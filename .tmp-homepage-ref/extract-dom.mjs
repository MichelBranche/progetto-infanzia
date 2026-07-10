import fs from "fs";

const file = process.argv[2];
let s = fs.readFileSync(file, "utf8");

// Rimuove i data URI enormi per rendere il DOM leggibile
s = s.replace(/(src|href|xlink:href)="data:[^"]{100,}"/g, '$1="DATA_URI"');
s = s.replace(/url\(data:[^)]{100,}\)/g, "url(DATA_URI)");
s = s.replace(/srcset="[^"]{100,}"/g, 'srcset="SRCSET"');

// Estrae solo il body
const bodyStart = s.indexOf("<body");
const bodyEnd = s.lastIndexOf("</body>");
const body = s.slice(bodyStart, bodyEnd);

// Outline: apertura tag con classi, testo breve
const out = [];
let depth = 0;
const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^<>]*?)?)(\/?)>/g;
let m;
let lastIndex = 0;
const skip = new Set(["script", "style", "path", "defs", "linearGradient", "stop", "filter", "feTurbulence", "feColorMatrix", "circle", "rect", "line", "polyline", "g"]);
while ((m = tagRe.exec(body))) {
  const [full, close, tag, attrs, selfClose] = m;
  const text = body.slice(lastIndex, m.index).replace(/\s+/g, " ").trim();
  if (text && text.length > 0 && text.length < 120 && out.length > 0) {
    out.push("  ".repeat(depth) + "» " + text);
  }
  lastIndex = m.index + full.length;
  if (skip.has(tag)) continue;
  if (close) {
    depth = Math.max(0, depth - 1);
    continue;
  }
  const cls = (attrs.match(/class="([^"]*)"/) || [])[1] || "";
  const style = (attrs.match(/style="([^"]{0,200})"/) || [])[1] || "";
  let line = "  ".repeat(depth) + "<" + tag;
  if (cls) line += ` class="${cls}"`;
  if (style) line += ` style="${style}"`;
  line += ">";
  out.push(line);
  const voidTags = new Set(["img", "br", "hr", "input", "meta", "link", "source", "canvas"]);
  if (!selfClose && !voidTags.has(tag)) depth++;
}
fs.writeFileSync(process.argv[3], out.join("\n"), "utf8");
console.log("lines:", out.length);
