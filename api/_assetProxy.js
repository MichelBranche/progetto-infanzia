/**
 * Proxy GET/HEAD verso BRANCHEFY_API_URL (poster, sc-image, …).
 */
export async function proxyAssetRequest(req, res, upstreamPath) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).json({ ok: false, error: "Metodo non consentito" });
    return;
  }

  const apiBase = process.env.BRANCHEFY_API_URL?.trim().replace(/\/$/, "");
  if (!apiBase) {
    res.status(500).json({
      ok: false,
      error: "BRANCHEFY_API_URL non configurato su Vercel",
    });
    return;
  }

  const query = req.url?.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const target = `${apiBase}${upstreamPath}${query}`;

  try {
    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;
    if (req.headers["if-none-match"]) {
      headers["If-None-Match"] = req.headers["if-none-match"];
    }
    if (req.headers["if-modified-since"]) {
      headers["If-Modified-Since"] = req.headers["if-modified-since"];
    }

    const upstream = await fetch(target, {
      method: req.method,
      headers,
    });

    res.status(upstream.status);

    const passHeaders = [
      "content-type",
      "content-length",
      "cache-control",
      "etag",
      "last-modified",
      "accept-ranges",
      "content-range",
    ];
    for (const name of passHeaders) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.send(buffer);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Errore proxy asset verso API Rust";
    res.status(502).json({ ok: false, error: message });
  }
}

export function joinProxyPath(segments) {
  if (!segments) return "";
  const parts = Array.isArray(segments) ? segments : [segments];
  return parts.map((part) => String(part)).join("/");
}
