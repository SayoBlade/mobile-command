/**
 * ── NO CHIP FOR AN EFFECT WITH NO NAME OF ITS OWN (deck-command MC-PATCHES-2026-11-09 S3) ───────────────────────
 *
 * Seat 2026-11-09 (R3 rerun 10): after a Hero Mancer level-up the phone showed a "New Effect" chip on the Test
 * Barbarian. That is a placeholder name, not one the player can read: dnd5e names a fresh effect `DND5E.EFFECT.New`
 * ("New Effect"), and core's ClientDocument.defaultName uses the document label `DOCUMENT.ActiveEffect`
 * ("Active Effect", then "Active Effect (2)" …). An effect whose name is empty or one of these makes no chip, unless it
 * carries a status: a condition the player must see (its chip then reads the status's own name).
 * Pure: tools/test-effect-chips.mjs runs it headless.
 */

const PLACEHOLDER_KEYS = ["DND5E.EFFECT.New", "DOCUMENT.ActiveEffect"];
const PLACEHOLDER_EN = ["New Effect", "Active Effect"];

/** The placeholder names in this client's language (and English, which a world built elsewhere may carry). */
export function placeholderNames(i18n = globalThis.game?.i18n) {
  const out = new Set(PLACEHOLDER_EN);
  for (const k of PLACEHOLDER_KEYS) {
    const v = i18n?.localize?.(k);
    if (v && v !== k) out.add(v);
  }
  return out;
}

/** True when the name is empty or a placeholder, with or without core's " (n)" suffix. */
export function isPlaceholderName(name, names = placeholderNames()) {
  const s = String(name ?? "").trim();
  if (!s) return true;
  return names.has(s.replace(/\s*\(\d+\)$/, ""));
}

/** The name of the effect's first status, from CONFIG.statusEffects, or null. */
function statusName(e) {
  const ids = [...(e?.statuses ?? [])];
  if (!ids.length) return null;
  const list = globalThis.CONFIG?.statusEffects ?? [];
  for (const id of ids) {
    const s = list.find?.((x) => x.id === id);
    const n = s?.name ?? s?.label;
    if (n) return globalThis.game?.i18n?.localize?.(n) ?? n;
  }
  return ids[0];
}

/**
 * The effects that get a phone chip, each as {e, name}: its own name, or its status's name when it has a placeholder
 * name but carries a status. A placeholder-named effect with no status is left out.
 */
export function chipEffects(effects, names = placeholderNames()) {
  const out = [];
  for (const e of effects ?? []) {
    if (!isPlaceholderName(e?.name, names)) { out.push({ e, name: e.name }); continue; }
    const s = statusName(e);
    if (s) out.push({ e, name: s });
  }
  return out;
}
