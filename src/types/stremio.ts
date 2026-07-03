export interface StremioCatalog {
  type: string;
  id: string;
  name: string;
  extra?: { name: string; isRequired?: boolean }[];
}

export interface InstalledAddon {
  id: string;
  manifestUrl: string;
  transportUrl: string;
  addonId: string;
  name: string;
  description: string;
  version: string;
  resources: string[];
  types: string[];
  catalogs: StremioCatalog[];
  enabled: boolean;
  installedAt: string;
}

export interface ScCatalogResponse {
  rows: {
    key: string;
    title: string;
    subtitle: string;
    items: StremioMetaPreview[];
  }[];
  index: StremioMetaPreview[];
  syncedAt: number;
  totalCount: number;
  needsBackgroundSync?: boolean;
}

export interface SaturnBrowsePage {
  items: StremioMetaPreview[];
  total: number;
  offset: number;
  hasMore: boolean;
}

export interface SearchCatalogPage {
  items: StremioMetaPreview[];
  total: number;
  offset: number;
  hasMore: boolean;
}

export interface StremioMetaPreview {
  id: string;
  type: string;
  name: string;
  poster?: string;
  posterShape?: string;
  description?: string;
  releaseInfo?: string;
  catalogPrefix?: string;
  slug?: string;
  /** film | serie | cartone — assegnato in unificazione catalogo */
  mediaType?: string;
  genres?: string[];
  sourceRowKey?: string;
  sourceRowTitle?: string;
  watchPosition?: number;
  watchDuration?: number;
  resumeVideoId?: string;
  /** Episodio da riprendere (riga Continua a guardare) */
  resumeEpisodeLabel?: string;
  /** Salvato in "La mia Lista" (streaming) */
  inMyList?: boolean;
}

export interface StreamingContinueItem {
  catalogPrefix: string;
  contentType: string;
  titleId: string;
  slug: string;
  videoId: string;
  titleName: string;
  episodeLabel?: string;
  poster?: string;
  positionSecs: number;
  durationSecs?: number;
  updatedAt: string;
}

export interface StreamingEpisodeProgress {
  videoId: string;
  positionSecs: number;
  durationSecs?: number;
}

export interface StreamingWatchProgressInput {
  catalogPrefix: string;
  contentType: string;
  titleId: string;
  slug: string;
  videoId: string;
  titleName: string;
  episodeLabel?: string;
  poster?: string;
  positionSecs: number;
  durationSecs?: number;
}

export interface StremioVideo {
  id: string;
  title: string;
  season?: number;
  episode?: number;
  thumbnail?: string;
  released?: string;
  description?: string;
  runtime?: string;
}

export interface StremioMeta {
  id: string;
  type: string;
  name: string;
  poster?: string;
  background?: string;
  description?: string;
  releaseInfo?: string;
  genres: string[];
  videos: StremioVideo[];
  runtime?: string;
  logo?: string;
  rating?: string;
  cast?: string[];
  directors?: string[];
  viewCount?: number;
  quality?: string;
  hasPreview?: boolean;
  seasonNumbers?: number[];
}

export interface PlayableStream {
  url: string;
  name?: string;
  description?: string;
  addonId: string;
  addonName: string;
  isHls: boolean;
  proxied?: boolean;
  needsDebrid?: boolean;
  infoHash?: string;
  fileIdx?: number;
  sources?: string[];
}

export interface DebridConfig {
  provider: string;
  apiKey: string;
}

export interface AddonPlayTarget {
  contentType: string;
  videoId: string;
  title: string;
  poster?: string;
}
