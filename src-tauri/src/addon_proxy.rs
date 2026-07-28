use crate::network::stream_remote_url;
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const ENTRY_TTL: Duration = Duration::from_secs(12 * 3600);
const CLEANUP_INTERVAL: Duration = Duration::from_secs(120);
/// Segmenti da tenere nelle media playlist live (senza EXT-X-ENDLIST).
/// ~4 min con targetduration 10s — abbastanza per latency HLS.js, senza
/// far esplodere il parser su finestre DVR da migliaia di EXTINF.
const LIVE_MEDIA_SEGMENT_KEEP: usize = 24;

#[derive(Debug, Clone)]
pub struct ProxyEntry {
    pub upstream_url: String,
    pub request_headers: HashMap<String, String>,
    pub rewrite_manifest: bool,
    /// Se true, fetch dell'entry via SOCKS/HTTP VPN SC.
    /// Il rewrite HLS passa comunque sempre dal proxy locale (Referer/Origin).
    pub use_proxy: bool,
    pub created_at: Instant,
}

/// Tipo di playlist HLS. Serve a capire cosa sono le righe "nude" (senza `#`):
/// nel master sono **varianti** (altre playlist, da riscrivere), nella media
/// sono **segmenti** (binari, da proxare opachi).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ManifestKind {
    Master,
    Media,
}

impl ManifestKind {
    fn detect(body: &str) -> Self {
        for line in body.lines() {
            let upper = line.trim().to_ascii_uppercase();
            if upper.starts_with("#EXT-X-STREAM-INF") || upper.starts_with("#EXT-X-I-FRAME-STREAM-INF")
            {
                return ManifestKind::Master;
            }
            if upper.starts_with("#EXTINF")
                || upper.starts_with("#EXT-X-TARGETDURATION")
                || upper.starts_with("#EXT-X-MEDIA-SEQUENCE")
            {
                return ManifestKind::Media;
            }
        }
        // Nel dubbio trattala da master: riscrivere una playlist di troppo è
        // recuperabile, lasciarne una grezza rompe la riproduzione.
        ManifestKind::Master
    }
}

pub struct AddonProxyRegistry {
    entries: Mutex<HashMap<String, ProxyEntry>>,
    last_cleanup: Mutex<Instant>,
}

