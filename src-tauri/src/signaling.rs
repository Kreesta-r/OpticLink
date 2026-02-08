use warp::Filter;
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tokio::sync::mpsc;
use warp::ws::{Message, WebSocket};
use futures::{StreamExt, SinkExt};

// Store connected clients
type Clients = Arc<Mutex<HashMap<String, mpsc::UnboundedSender<Message>>>>;

pub async fn start_server(port: u16, static_dir: String) {
    let clients: Clients = Arc::new(Mutex::new(HashMap::new()));

    let clients_filter = warp::any().map(move || clients.clone());

    // WebSocket route for signaling
    let signaling = warp::path("ws")
        .and(warp::ws())
        .and(clients_filter.clone())
        .map(|ws: warp::ws::Ws, clients| {
            ws.on_upgrade(move |socket| client_connection(socket, clients))
        });

    // Static files (for phone client)
    // In dev, we can just proxy or serve a placeholder.
    // In prod, we serve the 'dist' folder.
    let static_files = warp::fs::dir(static_dir);

    let routes = signaling.or(static_files);

    println!("Signaling server running on 0.0.0.0:{}", port);
    warp::serve(routes).run(([0, 0, 0, 0], port)).await;
}

async fn client_connection(ws: WebSocket, clients: Clients) {
    let (mut client_ws_sender, mut client_ws_rcv) = ws.split();
    let (client_sender, mut client_rcv) = mpsc::unbounded_channel();

    // Assign a random ID (or handle via handshake)
    let my_id = uuid::Uuid::new_v4().to_string();
    println!("Client connected: {}", my_id);

    clients.lock().unwrap().insert(my_id.clone(), client_sender);

    // Initial message
    let _ = client_ws_sender.send(Message::text(format!("{{\"type\": \"id\", \"id\": \"{}\"}}", my_id))).await;

    // Background task to push messages from channel to WebSocket
    tokio::task::spawn(async move {
        while let Some(msg) = client_rcv.recv().await {
            let _ = client_ws_sender.send(msg).await;
        }
    });

    // Handle incoming messages
    while let Some(result) = client_ws_rcv.next().await {
        let msg = match result {
            Ok(msg) => msg,
            Err(e) => {
                eprintln!("websocket error: {}", e);
                break;
            }
        };

        if msg.is_text() {
            let text = msg.to_str().unwrap();
            // Broadcast to other clients (simple relay for now)
            // Ideally: parse "target" and send only to target.
            // For MVP: Broadcast to everyone else.
            let clients_guard = clients.lock().unwrap();
            for (id, sender) in clients_guard.iter() {
                if *id != my_id {
                    let _ = sender.send(Message::text(text));
                }
            }
        }
    }

    clients.lock().unwrap().remove(&my_id);
    println!("Client disconnected: {}", my_id);
}
