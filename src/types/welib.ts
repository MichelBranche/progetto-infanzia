export interface WelibBook {
  md5: string;
  title: string;
  authors: string[];
  format?: string | null;
  language?: string | null;
  year?: string | null;
  size?: string | null;
  hasAudiobook: boolean;
  coverUrl?: string | null;
}

export interface WelibPopularResponse {
  items: WelibBook[];
  offset: number;
  limit: number;
}

export interface WelibSearchResponse {
  items: WelibBook[];
  limited: boolean;
}
