/**
 * Verifica i mirror Streaming Community e aggiorna public/sc-mirrors.json
 * (+ copia in src-tauri/resources per il desktop bundled).
 *
 * Usage:
 *   node tools/sc-mirrors-sync.mjs              # dry-run (report)
 *   node tools/sc-mirrors-sync.mjs --write       # riscrive sc-mirrors.json
 *   node tools/sc-mirrors-sync.mjs --write --sync-defaults
 *       # + DEFAULT_APP_URL / DEFAULT_CDN_URL in sc_catalog.rs e fallback FE
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIRRORS_PATH = path.join(ROOT, "public", "sc-mirrors.json");
const MIRRORS_DESKTOP_PATH = path.join(
  ROOT,
  "src-tauri",
  "resources",
  "sc-mirrors.json",
);
const SC_CATALOG_RS = path.join(ROOT, "src-tauri", "src", "sc_catalog.rs");
const SC_CDN_TS = path.join(ROOT, "src", "lib", "scCdnFallbacks.ts");

const COMMUNITY_SOURCES = [
  "https://cdn.jsdelivr.net/gh/sana888999/GinxStream@main/Test/Downloads/Conf/domains.json",
  "https://cdn.jsdelivr.net/gh/TopEnt3r/MultiDownloader@main/Downloader/StreamingCommunity/StreamingCommunity-main/.github/.domain/domains.json",
  "https://cdn.jsdelivr.net/gh/falcosan/StreamVault@main/assets/domains.json",
];

const HARDCODED_FALLBACKS = [
  "https://streamingcommunityz.recipes",
  "https://streamingunity.vip",
  "https://streamingcommunityz.support",
  "https://streamingcommunityz.vin",
  "https://streamingcommunityz.tech",
  "https://streamingunity.dog",
  "https://streamingunity.buzz",
  "https://streamingcommunityz.gives",
  "https://streamingcommunityz.buzz",
  "https://streamingcommunityz.space",
  "https://streamingcommunityz.ceo",
  "https://streamingcommunityz.community",
  "https://streamingcommunityz.lat",
  "https://streamingcommunityz.ltd",
  "https://streamingcommunityz.pizza",
];

const write = process.argv.includes("--write");
const syncDefaults = process.argv.includes("--sync-defaults");

function normalizeOrigin(raw) {
  try {
    const u = new URL(String(raw).trim());
    if (!/^https?:$/i.test(u.protocol)) return null;
    const host = u.hostname.toLowerCase();
    if (!host || host.startsWith("cdn.")) return null;
    return `${u.protocol}//${host}`.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function inferCdn(appUrl) {
  try {
    const u = new URL(appUrl);
    return `${u.protocol}//cdn.${u.hostname}`;
  } catch {
    return null;
  }
}

function looksScHost(host) {
  const h = host.toLowerCase();
  return (
    h.includes("streamingcommunity") ||
    h.includes("streamingunity") ||
    h.includes("streaming-community")
  );
}

function extractUrlsFromJson(value, out, seen) {
  const push = (raw) => {
    const url = normalizeOrigin(raw);
    if (!url) return;
    let host;
    try {
      host = new URL(url).hostname;
    } catch {
      return;
    }
    if (!looksScHost(host)) return;
    if (seen.has(url)) return;
    seen.add(url);
    out.push(url);
  };

  if (Array.isArray(value?.appUrls)) {
    for (const item of value.appUrls) push(item);
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, entry] of Object.entries(value)) {
      const keyL = key.toLowerCase();
      if (!(keyL.includes("streamingcommunity") || keyL.includes("streamingunity"))) {
        continue;
      }
      if (entry && typeof entry === "object" && typeof entry.full_url === "string") {
        push(entry.full_url);
      } else if (typeof entry === "string") {
        push(entry);
      }
    }
  }
}

function hasInertiaPage(html) {
  return typeof html === "string" && html.includes('data-page="');
}

async function fetchText(url, { timeoutMs = 10000, redirect = "follow" } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/json,text/plain,*/*",
        "User-Agent":
          "Mozilla/5.0 (compatible; BranchefyScMirrorsSync/1.0; +https://branchefy.it)",
      },
    });
    const text = await res.text();
    return { res, text };
  } finally {
    clearTimeout(timer);
  }
}

async function probeApp(appBase) {
  const localePaths = ["/it", "/"];
  for (const p of localePaths) {
    try {
      const { res, text } = await fetchText(`${appBase}${p}`);
      if (!res.ok) continue;
      if (hasInertiaPage(text)) {
        const finalOrigin = normalizeOrigin(res.url) || appBase;
        return { ok: true, finalOrigin };
      }
    } catch {
      // try next path
    }
  }
  return { ok: false, finalOrigin: appBase };
}

async function followRedirectSeed(seed) {
  try {
    const { res } = await fetchText(`${seed}/`, { timeoutMs: 8000 });
    return normalizeOrigin(res.url);
  } catch {
    return null;
  }
}

async function loadCommunityUrls() {
  const out = [];
  const seen = new Set();
  for (const source of COMMUNITY_SOURCES) {
    try {
      const { res, text } = await fetchText(source, { timeoutMs: 8000 });
      if (!res.ok) continue;
      const json = JSON.parse(text);
      extractUrlsFromJson(json, out, seen);
    } catch {
      // ignore source
    }
  }
  return out;
}

function readLocalMirrors() {
  try {
    const json = JSON.parse(fs.readFileSync(MIRRORS_PATH, "utf8"));
    const out = [];
    const seen = new Set();
    extractUrlsFromJson(json, out, seen);
    return { json, urls: out };
  } catch {
    return { json: { appUrls: [], cdnUrls: [] }, urls: [] };
  }
}

