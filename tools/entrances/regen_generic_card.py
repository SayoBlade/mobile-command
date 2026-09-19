"""Rebuild the page's "Everyone else" card (GENERIC_CARD in cards2.py) from generic.json, so the picker always shows
the current names and lines."""
import json
import re
from pathlib import Path

HERE = Path(__file__).parent
G = json.loads((HERE / "generic.json").read_text(encoding="utf-8"))
MAPS = {10: "map-vagrant", 11: "map-mayor", 13: "map-jericho", 14: "map-priors", 15: "map-sinner", 16: "map-stonoga",
        17: "map-hugo", 18: "map-blight", 19: "map-reaper", 20: "map-golub", 21: "map-fools", 22: "map-coven", 26: "map-kehlenn"}
esc = lambda t: t.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")
groups, cur = [], None
for i, g in enumerate(G):
    if g["chapter"] != cur:
        cur = g["chapter"]
        groups.append(f'<p class="gen-ch">Chapter {cur}</p>')
    groups.append(f'<button class="gen-pick" type="button" data-i="{i}" data-name="{esc(g["name"])}" data-sub="{esc(g["sub"])}" '
                  f'data-stance="{g["stance"]}" data-img="art/{g["key"]}.webp" data-map="art/{MAPS.get(g["chapter"], "map-mayor")}.webp">{esc(g["name"])}</button>')
first = G[0]
block = f'''GENERIC_CARD = r\'\'\'<article class="card t-generic g-{first["stance"]} gen" data-cue="g{"foe" if first["stance"] == "foe" else "friend"}" data-dur="7100" style="--dur:7.1s">
  <div class="screen" role="img" aria-label="A generic entrance banner, over a chapter map">
    <img class="map" src="art/{MAPS.get(first["chapter"], "map-mayor")}.webp" alt="">
    <div class="stage">
      <div class="dim"></div>
      <div class="weather"></div>
      <div class="art"><img src="art/{first["key"]}.webp" alt=""><img class="shade" src="art/{first["key"]}.webp" alt=""></div>
      <div class="band side-b"><div class="plate"><div class="strip s1"></div><div class="strip s2"></div><div class="strip s3"></div>
        <p class="name">{esc(first["name"])}</p><p class="sub">{esc(first["sub"])}</p></div></div>
    </div>
    {{PLAY}}
    <button class="fs" type="button" aria-label="Show this intro full screen" title="Full screen"><svg class="ico" aria-hidden="true"><use href="#i-full"/></svg></button>
  </div>
  <div class="info">
    <p class="eyebrow">Everyone else · {len(G)} generic intros</p>
    <h2>Everyone else</h2>
    <dl class="meta">
      <dt>Look</dt><dd>One quiet look for all of them. The accent line says friend (gold), neither (pewter) or foe (crimson); only a foe gets the black silhouette and pauses the game. A line under the name only when it is a job or eerie.</dd>
      <dt>Sound</dt><dd>%%SOUND:gfriend%% A foe: %%SOUND:gfoe%%</dd>
      <dt>Pick one</dt><dd><div class="gen-list">{"".join(groups)}</div></dd>
    </dl>
  </div>
</article>\'\'\'
'''
p = HERE / "cards2.py"
s = p.read_text(encoding="utf-8")
new, n = re.subn(r"GENERIC_CARD = r'''.*?'''\n", lambda m: block, s, count=1, flags=re.S)
assert n == 1
p.write_text(new, encoding="utf-8")
print("generic card rebuilt:", len(G), "people;", sum(1 for g in G if not g["sub"]), "without a line")
