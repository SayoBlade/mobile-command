# tools/entrances — the Crooked Moon intro banners' generators

Everything MC ships for §40.6 ("Intros") is GENERATED from one description of each banner — the preview page the
DM reviews (https://claude.ai/artifact/PcRn3sVZrxK4UpeQZjntUt) and the module come from the same sources:

| Step | Script | Reads | Writes |
|---|---|---|---|
| 1. the cards | `cards2.py` (`N`, one dict per banner; `GENERIC_CARD` rebuilt by `regen_generic_card.py` from `generic.json`) | `sounds.json` | `cards2.html` |
| 2. the page | `build2.py` | `head2.html`, `foot.html`, `base2.css`, `themes2.css`, `app2.js`, `symbols.svg`, `cards2.html`, `art/`, `snd/`, `fx/` | `crooked-moon-entrances-ii.html` (publish with the Artifact tool, same path = same link) |
| 3. MC | `gen_mc.py` | `cards2.py`, `sounds.json`, `sndspec.json`, `generic.json`, `stage.json`, `base2.css`, `themes2.css` | `scripts/cm-entrances.js`, `styles/entrances.css` |
| 4. the deck | `gen_intro_keys.py` | `scripts/cm-entrances.js`, `generic.json` | `../audio-catalogue/campaigns/crooked-moon-intro-keys.json` + `.apply.js` (TEST WORLD ONLY; copy it into `Data/deck-command-office/` and run it from the GM console) |

Media prep (all read the DM's Foundry Data — `%LOCALAPPDATA%/FoundryVTT/Data` — and write next to the scripts):
`art.py`…`art5.py`, `yorgrim_art.py`, `gen_generic.py` → `art/` (web copies of the book art for the PAGE only — MC
references the module's files by path and crops with CSS); `mkspec.py` → `sndspec.json` → `snd.py` → `snd/` (page
clips; MC plays the library windows); `swing.py` → `snd/druskenvald.mp3`, copied to `sounds/entrances/swing.mp3`
(the one clip MC carries itself). `art/`, `snd/`, `fx/`, the built page and screenshots are .gitignore'd: derived
from licensed content.

Verification: `cdp-multi.mjs <page url> <prefix> "<card>:<ms,ms>"…` + `sheet.py` = timed frames of the page in
headless Edge (`PRE_JS="document.body.classList.add('table')"` for the table layout); `tv-shots.mjs` / `tv-probe2.mjs`
= a headless TV logged into the test world that photographs the next banners and reports what its canvas shows;
`env.py <library paths>` = loudness envelopes to pick sound windows. Close headless Edge by its debugging port
(these do) — `proc.kill()` leaks the browser on Windows.

Each DM round was applied as an `edit_vNN.py` in the session scratch (v6–v16, 2026-09-19); the history is in
DESIGN.md §40.6, the git log and the files themselves. Book-research inputs (`roster.json`, `followup.json`) stayed
in the scratch: they quote the book.
