import re
from pathlib import Path

html = Path(r"d:\progetto-infanzia\.tmp-lordflix-zip\lordflix.org\index.html").read_text(
    encoding="utf-8", errors="ignore"
)

markers = [
    'role="tablist"',
    "mobile-nav-bar",
    "dot-filling",
    "h-[115%",
    "100dvh",
    "chromatic-logo",
    "liquid-bg",
    "stagger-card visible",
    "theme-btn-primary",
    "PLAY",
]

for marker in markers:
    i = html.find(marker)
    print(f"\n{'='*60}\n{marker} @ {i}\n{'='*60}")
    if i >= 0:
        print(html[i - 100 : i + 1500])

# sliding pill indicator
for m in re.finditer(r"absolute left-0 top-1\.5[^\"]{0,400}", html):
    print("\nPILL INDICATOR:", m.group(0)[:400])