impl AddonProxyRegistry {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            last_cleanup: Mutex::new(Instant::now()),
        }
    }

    /// Una media playlist può registrare centinaia di segmenti: fare il retain
    /// completo a ogni `register` è O(n²). Basta ripulire ogni due minuti.
    fn maybe_cleanup(&self) {
        {
            let mut last = self.last_cleanup.lock().expect("proxy cleanup lock");
            if last.elapsed() < CLEANUP_INTERVAL {
                return;
            }
            *last = Instant::now();
        }
        let mut guard = self.entries.lock().expect("proxy registry lock");
        let now = Instant::now();
        guard.retain(|_, entry| now.duration_since(entry.created_at) < ENTRY_TTL);
    }

    pub fn register(
        &self,
        upstream_url: String,
        request_headers: HashMap<String, String>,
        rewrite_manifest: bool,
        use_proxy: bool,
    ) -> String {
        self.maybe_cleanup();
        // ID stabile per URL upstream: le dirette Rai refresano la media playlist
        // ogni ~2s con centinaia/migliaia di segmenti. Se l'ID includeva i nanos,
        // ogni refresh creava N entry nuove → HashMap enorme, rewrite lento,
        // timeout del proxy Vite → levelParsingError.
        let id = format!("{:016x}", {
            let mut h = DefaultHasher::new();
            upstream_url.hash(&mut h);
            rewrite_manifest.hash(&mut h);
            use_proxy.hash(&mut h);
            let mut pairs: Vec<_> = request_headers.iter().collect();
            pairs.sort_by(|a, b| a.0.cmp(b.0));
            for (k, v) in pairs {
                k.hash(&mut h);
                v.hash(&mut h);
            }
            h.finish()
        });
        let entry = ProxyEntry {
            upstream_url,
            request_headers,
            rewrite_manifest,
            use_proxy,
            created_at: Instant::now(),
        };
        self.entries
            .lock()
            .expect("proxy registry lock")
            .insert(id.clone(), entry);
        id
    }

    pub fn get(&self, id: &str) -> Option<ProxyEntry> {
        self.entries
            .lock()
            .expect("proxy registry lock")
            .get(id)
            .cloned()
    }

    pub fn playback_url(&self, id: &str) -> String {
        stream_remote_url(id)
    }

    fn proxy_reference(
        &self,
        reference: &str,
        base: Option<&url::Url>,
        request_headers: &HashMap<String, String>,
        use_proxy: bool,
        // Body binario (chiave AES, init map, segmento): proxy opaco, mai
        // riscritto come testo m3u8.
        opaque: bool,
    ) -> String {
        let absolute = resolve_url(base, reference);
        // Sempre proxy locale: i CDN VixCloud/SC richiedono Referer/Origin che
        // il browser non può impostare. `use_proxy` è solo l'hop SOCKS/VPN.
        let rewrite = !opaque && is_hls_playlist_url(&absolute);
        let id = self.register(absolute, request_headers.clone(), rewrite, use_proxy);
        self.playback_url(&id)
    }

    fn rewrite_uri_attributes(
        &self,
        line: &str,
        base: Option<&url::Url>,
        request_headers: &HashMap<String, String>,
        use_proxy: bool,
    ) -> String {
        let upper = line.to_ascii_uppercase();
        // Le chiavi AES e gli init segment sono binari: se venissero registrati
        // come playlist il proxy ne riscriverebbe il body come testo e la
        // decrittazione fallirebbe (regressione 0.2.19–0.2.21).
        let opaque_uri = upper.contains("EXT-X-KEY")
            || upper.contains("EXT-X-SESSION-KEY")
            || upper.contains("EXT-X-MAP");
        let mut result = line.to_string();
        let mut search_from = 0;
        while let Some(rel) = result[search_from..].find("URI=\"") {
            let url_start = search_from + rel + 5;
            let Some(end_off) = result[url_start..].find('"') else {
                break;
            };
            let url_end = url_start + end_off;
            let reference = &result[url_start..url_end];
            if reference.is_empty() {
                search_from = url_end + 1;
                continue;
            }
            let proxied =
                self.proxy_reference(reference, base, request_headers, use_proxy, opaque_uri);
            result = format!("{}{}{}", &result[..url_start], proxied, &result[url_end..]);
            search_from = url_start + proxied.len();
        }
        result
    }

    pub fn rewrite_hls_manifest(
        &self,
        manifest_body: &str,
        manifest_url: &str,
        request_headers: &HashMap<String, String>,
        use_proxy: bool,
    ) -> String {
        let base = url::Url::parse(manifest_url).ok();
        let kind = ManifestKind::detect(manifest_body);
        // Dirette Rai espongono finestre DVR enormi (~1000×10s). HLS.js finisce
        // in levelParsingError; teniamo solo gli ultimi segmenti (live edge).
        let body = if kind == ManifestKind::Media {
            trim_live_media_window(manifest_body, LIVE_MEDIA_SEGMENT_KEEP)
        } else {
            manifest_body.to_string()
        };
        body
            .lines()
            .map(|line| {
                if line.trim().is_empty() {
                    return line.to_string();
                }
                let with_uris =
                    self.rewrite_uri_attributes(line, base.as_ref(), request_headers, use_proxy);
                let trimmed = with_uris.trim();
                if trimmed.starts_with('#') {
                    return with_uris;
                }
                // Riga nuda: nel master è una **variante** (altra playlist da
                // riscrivere), nella media è un **segmento** (opaco).
                // Marcare sempre opaco (regressione 0.2.22) lasciava le
                // varianti grezze: chiavi relative tipo `/storage/enc.key` e
                // segmenti diretti al CDN senza Referer → schermo nero.
                let opaque = match kind {
                    ManifestKind::Media => true,
                    ManifestKind::Master => false,
                };
                self.proxy_reference(trimmed, base.as_ref(), request_headers, use_proxy, opaque)
            })
            .collect::<Vec<_>>()
            .join("\n")
    }
}

