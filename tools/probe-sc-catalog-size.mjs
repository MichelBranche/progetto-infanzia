import https from "https";

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" } }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

function parseInertia(html) {
  const m = html.match(/data-page="([^"]+)"/);
  if (!m) return null;
  return JSON.parse(
    m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'"),
  );
}

async function fetchAll(basePath) {
  const seen = new Set();
  for (let p = 1; p <= 100; p++) {
    const sep = basePath.includes("?") ? "&" : "?";
    const html = await get(`https://streamingcommunityz.tech${basePath}${sep}page=${p}`);
    const page = parseInertia(html);
    const titles = page?.props?.titles ?? [];
    if (titles.length === 0) break;
    for (const t of titles) seen.add(`${t.type}:${t.id}`);
  }
  return seen;
}

const homeHtml = await get("https://streamingcommunityz.tech/");
const home = parseInertia(homeHtml) ?? parseInertia(await get("https://streamingcommunityz.tech/it"));
const genres = home.props.genres;
const sliders = home.props.sliders.map((s) => s.name);
console.log("sliders", sliders.length, sliders);
console.log("genres", genres.length);

const all = new Set();
async function merge(path) {
  const s = await fetchAll(path);
  const before = all.size;
  for (const k of s) all.add(k);
  console.log(path, "+", all.size - before, "=>", all.size);
}

await merge("/it/archive");
await merge("/it/archive?type=movie");
await merge("/it/archive?type=tv");
for (const g of genres.slice(0, 5)) {
  await merge(`/it/archive?type=movie&genres=${g.id}`);
}
console.log("sample total after partial genres", all.size);
