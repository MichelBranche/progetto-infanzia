import { spawnSync } from "node:child_process";
import fs from "node:fs";

const ua =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const jar = "welib-jar-cookies.txt";
if (fs.existsSync(jar)) fs.unlinkSync(jar);

spawnSync("curl.exe", ["-fsSL", "-c", jar, "-b", jar, "-A", ua, "https://welib.org/"]);
spawnSync("curl.exe", ["-fsSL", "-c", jar, "-b", jar, "-A", ua, "-e", "https://welib.org", "https://welib.org/popular?interval=24h&offset=0&limit=2"]);

console.log("cookies after warm:");
console.log(fs.readFileSync(jar, "utf8"));

const r = spawnSync(
  "curl.exe",
  ["-sSL", "-b", jar, "-A", ua, "-e", "https://welib.org/popular", "-w", "\nHTTP:%{http_code}", "https://welib.org/search?q=dante"],
  { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 },
);
const out = r.stdout || "";
console.log(out.slice(-20), "challenge", out.includes("Just a moment"));
