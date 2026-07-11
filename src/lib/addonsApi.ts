import { runtimeInvoke as invoke, usesBackendApi } from "./runtimeInvoke";
import { normalizePlaybackUrl } from "./streamUrl";
import type {
  DebridConfig,
  InstalledAddon,
  PlayableStream,
  ScCatalogResponse,
  StremioMeta,
  StremioMetaPreview,
  SaturnBrowsePage,
  SearchCatalogPage,
  StreamingContinueItem,
  StreamingEpisodeProgress,
  StreamingWatchProgressInput,
} from "../types/stremio";
import type { CanPlayResult } from "./parentalApi";
import type { PlayerStreamAudioLanguage } from "./playerAudioLanguage";
import type { AchievementUnlock } from "./achievements";
import { isWatchCompletedRatio, streamingCompletionKey } from "./achievements";
import { recordCompletion } from "./achievementsApi";
import type { StreamingListInput } from "./myList";
import {
  listDevStreamingList,
  listDevStreamingWatchHistory,
  saveDevStreamingWatchProgress,
  toggleDevStreamingList,
} from "./streamingDevStore";

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

export async function fetchScSeasonEpisodes(
  titleId: string,
  slug: string,
  season: number,
): Promise<StremioMeta["videos"]> {
  return invoke<StremioMeta["videos"]>("fetch_sc_season_episodes_cmd", {
    titleId: Number(titleId),
    slug,
    season,
  });
}

function normalizeStream<T extends { url: string }>(stream: T): T {
  return { ...stream, url: normalizePlaybackUrl(stream.url) };
}

export async function resolveScStream(
  titleId: string,
  slug: string,
  episodeId?: string,
  audioLang?: PlayerStreamAudioLanguage,
): Promise<PlayableStream> {
  const stream = await invoke<PlayableStream>("resolve_sc_stream_cmd", {
    titleId: Number(titleId),
    slug,
    episodeId: episodeId ? Number(episodeId) : null,
    audioLang: audioLang ?? null,
  });
  return normalizeStream(stream);
}

export async function searchScCatalog(
  query: string,
): Promise<StremioMetaPreview[]> {
  return invoke<StremioMetaPreview[]>("search_sc_catalog_cmd", { query });
}

export async function searchScCatalogPage(
  query: string,
  offset: number,
  limit = 48,
): Promise<SearchCatalogPage> {
  return invoke<SearchCatalogPage>("search_sc_catalog_page_cmd", {
    query,
    offset,
    limit,
  });
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

export async function fetchSaturnPoster(
  slug: string,
): Promise<string | null> {
  return invoke<string | null>("resolve_saturn_poster_cmd", { slug });
}

export async function fetchSaturnAnimePage(
  offset: number,
  limit = 48,
): Promise<SaturnBrowsePage> {
  return invoke<SaturnBrowsePage>("browse_saturn_anime_cmd", { offset, limit });
}

export async function resolveSaturnStream(
  slug: string,
  episodeId?: string,
): Promise<PlayableStream> {
  const stream = await invoke<PlayableStream>("resolve_saturn_stream_cmd", {
    slug,
    episodeId: episodeId ?? null,
  });
  return normalizeStream(stream);
}

export async function fetchLoonexMeta(slug: string): Promise<StremioMeta> {
  return invoke<StremioMeta>("fetch_loonex_meta_cmd", { slug });
}

export async function resolveLoonexStream(
  slug: string,
  episodeId?: string,
): Promise<PlayableStream> {
  const stream = await invoke<PlayableStream>("resolve_loonex_stream_cmd", {
    slug,
    episodeId: episodeId ?? null,
  });
  return normalizeStream(stream);
}

export async function fetchYoutubeMeta(playlistId: string): Promise<StremioMeta> {
  return invoke<StremioMeta>("fetch_youtube_meta_cmd", { playlistId });
}

export async function resolveYoutubeStream(
  playlistId: string,
  videoId: string,
): Promise<PlayableStream> {
  return invoke<PlayableStream>("resolve_youtube_stream_cmd", {
    playlistId,
    videoId,
  });
}

export async function saveStreamingWatchProgress(
  profileId: string,
  input: StreamingWatchProgressInput,
): Promise<AchievementUnlock[]> {
  if (!usesBackendApi()) {
    saveDevStreamingWatchProgress(profileId, input);
  } else {
    await invoke("update_streaming_watch_progress_cmd", { profileId, input });
  }

  if (!isWatchCompletedRatio(input.positionSecs, input.durationSecs)) {
    return [];
  }

  try {
    return await recordCompletion(
      profileId,
      streamingCompletionKey(input),
      "streaming",
      input.titleName,
    );
  } catch {
    return [];
  }
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

export async function listStreamingTitleProgress(
  profileId: string,
  catalogPrefix: string,
  contentType: string,
  titleId: string,
  slug: string,
): Promise<StreamingEpisodeProgress[]> {
  return invoke<StreamingEpisodeProgress[]>("list_streaming_title_progress_cmd", {
    profileId,
    catalogPrefix,
    contentType,
    titleId,
    slug,
  });
}

export async function getStreamingWatchHistory(
  profileId: string,
  limit = 50,
): Promise<StreamingContinueItem[]> {
  if (!usesBackendApi()) {
    return listDevStreamingWatchHistory(profileId, limit);
  }
  return invoke<StreamingContinueItem[]>("get_streaming_watch_history_cmd", {
    profileId,
    limit,
  });
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
  if (!usesBackendApi()) {
    return listDevStreamingList(profileId);
  }
  return invoke<StremioMetaPreview[]>("list_streaming_list_cmd", { profileId });
}

export async function toggleStreamingList(
  profileId: string,
  item: StreamingListInput,
): Promise<boolean> {
  if (!usesBackendApi()) {
    return toggleDevStreamingList(profileId, item);
  }
  return invoke<boolean>("toggle_streaming_list_cmd", { profileId, item });
}
