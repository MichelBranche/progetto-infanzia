import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(webDir, "..");

function copyTree(label, from, to) {
  if (!fs.existsSync(from)) {
    console.error(`[prepare] Manca ${label}: ${from}`);
    console.error(
      "[prepare] Il repo completo deve essere clonato (non usare sparse checkout).",
    );
    process.exit(1);
  }
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
  console.log(`[prepare] ${label} -> ${to}`);
}

copyTree("src", path.join(repoRoot, "src"), path.join(webDir, "app-src"));
copyTree("public", path.join(repoRoot, "public"), path.join(webDir, "public"));

console.log("[prepare] Deploy bundle pronto");
