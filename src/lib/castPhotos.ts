import { runtimeInvoke } from "./runtimeInvoke";

export interface CastPhoto {
  name: string;
  photoUrl?: string;
}

export interface FetchCastPhotosInput {
  title: string;
  year?: number;
  isSeries: boolean;
  tmdbId?: number;
  tmdbType?: string;
  castNames: string[];
}

const photoCache = new Map<string, CastPhoto[]>();
const wikipediaCache = new Map<string, string | undefined>();

function cacheKey(input: FetchCastPhotosInput): string {
  return [
    input.title,
    input.year ?? "",
    input.isSeries ? "1" : "0",
    input.tmdbId ?? "",
    input.tmdbType ?? "",
    input.castNames.join("|"),
  ].join("::");
}

async function wikipediaActorPhoto(name: string): Promise<string | undefined> {
  const cached = wikipediaCache.get(name);
  if (cached !== undefined) return cached;

  for (const wiki of ["it", "en"] as const) {
    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: name,
      gsrnamespace: "0",
      gsrlimit: "3",
      prop: "pageimages",
      piprop: "thumbnail",
      pithumbsize: "256",
      format: "json",
      origin: "*",
    });
    try {
      const response = await fetch(
        `https://${wiki}.wikipedia.org/w/api.php?${params.toString()}`,
      );
      if (!response.ok) continue;
      const payload = (await response.json()) as {
        query?: {
          pages?: Record<
            string,
            { thumbnail?: { source?: string }; title?: string }
          >;
        };
      };
      const pages = payload.query?.pages;
      if (!pages) continue;
      const match = Object.values(pages).find((page) => {
        const title = page.title?.toLowerCase() ?? "";
        const needle = name.toLowerCase();
        return title.includes(needle) || needle.includes(title);
      });
      const url = match?.thumbnail?.source;
      if (url) {
        wikipediaCache.set(name, url);
        return url;
      }
    } catch {
      // Wikipedia opzionale: ignora errori di rete/CORS.
    }
  }

  wikipediaCache.set(name, undefined);
  return undefined;
}

async function enrichWithWikipedia(photos: CastPhoto[]): Promise<CastPhoto[]> {
  const enriched = await Promise.all(
    photos.map(async (entry) => {
      if (entry.photoUrl) return entry;
      const fallback = await wikipediaActorPhoto(entry.name);
      return fallback ? { ...entry, photoUrl: fallback } : entry;
    }),
  );
  return enriched;
}

export async function fetchCastPhotos(
  input: FetchCastPhotosInput,
): Promise<CastPhoto[]> {
  if (input.castNames.length === 0) return [];

  const key = cacheKey(input);
  const cached = photoCache.get(key);
  if (cached) return cached;

  let photos: CastPhoto[] = input.castNames.map((name) => ({ name }));

  try {
    const fromTmdb = await runtimeInvoke<CastPhoto[]>("fetch_cast_photos_cmd", {
      title: input.title,
      year: input.year ?? null,
      isSeries: input.isSeries,
      tmdbId: input.tmdbId ?? null,
      tmdbType: input.tmdbType ?? null,
      castNames: input.castNames,
    });
    if (fromTmdb.length > 0) {
      photos = fromTmdb.map((entry) => ({
        name: entry.name,
        photoUrl: entry.photoUrl,
      }));
    }
  } catch {
    // TMDB opzionale: Wikipedia come fallback.
  }

  const result = await enrichWithWikipedia(photos);
  photoCache.set(key, result);
  return result;
}
