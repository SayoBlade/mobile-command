/**
 * ── THE RULES A CUE FIRES BY (§53; catalogue 231, shaped by the DM 2026-09-18) ──────────────────
 *
 * *"each creaky patch counts the feet that cross it and fires on the rule you give it — once, on chosen
 * passes (the 3rd and 12th, then the count starts over), 1 in N at random, or every time."* This file is
 * the arithmetic of that sentence and nothing else: no Foundry, no sound, so it runs headless
 * (tools/test-cues.mjs) and the behaviour in region-sound.js stays a thin wrapper around it.
 */

/** The rules, in the order the region's menu offers them. Values are the labels the DM reads. */
export const CUE_RULES = Object.freeze({
  always: "Every time",
  once: "Once, then never again",
  passes: "On chosen passes, then the count starts over",
  chance: "One time in N, at random",
  arm: "Arm a deck key instead of playing (the DM fires it)",
});

/**
 * "3, 12" → [3, 12]. Anything that is not a positive whole number is ignored; duplicates collapse; the
 * order is ascending so the last pass is the one the count restarts after.
 * @param {string|number[]} text
 * @returns {number[]}
 */
export function parsePasses(text) {
  const parts = Array.isArray(text) ? text : String(text ?? "").split(/[\s,;]+/);
  const out = new Set();
  for (const p of parts) {
    const n = Number(p);
    if (Number.isInteger(n) && n > 0) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * One crossing of the patch. Every rule counts the pass — the count is what the DM sees on the region —
 * and the rule says whether this one plays.
 *
 * @param {object} o
 * @param {string} o.rule           one of CUE_RULES' keys
 * @param {number} [o.count]        passes so far (before this one)
 * @param {boolean} [o.fired]       has a "once" cue already played
 * @param {string|number[]} [o.passes]  the chosen passes for "passes"
 * @param {number} [o.chance]       N for "one time in N"
 * @param {() => number} [o.random] a [0,1) source, injectable for tests
 * @returns {{fire: boolean, count: number, fired: boolean}}
 */
export function decide({ rule, count = 0, fired = false, passes = "", chance = 1, random = Math.random } = {}) {
  let next = Math.max(0, Math.floor(Number(count) || 0)) + 1;
  switch (rule) {
    case "once": {
      const fire = !fired;
      return { fire, count: next, fired: true };
    }
    case "passes": {
      const list = parsePasses(passes);
      if (!list.length) return { fire: true, count: next, fired }; // no passes named = every time
      const fire = list.includes(next);
      if (next >= list[list.length - 1]) next = 0; // "then the count starts over"
      return { fire, count: next, fired };
    }
    case "chance": {
      const n = Math.max(1, Math.floor(Number(chance) || 1));
      return { fire: random() < 1 / n, count: next, fired };
    }
    case "arm":
    case "always":
    default:
      return { fire: true, count: next, fired };
  }
}

/**
 * A take from the set, never the one that just played when there is a choice — a creak that repeats
 * itself twice running is what makes a haunted house sound like a machine.
 * @param {string[]} takes
 * @param {() => number} [random]
 * @param {string|null} [avoid]
 * @returns {string|null}
 */
export function pickTake(takes, random = Math.random, avoid = null) {
  const list = (takes ?? []).filter(Boolean);
  if (!list.length) return null;
  const pool = list.length > 1 && avoid ? list.filter((t) => t !== avoid) : list;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

/**
 * Still inside the cooldown after the last play? `cooldown` is in seconds; a cue that has never played
 * is never in cooldown.
 */
export function withinCooldown(lastAt, now, cooldown) {
  if (!lastAt) return false;
  const ms = Math.max(0, Number(cooldown) || 0) * 1000;
  return now - lastAt < ms;
}

/**
 * "Only player characters count by default, so moving a hidden monster across a board never gives it
 * away." The same test the TV's audio listeners use (a linked PC with a player owner) — pets and summons
 * are not feet on the boards, and a hidden token is never a trigger.
 * @param {{hidden?: boolean, actor?: {type?: string, hasPlayerOwner?: boolean}|null}} token
 */
export function isPlayerCharacter(token) {
  if (!token || token.hidden) return false;
  const a = token.actor;
  return !!a && a.type === "character" && !!a.hasPlayerOwner;
}
