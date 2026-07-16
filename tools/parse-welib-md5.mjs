const md5 = process.argv[2] || "2dd3b49bd557bff3a63ce229a6db2c04";
const res = await fetch(`http://127.0.0.1:8787/welib-book/${md5}`);
const html = await res.text();
console.log("status", res.status, "len", html.length);
for (const re of [
  /href="([^"]*(?:download|preview|epub|pdf|zlib|libgen)[^"]*)"/gi,
  /data-book-url="([^"]+)"/gi,
  /data-ext="([^"]+)"/gi,
  /"(https?:\/\/x-cdn-x\.com[^"]+)"/gi,
  /"(https?:\/\/[^"]+\.(?:epub|pdf)[^"]*)"/gi,
]) {
  const matches = [...html.matchAll(re)].map((m) => m[1]);
  if (matches.length) console.log(re.source, matches.slice(0, 8));
}
