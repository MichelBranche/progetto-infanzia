import type { StremioMetaPreview } from "../types/stremio";

/** Canali TV free Mediaset — fallback UI se il catalogo backend non li ha ancora mergiati. */
export const MEDIASET_LIVE_FALLBACK_CHANNELS: ReadonlyArray<{
  callSign: string;
  name: string;
}> = [
  { callSign: "C5", name: "Canale 5" },
  { callSign: "I1", name: "Italia 1" },
  { callSign: "R4", name: "Rete 4" },
  { callSign: "KA", name: "La5" },
  { callSign: "KI", name: "Iris" },
  { callSign: "KQ", name: "Mediaset Extra" },
  { callSign: "LB", name: "20 Mediaset" },
  { callSign: "B6", name: "Cine34" },
  { callSign: "LT", name: "Top Crime" },
  { callSign: "FU", name: "Focus" },
  { callSign: "I2", name: "Italia 2" },
  { callSign: "KB", name: "Boing" },
  { callSign: "LA", name: "Cartoonito" },
];

export function mediasetLiveFallbackPreviews(): StremioMetaPreview[] {
  return MEDIASET_LIVE_FALLBACK_CHANNELS.map((ch) => {
    const slug = `live-${ch.callSign}`;
    return {
      id: slug,
      type: "movie",
      name: ch.name,
      poster: undefined,
      background: undefined,
      logo: undefined,
      posterShape: "landscape",
      description: "In diretta",
      releaseInfo: "In diretta",
      catalogPrefix: "mediaset",
      slug,
      genres: ["Live", "Diretta"],
      cast: [],
      directors: [],
      streamingServices: ["mediaset"],
      sourceRowKey: "mediaset-live",
      sourceRowTitle: "In diretta · Mediaset Infinity",
      comingSoon: false,
    };
  });
}
