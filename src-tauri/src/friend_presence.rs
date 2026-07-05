use crate::db::Database;
use crate::models::STREAM_PORT;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::net::IpAddr;
use std::sync::{Arc, Mutex};
use std::time::Duration;

const PING_TIMEOUT_MS: u64 = 450;
const SCAN_BATCH: usize = 48;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevicePresence {
    pub profile_id: String,
    pub friend_code: String,
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cloud_friend_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresenceHello {
    pub friend_code: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanFriendPresence {
    pub friend_code: String,
    pub display_name: String,
    pub online: bool,
    pub last_host: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
}

pub type PresenceRegistry = Arc<Mutex<Option<DevicePresence>>>;

pub fn new_presence_registry() -> PresenceRegistry {
    Arc::new(Mutex::new(None))
}

pub fn set_device_presence(registry: &PresenceRegistry, presence: DevicePresence) {
    if let Ok(mut guard) = registry.lock() {
        *guard = Some(presence);
    }
}

pub fn get_device_presence(registry: &PresenceRegistry) -> Option<DevicePresence> {
    registry.lock().ok().and_then(|g| g.clone())
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_millis(PING_TIMEOUT_MS))
        .build()
        .map_err(|e| e.to_string())
}

async fn fetch_whoami(client: &Client, host: &str) -> Option<DevicePresence> {
    let url = format!("http://{host}:{STREAM_PORT}/presence/whoami");
    let response = client.get(url).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    response.json::<DevicePresence>().await.ok()
}

async fn fetch_presence_at(client: &Client, host: &str) -> Option<DevicePresence> {
    fetch_whoami(client, host).await
}

async fn send_hello(client: &Client, host: &str, friend_code: &str, display_name: &str) {
    let url = format!("http://{host}:{STREAM_PORT}/presence/hello");
    let body = PresenceHello {
        friend_code: friend_code.to_string(),
        display_name: display_name.to_string(),
    };
    let _ = client.post(url).json(&body).send().await;
}

fn subnet_hosts() -> Vec<String> {
    let ip = match local_ip_address::local_ip() {
        Ok(IpAddr::V4(v4)) if !v4.is_loopback() => v4,
        _ => return Vec::new(),
    };

    let octets = ip.octets();
    let prefix = [octets[0], octets[1], octets[2]];
    let self_last = octets[3];

    (1u8..=254)
        .filter(|&last| last != self_last)
        .map(|last| format!("{}.{}.{}.{}", prefix[0], prefix[1], prefix[2], last))
        .collect()
}

async fn scan_subnet_for_friends(
    client: &Client,
    db: &Database,
    known_codes: &HashSet<String>,
) {
    let hosts = subnet_hosts();
    for chunk in hosts.chunks(SCAN_BATCH) {
        let mut tasks = Vec::new();
        for host in chunk {
            let client = client.clone();
            let host = host.clone();
            let codes = known_codes.clone();
            tasks.push(tokio::spawn(async move {
                if let Some(presence) = fetch_whoami(&client, &host).await {
                    let code = presence.friend_code.to_uppercase();
                    if codes.contains(&code) {
                        return Some((code, host));
                    }
                }
                None
            }));
        }
        for task in tasks {
            if let Ok(Some((code, host))) = task.await {
                let _ = db.update_friend_hosts_for_code(&code, &host);
            }
        }
    }
}

pub async fn sync_lan_presence(
    db: &Database,
    profile_id: &str,
    my_code: &str,
    display_name: &str,
    deep_scan: bool,
) -> Result<Vec<LanFriendPresence>, String> {
    let client = http_client()?;
    let friends = db.list_friend_hosts(profile_id)?;
    let known_codes: HashSet<String> = friends
        .iter()
        .map(|(code, _, _)| code.to_uppercase())
        .collect();

    let mut announce_targets: HashSet<String> = friends
        .iter()
        .filter_map(|(_, _, host)| host.clone())
        .collect();

    for (_, _, host) in &friends {
        if let Some(h) = host {
            send_hello(&client, h, my_code, display_name).await;
        }
    }

    if deep_scan {
        scan_subnet_for_friends(&client, db, &known_codes).await;
    }

    let refreshed = db.list_friend_hosts(profile_id)?;
    for (_, _, host) in &refreshed {
        if let Some(h) = host {
            announce_targets.insert(h.clone());
        }
    }

    for host in announce_targets {
        send_hello(&client, &host, my_code, display_name).await;
    }

    let final_friends = db.list_friend_hosts(profile_id)?;
    let mut results = Vec::with_capacity(final_friends.len());

    for (friend_code, name, last_host) in final_friends {
        let (online, remote_avatar) = if let Some(ref host) = last_host {
            let presence = fetch_presence_at(&client, host).await;
            let online = presence
                .as_ref()
                .is_some_and(|p| p.friend_code.eq_ignore_ascii_case(&friend_code));
            (online, presence.and_then(|p| p.avatar_url))
        } else {
            (false, None)
        };
        results.push(LanFriendPresence {
            friend_code,
            display_name: name,
            online,
            last_host,
            avatar_url: remote_avatar,
        });
    }

    Ok(results)
}
