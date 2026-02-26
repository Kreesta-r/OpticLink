use anyhow::Result;
use std::sync::Arc;
use tokio::sync::mpsc;
use futures::{StreamExt, SinkExt};
use tokio_tungstenite::{connect_async, tungstenite::Message};

/// Frame data sent from WebRTC to Virtual Camera
pub struct VideoFrame {
    pub data: Vec<u8>,
    pub width: u32,  // Not used for H.264 stream (embedded in SPS)
    pub height: u32, // Not used for H.264 stream
}

struct H264Assembler {
    current_timestamp: u32,
    frame_buffer: Vec<u8>,
    fu_buffer: Vec<u8>,
    in_fu: bool,
}

impl H264Assembler {
    fn new() -> Self {
        Self {
            current_timestamp: 0,
            frame_buffer: Vec::with_capacity(100 * 1024), // 100KB prealloc
            fu_buffer: Vec::with_capacity(50 * 1024),
            in_fu: false,
        }
    }

    fn push(&mut self, payload: &[u8], timestamp: u32) -> Option<VideoFrame> {
        let mut completed_frame = None;

        if self.current_timestamp != timestamp {
            if !self.frame_buffer.is_empty() {
                completed_frame = Some(VideoFrame {
                    data: self.frame_buffer.clone(),
                    width: 0,
                    height: 0,
                });
            }
            self.frame_buffer.clear();
            self.current_timestamp = timestamp;
            // Reset FU state on new frame? Ideally yes, but RTP can be out of order?
            // Assuming simplified in-order delivery for now.
            self.in_fu = false; 
            self.fu_buffer.clear();
        }

        if payload.is_empty() {
            return completed_frame;
        }

        let header = payload[0];
        let nalu_type = header & 0x1F;

        if nalu_type == 28 { // FU-A
            if payload.len() < 2 { return completed_frame; }
            let fu_header = payload[1];
            let s_bit = (fu_header & 0x80) != 0;
            let e_bit = (fu_header & 0x40) != 0;
            let original_type = (header & 0xE0) | (fu_header & 0x1F);

            if s_bit {
                self.in_fu = true;
                self.fu_buffer.clear();
                // Reconstruct header
                self.fu_buffer.push(original_type);
                self.fu_buffer.extend_from_slice(&payload[2..]);
            } else if self.in_fu {
                self.fu_buffer.extend_from_slice(&payload[2..]);
                if e_bit {
                    self.in_fu = false;
                    // Append complete NALU to frame
                    self.frame_buffer.extend_from_slice(&[0, 0, 0, 1]);
                    self.frame_buffer.extend_from_slice(&self.fu_buffer);
                }
            }
        } else if nalu_type == 24 { // STAP-A
            let mut offset = 1;
            while offset + 2 < payload.len() {
                let len = ((payload[offset] as usize) << 8) | (payload[offset+1] as usize);
                offset += 2;
                if offset + len > payload.len() { break; }
                
                self.frame_buffer.extend_from_slice(&[0, 0, 0, 1]);
                self.frame_buffer.extend_from_slice(&payload[offset..offset+len]);
                offset += len;
            }
        } else {
            // Single NAL
            self.frame_buffer.extend_from_slice(&[0, 0, 0, 1]);
            self.frame_buffer.extend_from_slice(payload);
        }

        completed_frame
    }
}

