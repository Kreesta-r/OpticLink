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
            // In prod, serve the frontend build. In dev, just serve placeholder.
            let resource_path = app.path().resource_dir().unwrap_or_default().join("public");
            let static_dir = resource_path.to_string_lossy().to_string();

            tauri::async_runtime::spawn(async move {
                signaling::start_server(3001, static_dir).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, get_ip])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
