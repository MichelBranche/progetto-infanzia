import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(webDir, "..");

const required = [
  path.join(repoRoot, "src", "App.tsx"),
  path.join(repoRoot, "public", "favicon.png"),
];

for (const filePath of required) {
  if (!fs.existsSync(filePath)) {
    console.error(`[prebuild] File mancante: ${filePath}`);
    console.error(
      "[prebuild] Su Vercel imposta Root Directory = web (il repo completo deve essere clonato).",
    );
    process.exit(1);
  }
}

console.log("[prebuild] Percorsi monorepo OK");
