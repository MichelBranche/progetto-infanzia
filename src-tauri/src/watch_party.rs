use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::broadcast;

const CODE_CHARS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn random_code(len: usize) -> String {
    let seed =
        now_millis() as u128 ^ (std::process::id() as u128).wrapping_mul(0x9E37_79B9_7F4A_7C15);
    (0..len)
        .map(|i| {
            let idx = ((seed >> (i * 5)) as usize) % CODE_CHARS.len();
            CODE_CHARS[idx] as char
        })
        .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchPartyContent {
    pub media_id: String,
    pub title: String,
    pub stream_url: String,
    pub is_hls: bool,
    pub poster_url: Option<String>,
    pub content_kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchPartyMember {
    pub profile_id: String,
    pub name: String,
    pub is_host: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchPartyRoomInfo {
    pub code: String,
    pub host_profile_id: String,
    pub host_name: String,
    pub host_ip: Option<String>,
    pub content: WatchPartyContent,
    pub playing: bool,
    pub position_secs: f64,
    pub members: Vec<WatchPartyMember>,
}

struct RoomChannel {
    info: WatchPartyRoomInfo,
    tx: broadcast::Sender<String>,
}

pub struct WatchPartyRegistry {
    rooms: RwLock<HashMap<String, RoomChannel>>,
}

impl Default for WatchPartyRegistry {
    fn default() -> Self {
        Self {
            rooms: RwLock::new(HashMap::new()),
        }
    }
}

impl WatchPartyRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn create_room(
        &self,
        host_profile_id: String,
        host_name: String,
        content: WatchPartyContent,
        host_ip: Option<String>,
    ) -> Result<WatchPartyRoomInfo, String> {
        let code = random_code(6);
        let (tx, _) = broadcast::channel(64);
        let member = WatchPartyMember {
            profile_id: host_profile_id.clone(),
            name: host_name.clone(),
            is_host: true,
        };
        let info = WatchPartyRoomInfo {
            code: code.clone(),
            host_profile_id,
            host_name,
            host_ip,
            content,
            playing: false,
            position_secs: 0.0,
            members: vec![member],
        };
        self.rooms.write().insert(
            code.clone(),
            RoomChannel {
                info: info.clone(),
                tx,
            },
        );
        Ok(info)
    }

    pub fn get_room(&self, code: &str) -> Option<WatchPartyRoomInfo> {
        let code = code.to_uppercase();
        self.rooms.read().get(&code).map(|r| r.info.clone())
    }

    pub fn close_room(&self, code: &str, host_profile_id: &str) -> Result<(), String> {
        let code = code.to_uppercase();
        let mut rooms = self.rooms.write();
        let Some(room) = rooms.get(&code) else {
            return Err("Stanza non trovata".into());
        };
        if room.info.host_profile_id != host_profile_id {
            return Err("Solo l'host può chiudere la stanza".into());
        }
        rooms.remove(&code);
        Ok(())
    }

    fn subscribe(&self, code: &str) -> Option<(WatchPartyRoomInfo, broadcast::Receiver<String>)> {
        let code = code.to_uppercase();
        let rooms = self.rooms.read();
        let room = rooms.get(&code)?;
        Some((room.info.clone(), room.tx.subscribe()))
    }

    fn broadcast(&self, code: &str, message: &str) {
        let code = code.to_uppercase();
        if let Some(room) = self.rooms.read().get(&code) {
            let _ = room.tx.send(message.to_string());
        }
    }

    fn update_room<F>(&self, code: &str, f: F)
    where
        F: FnOnce(&mut WatchPartyRoomInfo),
    {
        let code = code.to_uppercase();
        let mut rooms = self.rooms.write();
        if let Some(room) = rooms.get_mut(&code) {
            f(&mut room.info);
        }
    }

    fn upsert_member(&self, code: &str, member: WatchPartyMember) {
        self.update_room(code, |info| {
            if let Some(existing) = info
                .members
                .iter_mut()
                .find(|m| m.profile_id == member.profile_id)
            {
                existing.name = member.name.clone();
                existing.is_host = member.is_host;
            } else {
                info.members.push(member);
            }
        });
    }

    fn remove_member(&self, code: &str, profile_id: &str) {
        self.update_room(code, |info| {
            info.members.retain(|m| m.profile_id != profile_id);
        });
    }

    fn publish_members(&self, code: &str) {
        let members = self.get_room(code).map(|r| r.members).unwrap_or_default();
        if let Ok(payload) = serde_json::to_string(&WsOutbound::Members { members }) {
            self.broadcast(code, &payload);
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WsConnectParams {
    pub code: String,
    pub profile_id: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum WsInbound {
    #[serde(rename = "sync")]
    Sync {
        playing: bool,
        position: f64,
        #[serde(default)]
        sent_at: u64,
    },
    #[serde(rename = "ping")]
    Ping,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum WsOutbound {
    #[serde(rename = "sync")]
    Sync {
        playing: bool,
        position: f64,
        sent_at: u64,
    },
    #[serde(rename = "content")]
    Content { content: WatchPartyContent },
    #[serde(rename = "members")]
    Members { members: Vec<WatchPartyMember> },
    #[serde(rename = "error")]
    Error { message: String },
}

pub async fn handle_socket(
    socket: WebSocket,
    registry: Arc<WatchPartyRegistry>,
    params: WsConnectParams,
) {
    let code = params.code.to_uppercase();
    let Some((room_info, mut rx)) = registry.subscribe(&code) else {
        return;
    };

    let is_host = room_info.host_profile_id == params.profile_id;
    registry.upsert_member(
        &code,
        WatchPartyMember {
            profile_id: params.profile_id.clone(),
            name: params.name.clone(),
            is_host,
        },
    );
    registry.publish_members(&code);

    let (mut sender, mut receiver) = socket.split();

    let hello_content = serde_json::to_string(&WsOutbound::Content {
        content: room_info.content.clone(),
    })
    .unwrap_or_default();
    let hello_sync = serde_json::to_string(&WsOutbound::Sync {
        playing: room_info.playing,
        position: room_info.position_secs,
        sent_at: now_millis(),
    })
    .unwrap_or_default();
    let hello_members = registry
        .get_room(&code)
        .and_then(|r| serde_json::to_string(&WsOutbound::Members { members: r.members }).ok())
        .unwrap_or_default();

    for msg in [hello_content, hello_sync, hello_members] {
        if !msg.is_empty() && sender.send(Message::Text(msg.into())).await.is_err() {
            return;
        }
    }

    let registry_fwd = registry.clone();
    let code_fwd = code.clone();
    let profile_id_fwd = params.profile_id.clone();
    let forward = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
        registry_fwd.remove_member(&code_fwd, &profile_id_fwd);
        registry_fwd.publish_members(&code_fwd);
    });

    while let Some(Ok(msg)) = receiver.next().await {
        match msg {
            Message::Text(text) => {
                let Ok(inbound) = serde_json::from_str::<WsInbound>(&text) else {
                    continue;
                };
                match inbound {
                    WsInbound::Ping => {}
                    WsInbound::Sync {
                        playing,
                        position,
                        sent_at,
                    } => {
                        if !is_host {
                            continue;
                        }
                        let sent_at = if sent_at == 0 { now_millis() } else { sent_at };
                        registry.update_room(&code, |info| {
                            info.playing = playing;
                            info.position_secs = position;
                        });
                        if let Ok(payload) = serde_json::to_string(&WsOutbound::Sync {
                            playing,
                            position,
                            sent_at,
                        }) {
                            registry.broadcast(&code, &payload);
                        }
                    }
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    forward.abort();
    registry.remove_member(&code, &params.profile_id);
    registry.publish_members(&code);
}
