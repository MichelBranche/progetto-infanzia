import https from "https";

https
  .get("https://streamingcommunityz.tech/it/archive", {
    headers: { "User-Agent": "Mozilla/5.0" },
  }, (res) => {
    let data = "";
    res.on("data", (c) => (data += c));
    res.on("end", () => {
      const m = data.match(/data-page="([^"]+)"/);
      if (!m) {
        console.log("no inertia page");
        return;
      }
      const json = JSON.parse(
        m[1]
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&")
          .replace(/&#39;/g, "'"),
      );
      const t = json.props?.titles;
      if (Array.isArray(t)) {
        console.log("flat titles", t.length);
      } else if (t && typeof t === "object") {
        console.log("paginator keys", Object.keys(t));
        console.log("page", t.current_page, "/", t.last_page, "total", t.total, "data", t.data?.length);
      }
      const g = json.props?.genres;
      console.log("genres", Array.isArray(g) ? g.length : typeof g);
      if (Array.isArray(g) && g[0]) console.log("genre0", g[0]);
    });
  })
  .on("error", console.error);
