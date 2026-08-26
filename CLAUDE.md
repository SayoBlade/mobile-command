# mobile-command — Phone Controller for FoundryVTT

## Source of truth

**[DESIGN.md](DESIGN.md) is the source of truth for this project.** Architecture decisions (D1–D7), the midi-qol settings preset (D4), per-feature sections with dated statuses, all live-world findings, and **the open ledger (§22.6)** live there. Start from its header's section map. When code, notes, or memory disagree with DESIGN.md, DESIGN.md wins. New findings (bench results, setting-key discoveries, DM preference decisions) must be written back into DESIGN.md in the relevant section, dated — and anything that opens or closes must be reflected in the §22.6 ledger.

**[UI-BIBLE.md](UI-BIBLE.md) is the source of truth for how the UI looks and what each visual choice means** — palette and the meaning of every colour, how names/identity are shown, the button hierarchy (primary/secondary/tertiary/destructive/close), state marking, layout, copy, and class-name hygiene. **Read it before writing any UI, and live by it.** If code and UI-BIBLE.md disagree, the bible wins — fix the code. If a genuinely new need isn't covered, add the rule to the bible first, then build to it.

**Tested stack (chase upstream, don't freeze — DM 2026-07-26):** last validated: Foundry 14.367 · dnd5e 5.3.3 · midi-qol 14.0.11 · automated-conditions-5e 14.533.15.4 · cat 0.0.7 · midi-item-showcase-community 2.0.2 · DAE 14.0.13 · wm5e 14.533.6 · simplecover5e 2.2.1 (overnight bench 2026-08-25/26, DESIGN §28.5.7 — the full §28.4 run on the new core; that night also caught + fixed the hit-verdict race, the preview suppressor leak, and the deeds first-blow kill credit. The cover-bonus-shifts-AC geometry pass CLOSED on night two, 2026-08-26/27 — §28.5.8: ac.cover 2 adjudicated through the phone chain; that night also caught the core-14 no-canvas game.combat regression, §28.4 now 12/12). Beta users will run current releases, so we keep up rather than pin old versions. When the System-health tab flags an unvalidated version: run the combat validation script (DESIGN §28.4), fix what broke, then bump the `TESTED` map in preflight.js AND this line together. Documentation predating this generation is unreliable — check installed module source over training data.

## Test protocol

- Every test is written as **numbered expected results** (1, 2, 3 …), each one independently observable.
- Run tests **one at a time** — never batch steps and check at the end.
- **Stop on the first failure.** Record which numbered result failed and what was observed instead; do not continue to later steps or "try variations" past a failure.

## Doc housekeeping (DM 2026-08-19: "I'm giving you control of housekeeping")

These .md files are written for **Claude, not the DM** — he will ask rather than read them, so optimize for machine retrieval, not presentation: dated statuses corrected in place, superseded text struck rather than erased, history compressed into banners once a section closes, one open ledger (DESIGN §22.6) updated on every open/close. When the DM asks what's open or what something means, answer from the docs **in plain words in chat** — never send him to a section number. Periodic sweeps (structure, stale statuses, contradictions, archive/) are Claude's job to initiate: don't ask permission, report what changed.

## Conduct

- Write operations are allowed **in the test world only** — the local **"Offline test"** world (Restored Keep v14 demo content) at `localhost:30000`, or a bench COPY of it per DESIGN §28.9. Never the DM's live campaign world. **BENCH RULE #0:** if the DM's Foundry has a world ACTIVE, do not start the bench at all.
- **Never delete anything** — no documents, no settings, no files.
- Prefer logging a blocker over guessing.
