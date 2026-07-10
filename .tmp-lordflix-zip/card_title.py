from pathlib import Path
import re

html = Path(r"d:\progetto-infanzia\.tmp-lordflix-zip\lordflix.org\index.html").read_text(
    encoding="utf-8", errors="ignore"
)

# Find a card block with following siblings for title
pat = r'w-\[140px\] lg:w-\[200px\][^<]{0,400}</div>\s*</div>(.{0,400})'
for m in re.finditer(pat, html):
    tail = m.group(1)
    if "text-" in tail or "font-" in tail or "<p" in tail:
        print("TAIL:", tail[:400])
        print("---")
        break
else:
    # count how many cards have title inside frame
    idx = html.find("group/card")
    print(html[idx:idx+2500].count("<p"), "p tags in 2500 chars")
    print(html[idx:idx+2500][-800:])
