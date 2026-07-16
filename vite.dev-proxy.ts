/** Proxy Vite → API Rust locale (dev:browser / web dev). */
export const devApiProxy = {
  target: "http://127.0.0.1:8787",
  changeOrigin: true,
  timeout: 15_000,
  proxyTimeout: 15_000,
};

/** Sync catalogo SC/Loonex può richiedere diversi minuti. */
const longApiProxy = {
  ...devApiProxy,
  timeout: 600_000,
  proxyTimeout: 600_000,
};

export const devServerProxy = {
  "/health": devApiProxy,
  "/api": longApiProxy,
  "/stream": longApiProxy,
  "/cast": devApiProxy,
  "/poster": longApiProxy,
  "/series-poster": longApiProxy,
  "/saturn-poster": longApiProxy,
  "/loonex-poster": longApiProxy,
  "/sc-image": longApiProxy,
  "/welib-book": { ...devApiProxy, timeout: 120_000, proxyTimeout: 120_000 },
  "/welib-audio": devApiProxy,
  "/welib-cover": devApiProxy,
  "/remote": devApiProxy,
  "/remote-cast": devApiProxy,
  "/torrent": devApiProxy,
  "/presence": devApiProxy,
  "/watch-party": { ...devApiProxy, ws: true },
};
