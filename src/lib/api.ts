import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Library, MediaItem, ScanResult, StreamInfo, AddMediaInput, UpdateMediaInput, PosterAsset, CastDevice, CastPosition } from "../types/media";
import { syncAchievements } from "./achievementsApi";

function emptyLibrary(): Library {
  return {
    items: [],
    collections: [],
    mediaRoot: "",
    totalCount: 0,
  };
}

function withProfile(profileId: string) {
  return { profileId };
}

export async function fetchLibrary(profileId: string): Promise<Library> {
  if (!isTauri()) {
    return emptyLibrary();
  }
  return invoke<Library>("get_library", withProfile(profileId));
}

export async function scanLibrary(): Promise<ScanResult> {
  return invoke<ScanResult>("scan_library_cmd");
}

export async function fetchMedia(profileId: string, id: string): Promise<MediaItem> {
  return invoke<MediaItem>("get_media", { profileId, id });
}

export async function searchMedia(
  profileId: string,
  query: string,
): Promise<MediaItem[]> {
  return invoke<MediaItem[]>("search_media", { profileId, query });
}

export async function fetchStreamInfo(
  profileId: string,
  id: string,
): Promise<StreamInfo> {
  return invoke<StreamInfo>("get_stream_info", { profileId, id });
}

export async function saveWatchProgress(
  profileId: string,
  mediaId: string,
  position: number,
  duration?: number,
): Promise<void> {
  return invoke("update_watch_progress", {
    profileId,
    mediaId,
    position,
    duration: duration ?? null,
  });
}

export async function toggleFavorite(
  profileId: string,
  mediaId: string,
): Promise<boolean> {
  const added = await invoke<boolean>("toggle_favorite", {
    profileId,
    mediaId,
  });
  void syncAchievements(profileId);
  return added;
}

export async function fetchMediaRoot(): Promise<string> {
  return invoke<string>("get_media_root");
}

export async function addMedia(
  profileId: string,
  input: AddMediaInput,
): Promise<MediaItem> {
  return invoke<MediaItem>("add_media_cmd", { profileId, input });
}

export async function updateMedia(
  profileId: string,
  id: string,
  input: UpdateMediaInput,
): Promise<MediaItem> {
  return invoke<MediaItem>("update_media_cmd", { profileId, id, input });
}

export async function deleteMedia(
  profileId: string,
  id: string,
): Promise<void> {
  return invoke("delete_media_cmd", { profileId, id });
}

export async function enrichMetadata(
  profileId: string,
  mediaId: string,
): Promise<MediaItem> {
  return invoke<MediaItem>("enrich_metadata_cmd", { profileId, mediaId });
}

export async function listSeries(mediaType: string): Promise<string[]> {
  return invoke<string[]>("list_series_cmd", { mediaType });
}

export async function listPosters(): Promise<PosterAsset[]> {
  return invoke<PosterAsset[]>("list_posters_cmd");
}

export async function discoverCastDevices(): Promise<CastDevice[]> {
  return invoke<CastDevice[]>("discover_cast_devices_cmd");
}

export async function probeCastDevice(host: string): Promise<CastDevice> {
  return invoke<CastDevice>("probe_cast_device_cmd", { host });
}

export async function castMedia(
  profileId: string,
  mediaId: string,
  device: CastDevice,
): Promise<void> {
  return invoke("cast_media_cmd", { profileId, mediaId, device });
}

export async function castRemoteStream(
  proxyId: string,
  title: string,
  device: CastDevice,
  startSecs: number,
  isHls: boolean,
): Promise<void> {
  return invoke("cast_remote_cmd", {
    proxyId,
    title,
    device,
    startSecs,
    isHls,
  });
}

export type CastTransportAction = "play" | "pause" | "stop" | "seek";

export async function castTransport(
  device: CastDevice,
  action: CastTransportAction,
  positionSecs?: number,
): Promise<void> {
  return invoke("cast_transport_cmd", { device, action, positionSecs: positionSecs ?? null });
}

export async function getCastPosition(device: CastDevice): Promise<CastPosition> {
  return invoke<CastPosition>("cast_position_cmd", { device });
}

export async function getLanHost(): Promise<string | null> {
  return invoke<string | null>("get_lan_host_cmd");
}
