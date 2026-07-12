use std::collections::HashMap;
use std::time::Duration;

use serde::Serialize;

#[derive(Debug, Clone, Copy)]
struct BucketStat {
    weight: f64,
    r_sum: f64,
    g_sum: f64,
    b_sum: f64,
    count: u32,
}

#[derive(Debug, Serialize)]
pub struct ImagePalette {
    pub hues: [f64; 3],
    pub accents: [[u8; 3]; 3],
}

fn rgb_to_hsl(r: u8, g: u8, b: u8) -> (f64, f64, f64) {
    let rn = f64::from(r) / 255.0;
    let gn = f64::from(g) / 255.0;
    let bn = f64::from(b) / 255.0;
    let max = rn.max(gn).max(bn);
    let min = rn.min(gn).min(bn);
    let lightness = (max + min) / 2.0;
    let mut hue = 0.0;
    let mut saturation = 0.0;

    if (max - min).abs() > f64::EPSILON {
        let delta = max - min;
        saturation = if lightness > 0.5 {
            delta / (2.0 - max - min)
        } else {
            delta / (max + min)
        };
        hue = if (max - rn).abs() < f64::EPSILON {
            ((gn - bn) / delta + if gn < bn { 6.0 } else { 0.0 }) / 6.0
        } else if (max - gn).abs() < f64::EPSILON {
            ((bn - rn) / delta + 2.0) / 6.0
        } else {
            ((rn - gn) / delta + 4.0) / 6.0
        };
    }

    (hue * 360.0, saturation * 100.0, lightness * 100.0)
}

fn hsl_to_rgb(h: f64, s: f64, l: f64) -> [u8; 3] {
    let sn = (s / 100.0).clamp(0.0, 1.0);
    let ln = (l / 100.0).clamp(0.0, 1.0);
    if sn <= f64::EPSILON {
        let v = (ln * 255.0).round() as u8;
        return [v, v, v];
    }

    let q = if ln < 0.5 {
        ln * (1.0 + sn)
    } else {
        ln + sn - ln * sn
    };
    let p = 2.0 * ln - q;
    let hk = (h / 360.0).rem_euclid(1.0);

    let r = hue_to_channel(p, q, hk + 1.0 / 3.0);
    let g = hue_to_channel(p, q, hk);
    let b = hue_to_channel(p, q, hk - 1.0 / 3.0);
    [
        (r * 255.0).round() as u8,
        (g * 255.0).round() as u8,
        (b * 255.0).round() as u8,
    ]
}

fn hue_to_channel(p: f64, q: f64, mut t: f64) -> f64 {
    if t < 0.0 {
        t += 1.0;
    }
    if t > 1.0 {
        t -= 1.0;
    }
    if t < 1.0 / 6.0 {
        return p + (q - p) * 6.0 * t;
    }
    if t < 1.0 / 2.0 {
        return q;
    }
    if t < 2.0 / 3.0 {
        return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
    }
    p
}

fn validate_remote_url(url: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url.trim()).map_err(|e| format!("URL non valido: {e}"))?;
    match parsed.scheme() {
        "http" | "https" => {}
        _ => return Err("Solo URL http/https sono supportati.".to_string()),
    }

    if let Some(host) = parsed.host_str() {
        let lower = host.to_ascii_lowercase();
        if lower == "localhost"
            || lower.ends_with(".localhost")
            || lower == "127.0.0.1"
            || lower == "::1"
        {
            return Err("URL locale non consentito.".to_string());
        }
    }

    Ok(parsed)
}

fn is_bare_sc_image_filename(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.len() >= 40
        && lower.ends_with(".webp")
        && lower
            .trim_end_matches(".webp")
            .chars()
            .all(|c| c.is_ascii_hexdigit() || c == '-')
}

fn resolve_palette_fetch_url(url: &str) -> Result<String, String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("URL vuoto.".to_string());
    }

    if let Some(rest) = trimmed.strip_prefix("/sc-image/") {
        return Ok(format!(
            "https://cdn.streamingcommunityz.tech/images/{}",
            rest.trim_start_matches('/')
        ));
    }

    if let Some(pos) = trimmed.find("/sc-image/") {
        let rest = &trimmed[pos + "/sc-image/".len()..];
        return Ok(format!(
            "https://cdn.streamingcommunityz.tech/images/{}",
            rest.trim_start_matches('/')
        ));
    }

    if is_bare_sc_image_filename(trimmed) {
        return Ok(format!(
            "https://cdn.streamingcommunityz.tech/images/{trimmed}"
        ));
    }

    Ok(trimmed.to_string())
}

fn default_image_palette() -> ImagePalette {
    ImagePalette {
        hues: [275.0, 285.0, 262.0],
        accents: [[88, 28, 135], [59, 7, 100], [49, 10, 80]],
    }
}

