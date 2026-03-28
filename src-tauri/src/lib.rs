use tokio::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::sync::LazyLock;
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use warp::Filter;
use futures::{StreamExt, SinkExt};
use windows::Win32::Media::MediaFoundation::IMFVirtualCamera;

mod virtual_cam;
mod media_stream;
mod webrtc_client;

use virtual_cam::{register_virtual_camera, OpticLinkMediaSource};
use media_stream::OpticLinkFrameSink;

// HTTP port (loopback only) — desktop WebSocket + Rust WebRTC client
pub const HTTP_PORT: u16 = 3001;
// HTTPS port (all interfaces) — phone app + phone WebSocket
pub const HTTPS_PORT: u16 = 3002;

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

static NEXT_USER_ID: AtomicUsize = AtomicUsize::new(1);
type Users = Arc<Mutex<HashMap<usize, mpsc::UnboundedSender<warp::ws::Message>>>>;

// ─── Tauri commands ──────────────────────────────────────────────────────────

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
    let (source, sink) = OpticLinkMediaSource::new().map_err(|e| e.to_string())?;
    let cam = register_virtual_camera(&source).map_err(|e| e.to_string())?;

    state.sink = Some(sink);
    state._cam = Some(SendVirtualCamera(cam));
    state.active = true;
    state.frames_processed = 0;

    println!("[VCam] Virtual Camera started.");
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
    state._cam = None;
    state.active = false;
    println!("[VCam] Virtual Camera stopped.");
    Ok(())
}

#[tauri::command]
fn get_ip() -> Result<String, String> {
    local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .map_err(|e| e.to_string())
}

/// Returns connection info: local IP + both server ports.
#[tauri::command]
fn get_connection_info() -> Result<String, String> {
    let ip = local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string());

    Ok(serde_json::json!({
        "ip": ip,
        "http_port": HTTP_PORT,
        "https_port": HTTPS_PORT
    }).to_string())
}

// ─── Signaling server ────────────────────────────────────────────────────────

async fn user_connected(ws: warp::ws::WebSocket, users: Users) {
    let my_id = NEXT_USER_ID.fetch_add(1, Ordering::Relaxed);
    println!("[Signaling] Client connected: {}", my_id);

    let (mut user_ws_tx, mut user_ws_rx) = ws.split();
    let (tx, mut rx) = mpsc::unbounded_channel();

    tokio::task::spawn(async move {
        while let Some(message) = rx.recv().await {
            user_ws_tx.send(message).await.unwrap_or_else(|e| {
                eprintln!("[Signaling] Send error: {}", e);
            });
        }
    });

    users.lock().unwrap().insert(my_id, tx);

    while let Some(result) = user_ws_rx.next().await {
        let msg = match result {
            Ok(msg) => msg,
            Err(e) => {
                eprintln!("[Signaling] WS error (uid={}): {}", my_id, e);
                break;
            }
        };

        if msg.is_text() {
            let text = msg.to_str().unwrap_or_default();
            // Broadcast to all other connected clients
            let users_lock = users.lock().unwrap();
            for (&uid, tx) in users_lock.iter() {
                if uid != my_id {
                    let _ = tx.send(warp::ws::Message::text(text));
                }
            }
        }
    }

    println!("[Signaling] Client disconnected: {}", my_id);
    users.lock().unwrap().remove(&my_id);
}

// ─── TLS certificate generation ──────────────────────────────────────────────

fn generate_self_signed_cert(local_ip: &str) -> Result<(Vec<u8>, Vec<u8>), String> {
    use rcgen::{generate_simple_self_signed, CertifiedKey};

    let subject_alt_names = vec![
        "localhost".to_string(),
        "127.0.0.1".to_string(),
        local_ip.to_string(),
    ];

    let CertifiedKey { cert, key_pair } =
        generate_simple_self_signed(subject_alt_names).map_err(|e| e.to_string())?;

    let cert_pem = cert.pem().into_bytes();
    let key_pem = key_pair.serialize_pem().into_bytes();

    println!("[TLS] Self-signed certificate generated for {}", local_ip);
    Ok((cert_pem, key_pem))
}

