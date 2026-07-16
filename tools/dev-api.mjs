import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, ".branchefy-data");

const browserOrigin =
  process.env.BRANCHEFY_BROWSER_ORIGIN ?? "http://localhost:5173";

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
      BRANCHEFY_PUBLIC_URL: browserOrigin,
      PORT: "8787",
    },
  },
);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
