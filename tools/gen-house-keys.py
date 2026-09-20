"""Generate the Crooked House's ACTION KEYS — one Foundry macro per beat, placed on the scene's board.

Writes  audio-catalogue/campaigns/crooked-house-keys.apply.js  (a GM console script, TEST WORLD ONLY).

Each key calls deck-command's action runtime (foundry-module/scripts/action-runtime.js), never a mechanism of
its own. Board layout is the DM's instruction of 2026-09-20: PAGE 1 is that floor's room keys — the
location-contextual ones he called his highest priority — and PAGE 2 the wider actions (doors that move by
themselves, the Crooked Man, the house).

⚠️ NOTHING IS NAMED BY DOCUMENT ID. A key references a door, a light, a loop or a cue by the `cm` flag the
wiring wrote, so the same generated key is true in a bench copy of the world as well as the original. Where a
flag does not exist yet the apply script PROVISIONS it first (the parlour hearth has no light in the shipped
map at all) and reports what it made.
"""
import json
from pathlib import Path

HERE = Path(__file__).parent
MC = HERE.parent
CAT = MC.parent / "audio-catalogue" / "campaigns"

ICON = {
    "bolt": "icons/magic/lightning/bolt-strike-blue.webp",
    "door": "icons/svg/door-open-outline.svg",
    "fire": "icons/magic/fire/flame-burning-campfire-orange.webp",
    "dark": "icons/magic/unholy/orb-smoking-green.webp",
    "music": "icons/tools/instruments/harp-lap-brown.webp",
    "quiet": "icons/svg/sound-off.svg",
    "scream": "icons/magic/death/skull-energy-light-purple.webp",
    "ghost": "icons/magic/death/hand-undead-skeleton-fire-green.webp",
    "lock": "icons/svg/door-locked-outline.svg",
}

# a = the stable A-number · page 1 room / 2 wider · scenes it belongs on · the runtime calls
KEYS = [
    # ── 12.1, page 1: the rooms ────────────────────────────────────────────────────────────────────
    dict(a="A80", label="Porch bolt", icon="bolt", page=1, scenes=["12.1"],
         note="Lightning beside the porch, and its thunder a second or two later.",
         body=[('fx', dict(id="lightning"))]),
    dict(a="A81", label="Front door", icon="door", page=1, scenes=["12.1"],
         note="The front door swings open on its own.",
         body=[('door', dict(cm="door:front", state="open"))]),
    dict(a="A83", label="Hearth lit", icon="fire", page=1, scenes=["12.1"],
         note="A pleasant fire catches in the parlour as the seance begins.",
         body=[('light', dict(cm="light:hearth", on=True)), ('loop', dict(cm="12.1:sound:3", on=True))]),
    dict(a="A84", label="Hearth out", icon="dark", page=1, scenes=["12.1"],
         note="The fire dies, the loop stops, and darkness falls on the parlour.",
         body=[('light', dict(cm="light:hearth", on=False)), ('loop', dict(cm="12.1:sound:3", on=False))]),
    dict(a="A89", label="Waltz", icon="music", page=1, scenes=["12.1"],
         note="The harpsichord's waltz, heard across the whole first floor.",
         body=[('loop', dict(cm="12.1:sound:1", on=True))]),
    dict(a="A90", label="Waltz off", icon="quiet", page=1, scenes=["12.1"],
         note="The waltz stops on the Performance success.",
         body=[('loop', dict(cm="12.1:sound:1", on=False))]),
    dict(a="A93", label="Oven bursts", icon="scream", page=1, scenes=["12.1"],
         note="The oven door bursts open in flame and the screaming stops.",
         body=[('cue', dict(cm="room:oven", on=False)),
               ('roomSound', dict(src="assets/Personal/SFX/Magic Spells Vol 2/Fire/Fireball J.wav",
                                  volume=0.8, at=[2170, 910], radius=30))]),
    dict(a="A94", label="Oven quiet", icon="quiet", page=1, scenes=["12.1"],
         note="The screams behind the oven stop when the glyph is disarmed.",
         body=[('cue', dict(cm="room:oven", on=False))]),
    dict(a="A95", label="Petunia go", icon="ghost", page=1, scenes=["12.1"],
         note="Petunia fades in peace and her bench falls quiet.",
         body=[('cue', dict(cm="room:petunia", on=False)),
               ('tokens', dict(match=["Petunia"], show=False))]),
    # ── page 2: what the house does wherever they are ──────────────────────────────────────────────
    dict(a="A125", label="Door slams", icon="door", page=2, scenes=["12.1", "12.2", "12.3", "12.4"],
         note="The nearest door opens or shuts by itself. A locked one is left alone.",
         body=[('door', dict(state="toggle"))]),
    dict(a="A126", label="Locks it", icon="lock", page=2, scenes=["12.1", "12.2", "12.3", "12.4"],
         note="The nearest door locks behind them.",
         body=[('door', dict(state="locked"))]),
]

