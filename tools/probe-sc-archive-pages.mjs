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

const base = "https://streamingcommunityz.tech";
let total = 0;
for (let p = 1; p <= 500; p++) {
  const html = await get(`${base}/it/archive?page=${p}`);
  const page = parseInertia(html);
  const titles = page?.props?.titles ?? [];
  if (titles.length === 0) {
    console.log("stopped at page", p, "total", total);
    break;
  }
  total += titles.length;
  if (p % 25 === 0) console.log(`page ${p}: running total ${total}`);
}
console.log("final total", total);
