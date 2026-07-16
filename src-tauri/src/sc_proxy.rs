//! Proxy opzionale per il traffico StreamingCommunity (solo desktop).
//!
//! L'utente il cui IP è stato bannato da SC può instradare *solo* le richieste
//! verso SC/VixCloud attraverso un proxy (HTTP/HTTPS o SOCKS5, es. l'endpoint
//! della propria VPN). Disattivato di default: per tutti gli altri utenti non
//! cambia nulla, la connessione resta diretta.
//!
//! Lo stato è globale perché i client SC sono costruiti da funzioni libere che
//! non hanno accesso al `Database`. Viene popolato all'avvio (`init_app`) e a
//! ogni salvataggio impostazioni, esclusivamente sul percorso desktop.

use std::sync::RwLock;

static SC_PROXY_URL: RwLock<Option<String>> = RwLock::new(None);

/// Imposta (o azzera) l'URL del proxy SC. `None` o stringa vuota = nessun proxy.
pub fn set_sc_proxy(url: Option<String>) {
    let normalized = url
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    if let Ok(mut guard) = SC_PROXY_URL.write() {
        *guard = normalized;
    }
}

/// URL del proxy SC attualmente configurato, se presente.
pub fn current_sc_proxy() -> Option<String> {
    SC_PROXY_URL.read().ok().and_then(|g| g.clone())
}

/// Applica il proxy SC a un client `reqwest::blocking` (catalogo, risoluzione link).
pub fn apply_blocking(builder: reqwest::blocking::ClientBuilder) -> reqwest::blocking::ClientBuilder {
    match current_sc_proxy() {
        Some(url) => match reqwest::Proxy::all(&url) {
            Ok(proxy) => builder.proxy(proxy),
            Err(err) => {
                eprintln!("[sc_proxy] URL proxy non valido ({url}): {err}");
                builder
            }
        },
        None => builder,
    }
}

/// Applica il proxy SC a un client `reqwest` async (scaricamento segmenti video).
pub fn apply_async(builder: reqwest::ClientBuilder) -> reqwest::ClientBuilder {
    match current_sc_proxy() {
        Some(url) => match reqwest::Proxy::all(&url) {
            Ok(proxy) => builder.proxy(proxy),
            Err(err) => {
                eprintln!("[sc_proxy] URL proxy non valido ({url}): {err}");
                builder
            }
        },
        None => builder,
    }
}
