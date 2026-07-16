# mobile-command — Phone Controller for FoundryVTT

## Source of truth

**[DESIGN.md](DESIGN.md) is the source of truth for this project.** Architecture decisions (D1–D7), the midi-qol settings preset (D4), the Service RPC contract, the spike plan, and all live-world findings live there. When code, notes, or memory disagree with DESIGN.md, DESIGN.md wins. New findings (spike results, setting-key discoveries, DM preference decisions) must be written back into DESIGN.md in the relevant section, dated.

**[UI-BIBLE.md](UI-BIBLE.md) is the source of truth for how the UI looks and what each visual choice means** — palette and the meaning of every colour, how names/identity are shown, the button hierarchy (primary/secondary/tertiary/destructive/close), state marking, layout, copy, and class-name hygiene. **Read it before writing any UI, and live by it.** If code and UI-BIBLE.md disagree, the bible wins — fix the code. If a genuinely new need isn't covered, add the rule to the bible first, then build to it.

**Pinned stack (do not drift):** Foundry 14.363 · dnd5e 5.3.3 · midi-qol 14.0.8. Documentation predating this generation is unreliable — check installed module source over training data.

## Test protocol

- Every test is written as **numbered expected results** (1, 2, 3 …), each one independently observable.
- Run tests **one at a time** — never batch steps and check at the end.
- **Stop on the first failure.** Record which numbered result failed and what was observed instead; do not continue to later steps or "try variations" past a failure.

## Conduct

- Write operations are allowed **in the test world only** (Restored Keep v14 demo).
- **Never delete anything** — no documents, no settings, no files.
- Prefer logging a blocker over guessing.
