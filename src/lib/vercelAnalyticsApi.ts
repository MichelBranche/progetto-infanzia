import { getSupabase } from "./supabaseClient";

export type VercelAnalyticsSnapshot = {
  configured: boolean;
  hint?: string;
  error?: string;
  window?: { since: string; until: string };
  totals?: {
    visitors7d: number | null;
    pageviews7d: number | null;
    visitors24h: number | null;
    pageviews24h: number | null;
  };
  series?: Array<{ key: string; visitors: number; pageviews: number }>;
};

export async function fetchVercelWebAnalytics(): Promise<VercelAnalyticsSnapshot> {
  const supabase = getSupabase();
  const { data: sessionData } = (await supabase?.auth.getSession()) ?? {
    data: { session: null },
  };
  const token = sessionData.session?.access_token;
  if (!token) {
    return { configured: false, error: "Sessione cloud richiesta" };
  }

  try {
    const res = await fetch("/api/dev-vercel-analytics", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await res.json().catch(() => ({}))) as VercelAnalyticsSnapshot & {
      ok?: boolean;
    };

    if (res.status === 404) {
      return {
        configured: false,
        hint:
          "Endpoint disponibile sul deploy Vercel. In locale le metriche Vercel non sono raggiungibili.",
      };
    }

    if (!res.ok) {
      return {
        configured: body.configured ?? true,
        error: body.error ?? `HTTP ${res.status}`,
        hint: body.hint,
      };
    }

    return {
      configured: Boolean(body.configured),
      hint: body.hint,
      error: body.error,
      window: body.window,
      totals: body.totals,
      series: body.series,
    };
  } catch {
    return {
      configured: false,
      hint:
        "Endpoint disponibile sul deploy Vercel. In locale le metriche Vercel non sono raggiungibili.",
    };
  }
}
