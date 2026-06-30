import { invoke } from "@tauri-apps/api/core";
import type {
  DebridConfig,
  InstalledAddon,
  PlayableStream,
  ScCatalogResponse,
  StremioMeta,
  StremioMetaPreview,
  StreamingContinueItem,
  StreamingWatchProgressInput,
} from "../types/stremio";
import type { CanPlayResult } from "./parentalApi";
import type { StreamingListInput } from "./myList";

export const CINEMETA_MANIFEST =
  "https://v3-cinemeta.strem.io/manifest.json";

export async function installAddon(
  parentProfileId: string,
  manifestUrl: string,
): Promise<InstalledAddon> {
  return invoke<InstalledAddon>("install_addon_cmd", {
    parentProfileId,
    manifestUrl,
  });
}

export async function removeAddon(
  parentProfileId: string,
  addonRowId: string,
): Promise<void> {
  return invoke("remove_addon_cmd", { parentProfileId, addonRowId });
}

export async function listAddons(profileId: string): Promise<InstalledAddon[]> {
  return invoke<InstalledAddon[]>("list_addons_cmd", { profileId });
}

export async function listAllAddons(
  parentProfileId: string,
): Promise<InstalledAddon[]> {
  return invoke<InstalledAddon[]>("list_all_addons_cmd", { parentProfileId });
}

export async function setAddonEnabled(
  parentProfileId: string,
  addonRowId: string,
  enabled: boolean,
): Promise<void> {
  return invoke("set_addon_enabled_cmd", {
    parentProfileId,
    addonRowId,
    enabled,
  });
}

export async function fetchAddonCatalog(
  profileId: string,
  addonRowId: string,
  contentType: string,
  catalogId: string,
  extra?: Record<string, string>,
): Promise<StremioMetaPreview[]> {
  return invoke<StremioMetaPreview[]>("fetch_addon_catalog_cmd", {
    profileId,
    addonRowId,
    contentType,
    catalogId,
    extra: extra ?? {},
  });
}

export async function fetchAddonMeta(
  profileId: string,
  contentType: string,
  metaId: string,
): Promise<StremioMeta> {
  return invoke<StremioMeta>("fetch_addon_meta_cmd", {
    profileId,
    contentType,
    metaId,
  });
}

export async function resolveAddonStreams(
  profileId: string,
  contentType: string,
  videoId: string,
): Promise<PlayableStream[]> {
  return invoke<PlayableStream[]>("resolve_addon_streams_cmd", {
    profileId,
    contentType,
    videoId,
  });
}

export async function fetchScCatalog(): Promise<ScCatalogResponse> {
  return invoke<ScCatalogResponse>("fetch_sc_catalog_cmd");
}

export async function refreshScCatalog(): Promise<ScCatalogResponse> {
  return invoke<ScCatalogResponse>("refresh_sc_catalog_cmd");
}

export async function fetchScMeta(
  titleId: string,
  slug: string,
): Promise<StremioMeta> {
  return invoke<StremioMeta>("fetch_sc_meta_cmd", {
    titleId: Number(titleId),
    slug,
  });
}

export async function resolveScStream(
  titleId: string,
  slug: string,
  episodeId?: string,
): Promise<PlayableStream> {
  return invoke<PlayableStream>("resolve_sc_stream_cmd", {
    titleId: Number(titleId),
    slug,
    episodeId: episodeId ? Number(episodeId) : null,
  });
}

export async function searchScCatalog(
  query: string,
): Promise<StremioMetaPreview[]> {
  return invoke<StremioMetaPreview[]>("search_sc_catalog_cmd", { query });
}

export async function resolveScPreview(
  titleId: string,
  slug: string,
): Promise<PlayableStream | null> {
  return invoke<PlayableStream | null>("resolve_sc_preview_cmd", {
    titleId: Number(titleId),
    slug,
  });
}

export async function fetchSaturnMeta(slug: string): Promise<StremioMeta> {
  return invoke<StremioMeta>("fetch_saturn_meta_cmd", { slug });
}

