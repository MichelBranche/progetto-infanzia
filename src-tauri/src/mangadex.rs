use std::time::Duration;

const API_BASE: &str = "https://api.mangadex.org";

fn user_agent() -> String {
    format!(
        "Branchefy/{} (https://github.com/MichelBranche/progetto-infanzia)",
        env!("CARGO_PKG_VERSION")
    )
}

fn validate_path(path: &str) -> Result<(), String> {
    if !path.starts_with('/') || path.contains("..") {
        return Err("Percorso MangaDex non valido.".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn mangadex_fetch_cmd(path: String, query: Option<String>) -> Result<String, String> {
    validate_path(&path)?;

    let url = match query {
        Some(q) if !q.trim().is_empty() => format!("{API_BASE}{path}?{q}"),
        _ => format!("{API_BASE}{path}"),
    };

    let client = reqwest::Client::builder()
        .user_agent(user_agent())
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| format!("Client HTTP: {e}"))?;

    let response = client
        .get(&url)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|e| format!("Connessione MangaDex fallita: {e}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Lettura risposta MangaDex: {e}"))?;

    if !status.is_success() {
        return Err(format!("MangaDex API {}", status.as_u16()));
    }

    Ok(body)
}
