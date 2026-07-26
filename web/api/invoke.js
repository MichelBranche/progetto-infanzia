export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
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

  const body = req.body ?? {};
  if (!body.command || typeof body.command !== "string") {
    res.status(400).json({ ok: false, error: "Campo command mancante" });
    return;
  }

  try {
    const upstream = await fetch(`${apiBase}/api/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        command: body.command,
        args: body.args ?? {},
      }),
    });

    const payload = await upstream.json().catch(() => ({
      ok: false,
      error: "Risposta API non valida",
    }));

    res.status(upstream.status).json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Errore proxy verso API Rust";
    res.status(502).json({ ok: false, error: message });
  }
}
