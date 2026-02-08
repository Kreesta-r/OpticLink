use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type")]
pub enum SignalingMessage {
    #[serde(rename = "offer")]
    Offer { sdp: String, target: String },
    #[serde(rename = "answer")]
    Answer { sdp: String, target: String },
    #[serde(rename = "ice-candidate")]
    IceCandidate { candidate: String, sdp_mid: Option<String>, sdp_m_line_index: Option<u16>, target: String },
    #[serde(rename = "join")]
    Join { id: String },
    #[serde(rename = "id")]
    Id { id: String },
}
