export interface MediaItem {
  id: string;
  title: string;
  mediaType: string;
  year?: number;
  filePath: string;
  fileName: string;
  description?: string;
  tag?: string;
  seriesTitle?: string;
  season?: number;
  episode?: number;
  posterPath?: string;
  posterUrl?: string;
  backgroundUrl?: string;
  seriesPosterPath?: string;
  seriesPosterUrl?: string;
  watchPosition?: number;
  watchDuration?: number;
  watchUpdatedAt?: string;
  isFavorite: boolean;
  kidFriendly: boolean;
  streamingServices: string[];
  tmdbId?: number;
  tmdbType?: string;
  genres?: string[];
  runtimeMins?: number;
  gradient: string;
  createdAt: string;
}

export interface PosterAsset {
  path: string;
  label: string;
  kind: string;
}

export interface AddMediaInput {
  mediaType: string;
  title: string;
  description?: string;
  seriesTitle?: string;
  season?: number;
  episode?: number;
  videoSourcePath: string;
  posterSourcePath?: string;
  seriesPosterSourcePath?: string;
  tag?: string;
  kidFriendly?: boolean;
  streamingServices?: string[];
}

export interface UpdateMediaInput {
  title?: string;
  description?: string;
  seriesTitle?: string;
  season?: number;
  episode?: number;
  tag?: string;
  kidFriendly?: boolean;
  streamingServices?: string[];
}

export type MediaTypeOption = "film" | "cartone" | "serie";

export interface MediaCollection {
  id: string;
  title: string;
  subtitle: string;
  items: MediaItem[];
}

export interface Library {
  items: MediaItem[];
  collections: MediaCollection[];
  featured?: MediaItem;
  mediaRoot: string;
  totalCount: number;
  lastScan?: string;
}

export interface ScanResult {
  added: number;
  updated: number;
  removed: number;
  total: number;
}

export interface StreamInfo {
  url: string;
  lanUrl?: string;
  media: MediaItem;
}

export interface CastDevice {
  id: string;
  name: string;
  location: string;
  controlUrl: string;
}

export interface CastPosition {
  positionSecs: number;
  durationSecs: number;
  playing: boolean;
}

export function formatDuration(seconds?: number): string | undefined {
  if (!seconds || seconds <= 0) return undefined;
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  return `${minutes}m`;
}

export function watchProgressPercent(item: MediaItem): number {
  const pos = item.watchPosition ?? 0;
  const dur = item.watchDuration ?? 0;
  if (dur <= 0) return 0;
  return Math.min(100, (pos / dur) * 100);
}

export function mediaTypeLabel(type: string): string {
  switch (type) {
    case "film":
      return "Film";
    case "cartone":
      return "Cartone";
    case "serie":
      return "Serie";
    default:
      return type;
  }
}
