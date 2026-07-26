/**
 * Proxy Web Analytics Vercel per l'Area Dev.
 *
 * Env su Vercel:
 * - VERCEL_API_TOKEN
 * - VERCEL_PROJECT_ID
 * - VERCEL_TEAM_ID (opzionale)
 * - SUPABASE_URL + SUPABASE_ANON_KEY (o VITE_*) per auth admin
 */
import { createClient } from "@supabase/supabase-js";

const DEV_ADMIN_EMAIL = "yutubecraft1234@gmail.com";

function env(...keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

async function assertDevAdmin(req) {
  const auth = req.headers.authorization;
  const token = auth?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;

  const url = env("SUPABASE_URL", "VITE_SUPABASE_URL");
  const key = env(
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  );
  if (!url || !key) return false;

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) return false;
  return data.user.email.trim().toLowerCase() === DEV_ADMIN_EMAIL.toLowerCase();
}

async function vercelVisits(pathSuffix, params) {
  const token = env("VERCEL_API_TOKEN", "VERCEL_TOKEN");
  const projectId = env("VERCEL_PROJECT_ID");
  const teamId = env("VERCEL_TEAM_ID", "VERCEL_ORG_ID");
  if (!token || !projectId) return { configured: false };

  const qs = new URLSearchParams({ projectId, ...params });
  if (teamId) qs.set("teamId", teamId);

  const url = `https://api.vercel.com/v1/query/web-analytics/visits/${pathSuffix}?${qs}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      body?.error?.message || body?.message || `Vercel HTTP ${res.status}`,
    );
  }
  return { configured: true, body };
}

function pickMetric(data, keys) {
  if (!data || typeof data !== "object") return null;
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  // Some responses nest under metrics
  if (data.metrics && typeof data.metrics === "object") {
    return pickMetric(data.metrics, keys);
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Metodo non consentito" });
    return;
  }

  if (!(await assertDevAdmin(req))) {
    res.status(403).json({ ok: false, error: "Accesso riservato" });
    return;
  }

  if (!env("VERCEL_API_TOKEN", "VERCEL_TOKEN") || !env("VERCEL_PROJECT_ID")) {
    res.status(200).json({
      ok: true,
      configured: false,
      hint:
        "Su Vercel Project → Settings → Environment Variables: VERCEL_API_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID.",
    });
    return;
  }

  try {
    const until = Date.now();
    const since7d = until - 7 * 24 * 60 * 60 * 1000;
    const since24h = until - 24 * 60 * 60 * 1000;

    const [count7d, count24h, aggregate] = await Promise.all([
      vercelVisits("count", {
        since: String(since7d),
        until: String(until),
      }),
      vercelVisits("count", {
        since: String(since24h),
        until: String(until),
      }),
      vercelVisits("aggregate", {
        since: String(since7d),
        until: String(until),
        by: "day",
      }),
    ]);

    const data7 = count7d.body?.data ?? count7d.body;
    const data24 = count24h.body?.data ?? count24h.body;
    const rows = Array.isArray(aggregate.body?.data)
      ? aggregate.body.data
      : Array.isArray(aggregate.body)
        ? aggregate.body
        : [];

    const series = rows
      .map((row) => ({
        key: String(row.day ?? row.date ?? row.timestamp ?? ""),
        visitors: Number(row.visitors ?? row.visitor ?? 0) || 0,
        pageviews: Number(row.pageviews ?? row.pageViews ?? row.views ?? 0) || 0,
      }))
      .filter((row) => row.key);

    res.status(200).json({
      ok: true,
      configured: true,
      window: {
        since: new Date(since7d).toISOString(),
        until: new Date(until).toISOString(),
      },
      totals: {
        visitors7d: pickMetric(data7, ["visitors", "visitor", "uniqueVisitors"]),
        pageviews7d: pickMetric(data7, [
          "pageviews",
          "pageViews",
          "views",
          "total",
        ]),
        visitors24h: pickMetric(data24, [
          "visitors",
          "visitor",
          "uniqueVisitors",
        ]),
        pageviews24h: pickMetric(data24, [
          "pageviews",
          "pageViews",
          "views",
          "total",
        ]),
      },
      series,
    });
  } catch (err) {
    res.status(502).json({
      ok: false,
      configured: true,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
