/** CDN Streaming Community noti (aggiornati da tools/sc-mirrors-sync). */
export const SC_CDN_FALLBACKS = [
  "https://cdn.streamingcommunityz.recipes",
  "https://cdn.streamingunity.vip",
  "https://cdn.streamingcommunityz.support",
  "https://cdn.streamingcommunityz.vin",
  "https://cdn.streamingcommunityz.tech",
  "https://cdn.streamingcommunityz.gives",
  "https://cdn.streamingcommunityz.buzz",
  "https://cdn.streamingcommunityz.space",
  "https://cdn.streamingcommunityz.ceo",
  "https://cdn.streamingcommunityz.community",
] as const;

export const SC_CDN_PRIMARY =
  SC_CDN_FALLBACKS[0] ?? "https://cdn.streamingcommunityz.recipes";
