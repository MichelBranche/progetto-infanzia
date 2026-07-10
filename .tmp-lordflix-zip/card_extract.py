from pathlib import Path
import re

html = Path(r"d:\progetto-infanzia\.tmp-lordflix-zip\lordflix.org\index.html").read_text(
    encoding="utf-8", errors="ignore"
)

idx = html.find("stagger-card visible")
chunk = html[idx : idx + 3500]
print(chunk[:3500])

print("\n\n=== TITLE AFTER CARD ===")
# find closing of card frame and what follows
m = re.search(r"group/card[^>]+>.*?</div>\s*</div>", chunk, re.DOTALL)
if m:
    print(m.group(0)[-500:])

print("\n\n=== HOVER OVERLAY ===")
for pat in ["brightness-50", "Play", "group-hover/card", "lf-card", "poster-card"]:
    i = html.find(pat)
    if i >= 0:
        print(pat, html[i - 80 : i + 200][:280])
        print("---")