# What the apply script has to MAKE before a key can name it (the shipped map has neither).
PROVISION = {
    "12.1": {
        # The book gives the parlour no light at all, so A83 would have nothing to light. One hidden light at
        # the hearth, flagged, and the two keys toggle it forever after.
        "lights": [dict(cm="light:hearth", x=770, y=1750, dim=18, bright=8, color="#ff9a3c", alpha=0.45)],
        # The front door is whichever door wall sits nearest the porch. Flagged once here so the key can name it.
        "doors": [dict(cm="door:front", near=[1330, 2730])],
    },
}


def call(verb, args):
    return f"  await act.{verb}({json.dumps(args, ensure_ascii=False)});"


def command_for(k):
    lines = [
        f"// Deck Command action key {k['a']} — {k['note']}",
        "// Generated by mobile-command/tools/gen-house-keys.py. Every verb lives in deck-command's action",
        "// runtime, so this macro is a script of calls and never a mechanism of its own.",
        'const act = game.modules.get("deck-command")?.api?.act;',
        'if (!act) return ui.notifications.warn("Deck Command is not active, so this key has nothing to call.");',
        "(async () => {",
    ]
    for verb, args in k["body"]:
        a = dict(args)
        if "at" in a and isinstance(a["at"], list):
            a["at"] = {"x": a["at"][0], "y": a["at"][1]}
        lines.append(call(verb, a))
    lines.append("})();")
    return "\n".join(lines)


# ⚠️ WHERE A KEY GOES IS ALREADY DECIDED (learned the hard way 2026-09-20). The scene boards are not empty:
# `crooked-moon-scene-boards.apply.js` filled five pages per floor with SOUND keys, one per beat — "Toys Wake",
# "Wisp Vanishes", "Door Creaks". Appending action keys after them buried the new ones on page 3 and beyond, and
# the DM saw nothing at all. His instruction covered this: *"keep the room FX on the first page (make sure to
# remove sounds that get full actions replacing them)"*.
#
# So an action key does not join the board — it REPLACES its beat, in the box that beat already occupies. The
# register (`crooked-moon-action-keys.json`) records the board, page and box of all 39 beats that have one, so
# the DM's own layout is preserved exactly and the board does not grow by a single entry. A beat with several
# sound boxes keeps the first for the action key and gives the rest back as empty space; nothing is deleted, the
# playlist sounds all still exist, and the script reports every box it frees.
REG = json.loads((CAT / "crooked-moon-action-keys.json").read_text(encoding="utf-8"))
ONBOARD = {}
for r in REG["records"]:
    if str(r.get("chapter")) != "12":
        continue
    rows = [b for b in (r.get("onBoard") or []) if b.get("board") and b.get("page") and b.get("box")]
    if rows:
        ONBOARD[str(r.get("a"))] = [dict(board=b["board"], page=b["page"], box=b["box"], label=b.get("label", ""))
                                    for b in rows]

plan = [dict(a=k["a"], label=k["label"], img=ICON[k["icon"]], page=k["page"], scenes=k["scenes"],
             note=k["note"], command=command_for(k), takes=ONBOARD.get(k["a"], [])) for k in KEYS]
_homed = sum(1 for p in plan if p["takes"])

