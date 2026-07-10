import fs from "fs";

const file = process.argv[2];
const minLen = Number(process.argv[3] || 4);
const s = fs.readFileSync(file, "utf8");

const patterns = [
  /class:"([^"]{3,200})"/g,
  /className:"([^"]{3,200})"/g,
  /class:([a-zA-Z_$][\w$]*)/g,
  /"([a-z][a-z0-9-]*(?:\s+[a-z][a-z0-9-]*){1,12})"/gi,
];

const set = new Set();
for (const re of patterns) {
  let m;
  while ((m = re.exec(s))) {
    const v = m[1];
    if (!v) continue;
    if (/hero|nav|pill|glass|slide|carousel|dot|ken|banner|continue|row|movie|home|theme|scroll|parallax|fade|animate|transition|backdrop|chromatic|dock|header/i.test(v)) {
      set.add(v);
    }
  }
}

// Also hunt CSS-like tokens in bundle
const cssRe = /(theme-[a-z-]+|pill-[a-z-]+|chromatic-[a-z-]+|dot-[a-z-]+|hero[a-zA-Z-]*|lf-[a-z-]+|liquid-[a-z-]+|ambient-[a-z-]+)/g;
let cm;
while ((cm = cssRe.exec(s))) set.add(cm[1]);

[...set].sort().forEach((x) => console.log(x));
