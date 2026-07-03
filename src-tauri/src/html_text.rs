use regex::Regex;

/// Decodifica entità HTML (anche doppie come `&amp;#039;` → `'`).
pub fn decode_html_entities(raw: &str) -> String {
    let mut s = raw.trim().to_string();
    if s.is_empty() {
        return s;
    }

    let dec_re = Regex::new(r"&#(\d+);").expect("html dec entity");
    let hex_re = Regex::new(r"&#x([0-9a-fA-F]+);").expect("html hex entity");
    let named: [(&str, &str); 12] = [
        ("&nbsp;", " "),
        ("&middot;", "·"),
        ("&hellip;", "…"),
        ("&rsquo;", "'"),
        ("&lsquo;", "'"),
        ("&rdquo;", "\""),
        ("&ldquo;", "\""),
        ("&apos;", "'"),
        ("&#039;", "'"),
        ("&quot;", "\""),
        ("&lt;", "<"),
        ("&gt;", ">"),
    ];

    for _ in 0..4 {
        let prev = s.clone();
        s = dec_re
            .replace_all(&s, |caps: &regex::Captures| {
                caps.get(1)
                    .and_then(|m| m.as_str().parse::<u32>().ok())
                    .and_then(char::from_u32)
                    .map(|c| c.to_string())
                    .unwrap_or_else(|| caps[0].to_string())
            })
            .into_owned();
        s = hex_re
            .replace_all(&s, |caps: &regex::Captures| {
                caps.get(1)
                    .and_then(|m| u32::from_str_radix(m.as_str(), 16).ok())
                    .and_then(char::from_u32)
                    .map(|c| c.to_string())
                    .unwrap_or_else(|| caps[0].to_string())
            })
            .into_owned();
        for (entity, ch) in named {
            s = s.replace(entity, ch);
        }
        s = s.replace("&amp;", "&");
        if s == prev {
            break;
        }
    }

    s.replace('\u{2019}', "'")
        .replace('\u{2018}', "'")
        .replace('\u{201C}', "\"")
        .replace('\u{201D}', "\"")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_html_entities_in_titles() {
        assert_eq!(decode_html_entities("Tom &amp; Jerry"), "Tom & Jerry");
        assert_eq!(
            decode_html_entities("&amp;quot;Hello&amp;quot;"),
            "\"Hello\""
        );
        assert_eq!(decode_html_entities("Demon&#39;s Slayer"), "Demon's Slayer");
        assert_eq!(decode_html_entities("L&#039;ape Maia"), "L'ape Maia");
        assert_eq!(
            decode_html_entities("A&amp;B &quot;Test&quot;"),
            "A&B \"Test\""
        );
        assert_eq!(decode_html_entities("&#8217;"), "'");
    }
}
