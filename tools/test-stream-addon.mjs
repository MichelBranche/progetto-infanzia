#!/usr/bin/env node
// Addon Stremio di TEST per Branchefy.
// Fornisce catalogo + meta + stream usando film di pubblico dominio
// (open movies Blender) ospitati sul bucket di test pubblico di Google.
//
// Avvio:   node tools/test-stream-addon.mjs
// Poi in Branchefy: Impostazioni -> Addon Stremio -> Aggiungi
//   http://127.0.0.1:43010/manifest.json
//
// Serve a verificare che Home/Hero mostrino i titoli e che il player
// in-app riproduca davvero lo stream. NON contiene materiale protetto.

import http from "node:http";

const PORT = process.env.PORT || 43010;

const CATALOG = [
  {
    id: "bf-bbb",
    type: "movie",
    name: "Big Buck Bunny",
    poster:
      "https://upload.wikimedia.org/wikipedia/commons/c/c5/Big_buck_bunny_poster_big.jpg",
    background:
      "https://upload.wikimedia.org/wikipedia/commons/c/c5/Big_buck_bunny_poster_big.jpg",
    description:
      "Un coniglio gigante e gentile affronta tre roditori dispettosi. Cortometraggio open movie della Blender Foundation.",
    releaseInfo: "2008",
    runtime: "10 min",
    stream:
      "https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4",
  },
  {
    id: "bf-sintel",
    type: "movie",
    name: "Sintel",
    poster:
      "https://upload.wikimedia.org/wikipedia/commons/5/50/Sintel_poster.jpg",
    background:
      "https://upload.wikimedia.org/wikipedia/commons/5/50/Sintel_poster.jpg",
    description:
      "Una ragazza cerca il suo piccolo drago in un mondo ostile. Open movie della Blender Foundation.",
    releaseInfo: "2010",
    runtime: "15 min",
    stream: "https://archive.org/download/Sintel/sintel-2048-surround.mp4",
  },
  {
    id: "bf-cosmos",
    type: "movie",
    name: "Cosmos Laundromat",
    poster: "https://archive.org/services/img/cosmos-laundromat",
    background: "https://archive.org/services/img/cosmos-laundromat",
    description:
      "Su un'isola desolata, una pecora suicida incontra un bizzarro venditore che gli offre la vita dei suoi sogni. Open movie della Blender Foundation.",
    releaseInfo: "2015",
    runtime: "12 min",
    stream:
      "https://archive.org/download/cosmos-laundromat/Cosmos%20Laundromat.mp4",
  },
  {
    id: "bf-ed",
    type: "movie",
    name: "Elephants Dream",
    poster:
      "https://upload.wikimedia.org/wikipedia/commons/9/9a/Elephants_Dream_cover.jpg",
    background:
      "https://upload.wikimedia.org/wikipedia/commons/9/9a/Elephants_Dream_cover.jpg",
    description:
      "Due personaggi esplorano una macchina surreale e infinita. Primo open movie della Blender Foundation.",
    releaseInfo: "2006",
    runtime: "11 min",
    stream: "https://archive.org/download/ElephantsDream/ed_hd.mp4",
  },
];

const MANIFEST = {
  id: "org.branchefy.testfree",
  version: "1.0.0",
  name: "Branchefy Test (Film liberi)",
  description:
    "Addon di test con film di pubblico dominio per verificare streaming e player in-app.",
  resources: ["catalog", "meta", "stream"],
  types: ["movie"],
  catalogs: [{ type: "movie", id: "free", name: "Film liberi" }],
  idPrefixes: ["bf-"],
};

function findById(id) {
  return CATALOG.find((m) => m.id === id);
}

function metaPreview(m) {
  return {
    id: m.id,
    type: m.type,
    name: m.name,
    poster: m.poster,
    description: m.description,
    releaseInfo: m.releaseInfo,
  };
}

function fullMeta(m) {
  return {
    id: m.id,
    type: m.type,
    name: m.name,
    poster: m.poster,
    background: m.background,
    description: m.description,
    releaseInfo: m.releaseInfo,
    runtime: m.runtime,
    genres: ["Animazione", "Open Movie"],
    videos: [],
  };
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "no-cache",
  });
  res.end(json);
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");

  // /manifest.json
  if (parts.length === 1 && parts[0] === "manifest.json") {
    return send(res, 200, MANIFEST);
  }

  // /catalog/movie/free.json
  if (parts.length === 3 && parts[0] === "catalog") {
    return send(res, 200, { metas: CATALOG.map(metaPreview) });
  }

  // /meta/movie/<id>.json
  if (parts.length === 3 && parts[0] === "meta") {
    const id = decodeURIComponent(parts[2].replace(/\.json$/, ""));
    const m = findById(id);
    if (!m) return send(res, 404, { meta: null });
    return send(res, 200, { meta: fullMeta(m) });
  }

  // /stream/movie/<id>.json
  if (parts.length === 3 && parts[0] === "stream") {
    const id = decodeURIComponent(parts[2].replace(/\.json$/, ""));
    const m = findById(id);
    if (!m) return send(res, 200, { streams: [] });
    return send(res, 200, {
      streams: [
        {
          url: m.stream,
          name: "Branchefy Test",
          title: `${m.name} · 720p MP4`,
        },
      ],
    });
  }

  send(res, 404, { err: "not found" });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(
      `\nL'addon di test e' GIA' in esecuzione su http://127.0.0.1:${PORT}/manifest.json`,
    );
    console.log(
      "Non serve riavviarlo: usa pure quell'URL in Branchefy (Impostazioni -> Addon Stremio).\n",
    );
    process.exit(0);
  }
  console.error("Errore addon di test:", err.message);
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\nBranchefy test stream addon in ascolto su:`);
  console.log(`  http://127.0.0.1:${PORT}/manifest.json\n`);
  console.log("Aggiungi questo URL in Branchefy: Impostazioni -> Addon Stremio.");
});
