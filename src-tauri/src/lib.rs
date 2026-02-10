// use tauri::Manager; // Removed unused import
use tokio::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::sync::LazyLock;
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use warp::Filter;
use futures::{StreamExt, SinkExt};
use windows::Win32::Media::MediaFoundation::IMFVirtualCamera;

// Modules
mod virtual_cam;
mod media_stream;
mod webrtc_client;

use virtual_cam::{register_virtual_camera, OpticLinkMediaSource};
use media_stream::OpticLinkFrameSink;

// Wrapper to make IMFVirtualCamera Send/Sync (assuming Agile/MTA)
struct SendVirtualCamera(IMFVirtualCamera);
unsafe impl Send for SendVirtualCamera {}
unsafe impl Sync for SendVirtualCamera {}

struct VirtualCamState {
    active: bool,
    frames_processed: u64,
    sink: Option<OpticLinkFrameSink>,
    _cam: Option<SendVirtualCamera>,
}

static VCAM_STATE: LazyLock<Mutex<VirtualCamState>> = LazyLock::new(|| {
    Mutex::new(VirtualCamState {
        active: false,
        frames_processed: 0,
        sink: None,
        _cam: None,
    })
});

// Signaling Server Globals
static NEXT_USER_ID: AtomicUsize = AtomicUsize::new(1);
type Users = Arc<Mutex<HashMap<usize, mpsc::UnboundedSender<warp::ws::Message>>>>;

#[tauri::command]
fn get_virtual_cam_status() -> Result<String, String> {
    let state = VCAM_STATE.lock().map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "active": state.active,
        "frames": state.frames_processed
    }).to_string())
}

#[tauri::command]
async fn start_virtual_cam() -> Result<(), String> {
    let mut state = VCAM_STATE.lock().map_err(|e| e.to_string())?;
    if state.active {
        return Ok(());
    }

    println!("[VCam] Registering Virtual Camera...");
    
    // Create Source and Sink
    let (source, sink) = OpticLinkMediaSource::new().map_err(|e| e.to_string())?;
    
    // Register Camera
    let cam = register_virtual_camera(&source).map_err(|e| e.to_string())?;
    
    // Store
    state.sink = Some(sink);
    state._cam = Some(SendVirtualCamera(cam));
    state.active = true;
    state.frames_processed = 0;
    
    println!("[VCam] Virtual Camera Started.");
    Ok(())
}

#[tauri::command]
async fn stop_virtual_cam() -> Result<(), String> {
    let mut state = VCAM_STATE.lock().map_err(|e| e.to_string())?;
    if !state.active {
        return Ok(());
    }

    println!("[VCam] Stopping Virtual Camera...");
    state.sink = None;
    state._cam = None; // Dropping cam releases the virtual camera
    state.active = false;
    
    Ok(())
}

async fn user_connected(ws: warp::ws::WebSocket, users: Users) {
    let my_id = NEXT_USER_ID.fetch_add(1, Ordering::Relaxed);
    println!("[Signaling] New user connected: {}", my_id);

    let (mut user_ws_tx, mut user_ws_rx) = ws.split();
    let (tx, mut rx) = mpsc::unbounded_channel();
    
    // Loop to forward messages from internal channel to WebSocket
    tokio::task::spawn(async move {
        while let Some(message) = rx.recv().await {
            user_ws_tx.send(message).await.unwrap_or_else(|e| {
                eprintln!("[Signaling] Websocket send error: {}", e);
            });
        }
    });

    // Save sender
    users.lock().unwrap().insert(my_id, tx);
    
    // Send ID to user (optional)
    // let _ = users.lock().unwrap().get(&my_id).unwrap().send(warp::ws::Message::text(format!("{{ \"type\": \"id\", \"id\": {} }}", my_id)));

    // Loop to handle incoming messages
    while let Some(result) = user_ws_rx.next().await {
        let msg = match result {
            Ok(msg) => msg,
            Err(e) => {
                eprintln!("[Signaling] websocket error(uid={}): {}", my_id, e);
                break;
            }
        };
        
        if msg.is_text() {
            let text = msg.to_str().unwrap();
            // Broadcast to other users
            let users_lock = users.lock().unwrap();
            for (&uid, tx) in users_lock.iter() {
                if uid != my_id {
                    let _ = tx.send(warp::ws::Message::text(text));
                }
            }
        }
    }

    // Disconnect
    println!("[Signaling] User disconnected: {}", my_id);
    users.lock().unwrap().remove(&my_id);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| {
            // Start Signaling Server
            let users: Users = Arc::new(Mutex::new(HashMap::new()));
            let users = warp::any().map(move || users.clone());

            let ws_route = warp::path("ws")
                .and(warp::ws())
                .and(users)
                .map(|ws: warp::ws::Ws, users| {
                    ws.on_upgrade(move |socket| user_connected(socket, users))
                });
            
            tauri::async_runtime::spawn(async move {
                println!("[Signaling] Server running on 0.0.0.0:3001/ws");
                warp::serve(ws_route).run(([0, 0, 0, 0], 3001)).await;
            });
            
            // WebRTC Client / Pipe
            let (frame_tx, mut frame_rx) = mpsc::unbounded_channel::<webrtc_client::VideoFrame>();
            
            // Consumer Loop
            tauri::async_runtime::spawn(async move {
                println!("[Pipe] Starting frame consumer loop");
                while let Some(frame) = frame_rx.recv().await {
                    let sink = {
                        let state = VCAM_STATE.lock().unwrap();
                        if state.active {
                            state.sink.clone()
                        } else {
                            None
                        }
                    };

                    if let Some(sink) = sink {
                         if let Err(e) = sink.push_frame(frame.data) {
                             eprintln!("Failed to push frame: {}", e);
                         } else {
                             // Update stats (lazy, maybe every 30 frames)
                            //  if let Ok(mut state) = VCAM_STATE.lock() {
                            //      state.frames_processed += 1;
                            //  }
                         }
                    }
                }
            });

            // Start WebRTC Client in loop (auto-reconnect)
            tauri::async_runtime::spawn(async move {
                loop {
                    println!("[VCam Client] Starting...");
                    // Note: Ensure we don't connect before server is up?
                    // The server spawn is slightly ahead.
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                    
                    if let Err(e) = webrtc_client::start_virtual_cam_client(frame_tx.clone()).await {
                        eprintln!("[VCam Client] Error: {}", e);
                    }
                    println!("[VCam Client] Disconnected. Retrying in 2s...");
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                }
            });

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_virtual_cam_status, start_virtual_cam, stop_virtual_cam])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
