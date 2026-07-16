import { spawnSync } from "node:child_process";
import fs from "node:fs";

const md5 = "2dd3b49bd557bff3a63ce229a6db2c04";
const jar = "welib-jar7.txt";
const ua =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function curl(args) {
  return spawnSync("curl.exe", args, { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
}

curl(["-fsSL", "-c", jar, "-b", jar, "-A", ua, "https://welib.org/"]);
const r = curl([
  "-fsSL",
  "-c",
  jar,
  "-b",
  jar,
  "-A",
  ua,
  "-e",
  "https://welib.org",
  `https://welib.org/slow_download/${md5}/0/0`,
]);
const html = r.stdout || "";
const re = /href="(https:\/\/x-cdn-x\.com\/[^"]+\.(?:epub|pdf))"/gi;
const urls = [...html.matchAll(re)].map((m) => m[1].replace(/&amp;/g, "&"));
const scoped = urls.filter((u) => u.toLowerCase().includes(md5));
console.log("urls", scoped);
const fileUrl = scoped.find((u) => u.toLowerCase().endsWith(".pdf")) || scoped[0];
console.log("pick", fileUrl);

const dl = curl([
  "-fsSL",
  "-c",
  jar,
  "-b",
  jar,
  "-A",
  ua,
  "-e",
  "https://welib.org",
  fileUrl,
]);
console.log("download status", dl.status, "stderr", dl.stderr?.slice(0, 300));
if (dl.stdout) {
  const buf = Buffer.from(dl.stdout, "binary");
  fs.writeFileSync(".tmp-dl.bin", buf);
  console.log("len", buf.length, "magic", buf.slice(0, 8).toString("latin1"));
}
