/**
 * Which dead NPCs MC's corpse handling may touch, and what counts as loot (DESIGN §7.8 notes, 2026-11-07).
 * Rules only, no Foundry global: tools/test-corpse.mjs runs them headless. rpc.js is the glue.
 */

const DECK = "deck-command";

const readPath = (o, path) => path.split(".").reduce((v, k) => (v === null || v === undefined ? undefined : v[k]), o);

function matches(value, wanted) {
  if (Array.isArray(value)) return value.some((v) => matches(v, wanted));
  if (typeof value === "number" && Number.isFinite(Number(wanted))) return value === Number(wanted);
  return value === wanted;
}

/**
 * ⚠️ ITEM PILES' PUBLIC `getActorItems(target)` TAKES ONE ARGUMENT (3.3.4). The inner function has an
 * `itemFilters` option; the API wrapper does not pass it on, so `API.getActorItems(actor, { itemFilters })`
 * silently answers with the global filters, whose natural-weapon test reads a path dnd5e no longer uses. A
 * Rail Slam or a Draining Regret then counted as loot and every such body became a pile. So the filters are
 * applied here, by the same rule the pile itself uses (`isItemInvalid` over `cleanItemFilters`).
 */
export function lootableItems(items, filters) {
  const list = (filters ?? []).map((f) => ({
    path: String(f.path).trim(),
    values: (Array.isArray(f.filters) ? f.filters : String(f.filters ?? "").split(",")).map((v) => {
      if (typeof v !== "string") return v;
      const t = v.trim();
      return t.toLowerCase() === "true" ? true : t.toLowerCase() === "false" ? false : t;
    }).filter(Boolean), // a `false` never filters anything in Item Piles either
  }));
  return Array.from(items ?? []).filter((item) => {
    const data = item?.toObject?.() ?? item;
    return !list.some(({ path, values }) => {
      const v = readPath(data, path);
      return v !== undefined && values.some((w) => matches(v, w));
    });
  });
}

/**
 * Deck Command authored this death (its D-0068: `flags.deck-command.death` = "own"), so the body is its own
 * business: no pile, no skull, no hide, no leaving the fight. A boss whose Phase 2 starts at 0 HP is not dead.
 *
 * An explicit flag answers first, on the actor or, for a placed copy, the actor it was made from: a token's
 * synthetic actor does not carry the base actor's flags. Unflagged, D-0068 derives it from the pack (the
 * Locomotive is one of these), which only Deck Command can read, so `api.animater.deathFor` is asked.
 */
export function authoredDeath(actor, deckApi) {
  const flag = actor?.flags?.[DECK]?.death ?? actor?.baseActor?.flags?.[DECK]?.death;
  if (flag) return flag === "own";
  try { return deckApi?.animater?.deathFor?.(actor) === "own"; } catch { return false; }
}

/**
 * An echo Deck Command spawned (`flags.deck-command.echo` on the TOKEN). It vanishes at 0 HP with its own
 * burst, and DC hides it itself. Read off `flags`: `getFlag` throws for a module that is switched off.
 */
export const isDeckEcho = (tokenDoc) => Boolean(tokenDoc?.flags?.[DECK]?.echo);