export async function resolveSaturnStream(
  slug: string,
  episodeId?: string,
): Promise<PlayableStream> {
  return invoke<PlayableStream>("resolve_saturn_stream_cmd", {
    slug,
    episodeId: episodeId ?? null,
  });
}

export async function saveStreamingWatchProgress(
  profileId: string,
  input: StreamingWatchProgressInput,
): Promise<void> {
  return invoke("update_streaming_watch_progress_cmd", { profileId, input });
}

export async function getStreamingWatchProgress(
  profileId: string,
  catalogPrefix: string,
  contentType: string,
  titleId: string,
  slug: string,
  videoId: string,
): Promise<[number, number | null] | null> {
  return invoke<[number, number | null] | null>(
    "get_streaming_watch_progress_cmd",
    {
      profileId,
      catalogPrefix,
      contentType,
      titleId,
      slug,
      videoId,
    },
  );
}

export async function getStreamingContinue(
  profileId: string,
  limit = 20,
): Promise<StreamingContinueItem[]> {
  return invoke<StreamingContinueItem[]>("get_streaming_continue_cmd", {
    profileId,
    limit,
  });
}

export async function canPlayAddon(
  profileId: string,
  addonRowId: string,
): Promise<CanPlayResult> {
  return invoke<CanPlayResult>("can_play_addon_cmd", {
    profileId,
    addonRowId,
  });
}

export async function getAddonAllowlist(
  parentProfileId: string,
  childProfileId: string,
): Promise<string[]> {
  return invoke<string[]>("get_addon_allowlist_cmd", {
    parentProfileId,
    childProfileId,
  });
}

export async function setAddonAllowlist(
  parentProfileId: string,
  childProfileId: string,
  addonRowIds: string[],
): Promise<void> {
  return invoke("set_addon_allowlist_cmd", {
    parentProfileId,
    childProfileId,
    addonRowIds,
  });
}

export async function hasStreamingAccess(profileId: string): Promise<boolean> {
  return invoke<boolean>("has_streaming_access_cmd", { profileId });
}

export async function getDebridConfig(): Promise<DebridConfig> {
  return invoke<DebridConfig>("get_debrid_config_cmd");
}

export async function setDebridConfig(
  parentProfileId: string,
  provider: string,
  apiKey: string,
): Promise<void> {
  return invoke("set_debrid_config_cmd", {
    parentProfileId,
    provider,
    apiKey,
  });
}

export async function testDebrid(
  parentProfileId: string,
  provider: string,
  apiKey: string,
): Promise<string> {
  return invoke<string>("test_debrid_cmd", {
    parentProfileId,
    provider,
    apiKey,
  });
}

export async function resolveDebridStream(
  profileId: string,
  infoHash: string,
  fileIdx: number | undefined,
  sources: string[],
): Promise<PlayableStream> {
  return invoke<PlayableStream>("resolve_debrid_stream_cmd", {
    profileId,
    infoHash,
    fileIdx,
    sources,
  });
}

/**
 * Resolve a torrent stream into a playable URL. Uses a configured debrid
 * provider when available (fast, cached), otherwise streams it through the
 * built-in torrent engine.
 */
export async function resolveTorrentSource(
  profileId: string,
  infoHash: string,
  fileIdx: number | undefined,
  sources: string[],
): Promise<PlayableStream> {
  return invoke<PlayableStream>("resolve_torrent_source_cmd", {
    profileId,
    infoHash,
    fileIdx,
    sources,
  });
}

export async function listStreamingList(
  profileId: string,
): Promise<StremioMetaPreview[]> {
  return invoke<StremioMetaPreview[]>("list_streaming_list_cmd", { profileId });
}

export async function toggleStreamingList(
  profileId: string,
  item: StreamingListInput,
): Promise<boolean> {
  return invoke<boolean>("toggle_streaming_list_cmd", { profileId, item });
}
