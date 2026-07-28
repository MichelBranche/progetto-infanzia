/**
 * Check ban IP (guest) + report IP / check ban account (autenticato).
 *
 * Env Vercel:
 * - SUPABASE_URL (o VITE_SUPABASE_URL)
 * - SUPABASE_SERVICE_ROLE_KEY (obbligatoria)
 * - SUPABASE_ANON_KEY / PUBLISHABLE (per verificare JWT)
 */
import { createClient } from "@supabase/supabase-js";

function env(...keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return String(forwarded[0]).split(",")[0].trim();
  }
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.trim()) return real.trim();
  return req.socket?.remoteAddress || null;
}

function adminClient() {
  const url = env("SUPABASE_URL", "VITE_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function anonClient() {
  const url = env("SUPABASE_URL", "VITE_SUPABASE_URL");
  const key = env(
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  );
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isBanActive(row) {
  if (!row || !row.active) return false;
  if (!row.expires_at) return true;
  return Date.parse(row.expires_at) > Date.now();
}

async function checkIpBanned(supabase, ip) {
  if (!ip) return null;
  const { data, error } = await supabase
    .from("banned_ips")
    .select("ip, reason, expires_at, active")
    .eq("ip", ip)
    .maybeSingle();
  if (error || !isBanActive(data)) return null;
  return data;
}

async function checkUserBanned(supabase, userId) {
  const { data, error } = await supabase
    .from("user_bans")
    .select("user_id, reason, expires_at, active")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !isBanActive(data)) return null;
  return data;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Metodo non consentito" });
    return;
  }

  const supabase = adminClient();
  if (!supabase) {
    res.status(503).json({
      ok: false,
      error: "SUPABASE_SERVICE_ROLE_KEY non configurata su Vercel",
      blocked: false,
    });
    return;
  }

  const ip = clientIp(req);

  try {
    if (req.method === "GET") {
      const ban = await checkIpBanned(supabase, ip);
      if (ban) {
        res.status(200).json({
          ok: true,
          blocked: true,
          kind: "ip",
          reason: ban.reason ?? null,
          expiresAt: ban.expires_at ?? null,
          ip,
        });
        return;
      }
      res.status(200).json({ ok: true, blocked: false, ip });
      return;
    }

    // POST: JWT richiesto → sighting + check user/IP
    const auth = req.headers.authorization;
    const token = auth?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      res.status(401).json({ ok: false, error: "Token mancante", blocked: false });
      return;
    }

    const anon = anonClient();
    if (!anon) {
      res.status(503).json({
        ok: false,
        error: "Chiave anon Supabase non configurata",
        blocked: false,
      });
      return;
    }

    const { data: userData, error: userError } = await anon.auth.getUser(token);
    if (userError || !userData.user?.id) {
      res.status(401).json({ ok: false, error: "Sessione non valida", blocked: false });
      return;
    }

    const userId = userData.user.id;

    if (ip) {
      const now = new Date().toISOString();
      const { data: existing } = await supabase
        .from("user_ip_sightings")
        .select("user_id")
        .eq("user_id", userId)
        .eq("ip", ip)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("user_ip_sightings")
          .update({ last_seen_at: now })
          .eq("user_id", userId)
          .eq("ip", ip);
      } else {
        await supabase.from("user_ip_sightings").insert({
          user_id: userId,
          ip,
          first_seen_at: now,
          last_seen_at: now,
        });
      }
    }

    const userBan = await checkUserBanned(supabase, userId);
    if (userBan) {
      res.status(200).json({
        ok: true,
        blocked: true,
        kind: "user",
        reason: userBan.reason ?? null,
        expiresAt: userBan.expires_at ?? null,
        ip,
      });
      return;
    }

    const ipBan = await checkIpBanned(supabase, ip);
    if (ipBan) {
      res.status(200).json({
        ok: true,
        blocked: true,
        kind: "ip",
        reason: ipBan.reason ?? null,
        expiresAt: ipBan.expires_at ?? null,
        ip,
      });
      return;
    }

    res.status(200).json({ ok: true, blocked: false, ip });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore access-ip";
    res.status(500).json({ ok: false, error: message, blocked: false });
  }
}