/// Riduce una media playlist live alla coda (live edge), aggiornando
/// `EXT-X-MEDIA-SEQUENCE`. Le VOD (`#EXT-X-ENDLIST`) restano intatte.
fn trim_live_media_window(body: &str, keep: usize) -> String {
    if keep == 0
        || body
            .lines()
            .any(|l| l.trim().eq_ignore_ascii_case("#EXT-X-ENDLIST"))
    {
        return body.to_string();
    }

    let lines: Vec<&str> = body.lines().collect();
    let mut seg_starts: Vec<usize> = Vec::new();
    for (i, line) in lines.iter().enumerate() {
        if line.trim().to_ascii_uppercase().starts_with("#EXTINF") {
            seg_starts.push(i);
        }
    }
    if seg_starts.len() <= keep {
        return body.to_string();
    }

    let drop_count = seg_starts.len() - keep;
    let first_kept = seg_starts[drop_count];
    let header_end = seg_starts[0];
    let mut out: Vec<String> = Vec::with_capacity(keep * 2 + 16);

    for line in &lines[..header_end] {
        let upper = line.trim().to_ascii_uppercase();
        if let Some(rest) = upper.strip_prefix("#EXT-X-MEDIA-SEQUENCE:") {
            if let Ok(seq) = rest.trim().parse::<u64>() {
                out.push(format!(
                    "#EXT-X-MEDIA-SEQUENCE:{}",
                    seq + drop_count as u64
                ));
                continue;
            }
        }
        // PDT del primo segmento (ore fa): fuorviante dopo il trim.
        if upper.starts_with("#EXT-X-PROGRAM-DATE-TIME:") {
            continue;
        }
        out.push((*line).to_string());
    }
    for line in &lines[first_kept..] {
        out.push((*line).to_string());
    }
    out.join("\n")
}

/// Rete di sicurezza del proxy: qualunque cosa fosse stata registrata, se il
/// body è una playlist HLS va riscritta, altrimenti va servita intatta.
pub fn looks_like_hls_manifest(body: &[u8]) -> bool {
    let head = &body[..body.len().min(256)];
    let text = String::from_utf8_lossy(head);
    text.trim_start().starts_with("#EXTM3U")
}

fn is_hls_playlist_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    // `type=key` è una chiave AES (binaria) anche se su VixCloud vive sotto
    // `/playlist/...`: non è mai una playlist.
    if lower.contains("type=key") {
        return false;
    }
    lower.contains("/playlist/")
        || lower.ends_with(".m3u8")
        || lower.contains(".m3u8?")
        || lower.contains("type=audio")
        || lower.contains("type=subtitle")
        || lower.contains("type=video")
}

/// True quando vale la pena bufferizzare la risposta per capire se è una
/// playlist. Le playlist sono piccole; i segmenti restano in streaming.
pub fn should_sniff_manifest(entry: &ProxyEntry, content_type: Option<&str>) -> bool {
    if entry.rewrite_manifest {
        return true;
    }
    // Varianti master registrate per sbaglio come opache (0.2.22–0.2.23)
    // avevano `type=video` / `/playlist/` nell'URL: senza sniff la media
    // restava grezza e la chiave relativa `/storage/enc.key` finiva in 404.
    if is_hls_playlist_url(&entry.upstream_url) {
        return true;
    }
    match content_type {
        Some(ct) => {
            let lower = ct.to_ascii_lowercase();
            lower.contains("mpegurl")
                || lower.contains("m3u8")
                || lower.contains("m3u")
                || lower.contains("text/plain")
        }
        // Senza Content-Type non rischiamo di bufferizzare i .ts:
        // i segmenti hanno quasi sempre un tipo media esplicito.
        None => false,
    }
}

fn resolve_url(base: Option<&url::Url>, reference: &str) -> String {
    if let Ok(abs) = url::Url::parse(reference) {
        return abs.to_string();
    }
    if let Some(base) = base {
        if let Ok(mut joined) = base.join(reference) {
            // Master Rai/msvdn: `playlist_mo.m3u8?tk2=…` con varianti relative
            // `rainews_2400/chunklist.m3u8`. Senza query il CDN può rispondere
            // male al refresh live → levelParsingError dopo pochi secondi.
            if joined.query().is_none() {
                let path = joined.path().to_ascii_lowercase();
                if path.contains(".m3u8") {
                    if let Some(q) = base.query() {
                        joined.set_query(Some(q));
                    }
                }
            }
            return joined.to_string();
        }
    }
    reference.to_string()
}

