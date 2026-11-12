// CASTING AS A RITUAL FROM THE PHONE (seat LIVE TRY 2026-11-12, part 2: Detect Magic on the phone offered only "Cast at
// L1", and Use spent a 1st-level slot). A ritual is the spell at its own level, no slot spent, ten minutes longer.
// dnd5e 6 has no ritual switch of its own: it is a cast with `consume.spellSlot: false` (the usage dialog's "consume
// spell slot" box), which is exactly what the executor sends for a ritual (rpc.js slotUsage).
//
// Who may (2024 rules, the lead's call): any caster, a spell with the Ritual tag that they have PREPARED (prepared or
// always prepared); and a WIZARD any ritual in their spellbook, prepared or not (Ritual Adept). A ritual-only spell
// (method "ritual") is already slot-free and needs no choice.
// Pure: no `game`. Tested in tools/test-ritual.mjs.

/** The phone's slot-row id for "cast this as a ritual": the base level's slot, marked. */
export const RITUAL_PREFIX = "ritual:";
export const ritualSlotId = (level) => `${RITUAL_PREFIX}spell${Math.max(1, Number(level) || 1)}`;
export const isRitualSlot = (id) => typeof id === "string" && id.startsWith(RITUAL_PREFIX);

const hasProp = (props, p) => (props instanceof Set ? props.has(p) : Array.isArray(props) ? props.includes(p) : Boolean(props?.[p]));

/**
 * @param {{ type, system: { level, method, prepared, properties } }} item   the spell
 * @param {{ items?: Iterable<{ type, system: { identifier } }> }} actor
 */
export function canCastAsRitual(item, actor) {
  if (item?.type !== "spell") return false;
  const s = item.system ?? {};
  if (!(Number(s.level) >= 1) || !hasProp(s.properties, "ritual")) return false;
  if (s.method === "ritual" || s.method === "atwill" || s.method === "innate") return false; // already slot-free
  if (Number(s.prepared) >= 1) return true;                                                  // prepared, or always
  const wizard = [...(actor?.items ?? [])].some((i) => i?.type === "class" && String(i.system?.identifier ?? "").toLowerCase() === "wizard");
  return wizard && s.method === "spell";                                                     // in the wizard's book
}

/**
 * dnd5e usage config for the slot the phone picked. A ritual id casts at its base slot and spends none.
 * @returns {{ spell?: { slot: string }, consume?: { spellSlot: false } }}
 */
export function slotUsage(id) {
  if (!id) return {};
  if (isRitualSlot(id)) return { spell: { slot: id.slice(RITUAL_PREFIX.length) }, consume: { spellSlot: false } };
  return { spell: { slot: id } };
}
