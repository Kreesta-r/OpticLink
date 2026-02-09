use anyhow::Result;
use webrtc::api::media_engine::MediaEngine;
use webrtc::api::APIBuilder;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;
use webrtc::peer_connection::RTCPeerConnection;
use std::sync::Arc;

pub async fn start_webrtc_listener() -> Result<()> {
    // 1. Create Media Engine
    let mut m = MediaEngine::default();
    m.register_default_codecs()?;

    // 2. Create API
    let api = APIBuilder::new()
        .with_media_engine(m)
        .build();

    // 3. Create Peer Connection Config
    let config = RTCConfiguration {
        ice_servers: vec![], // Local network only for now
        ..Default::default()
    };

    // 4. Create Peer Connection
    let peer_connection = Arc::new(api.new_peer_connection(config).await?);

    // 5. Handle Track
    peer_connection.on_track(Box::new(|track, _receiver, _transceiver| {
        Box::pin(async move {
            println!("Track received: {:?}", track.id());
            // TODO: Extract frames and send to Virtual Cam
        })
    }));

    // TODO: Signaling exchange (Answer/Offer)
    
    Ok(())
}
