import fs from "fs";

const file = process.argv[2];
const s = fs.readFileSync(file, "utf8");
const re = /['"`]([^'"`]{5,140})['"`]/g;
const set = new Set();
let m;
while ((m = re.exec(s))) {
  const v = m[1];
  if (/class|glass|pill|hero|continue|rounded|aspect|grid|nav|theme|shadow|blur|Movies|Netflix|Play|Discover|filter|Random|Genre|Provider|row|card/i.test(v)) {
    set.add(v);
  }
}
[...set].sort().forEach((x) => console.log(x));
