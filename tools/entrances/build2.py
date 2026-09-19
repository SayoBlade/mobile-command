"""Stitch the Boss-Splash-style entrance page: head2.html is the template; sounds.json fills the clips and the Sound lines."""
import json
import re
from pathlib import Path

here = Path(__file__).parent
read = lambda name: (here / name).read_text(encoding="utf-8").strip("\n")

sounds = json.loads(read("sounds.json")) if (here / "sounds.json").exists() else {}
cards = read("cards2.html")
for key in re.findall(r"%%SOUND:([a-z0-9-]+)%%", cards):
    cards = cards.replace(f"%%SOUND:{key}%%", sounds.get(key, {}).get("text", "Not chosen yet."))
clips = {key: s.get("clips", []) for key, s in sounds.items()}

page = read("head2.html")
for slot, value in {"BASE": read("base2.css"), "THEMES": read("themes2.css"), "CARDS": cards,
                    "CLIPS": json.dumps(clips, separators=(",", ":")), "APP": read("app2.js")}.items():
    token = "%%" + slot + "%%"
    assert token in page, token
    page = page.replace(token, value)
assert "%%" not in page, "unfilled slot"
out = here / "crooked-moon-entrances-ii.html"
out.write_text(page, encoding="utf-8")

# Every file the page references, for the publish step and a missing-file check.
refs = sorted(set(re.findall(r'(?:src|href|data-img|data-map)="((?:art|snd|fx)/[^"]+)"', page)) | {c["src"] for v in clips.values() for c in v})
missing = [r for r in refs if not (here / r).exists()]
(here / "refs.json").write_text(json.dumps(refs, indent=1), encoding="utf-8")
print(out.name, len(page.encode("utf-8")), "bytes;", len(refs), "files referenced;", "missing:", missing or "none")
