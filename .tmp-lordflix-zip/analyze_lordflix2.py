from pathlib import Path

html = Path(r"d:\progetto-infanzia\.tmp-lordflix-zip\lordflix.org\index.html").read_text(
    encoding="utf-8", errors="ignore"
)

for pat in [
    "data-theme-ambient",
    "data-theme-glass",
    'data-theme="',
    "ambient-bleed",
    "light-bar",
    "theme-global",
    "image.tmdb",
    "w1280",
    "w780",
]:
    idx = html.find(pat)
    print(pat, idx)
    if idx != -1:
        print(html[max(0, idx - 60) : idx + 180][:240])
    print("---")

text = Path(
    r"C:\Users\miche\.cursor\projects\d-progetto-infanzia\agent-tools\c99f1bc7-6828-4427-b41a-91762c778fc6.txt"
).read_text(encoding="utf-8", errors="ignore")

for anchor in [
    "preview:Y,aurora",
    "background:{main",
    "disableAmbientBleed",
    "theme-global-accentA",
    "setProperty",
    "documentElement",
    "data-theme-ambient-bleed",
    "ambient-bleed",
]:
    idx = text.find(anchor)
    while idx != -1:
        print("\n===", anchor, idx, "===")
        print(text[max(0, idx - 100) : idx + 350][:450])
        idx = text.find(anchor, idx + len(anchor))
        if anchor != "setProperty":
            break