async fn extract_image_palette_inner(url: &str) -> Option<ImagePalette> {
    let resolved = resolve_palette_fetch_url(url).ok()?;
    let parsed = validate_remote_url(&resolved).ok()?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Branchefy/0.1",
        )
        .build()
        .ok()?;

    let referer = if resolved.to_ascii_lowercase().contains("streamingcommunity") {
        "https://streamingcommunityz.tech/"
    } else {
        "https://www.themoviedb.org/"
    };

    let response = client
        .get(parsed)
        .header("Referer", referer)
        .send()
        .await
        .ok()?;

    if !response.status().is_success() {
        return None;
    }

    let bytes = response.bytes().await.ok()?;
    let image = image::load_from_memory(&bytes).ok()?;
    let rgba = image.to_rgba8();
    extract_palette_from_rgba(&rgba)
}

fn boost_accent(rgb: [u8; 3], min_lightness: f64, min_saturation: f64) -> [u8; 3] {
    let (h, s, l) = rgb_to_hsl(rgb[0], rgb[1], rgb[2]);
    hsl_to_rgb(h, s.max(min_saturation), l.max(min_lightness))
}

fn accent_from_bucket(stat: &BucketStat) -> [u8; 3] {
    if stat.count == 0 {
        return [88, 28, 135];
    }
    boost_accent(
        [
            (stat.r_sum / f64::from(stat.count)).round() as u8,
            (stat.g_sum / f64::from(stat.count)).round() as u8,
            (stat.b_sum / f64::from(stat.count)).round() as u8,
        ],
        46.0,
        58.0,
    )
}

fn extract_palette_from_rgba(rgba: &image::RgbaImage) -> Option<ImagePalette> {
    let (width, height) = rgba.dimensions();
    if width == 0 || height == 0 {
        return None;
    }

    let (width, height) = rgba.dimensions();
    if width == 0 || height == 0 {
        return None;
    }

    let is_portrait = width < height;
    let (start_x, start_y, sample_w, sample_h) = if is_portrait {
        let crop = width.min(height);
        let sx = (width - crop) / 2;
        let sy = (height - crop) / 2;
        (sx, sy, crop, crop)
    } else {
        let crop_width = ((width as f32) * 0.52).max(1.0) as u32;
        (0, 0, crop_width, height)
    };

    let mut buckets: HashMap<u32, BucketStat> = HashMap::new();

    for y in start_y..(start_y + sample_h) {
        for x in start_x..(start_x + sample_w) {
            if ((x - start_x) + (y - start_y)) % 2 != 0 {
                continue;
            }
            let pixel = rgba.get_pixel(x, y);
            let alpha = pixel[3];
            if alpha < 40 {
                continue;
            }

            let (hue, saturation, lightness) = rgb_to_hsl(pixel[0], pixel[1], pixel[2]);
            if lightness < 8.0 || lightness > 88.0 || saturation < 12.0 {
                continue;
            }

            let bucket = (hue / 16.0).round() as u32 * 16;
            let entry = buckets.entry(bucket).or_insert(BucketStat {
                weight: 0.0,
                r_sum: 0.0,
                g_sum: 0.0,
                b_sum: 0.0,
                count: 0,
            });
            entry.weight += saturation * (lightness / 52.0).max(0.4);
            entry.r_sum += f64::from(pixel[0]);
            entry.g_sum += f64::from(pixel[1]);
            entry.b_sum += f64::from(pixel[2]);
            entry.count += 1;
        }
    }

    let mut sorted: Vec<(u32, BucketStat)> = buckets.into_iter().collect();
    sorted.sort_by(|a, b| {
        b.1
            .weight
            .partial_cmp(&a.1.weight)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    if sorted.is_empty() {
        return None;
    }

    let primary_hue = f64::from(sorted[0].0);
    let secondary_hue = sorted
        .get(1)
        .map(|entry| f64::from(entry.0))
        .unwrap_or((primary_hue + 24.0) % 360.0);
    let tertiary_hue = sorted
        .get(2)
        .map(|entry| f64::from(entry.0))
        .unwrap_or((primary_hue - 20.0 + 360.0) % 360.0);

    let accent_a = accent_from_bucket(&sorted[0].1);
    let accent_b = sorted
        .get(1)
        .map(|entry| accent_from_bucket(&entry.1))
        .unwrap_or(hsl_to_rgb(secondary_hue, 72.0, 42.0));
    let accent_c = sorted
        .get(2)
        .map(|entry| accent_from_bucket(&entry.1))
        .unwrap_or(hsl_to_rgb(tertiary_hue, 68.0, 36.0));

    Some(ImagePalette {
        hues: [primary_hue, secondary_hue, tertiary_hue],
        accents: [accent_a, accent_b, accent_c],
    })
}

#[tauri::command]
pub async fn extract_image_palette_cmd(url: String) -> Result<ImagePalette, String> {
    Ok(extract_image_palette_inner(&url)
        .await
        .unwrap_or_else(default_image_palette))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_local_urls() {
        assert!(validate_remote_url("http://localhost/poster.jpg").is_err());
        assert!(validate_remote_url("https://127.0.0.1/x").is_err());
    }
}
