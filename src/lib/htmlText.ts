const NAMED_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&middot;": "·",
  "&hellip;": "…",
  "&rsquo;": "'",
  "&lsquo;": "'",
  "&rdquo;": '"',
  "&ldquo;": '"',
  "&apos;": "'",
  "&#039;": "'",
  "&quot;": '"',
  "&lt;": "<",
  "&gt;": ">",
};

export function decodeHtmlEntities(raw: string): string {
  let s = raw.trim();
  if (!s) return s;

  for (let pass = 0; pass < 4; pass++) {
    const prev = s;
    s = s.replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(Number(code)),
    );
    s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
    for (const [entity, ch] of Object.entries(NAMED_ENTITIES)) {
      if (s.includes(entity)) s = s.split(entity).join(ch);
    }
    s = s.replace(/&amp;/g, "&");
    if (s === prev) break;
  }

  return s
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'")
    .replace(/\u201C/g, '"')
    .replace(/\u201D/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Rimuove metadati SEO Loonex/streaming dalle sinossi in anteprima. */
export function cleanStreamingSynopsis(raw?: string, title?: string): string {
  if (!raw?.trim()) return "";
  let s = decodeHtmlEntities(raw);
  const patterns = [
    /^\s*📂\s*Categoria:[^👁\n]+/i,
    /👁️?\s*[\d.,]+\s*Visualizzazioni\s*•\s*🌟?\s*\d+\s*Vibes\s*/i,
    /Streaming gratis senza pubblicità in italiano,\s*tutti gli episodi[^.]*\.\s*/i,
    /tutti gli episodi\s*\/\s*puntate[^.]*\.\s*/i,
    /Streaming gratis[^.]*su loonex\.eu\.\s*/i,
    /guarda[^.]*su loonex\.eu\.\s*/i,
  ];
  for (const re of patterns) {
    s = s.replace(re, "");
  }
  if (title?.trim()) {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(`^\\s*${escaped}\\s*[-–:.]*\\s*`, "i"), "");
  }
  return s.replace(/\s+/g, " ").trim();
}