function replaceConstString(source, constName, nextValue) {
  const re = new RegExp(
    `(const ${constName}: &str = ")[^"]+(";)`,
  );
  if (!re.test(source)) {
    throw new Error(`const ${constName} not found in sc_catalog.rs`);
  }
  return source.replace(re, `$1${nextValue}$2`);
}

function syncRustDefaults(appUrl, cdnUrl) {
  let src = fs.readFileSync(SC_CATALOG_RS, "utf8");
  src = replaceConstString(src, "DEFAULT_APP_URL", appUrl);
  src = replaceConstString(src, "DEFAULT_CDN_URL", cdnUrl);

  // Move working URL to front of FALLBACK_APP_URLS if present; else prepend.
  const fallbackBlockRe =
    /const FALLBACK_APP_URLS: &\[&str\] = &\[[\s\S]*?\];/;
  const match = src.match(fallbackBlockRe);
  if (match) {
    const urls = [...HARDCODED_FALLBACKS];
    const rest = urls.filter((u) => u !== appUrl);
    const ordered = [appUrl, ...rest];
    const body = ordered.map((u) => `    "${u}",`).join("\n");
    src = src.replace(
      fallbackBlockRe,
      `const FALLBACK_APP_URLS: &[&str] = &[\n${body}\n];`,
    );
  }

  fs.writeFileSync(SC_CATALOG_RS, src);
  console.log(`Updated defaults in ${path.relative(ROOT, SC_CATALOG_RS)}`);
}

function syncFeCdnFallbacks(cdnUrls) {
  const unique = [];
  const seen = new Set();
  for (const u of cdnUrls) {
    const n = String(u).trim().replace(/\/$/, "");
    if (!n || seen.has(n)) continue;
    seen.add(n);
    unique.push(n);
  }
  const body = unique.map((u) => `  "${u}",`).join("\n");
  const contents = `/** CDN Streaming Community noti (aggiornati da tools/sc-mirrors-sync). */
export const SC_CDN_FALLBACKS = [
${body}
] as const;

export const SC_CDN_PRIMARY = SC_CDN_FALLBACKS[0] ?? "https://cdn.streamingcommunityz.support";
`;
  fs.writeFileSync(SC_CDN_TS, contents);
  console.log(`Updated ${path.relative(ROOT, SC_CDN_TS)}`);
}

async function main() {
  const local = readLocalMirrors();
  const community = await loadCommunityUrls();

  const seeds = [];
  const seenSeed = new Set();
  for (const url of [...local.urls, ...HARDCODED_FALLBACKS, ...community]) {
    const n = normalizeOrigin(url);
    if (!n || seenSeed.has(n)) continue;
    seenSeed.add(n);
    seeds.push(n);
  }

  console.log(`Candidates: ${seeds.length}`);

  // Follow redirects from seeds to discover new hosts.
  for (const seed of [...seeds]) {
    const redirected = await followRedirectSeed(seed);
    if (redirected && !seenSeed.has(redirected) && looksScHost(new URL(redirected).hostname)) {
      seenSeed.add(redirected);
      seeds.push(redirected);
      console.log(`  redirect ${seed} → ${redirected}`);
    }
  }

  const working = [];
  const failed = [];
  for (const app of seeds) {
    process.stdout.write(`probe ${app} ... `);
    const result = await probeApp(app);
    if (result.ok) {
      const finalOrigin = result.finalOrigin;
      console.log(`OK${finalOrigin !== app ? ` (final ${finalOrigin})` : ""}`);
      if (!working.includes(finalOrigin)) working.push(finalOrigin);
      if (finalOrigin !== app && !working.includes(app)) {
        // keep original only if it also worked; final is enough
      }
    } else {
      console.log("FAIL");
      failed.push(app);
    }
  }

  if (working.length === 0) {
    console.error("\nNo working Streaming Community mirrors found.");
    process.exitCode = 1;
    return;
  }

  const primary = working[0];
  const cdnUrls = [];
  const seenCdn = new Set();
  for (const app of working) {
    const cdn = inferCdn(app);
    if (cdn && !seenCdn.has(cdn)) {
      seenCdn.add(cdn);
      cdnUrls.push(cdn);
    }
  }
  // Keep previously listed CDN that still match working apps.
  if (Array.isArray(local.json.cdnUrls)) {
    for (const c of local.json.cdnUrls) {
      const n = String(c).trim().replace(/\/$/, "");
      if (n && !seenCdn.has(n)) {
        seenCdn.add(n);
        cdnUrls.push(n);
      }
    }
  }

  const payload = {
    updatedAt: new Date().toISOString().slice(0, 10),
    appUrls: working,
    cdnUrls,
  };

  console.log("\nPrimary:", primary);
  console.log("Working apps:", working.length);
  console.log("Failed:", failed.length);

  if (!write) {
    console.log("\nDry-run only. Pass --write to update public/sc-mirrors.json");
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const body = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(MIRRORS_PATH, body);
  fs.mkdirSync(path.dirname(MIRRORS_DESKTOP_PATH), { recursive: true });
  fs.writeFileSync(MIRRORS_DESKTOP_PATH, body);
  console.log(`\nWrote ${path.relative(ROOT, MIRRORS_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, MIRRORS_DESKTOP_PATH)}`);

  if (syncDefaults) {
    const cdnPrimary = inferCdn(primary) || cdnUrls[0];
    syncRustDefaults(primary, cdnPrimary);
    syncFeCdnFallbacks(cdnUrls.length ? cdnUrls : [cdnPrimary]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
