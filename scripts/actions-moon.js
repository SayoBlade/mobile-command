import { defineActions } from "./actions.js";
import { moonsDue, rerollCandidates, moonReroll, redirectOffer, startRedirectPick, MOON_CAP } from "./moons-due.js";

/**
 * -- THE MOON'S DUE ON THE DECK (DM 2026-11-26) --
 * Two keys behind the deck's one Moon's Due key (it wears the crescent and the count; deck-command page.js MOON_NODE):
 *  Reroll    a pick of the last few NPC rolls in chat, newest first; a press without a choice takes the newest.
 *  Redirect  live only while a player's natural 1 on a weapon attack is open (it is also in the Waiting queue and on
 *            the Notifications key); the press arms the DM's map click for the new target.
 * Both spend one token. Crooked Moon only.
 */
const first = (n) => String(n ?? "").trim().split(/\s+/)[0] || "Someone";

defineActions([
  {
    id: "moon.reroll", area: "combat", group: "Moon's Due", label: "Reroll", icon: "dice", kind: "pick", cm: true,
    when: () => moonsDue() > 0 && rerollCandidates(1).length > 0,
    sub: () => (moonsDue() < 1 ? `none due (0/${MOON_CAP})` : rerollCandidates(1)[0]?.label ?? "no NPC roll yet"),
    choices: () => rerollCandidates(4).map((c) => ({ id: c.id, label: c.label })),
    run: ({ choice } = {}) => moonReroll(choice ?? null),
  },
  {
    id: "moon.redirect", area: "combat", group: "Moon's Due", label: "Redirect", icon: "target", cm: true,
    when: () => !!redirectOffer(),
    alert: () => !!redirectOffer(),
    sub: () => { const o = redirectOffer(); return o ? `${first(o.name)} rolled a 1` : "on a hero's natural 1"; },
    run: () => startRedirectPick(),
  },
]);
