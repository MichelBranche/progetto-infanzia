//! Matching e ranking smart condiviso per ricerca catalogo (SC, Saturn, Loonex, YouTube).

use crate::stremio::StremioMetaPreview;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum SearchIntentKind {
    Movie,
    Series,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum SearchIntentCatalog {
    Sc,
    Saturn,
    Loonex,
}

pub struct ParsedQuery {
    pub normalized: String,
    pub tokens: Vec<String>,
    pub year: Option<u16>,
    pub kind: Option<SearchIntentKind>,
    pub catalog_hint: Option<SearchIntentCatalog>,
}

fn strip_diacritics(ch: char) -> char {
    match ch {
        'à' | 'á' | 'â' | 'ä' | 'ã' | 'å' => 'a',
        'è' | 'é' | 'ê' | 'ë' => 'e',
        'ì' | 'í' | 'î' | 'ï' => 'i',
        'ò' | 'ó' | 'ô' | 'ö' | 'õ' => 'o',
        'ù' | 'ú' | 'û' | 'ü' => 'u',
        'ý' | 'ÿ' => 'y',
        'ñ' => 'n',
        'ç' => 'c',
        other => other,
    }
}

pub fn normalize_search_text(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut last_space = false;
    for ch in input.chars() {
        let lower = ch.to_lowercase().next().unwrap_or(ch);
        // Apostrofi: unisci le lettere (C'è → ce), senza spazio.
        if matches!(lower, '\'' | '`' | '´' | 'ʼ' | '＇') {
            continue;
        }
        let mapped = strip_diacritics(lower);
        if mapped.is_ascii_alphanumeric() {
            out.push(mapped);
            last_space = false;
        } else if !last_space && !out.is_empty() {
            out.push(' ');
            last_space = true;
        }
    }
    out.trim().to_string()
}

pub fn tokenize(input: &str) -> Vec<String> {
    normalize_search_text(input)
        .split_whitespace()
        .filter(|t| !t.is_empty())
        .map(|t| t.to_string())
        .collect()
}

pub fn parse_query(query: &str) -> ParsedQuery {
    let mut working = query.trim().to_string();
    let lower = working.to_lowercase();
    let mut kind = None;
    let mut catalog_hint = None;

    let kind_rules: &[(&[&str], SearchIntentKind)] = &[
        (&["film", "movie", "movies"], SearchIntentKind::Movie),
        (&["serie", "series", "serietv", "show"], SearchIntentKind::Series),
    ];
    for (words, k) in kind_rules {
        for w in *words {
            let needle = format!(" {w} ");
            let padded = format!(" {lower} ");
            if padded.contains(&needle) {
                kind = Some(*k);
                // rimuovi parola (case-insensitive grezzo)
                let re = regex_lite_remove(&working, w);
                working = re;
                break;
            }
        }
        if kind.is_some() {
            break;
        }
    }

    let catalog_rules: &[(&[&str], SearchIntentCatalog)] = &[
        (&["anime", "animesaturn", "saturn"], SearchIntentCatalog::Saturn),
        (
            &["cartoni", "cartoon", "cartone", "loonex", "youtube"],
            SearchIntentCatalog::Loonex,
        ),
        (&["streaming", "sc"], SearchIntentCatalog::Sc),
    ];
    let lower2 = working.to_lowercase();
    for (words, c) in catalog_rules {
        for w in *words {
            let needle = format!(" {w} ");
            let padded = format!(" {lower2} ");
            if padded.contains(&needle) {
                catalog_hint = Some(*c);
                working = regex_lite_remove(&working, w);
                break;
            }
        }
        if catalog_hint.is_some() {
            break;
        }
    }

    let tokens_all = tokenize(&working);
    let year = tokens_all.iter().find_map(|t| {
        if t.len() == 4 && t.chars().all(|c| c.is_ascii_digit()) {
            let y: u16 = t.parse().ok()?;
            if (1900..=2099).contains(&y) {
                return Some(y);
            }
        }
        None
    });
    let tokens: Vec<String> = tokens_all
        .into_iter()
        .filter(|t| !(t.len() == 4 && t.chars().all(|c| c.is_ascii_digit())))
        .collect();
    let normalized = tokens.join(" ");

    ParsedQuery {
        normalized,
        tokens,
        year,
        kind,
        catalog_hint,
    }
}

fn regex_lite_remove(input: &str, word: &str) -> String {
    let lower_word = word.to_lowercase();
    input
        .split_whitespace()
        .filter(|part| part.to_lowercase() != lower_word)
        .collect::<Vec<_>>()
        .join(" ")
}

fn edit_distance(a: &str, b: &str, max: usize) -> usize {
    if a == b {
        return 0;
    }
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a.len().abs_diff(b.len()) > max {
        return max + 1;
    }
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut curr = vec![0; b.len() + 1];
    for i in 1..=a.len() {
        curr[0] = i;
        let mut row_min = curr[0];
        for j in 1..=b.len() {
            let cost = if a[i - 1] == b[j - 1] { 0 } else { 1 };
            curr[j] = (prev[j] + 1)
                .min(curr[j - 1] + 1)
                .min(prev[j - 1] + cost);
            row_min = row_min.min(curr[j]);
        }
        if row_min > max {
            return max + 1;
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[b.len()]
}

fn fuzzy_allowed(token_len: usize) -> usize {
    if token_len <= 3 {
        0
    } else if token_len <= 5 {
        1
    } else if token_len <= 8 {
        2
    } else {
        3
    }
}

fn year_from_preview(preview: &StremioMetaPreview) -> Option<u16> {
    let info = preview.release_info.as_deref().unwrap_or("");
    for word in info.split(|c: char| !c.is_ascii_digit()) {
        if word.len() == 4 {
            if let Ok(y) = word.parse::<u16>() {
                if (1900..=2099).contains(&y) {
                    return Some(y);
                }
            }
        }
    }
    None
}

fn haystack(preview: &StremioMetaPreview) -> (String, Vec<String>) {
    let name = normalize_search_text(&preview.name);
    let slug = normalize_search_text(
        &preview
            .slug
            .as_deref()
            .unwrap_or("")
            .replace('-', " "),
    );
    let genres = preview
        .genres
        .iter()
        .map(|x| normalize_search_text(x))
        .collect::<Vec<_>>()
        .join(" ");
    let cast = preview
        .cast
        .iter()
        .map(|x| normalize_search_text(x))
        .collect::<Vec<_>>()
        .join(" ");
    let directors = preview
        .directors
        .iter()
        .map(|x| normalize_search_text(x))
        .collect::<Vec<_>>()
        .join(" ");
    let text = [name, slug, genres, cast, directors]
        .into_iter()
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    let words = text
        .split_whitespace()
        .map(|w| w.to_string())
        .collect();
    (text, words)
}

fn token_matches(token: &str, haystack: &str, words: &[String]) -> bool {
    if token.is_empty() {
        return true;
    }
    if haystack.contains(token) {
        return true;
    }
    let max = fuzzy_allowed(token.chars().count());
    if max == 0 {
        return false;
    }
    for word in words {
        if word.chars().count().abs_diff(token.chars().count()) > max {
            continue;
        }
        if edit_distance(token, word, max) <= max {
            return true;
        }
    }
    false
}

pub fn score_preview(preview: &StremioMetaPreview, parsed: &ParsedQuery) -> i32 {
    if parsed.normalized.is_empty()
        && parsed.year.is_none()
        && parsed.kind.is_none()
        && parsed.catalog_hint.is_none()
    {
        return 0;
    }

    if let Some(SearchIntentKind::Movie) = parsed.kind {
        if preview.r#type == "series" {
            return 0;
        }
    }
    if let Some(SearchIntentKind::Series) = parsed.kind {
        if preview.r#type == "movie" {
            return 0;
        }
    }

    if let Some(hint) = parsed.catalog_hint {
        let prefix = preview.catalog_prefix.as_deref().unwrap_or("");
        let ok = match hint {
            SearchIntentCatalog::Sc => prefix == "sc",
            SearchIntentCatalog::Saturn => prefix == "saturn",
            SearchIntentCatalog::Loonex => prefix == "loonex" || prefix == "youtube",
        };
        if !ok {
            return 0;
        }
    }

    let (text, words) = haystack(preview);
    if text.is_empty() && !parsed.tokens.is_empty() {
        return 0;
    }

    let mut score = 0i32;

    if !parsed.normalized.is_empty() {
        if text == parsed.normalized {
            score = 1000;
        } else if text.starts_with(&parsed.normalized) {
            score = 860;
        } else if words.iter().any(|w| w.starts_with(&parsed.normalized)) {
            score = 780;
        } else if text.contains(&parsed.normalized) {
            score = 680;
        } else {
            if !parsed
                .tokens
                .iter()
                .all(|t| token_matches(t, &text, &words))
            {
                return 0;
            }
            let mut token_score = 420;
            for token in &parsed.tokens {
                if words.iter().any(|w| w == token) {
                    token_score += 40;
                } else if words.iter().any(|w| w.starts_with(token)) {
                    token_score += 24;
                } else if text.contains(token) {
                    token_score += 12;
                } else {
                    let max = fuzzy_allowed(token.chars().count());
                    let mut best = max + 1;
                    for word in &words {
                        best = best.min(edit_distance(token, word, max));
                    }
                    token_score += (18 - (best as i32) * 8).max(0);
                }
            }
            score = token_score;
        }
    } else {
        score = 200;
    }

    if let Some(year) = parsed.year {
        match year_from_preview(preview) {
            Some(y) if y == year => score += 80,
            Some(_) => score -= 30,
            None => {}
        }
    }

    if let Some(kind) = parsed.kind {
        let matches = match kind {
            SearchIntentKind::Movie => preview.r#type == "movie",
            SearchIntentKind::Series => preview.r#type == "series",
        };
        if matches {
            score += 25;
        }
    }

    if !parsed.tokens.is_empty() {
        let people: Vec<String> = preview
            .cast
            .iter()
            .chain(preview.directors.iter())
            .map(|p| normalize_search_text(p))
            .filter(|p| !p.is_empty())
            .collect();
        for person in &people {
            if *person == parsed.normalized {
                score += 120;
                break;
            }
            if person.contains(&parsed.normalized) || parsed.normalized.contains(person) {
                score += 70;
                break;
            }
            if parsed.tokens.iter().all(|token| person.contains(token)) {
                score += 55;
                break;
            }
        }
    }

    let name_len = preview.name.chars().count();
    score += (24 - (name_len as i32 / 4).min(24)).max(0);
    score
}

pub fn filter_and_rank_previews(
    items: Vec<StremioMetaPreview>,
    query: &str,
    limit: usize,
) -> Vec<StremioMetaPreview> {
    let parsed = parse_query(query);
    if parsed.normalized.chars().count() < 2
        && parsed.year.is_none()
        && parsed.kind.is_none()
        && parsed.catalog_hint.is_none()
    {
        return Vec::new();
    }

    let mut scored: Vec<(i32, StremioMetaPreview)> = items
        .into_iter()
        .filter_map(|item| {
            let score = score_preview(&item, &parsed);
            if score > 0 {
                Some((score, item))
            } else {
                None
            }
        })
        .collect();

    scored.sort_by(|a, b| {
        b.0.cmp(&a.0)
            .then_with(|| a.1.name.to_lowercase().cmp(&b.1.name.to_lowercase()))
    });
    scored
        .into_iter()
        .take(limit)
        .map(|(_, item)| item)
        .collect()
}

pub fn rank_previews_keep_unmatched(
    items: Vec<StremioMetaPreview>,
    query: &str,
) -> Vec<StremioMetaPreview> {
    let parsed = parse_query(query);
    if parsed.normalized.is_empty()
        && parsed.year.is_none()
        && parsed.kind.is_none()
        && parsed.catalog_hint.is_none()
    {
        return items;
    }

    let mut scored = Vec::new();
    let mut rest = Vec::new();
    for item in items {
        let score = score_preview(&item, &parsed);
        if score > 0 {
            scored.push((score, item));
        } else {
            rest.push(item);
        }
    }
    scored.sort_by(|a, b| b.0.cmp(&a.0));
    let mut out: Vec<_> = scored.into_iter().map(|(_, i)| i).collect();
    out.append(&mut rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_accents_and_punctuation() {
        assert_eq!(normalize_search_text("C'è postà"), "ce posta");
        assert_eq!(normalize_search_text("Spider-Man"), "spider man");
    }

    #[test]
    fn scores_exact_above_partial() {
        let exact = StremioMetaPreview {
            id: "1".into(),
            r#type: "movie".into(),
            name: "Silo".into(),
            poster: None,
            background: None,
            logo: None,
            poster_shape: None,
            description: None,
            release_info: Some("2023".into()),
            catalog_prefix: Some("sc".into()),
            slug: Some("silo".into()),
            genres: Vec::new(),
            cast: Vec::new(),
            directors: Vec::new(),
            streaming_services: None,
            source_row_key: None,
            source_row_title: None,
            resume_video_id: None,
        };
        let mut partial = exact.clone();
        partial.name = "Silo Valley".into();
        partial.slug = Some("silo-valley".into());
        let parsed = parse_query("silo");
        assert!(score_preview(&exact, &parsed) > score_preview(&partial, &parsed));
    }
}