// ─── App entry point ─────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| {
            let local_ip = local_ip_address::local_ip()
                .map(|ip| ip.to_string())
                .unwrap_or_else(|_| "127.0.0.1".to_string());

            // Shared signaling state between both servers
            let users: Users = Arc::new(Mutex::new(HashMap::new()));

            // ── HTTP server (loopback only, port 3001) ───────────────────────
            // Used by: desktop browser WebSocket, Rust WebRTC client
            {
                let users_http = users.clone();
                let ws_route = warp::path("ws")
                    .and(warp::ws())
                    .and(warp::any().map(move || users_http.clone()))
                    .map(|ws: warp::ws::Ws, users| {
                        ws.on_upgrade(move |socket| user_connected(socket, users))
                    });

                tauri::async_runtime::spawn(async move {
                    println!("[HTTP] Signaling server on 127.0.0.1:{}", HTTP_PORT);
                    warp::serve(ws_route).run(([127, 0, 0, 1], HTTP_PORT)).await;
                });
            }

            // ── HTTPS server (all interfaces, port 3002) ─────────────────────
            // Used by: phone app (static files) + phone WebSocket (WSS)
            {
                let users_https = users.clone();
                let dist_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("../dist");
                let index_path = dist_dir.join("index.html");

                let https_ws = warp::path("ws")
                    .and(warp::ws())
                    .and(warp::any().map(move || users_https.clone()))
                    .map(|ws: warp::ws::Ws, users| {
                        ws.on_upgrade(move |socket| user_connected(socket, users))
                    });

                let static_files = warp::get().and(warp::fs::dir(dist_dir));
                let spa_fallback = warp::get()
                    .and(warp::any())
                    .and(warp::fs::file(index_path));

                let https_routes = https_ws.or(static_files).or(spa_fallback);

                match generate_self_signed_cert(&local_ip) {
                    Ok((cert_pem, key_pem)) => {
                        tauri::async_runtime::spawn(async move {
                            println!(
                                "[HTTPS] Phone server on 0.0.0.0:{} (phone URL: https://{}:{}/#phone)",
                                HTTPS_PORT, local_ip, HTTPS_PORT
                            );
                            warp::serve(https_routes)
                                .tls()
                                .cert(cert_pem)
                                .key(key_pem)
                                .run(([0, 0, 0, 0], HTTPS_PORT))
                                .await;
                        });
                    }
                    Err(e) => {
                        eprintln!("[TLS] Failed to generate cert, falling back to HTTP: {}", e);
                        // Fallback: serve phone app over HTTP (camera won't work on mobile Chrome)
                        let users_fb = users.clone();
                        let dist_dir2 = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                            .join("../dist");
                        let index_path2 = dist_dir2.join("index.html");
                        let fb_ws = warp::path("ws")
                            .and(warp::ws())
                            .and(warp::any().map(move || users_fb.clone()))
                            .map(|ws: warp::ws::Ws, users| {
                                ws.on_upgrade(move |socket| user_connected(socket, users))
                            });
                        let fb_static = warp::get().and(warp::fs::dir(dist_dir2));
                        let fb_fallback = warp::get()
                            .and(warp::any())
                            .and(warp::fs::file(index_path2));
                        let fb_routes = fb_ws.or(fb_static).or(fb_fallback);
                        tauri::async_runtime::spawn(async move {
                            warp::serve(fb_routes).run(([0, 0, 0, 0], HTTPS_PORT)).await;
                        });
                    }
                }
            }

            // ── WebRTC frame pipeline ────────────────────────────────────────
            let (frame_tx, mut frame_rx) = mpsc::unbounded_channel::<webrtc_client::VideoFrame>();

            // Consumer: push decoded frames into the virtual camera sink
            tauri::async_runtime::spawn(async move {
                println!("[Pipe] Frame consumer started");
                while let Some(frame) = frame_rx.recv().await {
                    let sink = {
                        let state = VCAM_STATE.lock().unwrap();
                        if state.active { state.sink.clone() } else { None }
                    };

                    if let Some(sink) = sink {
                        if let Err(e) = sink.push_frame(frame.data) {
                            eprintln!("[Pipe] push_frame error: {}", e);
                        } else {
                            if let Ok(mut state) = VCAM_STATE.lock() {
                                state.frames_processed += 1;
                            }
                        }
                    }
                }
            });

            // Rust WebRTC client (auto-reconnects, connects to HTTP loopback WS)
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                    println!("[WebRTC Client] Starting...");
                    if let Err(e) = webrtc_client::start_virtual_cam_client(frame_tx.clone()).await {
                        eprintln!("[WebRTC Client] Error: {}", e);
                    }
                    println!("[WebRTC Client] Disconnected, retrying in 2s...");
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                }
            });

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_virtual_cam_status,
            start_virtual_cam,
            stop_virtual_cam,
            get_ip,
            get_connection_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
