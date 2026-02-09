use tauri::Manager;
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_ip() -> String {
    local_ip_address::local_ip().map(|ip| ip.to_string()).unwrap_or_else(|_| "127.0.0.1".to_string())
}

mod signaling;
mod types;
mod virtual_cam;
mod media_stream;
mod webrtc_client;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Start Signaling Server on Port 3001
            // Serve the frontend build from 'dist' folder
            let app_path = app.path();
            
            // In production, resources are bundled. In dev, use ../dist relative to src-tauri
            let static_dir = app_path.resource_dir()
                .ok()
                .and_then(|p| {
                    let bundled = p.join("_up_/dist");
                    if bundled.exists() { Some(bundled) } else { None }
                })
                .unwrap_or_else(|| {
                    // Dev mode: use relative path from workspace
                    std::env::current_dir().unwrap().parent().unwrap().join("dist")
                })
                .to_string_lossy()
                .to_string();
            
            println!("Serving static files from: {}", static_dir);

            tauri::async_runtime::spawn(async move {
                signaling::start_server(3001, static_dir).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, get_ip])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
