import type { StremioMetaPreview } from "../types/stremio";

const BRAND =
  "https://static2.mediasetplay.mediaset.it/Mediaset_Italia_Production_-_Main";

/** Canali TV free Mediaset — fallback UI se il catalogo backend non li ha ancora mergiati. */
export const MEDIASET_LIVE_FALLBACK_CHANNELS: ReadonlyArray<{
  callSign: string;
  name: string;
  brandLogo: string;
}> = [
  { callSign: "C5", name: "Canale 5", brandLogo: `${BRAND}/c5.png` },
  { callSign: "I1", name: "Italia 1", brandLogo: `${BRAND}/i1.png` },
  { callSign: "R4", name: "Rete 4", brandLogo: `${BRAND}/r4.png` },
  { callSign: "KA", name: "La5", brandLogo: `${BRAND}/la5.png` },
  { callSign: "KI", name: "Iris", brandLogo: `${BRAND}/iris.png` },
  { callSign: "KQ", name: "Mediaset Extra", brandLogo: `${BRAND}/extra.png` },
  { callSign: "LB", name: "20 Mediaset", brandLogo: `${BRAND}/20.png` },
  { callSign: "B6", name: "Cine34", brandLogo: `${BRAND}/b6.png` },
  { callSign: "LT", name: "Top Crime", brandLogo: `${BRAND}/topcrime.png` },
  { callSign: "FU", name: "Focus", brandLogo: `${BRAND}/focus.png` },
  { callSign: "I2", name: "Italia 2", brandLogo: `${BRAND}/i2.png` },
  { callSign: "KB", name: "Boing", brandLogo: `${BRAND}/kb.png` },
  { callSign: "LA", name: "Cartoonito", brandLogo: `${BRAND}/la.png` },
];

export function mediasetLiveFallbackPreviews(): StremioMetaPreview[] {
  return MEDIASET_LIVE_FALLBACK_CHANNELS.map((ch) => {
    const slug = `live-${ch.callSign}`;
    return {
      id: slug,
      type: "movie",
      name: ch.name,
      poster: ch.brandLogo,
      background: ch.brandLogo,
      logo: ch.brandLogo,
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
