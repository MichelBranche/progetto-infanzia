export type MangaDexContentRating = "safe" | "suggestive" | "erotica" | "pornographic";

export type MangaDexMangaStatus = "ongoing" | "completed" | "hiatus" | "cancelled";

export interface MangaDexLocalizedString {
  [locale: string]: string | undefined;
}

export interface MangaDexEntity<T> {
  id: string;
  type: string;
  attributes: T;
  relationships?: MangaDexRelationship[];
}

export interface MangaDexRelationship {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
}

export interface MangaDexMangaAttributes {
  title: MangaDexLocalizedString;
  altTitles: Array<MangaDexLocalizedString>;
  description: MangaDexLocalizedString;
  status: MangaDexMangaStatus;
  year?: number;
  contentRating: MangaDexContentRating;
  tags: MangaDexEntity<{ name: MangaDexLocalizedString; group: string }>[];
  lastChapter?: string;
  availableTranslatedLanguages: string[];
}

export interface MangaDexChapterAttributes {
  title: string | null;
  volume: string | null;
  chapter: string | null;
  pages: number;
  translatedLanguage: string;
  publishAt: string;
  readableAt: string;
}

export interface MangaDexCoverArtAttributes {
  fileName: string;
  locale: string | null;
}

export interface MangaDexListResponse<T> {
  result: string;
  response: string;
  data: MangaDexEntity<T>[];
  limit: number;
  offset: number;
  total: number;
}

export interface MangaDexEntityResponse<T> {
  result: string;
  response: string;
  data: MangaDexEntity<T>;
}

export interface MangaDexAtHomeResponse {
  result: string;
  baseUrl: string;
  chapter: {
    hash: string;
    data: string[];
    dataSaver: string[];
  };
}

/** Tile per la griglia tabloid */
export interface MangaBrowseItem {
  id: string;
  title: string;
  coverUrl: string | null;
  status?: MangaDexMangaStatus;
  year?: number;
  latestChapter?: string;
  latestChapterId?: string;
  description?: string;
  contentRating?: MangaDexContentRating;
}

export interface MangaChapterItem {
  id: string;
  mangaId: string;
  title: string | null;
  chapter: string | null;
  volume: string | null;
  pages: number;
  language: string;
  publishAt: string;
}

export interface MangaReadProgress {
  mangaId: string;
  chapterId: string;
  chapterLabel: string | null;
  page: number;
  updatedAt: string;
}
