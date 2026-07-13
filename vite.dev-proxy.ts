/** Proxy Vite → API Rust locale (dev:browser / web dev). */
export const devApiProxy = {
  target: "http://127.0.0.1:8787",
  changeOrigin: true,
  timeout: 15_000,
  proxyTimeout: 15_000,
};

export const devServerProxy = {
  "/health": devApiProxy,
  "/api": devApiProxy,
  "/stream": devApiProxy,
  "/cast": devApiProxy,
  "/poster": devApiProxy,
  "/series-poster": devApiProxy,
  "/saturn-poster": devApiProxy,
  "/loonex-poster": devApiProxy,
  "/sc-image": devApiProxy,
  "/welib-book": { ...devApiProxy, timeout: 120_000, proxyTimeout: 120_000 },
  "/welib-audio": devApiProxy,
  "/welib-cover": devApiProxy,
  "/remote": devApiProxy,
  "/remote-cast": devApiProxy,
  "/torrent": devApiProxy,
  "/presence": devApiProxy,
  "/watch-party": { ...devApiProxy, ws: true },
};
