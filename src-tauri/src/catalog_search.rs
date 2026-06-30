use crate::db::Database;
use crate::saturn_catalog;
use crate::sc_catalog;
use crate::sc_playback;
use crate::stremio::StremioMetaPreview;
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

const CACHE_TTL: Duration = Duration::from_secs(600);
const CACHE_MAX_ENTRIES: usize = 24;

struct SearchCacheEntry {
    items: Vec<StremioMetaPreview>,
    at: Instant,
}

static SEARCH_CACHE: LazyLock<Mutex<HashMap<String, SearchCacheEntry>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchCatalogPage {
    pub items: Vec<StremioMetaPreview>,
    pub total: usize,
    pub offset: usize,
    pub has_more: bool,
}

fn prune_cache(cache: &mut HashMap<String, SearchCacheEntry>) {
    if cache.len() <= CACHE_MAX_ENTRIES {
        return;
    }
    let mut keys: Vec<_> = cache
        .iter()
        .map(|(k, v)| (k.clone(), v.at))
        .collect();
    keys.sort_by_key(|(_, at)| *at);
    let remove = cache.len().saturating_sub(CACHE_MAX_ENTRIES);
    for (key, _) in keys.into_iter().take(remove) {
        cache.remove(&key);
    }
}

fn run_search(
    db: &Database,
    query: &str,
    sc_enabled: bool,
    saturn_enabled: bool,
    cdn: &str,
    locale: &str,
) -> Vec<StremioMetaPreview> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut push_unique = |items: Vec<StremioMetaPreview>| {
        for item in items {
            let key = format!("{}:{}", item.r#type, item.id);
            if seen.insert(key) {
                out.push(item);
            }
        }
    };

    if sc_enabled {
        push_unique(sc_catalog::search_index(db, query));
        if let Ok(app) = sc_catalog::resolve_app_url(db) {
            if let Ok(live) = sc_playback::search_titles(&app, cdn, locale, query) {
                push_unique(live);
            }
        }
    }
    if saturn_enabled {
        push_unique(saturn_catalog::search_titles(db, query));
    }

    out
}

fn cached_search(
    db: &Database,
    query: &str,
    sc_enabled: bool,
    saturn_enabled: bool,
    cdn: &str,
    locale: &str,
) -> Vec<StremioMetaPreview> {
    let key = query.trim().to_lowercase();
    if key.len() < 2 {
        return Vec::new();
    }

    let mut guard = match SEARCH_CACHE.lock() {
        Ok(g) => g,
        Err(_) => {
            return run_search(db, query, sc_enabled, saturn_enabled, cdn, locale);
        }
    };

    if let Some(entry) = guard.get(&key) {
        if entry.at.elapsed() < CACHE_TTL {
            return entry.items.clone();
        }
    }

    let items = run_search(db, query, sc_enabled, saturn_enabled, cdn, locale);
    guard.insert(
        key,
        SearchCacheEntry {
            items: items.clone(),
            at: Instant::now(),
        },
    );
    prune_cache(&mut guard);
    items
}

pub fn search_catalog_page(
    db: &Database,
    query: &str,
    offset: usize,
    limit: usize,
    sc_enabled: bool,
    saturn_enabled: bool,
    cdn: &str,
    locale: &str,
) -> SearchCatalogPage {
    let limit = limit.clamp(1, 96);
    let items = cached_search(db, query, sc_enabled, saturn_enabled, cdn, locale);
    let total = items.len();
    let end = offset.saturating_add(limit).min(total);
    let page_items = if offset < total {
        items[offset..end].to_vec()
    } else {
        Vec::new()
    };
    let has_more = end < total;

    SearchCatalogPage {
        items: page_items,
        total,
        offset,
        has_more,
    }
}

pub fn clear_search_cache() {
    if let Ok(mut guard) = SEARCH_CACHE.lock() {
        guard.clear();
    }
}
