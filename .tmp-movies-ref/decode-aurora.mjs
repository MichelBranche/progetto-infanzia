import fs from "fs";

const src = fs.readFileSync(
  new URL("./assets/chunks/B1-NEbxd.js", import.meta.url),
  "utf8",
);

// Rimuove gli import ES (il decoder non ne ha bisogno) e taglia prima
// dell'uso dei moduli svelte, tenendo solo string-table + decoder + shuffle.
const importStripped = src.replace(/import\{[^}]*\}from"[^"]+";/g, "");

// Trova la funzione string-table (function XX(){const n=[...];return XX=...)
// e il decoder (function YY(n,B){...}) più l'IIFE di shuffle.
// Strategia: eval dell'intero file in un contesto sandbox fallirebbe per i
// riferimenti svelte, quindi estraiamo fino alla fine dell'IIFE di shuffle.

// L'IIFE di shuffle è: (function(n,B){...})(TABLE_FN, number);
const iifeMatch = importStripped.match(
  /\(function\(n,B\)\{[\s\S]*?\}\)\([A-Za-z0-9_$]+,\s*-?[\dx*+\-() ]+\);/,
);
if (!iifeMatch) {
  console.error("shuffle IIFE non trovato");
  process.exit(1);
}
const iifeEnd = importStripped.indexOf(iifeMatch[0]) + iifeMatch[0].length;
let prelude = importStripped.slice(0, iifeEnd);

// Il decoder e la string table sono function-declaration hoisted che appaiono
// anche dopo l'IIFE: aggiungiamole.
const fnDecls = importStripped.match(
  /function [A-Za-z0-9_$]+\(\)\{const [A-Za-z0-9_$]+=\[[\s\S]*?\];return [A-Za-z0-9_$]+=function\(\)\{return [A-Za-z0-9_$]+\},[A-Za-z0-9_$]+\(\)\}/,
);
const decoderDecl = importStripped.match(
  /function [A-Za-z0-9_$]+\([A-Za-z0-9_$]+,[A-Za-z0-9_$]+\)\{[A-Za-z0-9_$]+=[A-Za-z0-9_$]+-\([\s\S]*?return [A-Za-z0-9_$]+\}/,
);

if (fnDecls) prelude += "\n" + fnDecls[0];
if (decoderDecl) prelude += "\n" + decoderDecl[0];

// Nome del decoder: const gW=SW; -> SW è il decoder
const aliasMatch = importStripped.match(
  /const ([A-Za-z0-9_$]+)=([A-Za-z0-9_$]+);/,
);
const decoderName = aliasMatch ? aliasMatch[2] : null;
if (!decoderName) {
  console.error("decoder alias non trovato");
  process.exit(1);
}

const fn = new Function(
  prelude + `\nreturn ${decoderName};`,
);
let decode;
try {
  decode = fn();
} catch (e) {
  console.error("eval fallita:", e.message);
  process.exit(1);
}

// Trova tutte le chiamate decoder(idx,"key") o alias(idx,"key")
const callRe = /[A-Za-z0-9_$]+\((\d+),\s*"([^"]+)"\)/g;
const seen = new Set();
let m;
while ((m = callRe.exec(src))) {
  const idx = Number(m[1]);
  const key = m[2];
  const id = `${idx}|${key}`;
  if (seen.has(id)) continue;
  seen.add(id);
  try {
    const out = decode(idx, key);
    if (typeof out === "string" && out.length > 0) {
      console.log(JSON.stringify([idx, key, out]));
    }
  } catch {}
}
