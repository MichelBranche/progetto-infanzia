import { getSupabase } from "./supabaseClient";
import { isCloudEnabled } from "./cloudConfig";
import type { StremioMetaPreview } from "../types/stremio";
import type {
  BranchefyTopPreview,
  HomeTop10Config,
  HomeTop10Mode,
} from "../types/homeTop10";

function mapPreview(raw: Record<string, unknown>): StremioMetaPreview {
  return {
    id: String(raw.id ?? ""),
    type: String(raw.type ?? "movie"),
    name: String(raw.name ?? "Senza titolo"),
    poster: raw.poster ? String(raw.poster) : undefined,
    background: raw.background ? String(raw.background) : undefined,
    logo: raw.logo ? String(raw.logo) : undefined,
    catalogPrefix: raw.catalogPrefix
      ? String(raw.catalogPrefix)
      : raw.catalog_prefix
        ? String(raw.catalog_prefix)
        : "sc",
    slug: raw.slug ? String(raw.slug) : undefined,
    description: raw.description ? String(raw.description) : undefined,
    releaseInfo: raw.releaseInfo
      ? String(raw.releaseInfo)
      : raw.release_info
        ? String(raw.release_info)
        : undefined,
    comingSoon: Boolean(raw.comingSoon ?? raw.coming_soon),
  };
}

function mapConfig(data: Record<string, unknown>): HomeTop10Config {
  const modeRaw = String(data.mode ?? "sc");
  const mode: HomeTop10Mode =
    modeRaw === "branchefy" || modeRaw === "manual" ? modeRaw : "sc";
  const itemsRaw = Array.isArray(data.items) ? data.items : [];
  return {
    mode,
    items: itemsRaw
      .map((item) => mapPreview(item as Record<string, unknown>))
      .filter((item) => item.id.length > 0)
      .slice(0, 10),
    updatedAt: data.updated_at ? String(data.updated_at) : undefined,
  };
}

export async function fetchHomeTop10Config(): Promise<HomeTop10Config> {
  if (!isCloudEnabled()) {
    return { mode: "sc", items: [] };
  }
  const supabase = getSupabase();
  if (!supabase) return { mode: "sc", items: [] };

  const { data, error } = await supabase.rpc("get_home_top10");
  if (error || !data || typeof data !== "object") {
    return { mode: "sc", items: [] };
  }
  return mapConfig(data as Record<string, unknown>);
}

export async function fetchDevHomeTop10Config(): Promise<HomeTop10Config> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud non configurato");

  const { data, error } = await supabase
    .from("app_home_top10")
    .select("mode, items, updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { mode: "sc", items: [] };
  return mapConfig(data as Record<string, unknown>);
}

export async function saveDevHomeTop10Config(input: {
  mode: HomeTop10Mode;
  items: StremioMetaPreview[];
}): Promise<HomeTop10Config> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud non configurato");

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id ?? null;

  const payload = {
    id: 1,
    mode: input.mode,
    items: input.mode === "manual" ? input.items.slice(0, 10) : [],
    updated_at: new Date().toISOString(),
    updated_by: userId,
  };

  const { data, error } = await supabase
    .from("app_home_top10")
    .upsert(payload, { onConflict: "id" })
    .select("mode, items, updated_at")
    .single();

  if (error) throw new Error(error.message);
  return mapConfig(data as Record<string, unknown>);
}

export async function fetchDevBranchefyTopPreview(): Promise<BranchefyTopPreview[]> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Cloud non configurato");

  const { data, error } = await supabase.rpc("dev_branchefy_top10_preview");
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) return [];

  return data.map((row) => {
    const raw = row as Record<string, unknown>;
    return {
      ...mapPreview(raw),
      totalSeconds: Number(raw.total_seconds ?? raw.totalSeconds ?? 0) || 0,
      viewers: Number(raw.viewers ?? 0) || 0,
    };
  });
}

/** Arricchisce gli item salvati con poster/nome dal catalogo locale se mancanti. */
export function resolveTop10Items(
  items: StremioMetaPreview[],
  catalogIndex: StremioMetaPreview[],
): StremioMetaPreview[] {
  const byId = new Map<string, StremioMetaPreview>(
    catalogIndex.map((item) => [`${item.type}:${item.id}`, item]),
  );
  const bySlug = new Map<string, StremioMetaPreview>(
    catalogIndex
      .filter((item) => item.slug)
      .map((item) => [`${item.catalogPrefix ?? "sc"}:${item.slug}`, item]),
  );

  const out: StremioMetaPreview[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const idKey = `${item.type}:${item.id}`;
    if (seen.has(idKey)) continue;
    const fromId = byId.get(idKey);
    const fromSlug =
      item.slug
        ? bySlug.get(`${item.catalogPrefix ?? "sc"}:${item.slug}`)
        : undefined;
    const resolved = fromId ?? fromSlug ?? item;
    if (!resolved.id) continue;
    seen.add(`${resolved.type}:${resolved.id}`);
    out.push({
      ...resolved,
      catalogPrefix: resolved.catalogPrefix ?? item.catalogPrefix ?? "sc",
    });
    if (out.length >= 10) break;
  }
  return out;
}