pub fn stream_needs_proxy(not_web_ready: bool, request_headers: &HashMap<String, String>) -> bool {
    not_web_ready || !request_headers.is_empty()
}

#[cfg(test)]
fn remote_id_from_line(line: &str) -> Option<String> {
    let start = line.find("/remote/")? + "/remote/".len();
    let rest = &line[start..];
    let end = rest
        .find(|c: char| c == '"' || c.is_whitespace() || c == ',')
        .unwrap_or(rest.len());
    Some(rest[..end].to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers() -> HashMap<String, String> {
        HashMap::from([("Referer".to_string(), "https://vixcloud.cc/".to_string())])
    }

    #[test]
    fn rewrites_media_uris_and_variants() {
        let proxy = AddonProxyRegistry::new();
        let master = r#"#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,URI="https://vixcloud.cc/playlist/1?type=audio&token=abc"
#EXT-X-STREAM-INF:BANDWIDTH=1000
https://vixcloud.cc/playlist/1?type=video&rendition=720p&token=def"#;

        let rewritten = proxy.rewrite_hls_manifest(
            master,
            "https://vixcloud.cc/playlist/1?b=1",
            &headers(),
            false,
        );

        assert!(!rewritten.contains("vixcloud.cc/playlist"), "{rewritten}");
        assert_eq!(rewritten.matches("/remote/").count(), 2);
    }

    /// Regressione 0.2.22: le varianti nude del master venivano registrate
    /// opache, quindi servite grezze. Il player riceveva chiavi relative e
    /// segmenti diretti al CDN → schermo nero.
    #[test]
    fn master_variants_are_rewritten_not_opaque() {
        let proxy = AddonProxyRegistry::new();
        let master = r#"#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720
https://vixcloud.cc/playlist/775090?type=video&rendition=720p&token=def"#;

        let rewritten = proxy.rewrite_hls_manifest(
            master,
            "https://vixcloud.cc/playlist/775090?token=t",
            &headers(),
            false,
        );

        let variant_id = rewritten
            .lines()
            .find(|l| !l.starts_with('#') && l.contains("/remote/"))
            .and_then(remote_id_from_line)
            .expect("variant id");
        let entry = proxy.get(&variant_id).expect("variant entry");
        assert!(
            entry.rewrite_manifest,
            "una variante del master deve essere riscritta, non servita grezza"
        );
    }

    /// Regressione gemella: la chiave relativa `/storage/enc.key` deve essere
    /// risolta sull'upstream e proxata, mai lasciata relativa (si risolverebbe
    /// sull'origin del proxy → 404).
    #[test]
    fn relative_key_uri_is_resolved_against_upstream() {
        let proxy = AddonProxyRegistry::new();
        let media = r#"#EXTM3U
#EXT-X-TARGETDURATION:8
#EXT-X-KEY:METHOD=AES-128,URI="/storage/enc.key",IV=0x43A6D967D5C17290
#EXTINF:8,
https://sc-u9-01.vix-content.net/hls/34/video/720p/0000.ts?token=x"#;

        let rewritten = proxy.rewrite_hls_manifest(
            media,
            "https://vixcloud.cc/playlist/775090?type=video&rendition=720p",
            &headers(),
            false,
        );

        assert!(
            !rewritten.contains("\"/storage/enc.key\""),
            "chiave relativa non riscritta: {rewritten}"
        );
        assert!(
            !rewritten.contains("vix-content.net"),
            "segmento lasciato sul CDN: {rewritten}"
        );

        let key_id = rewritten
            .lines()
            .find(|l| l.contains("EXT-X-KEY"))
            .and_then(remote_id_from_line)
            .expect("key id");
        let key_entry = proxy.get(&key_id).expect("key entry");
        assert_eq!(key_entry.upstream_url, "https://vixcloud.cc/storage/enc.key");
        assert!(
            !key_entry.rewrite_manifest,
            "la chiave AES è binaria: deve restare opaca"
        );
    }

    #[test]
    fn proxies_media_segments_without_vpn() {
        let proxy = AddonProxyRegistry::new();
        let media = r#"#EXTM3U
#EXTINF:4.0,
https://cdn.example/seg/001.ts?token=s1
#EXTINF:4.0,
https://cdn.example/seg/002.m4s?token=s2"#;

        let rewritten = proxy.rewrite_hls_manifest(
            media,
            "https://vixcloud.cc/playlist/1?type=video",
            &headers(),
            false,
        );

        assert_eq!(rewritten.matches("/remote/").count(), 2, "{rewritten}");
        assert!(!rewritten.contains("cdn.example/seg/"), "{rewritten}");

        let seg_id = rewritten
            .lines()
            .find(|l| !l.starts_with('#') && l.contains("/remote/"))
            .and_then(remote_id_from_line)
            .expect("seg id");
        assert!(!proxy.get(&seg_id).expect("seg entry").rewrite_manifest);
    }

    /// Regressione 0.2.19–0.2.21: le chiavi su `/playlist/...?type=key`
    /// finivano registrate come m3u8 e il body veniva corrotto.
    #[test]
    fn vixcloud_playlist_path_keys_stay_opaque() {
        let proxy = AddonProxyRegistry::new();
        let media = r#"#EXTM3U
#EXT-X-TARGETDURATION:8
#EXT-X-KEY:METHOD=AES-128,URI="https://vixcloud.cc/playlist/abcd?type=key&token=k"
#EXTINF:4.0,
https://cdn.example/seg/001.ts"#;

        let rewritten = proxy.rewrite_hls_manifest(
            media,
            "https://vixcloud.cc/playlist/1?type=video",
            &headers(),
            false,
        );
        let key_id = rewritten
            .lines()
            .find(|l| l.contains("EXT-X-KEY"))
            .and_then(remote_id_from_line)
            .expect("key id");
        let entry = proxy.get(&key_id).expect("key entry");
        assert!(!entry.rewrite_manifest);
        assert!(entry.upstream_url.contains("type=key"));
    }

    /// Regressione 0.2.19: i segmenti restavano sul CDN e il browser non poteva
    /// impostare il Referer richiesto.
    #[test]
    fn proxies_segments_when_vpn_enabled() {
        let proxy = AddonProxyRegistry::new();
        let media = r#"#EXTM3U
#EXTINF:4.0,
https://cdn.example/seg/001.ts"#;

        let rewritten = proxy.rewrite_hls_manifest(
            media,
            "https://vixcloud.cc/playlist/1?type=video",
            &HashMap::new(),
            true,
        );

        assert!(!rewritten.contains("cdn.example"), "{rewritten}");
        let id = remote_id_from_line(
            rewritten.lines().find(|l| l.contains("/remote/")).expect("seg"),
        )
        .expect("id");
        assert!(proxy.get(&id).expect("entry").use_proxy);
    }

    /// Regressione 0.2.23: i ticket firmati gonfiavano ogni URL di segmento.
    #[test]
    fn segment_urls_stay_short() {
        let proxy = AddonProxyRegistry::new();
        let id = proxy.register(
            "https://cdn.example/seg/001.ts".into(),
            headers(),
            false,
            false,
        );
        assert_eq!(id.len(), 16, "id proxy troppo lungo: {id}");
        assert!(id.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn reuses_stable_id_for_same_upstream() {
        let proxy = AddonProxyRegistry::new();
        let a = proxy.register(
            "https://cdn.example/seg/001.ts".into(),
            headers(),
            false,
            false,
        );
        let b = proxy.register(
            "https://cdn.example/seg/001.ts".into(),
            headers(),
            false,
            false,
        );
        assert_eq!(a, b, "stesso upstream deve riusare lo stesso id proxy");
        assert_eq!(proxy.entries.lock().unwrap().len(), 1);
    }

    #[test]
    fn trims_huge_live_media_window() {
        let mut body = String::from(
            "#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:100\n#EXT-X-PROGRAM-DATE-TIME:2026-01-01T00:00:00Z\n",
        );
        for i in 0..50 {
            body.push_str(&format!("#EXTINF:10.0,\nhttps://cdn.example/seg/{i}.ts\n"));
        }
        let trimmed = trim_live_media_window(&body, 5);
        assert!(
            !trimmed.contains("#EXT-X-PROGRAM-DATE-TIME"),
            "PDT stale rimossa"
        );
        assert!(
            trimmed.contains("#EXT-X-MEDIA-SEQUENCE:145"),
            "sequence aggiornata: {trimmed}"
        );
        assert_eq!(
            trimmed.matches("#EXTINF").count(),
            5,
            "solo coda: {trimmed}"
        );
        assert!(trimmed.contains("seg/49.ts"));
        assert!(!trimmed.contains("seg/0.ts"));

        let vod = format!("{body}#EXT-X-ENDLIST\n");
        assert_eq!(
            trim_live_media_window(&vod, 5).matches("#EXTINF").count(),
            50,
            "VOD non va trimmata"
        );
    }

    #[test]
    fn detects_manifest_kind() {
        assert_eq!(
            ManifestKind::detect("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nhttp://a/b"),
            ManifestKind::Master
        );
        assert_eq!(
            ManifestKind::detect("#EXTM3U\n#EXT-X-TARGETDURATION:8\n#EXTINF:8,\nhttp://a/b.ts"),
            ManifestKind::Media
        );
    }

    #[test]
    fn sniffing_catches_misclassified_playlists() {
        assert!(looks_like_hls_manifest(b"#EXTM3U\n#EXT-X-VERSION:3"));
        assert!(looks_like_hls_manifest(b"\n  #EXTM3U\n"));
        // Chiave AES binaria: mai scambiata per una playlist.
        assert!(!looks_like_hls_manifest(&[0xb2, 0x07, 0x82, 0xcb, 0xc3, 0x2a]));
        assert!(!looks_like_hls_manifest(b""));

        let entry = ProxyEntry {
            upstream_url: "https://cdn.example/seg/001.ts".into(),
            request_headers: HashMap::new(),
            rewrite_manifest: false,
            use_proxy: false,
            created_at: Instant::now(),
        };
        // Segmento normale: nessun buffering.
        assert!(!should_sniff_manifest(&entry, Some("video/mp2t")));
        // Ma se l'upstream dichiara una playlist, il proxy la ricontrolla
        // comunque anche se era stata registrata opaca.
        assert!(should_sniff_manifest(&entry, Some("application/vnd.apple.mpegurl")));

        let key = ProxyEntry {
            upstream_url: "https://vixcloud.cc/playlist/1?type=key".into(),
            request_headers: HashMap::new(),
            rewrite_manifest: false,
            use_proxy: false,
            created_at: Instant::now(),
        };
        assert!(!should_sniff_manifest(&key, Some("application/octet-stream")));

        // Esatto bug live 0.2.23: variante video registrata opaca (`r:false` nel
        // ticket). Senza sniff la media playlist restava grezza.
        let misclassified = ProxyEntry {
            upstream_url: "https://vixcloud.cc/playlist/775090?type=video&rendition=720p"
                .into(),
            request_headers: HashMap::new(),
            rewrite_manifest: false,
            use_proxy: false,
            created_at: Instant::now(),
        };
        assert!(
            should_sniff_manifest(&misclassified, Some("application/vnd.apple.mpegurl")),
            "variante video opaca deve essere sniffata e riscritta"
        );
        assert!(should_sniff_manifest(&misclassified, None));
    }

    #[test]
    fn preserves_query_on_relative_m3u8_join() {
        let base = url::Url::parse(
            "https://cdn.example/hls/playlist_mo.m3u8?baseuri=%2Fhls%2F&tk2=abc",
        )
        .unwrap();
        let joined = resolve_url(Some(&base), "rainews_2400/chunklist.m3u8");
        assert!(
            joined.contains("tk2=abc"),
            "query token perso sul livello HLS: {joined}"
        );
        assert!(
            joined.contains("rainews_2400/chunklist.m3u8"),
            "{joined}"
        );
        // I segmenti .ts non devono ereditare la query del master.
        let seg = resolve_url(
            Some(
                &url::Url::parse("https://cdn.example/hls/rainews_2400/chunklist.m3u8?tk2=abc")
                    .unwrap(),
            ),
            "0xrluj8g/media_1.ts",
        );
        assert!(
            !seg.contains("tk2="),
            "query non doveva finire sul segmento: {seg}"
        );
    }
}
