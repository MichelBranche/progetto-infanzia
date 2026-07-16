const md5 = process.argv[2] || "2dd3b49bd557bff3a63ce229a6db2c04";

const bookRes = await fetch(`http://127.0.0.1:8787/welib-book/${md5}`);
const bookBuf = await bookRes.arrayBuffer();
const u8 = new Uint8Array(bookBuf.slice(0, 8));
const magic = String.fromCharCode(...u8);
console.log("book", {
  status: bookRes.status,
  len: bookBuf.byteLength,
  magic,
  ct: bookRes.headers.get("content-type"),
});

const popular = await fetch("http://127.0.0.1:8787/api/invoke", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    command: "welib_popular_cmd",
    args: { interval: "24h", offset: 0, limit: 1 },
  }),
}).then((r) => r.json());

const coverUrl = popular.data?.items?.[0]?.coverUrl;
if (coverUrl) {
  const fixed = coverUrl.replace(/&amp;/g, "&");
  const coverRes = await fetch(
    `http://127.0.0.1:8787/welib-cover/${encodeURIComponent(fixed)}`,
  );
  const coverBuf = await coverRes.arrayBuffer();
  console.log("cover", {
    status: coverRes.status,
    len: coverBuf.byteLength,
    ct: coverRes.headers.get("content-type"),
  });
}