/// Start the Rust-side WebRTC client that connects to the signaling server
/// and receives video frames for piping to the virtual camera.
pub async fn start_virtual_cam_client(
    frame_tx: mpsc::UnboundedSender<VideoFrame>,
) -> Result<()> {
    use tokio_tungstenite::tungstenite::Message as WsMsg;
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    println!("[VCam Client] Connecting to signaling server...");
    
    let url = "ws://127.0.0.1:3001/ws";
    let (ws_stream, _) = connect_async(url).await?;
    let (ws_write, mut ws_read) = ws_stream.split();
    let ws_write = Arc::new(tokio::sync::Mutex::new(ws_write));
    
    println!("[VCam Client] Connected to signaling server");
    
    let mut media_engine = webrtc::api::media_engine::MediaEngine::default();
    media_engine.register_default_codecs()?;
    let api = webrtc::api::APIBuilder::new()
        .with_media_engine(media_engine)
        .build();
    
    let config = webrtc::peer_connection::configuration::RTCConfiguration {
        ice_servers: vec![webrtc::ice_transport::ice_server::RTCIceServer {
            urls: vec!["stun:stun.l.google.com:19302".to_string()],
            ..Default::default()
        }],
        ..Default::default()
    };
    
    let mut current_pc: Option<Arc<webrtc::peer_connection::RTCPeerConnection>> = None;
    let (ice_tx, mut ice_rx) = mpsc::unbounded_channel::<String>();
    let ws_write_ice = ws_write.clone();
    tokio::spawn(async move {
        while let Some(msg) = ice_rx.recv().await {
            let mut w = ws_write_ice.lock().await;
            if let Err(e) = w.send(WsMsg::Text(msg.into())).await {
                eprintln!("[VCam Client] ICE send error: {}", e);
                break;
            }
        }
    });
    
    while let Some(msg_result) = ws_read.next().await {
        let msg = match msg_result {
            Ok(m) => m,
            Err(e) => {
                eprintln!("[VCam Client] WS read error: {}", e);
                break;
            }
        };
        if let Message::Text(text) = msg {
            let text_str: &str = text.as_ref();
            let json: serde_json::Value = match serde_json::from_str(text_str) {
                Ok(j) => j,
                Err(_) => continue,
            };
            match json["type"].as_str() {
                Some("offer") => {
                    let sdp = json["sdp"].as_str().unwrap_or_default();
                    if sdp.is_empty() {
                        eprintln!("[VCam Client] Offer has empty SDP");
                        continue;
                    }
                    if let Some(old) = current_pc.take() {
                        let _ = old.close().await;
                    }
                    println!("[VCam Client] Received offer, creating answer...");
                    
                    let pc = Arc::new(api.new_peer_connection(config.clone()).await?);
                    let ice_tx_c = ice_tx.clone();
                    pc.on_ice_candidate(Box::new(move |candidate| {
                        let tx = ice_tx_c.clone();
                        Box::pin(async move {
                            if let Some(c) = candidate {
                                let json = c.to_json().unwrap();
                                let msg = serde_json::json!({
                                    "type": "ice-candidate",
                                    "candidate": json.candidate,
                                    "sdp_mid": json.sdp_mid.unwrap_or_default(),
                                    "sdp_m_line_index": json.sdp_mline_index.unwrap_or(0),
                                    "target": "phone"
                                });
                                let _ = tx.send(msg.to_string());
                            }
                        })
                    }));
                    let frame_tx_c = frame_tx.clone();
                    pc.on_track(Box::new(move |track, _receiver, _transceiver| {
                        let tx = frame_tx_c.clone();
                        Box::pin(async move {
                            println!("[VCam Client] Track received: codec={}", track.codec().capability.mime_type);
                            let mut buf = vec![0u8; 1500];
                            let mut assembler = H264Assembler::new();
                            loop {
                                match track.read(&mut buf).await {
                                    Ok((rtp_packet, _attributes)) => {
                                        let payload = &rtp_packet.payload;
                                        if let Some(frame) = assembler.push(payload, rtp_packet.header.timestamp) {
                                            let _ = tx.send(frame);
                                        }
                                    }
                                    Err(e) => {
                                        println!("[VCam Client] Track read error: {}", e);
                                        break;
                                    }
                                }
                            }
                        })
                    }));
                    pc.on_peer_connection_state_change(Box::new(|state| {
                        println!("[VCam Client] Connection state: {}", state);
                        Box::pin(async {})
                    }));
                    
                    let offer = webrtc::peer_connection::sdp::session_description::RTCSessionDescription::offer(sdp.to_string())?;
                    pc.set_remote_description(offer).await?;
                    let answer = pc.create_answer(None).await?;
                    pc.set_local_description(answer.clone()).await?;
                    
                    let answer_msg = serde_json::json!({
                        "type": "answer",
                        "sdp": answer.sdp,
                        "target": "phone"
                    });
                    {
                        let mut w = ws_write.lock().await;
                        w.send(Message::Text(answer_msg.to_string().into())).await?;
                    }
                    println!("[VCam Client] Answer sent");
                    current_pc = Some(pc);
                }
                Some("ice-candidate") => {
                    if let Some(ref pc) = current_pc {
                        let candidate = json["candidate"].as_str().unwrap_or_default();
                        let sdp_mid = json["sdp_mid"].as_str().map(|s| s.to_string());
                        let sdp_mline_index = json["sdp_m_line_index"].as_u64().map(|n| n as u16);
                        let ice = webrtc::ice_transport::ice_candidate::RTCIceCandidateInit {
                            candidate: candidate.to_string(),
                            sdp_mid,
                            sdp_mline_index,
                            username_fragment: None,
                        };
                        if let Err(e) = pc.add_ice_candidate(ice).await {
                            eprintln!("[VCam Client] add_ice_candidate error: {}", e);
                        }
                    }
                }
                _ => {}
            }
        }
    }
    
    Ok(())
}
