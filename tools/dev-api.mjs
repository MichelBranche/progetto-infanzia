import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, ".branchefy-data");

/** Carica KEY=VALUE da un file .env senza sovrascrivere variabili già presenti. */
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(root, ".env"));
loadEnvFile(path.join(root, ".env.local"));

const browserOrigin =
  process.env.BRANCHEFY_BROWSER_ORIGIN ?? "http://localhost:5173";

// Gli URL /remote/* devono puntare all'API (:8787), non a Vite (:5173):
// il proxy Vite ha timeout corti e le dirette HLS (playlist grandi + refresh
// ogni 2s) finivano in levelParsingError dopo ~10–15 secondi.
const streamPublicUrl =
  process.env.BRANCHEFY_PUBLIC_URL ?? "http://127.0.0.1:8787";

if (process.env.MEDIASET_LOGIN_ID && process.env.MEDIASET_PASSWORD) {
  console.log("[dev-api] Mediaset account login configurato (MEDIASET_LOGIN_ID)");
} else {
  console.log(
    "[dev-api] Mediaset guest only — imposta MEDIASET_LOGIN_ID + MEDIASET_PASSWORD in .env per account",
  );
}

const child = spawn(
  "cargo",
  [
    "run",
    "--release",
    "--manifest-path",
    path.join(root, "src-tauri", "Cargo.toml"),
    "--bin",
    "branchefy-web-api",
    "--features",
    "web-api",
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      BRANCHEFY_DATA_DIR: dataDir,
      BRANCHEFY_PUBLIC_URL: streamPublicUrl,
      BRANCHEFY_BROWSER_ORIGIN: browserOrigin,
      PORT: "8787",
    },
  },
);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
