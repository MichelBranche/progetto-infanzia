import { getSupabase } from "./supabaseClient";
import { isCloudEnabled } from "./cloudConfig";

export interface CloudWatchLogInput {
  titleName: string;
  contentType?: string;
  catalogPrefix?: string;
  slug?: string;
  episodeLabel?: string;
  secondsWatched: number;
}

const lastLogged = new Map<string, number>();
const MIN_INTERVAL_MS = 90_000;

function logKey(input: CloudWatchLogInput): string {
  return [
    input.titleName,
    input.catalogPrefix ?? "",
    input.slug ?? "",
    input.episodeLabel ?? "",
  ].join("|");
}

export async function logCloudWatchEvent(
  input: CloudWatchLogInput,
): Promise<void> {
  if (!isCloudEnabled() || input.secondsWatched < 20) return;

  const key = logKey(input);
  const now = Date.now();
  const prev = lastLogged.get(key) ?? 0;
  if (now - prev < MIN_INTERVAL_MS) return;
  lastLogged.set(key, now);

  const supabase = getSupabase();
  if (!supabase) return;

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return;

  const { error } = await supabase.from("cloud_watch_events").insert({
    user_id: userId,
    title_name: input.titleName.trim() || "Senza titolo",
    content_type: input.contentType ?? null,
    catalog_prefix: input.catalogPrefix ?? null,
    slug: input.slug ?? null,
    episode_label: input.episodeLabel ?? null,
    seconds_watched: Math.round(input.secondsWatched),
  });

  if (error && !error.message.includes("cloud_watch_events")) {
    // Tabella non ancora migrata su Supabase: ignora silenziosamente
  }
}
