import re
from pathlib import Path

html = Path(r"d:\progetto-infanzia\.tmp-lordflix-zip\lordflix.org\index.html").read_text(
    encoding="utf-8", errors="ignore"
)

print("=== ambient-bleed CSS ===")
for m in re.finditer(r"\.ambient-bleed[^{]{0,200}\{[^}]+\}", html):
    print(m.group(0)[:600])
    print("---")

print("=== ambient-bleed DOM ===")
for m in re.finditer(r'class="[^"]*ambient-bleed[^"]*"', html):
    print(m.group(0)[:300])

print("=== theme-global CSS vars ===")
for m in re.finditer(r"--theme-global-accent[A-Z][^;]{0,120}", html):
    print(m.group(0)[:200])

chunk = Path(r"C:\Users\miche\.cursor\projects\d-progetto-infanzia\agent-tools\88e38f98-2bef-475d-a67e-e591e2523fcd.txt")
if chunk.exists():
    text = chunk.read_text(encoding="utf-8", errors="ignore")
    for kw in ["ambient", "bleed", "hue", "palette", "createRadialGradient", "getImageData", "accentA", "liquid"]:
        if kw.lower() in text.lower():
            idx = text.lower().find(kw.lower())
            print(f"\n=== chunk DpoXALn {kw} @ {idx} ===")
            print(text[max(0, idx - 100) : idx + 400])