JS = r"""// Deck Command — the Crooked House's ACTION KEYS. TEST WORLD ONLY. Paste into the GM's console.
//
// One macro per beat, in the Macros folder "Deck Command - Crooked House", placed on the board of every scene
// it belongs to: PAGE 1 the room keys, PAGE 2 what the house does anywhere (the DM's layout, 2026-09-20).
// Creates or updates, never deletes; a key he has moved stays where he put it.
//
// It also PROVISIONS what the keys name and the shipped map lacks: a hidden light at the parlour hearth (the
// book puts none there at all) and a flag on the front door. Both are made once and reported.
(async () => {
  if (game.world?.id !== "offline-test") return { refused: `world is ${game.world?.id}, not offline-test` };
  if (!game.user?.isGM) return { refused: "not a GM" };
  const ID = "deck-command";
  const MOD = "mobile-command";
  const PLAN = __PLAN__;
  const PROVISION = __PROVISION__;
  const report = { made: [], created: [], updated: [], placed: [], freed: [], missing: [] };

  const numOf = (name) => /^(\d{1,2}(?:\.\d{1,2})+)\s/.exec(name)?.[1] ?? null;
  const covers = (planNum, sceneNum) => sceneNum === planNum || sceneNum.startsWith(`${planNum}.`);

  // ── 1. make what the keys will name
  for (const scene of game.scenes.contents) {
    const num = numOf(scene.name);
    const want = num && PROVISION[num];
    if (!want) continue;
    for (const l of want.lights ?? []) {
      if (scene.lights.find((x) => x.getFlag(MOD, "cm") === l.cm)) continue;
      await scene.createEmbeddedDocuments("AmbientLight", [{
        x: l.x, y: l.y, hidden: true, flags: { [MOD]: { cm: l.cm } },
        config: { dim: l.dim, bright: l.bright, color: l.color, alpha: l.alpha, animation: { type: "torch", speed: 2, intensity: 3 } },
      }]);
      report.made.push(`${scene.name}: light ${l.cm}`);
    }
    for (const d of want.doors ?? []) {
      if (scene.walls.find((w) => w.getFlag(MOD, "cm") === d.cm)) continue;
      const doors = scene.walls.filter((w) => w.door > 0);
      if (!doors.length) { report.missing.push(`${scene.name}: no doors to flag as ${d.cm}`); continue; }
      const mid = (w) => ({ x: (w.c[0] + w.c[2]) / 2, y: (w.c[1] + w.c[3]) / 2 });
      const best = doors.reduce((b, w) => {
        const m = mid(w);
        const dist = (m.x - d.near[0]) ** 2 + (m.y - d.near[1]) ** 2;
        return !b || dist < b.dist ? { w, dist } : b;
      }, null);
      await best.w.setFlag(MOD, "cm", d.cm);
      report.made.push(`${scene.name}: ${d.cm} -> the door at ${Math.round(mid(best.w).x)},${Math.round(mid(best.w).y)}`);
    }
  }

  // ── 2. the macros
  const folderName = "Deck Command - Crooked House";
  const folder = game.folders.find((f) => f.type === "Macro" && f.name === folderName)
    ?? await Folder.implementation.create({ name: folderName, type: "Macro" });
  const macros = {};
  for (const p of PLAN) {
    const data = { name: p.label, type: "script", img: p.img, command: p.command, folder: folder.id, flags: { [ID]: { house: p.a } } };
    let m = game.macros.find((x) => x.flags?.[ID]?.house === p.a);
    if (m) { await m.update(data); report.updated.push(`${p.a} ${p.label}`); }
    else { m = await Macro.implementation.create(data); report.created.push(`${p.a} ${p.label}`); }
    macros[p.a] = m;
  }

  // ── 3. onto the boards — TAKING each beat's existing box, never queuing up behind it
  const SLOTS = 10;
  for (const scene of game.scenes.contents) {
    const num = numOf(scene.name);
    if (!num) continue;
    const wanted = PLAN.filter((p) => p.scenes.some((n) => covers(n, num)));
    if (!wanted.length) continue;
    const raw = scene.flags?.[ID]?.sounds;
    const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];
    const pages = list.map((pg) => Array.from({ length: SLOTS }, (_, i) => {
      const v = (Array.isArray(pg) ? pg : Object.values(pg ?? {}))[i];
      return typeof v === "string" && v ? v : null;
    }));
    let changed = false;

    // Re-running must not pile up: lift every key this script placed before, wherever he has not moved it.
    const ours = new Set(PLAN.map((p) => macros[p.a].uuid));
    for (const pg of pages) for (let i = 0; i < pg.length; i++) if (ours.has(pg[i])) { pg[i] = null; changed = true; }

    for (const p of wanted) {
      const here = (p.takes ?? []).filter((t) => covers(t.board, num));
      if (here.length) {
        // The beat's first box becomes the action; its other boxes are freed. The DM's layout is untouched.
        const [first, ...rest] = here;
        while (pages.length < first.page) pages.push(Array(SLOTS).fill(null));
        const had = pages[first.page - 1][first.box - 1];
        pages[first.page - 1][first.box - 1] = macros[p.a].uuid;
        changed = true;
        report.placed.push(`${scene.name}: ${p.label} -> p${first.page} b${first.box}`
          + (had ? ` (over "${first.label}")` : ""));
        for (const t of rest) {
          if (!pages[t.page - 1] || !pages[t.page - 1][t.box - 1]) continue;
          pages[t.page - 1][t.box - 1] = null;
          report.freed.push(`${scene.name}: p${t.page} b${t.box} "${t.label}"`);
        }
        continue;
      }
      // No beat on this board to take over: the first gap on the page he asked for.
      while (pages.length < p.page) pages.push(Array(SLOTS).fill(null));
      let pg = p.page - 1;
      let i = pages[pg].indexOf(null);
      while (i < 0) { pg++; if (!pages[pg]) pages.push(Array(SLOTS).fill(null)); i = pages[pg].indexOf(null); }
      pages[pg][i] = macros[p.a].uuid;
      changed = true;
      report.placed.push(`${scene.name}: ${p.label} -> p${pg + 1} b${i + 1} (new)`);
    }
    if (changed) await scene.setFlag(ID, "sounds", pages);
  }

  console.log("Crooked House action keys", report);
  ui.notifications.info(`Action keys: ${report.created.length} created, ${report.updated.length} updated, `
    + `${report.placed.length} placed, ${report.freed.length} sound boxes freed, ${report.made.length} provisioned`
    + (report.missing.length ? ` - could not: ${report.missing.join("; ")}` : "."));
  return report;
})();
"""

out = JS.replace("__PLAN__", json.dumps(plan, ensure_ascii=False)).replace("__PROVISION__", json.dumps(PROVISION, ensure_ascii=False))
CAT.mkdir(parents=True, exist_ok=True)
(CAT / "crooked-house-keys.apply.js").write_text(out, encoding="utf-8")
(MC / "tools/crooked-house-keys.apply.js").write_text(out, encoding="utf-8")
print(f"{len(plan)} action keys planned; {_homed} take over a beat's existing box, "
      f"{len(plan) - _homed} need a new one")
