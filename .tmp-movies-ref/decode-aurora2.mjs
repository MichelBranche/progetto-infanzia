import fs from "fs";

const src = fs.readFileSync(
  new URL("./assets/chunks/B1-NEbxd.js", import.meta.url),
  "utf8",
);

// Stub universale: funzione richiamabile con qualsiasi proprietà.
const makeStub = () => {
  const fn = function () {
    return makeStub();
  };
  return new Proxy(fn, {
    get: (t, p) => (p === Symbol.toPrimitive ? () => "" : makeStub()),
    apply: () => makeStub(),
    construct: () => makeStub(),
  });
};

// Sostituisce gli import con const stub.
let body = src
  .replace(
    /import\{([^}]*)\}from"[^"]+";/g,
    (_, names) =>
      names
        .split(",")
        .map((n) => {
          const alias = n.includes(" as ")
            ? n.split(" as ")[1].trim()
            : n.trim();
          return `const ${alias}=__stub();`;
        })
        .join("") ,
  )
  .replace(/import"[^"]+";/g, "")
  .replace(/export\{[^}]*\};?/g, "");

// L'alias del decoder: const gW=SW;
const aliasMatch = src.match(/const ([A-Za-z0-9_$]{2})=([A-Za-z0-9_$]{2});\(function/);
if (!aliasMatch) {
  console.error("alias non trovato");
  process.exit(1);
}
const decoderName = aliasMatch[2];

let decode;
try {
  const fn = new Function(
    "__stub",
    body + `\n;return ${decoderName};`,
  );
  decode = fn(makeStub);
} catch (e) {
  console.error("exec fallita:", e.message);
  process.exit(1);
}

const callRe = /\((\d+),\s*"([^"\\]{2,8})"\)/g;
const seen = new Set();
let m;
const out = [];
while ((m = callRe.exec(src))) {
  const idx = Number(m[1]);
  const key = m[2];
  const id = `${idx}|${key}`;
  if (seen.has(id)) continue;
  seen.add(id);
  try {
    const s = decode(idx, key);
    if (typeof s === "string" && s.length > 0 && /[ -~\n\t]/.test(s)) {
      out.push(`${idx}\t${key}\t${s}`);
    }
  } catch {}
}
fs.writeFileSync(new URL("./aurora-strings.txt", import.meta.url), out.join("\n"), "utf8");
console.log("decoded:", out.length);
