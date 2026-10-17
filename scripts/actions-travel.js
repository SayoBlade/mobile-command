import { defineActions } from "./actions.js";
import { beginTravel, armTravelRoute, runTravelJourney, stopTravelJourney, packedGroup, travelState }
  from "./dm-panel.js";

/**
 * ── THE TRAVEL TAB, AS ACTIONS (area `travel`) ───────────────────────────────────────────────────
 *
 * ⚠️ THE AREA WAS DECLARED AND PUBLISHED NOTHING. `AREAS` has carried `{ id: "travel" }` since the
 * action list was written, and pressing it answered "nothing here right now" — one of the seven
 * empty areas the DM asked to **populate** rather than hide (*"filling those is a task we should
 * add to todo"*, 2026-10-15). This fills it.
 *
 * WHY NOW, and what it unblocks. DM 2026-10-18, speccing travel for the deck:
 *
 * > *"a button called 'travel' that transfers the party as a single token to the travel map,
 * > there the deck gives up to 5 closest locations… clicking it starts a walk to the location (as
 * > per mc travel) along a road (you'll need to draw the path), at which point the dm clicks a
 * > button to execute… when reaching a destination the done button becomes 'enter'."*
 *
 * **The journey itself was already built here** — `runTravelJourney` walks the packed group along
 * the drawn route, an hour of game time per tick, daylight swept waypoint by waypoint, the game
 * auto-paused for the trip and left paused if Stop is pressed, because a stop is probably an
 * encounter. What was missing was a handle: the whole flow lived in the panel's click handler, so
 * no other surface could reach it. These five rows are that handle and nothing more.
 *
 * ⚠️ NOTHING HERE RE-IMPLEMENTS ANYTHING. Every runner calls the exact function the panel's own
 * button calls — `beginTravel` was extracted FROM that click handler and both call it now, so the
 * two surfaces cannot drift. If a behaviour looks wrong, it is wrong on the panel too.
 *
 * ⚠️ AND AS OF 2026-10-18 THESE ARE THE ONLY TRAVEL CONTROLS THAT EXIST. His words: *"No travel
 * controls on mobile at all… players have zero choice beyond use in the teleporter"*, and *"the
 * dm decides if the player moves to the next room, if it's as a group, or not at all."* The
 * panel's Switch map / Draw from party / Start / Stop / Clear buttons were removed the same day;
 * what stays there is setup (which scene is the travel map), the pace, the readout, and the
 * drawing surface itself — because the deck has no touch surface and he said *"they can draw
 * using the mc widget."* The deck ARMS the drawing; the dragging happens on the phone.
 *
 * ⚠️ WHAT IS DELIBERATELY NOT HERE:
 *   • **Pace.** It is a six-way choice with a custom-transport editor behind it; the deck would
 *     need a page of its own and he has not asked for one. The panel keeps it.
 *   • **Picking the destination, and `Enter` on arrival.** Those are the DECK's half of his spec
 *     (deck-command BACKLOG §0a0h steps 3–5): which places are nearest is a question about pins
 *     on a map, and the landing spot in each location has to be authored. MC's job is to walk the
 *     party, not to decide where.
 *   • **A "clear the route" row.** `Draw` re-arms and replaces, which is the one he actually does;
 *     a second key for erasing is clutter until he asks.
 */

/** Travel is table furniture, not a sound and not a change to a scene — plain controls. */
const T = (d) => ({ area: "travel", kind: "shot", ...d });

defineActions([
  /* ── getting there ─────────────────────────────────────────────────────────────────────────── */
  T({
    id: "travel.begin", group: "Travel", label: "Travel", icon: "jump",
    sub: () => (packedGroup() ? "already packed" : "pack and go to the map"),
    run: async () => (await beginTravel()) ?? undefined,
  }),

  /* ── the road ──────────────────────────────────────────────────────────────────────────────── */
  T({
    id: "travel.route", group: "Travel", label: "Draw road", icon: "pen",
    // ⚠️ Drawing captures pointer events on the PANEL's board, so a press with the panel closed
    // would arm nothing and report success. Dim, with the reason, beats a lie.
    when: () => travelState().canDraw,
    sub: () => {
      const s = travelState();
      if (!s.packed) return "form up first";
      if (!s.canDraw) return "open the panel";
      return s.routed ? `${Math.round(s.miles)} mi · draw again to replace` : "draw from the party";
    },
    run: () => { armTravelRoute(); },
  }),

  /* ── the walk ──────────────────────────────────────────────────────────────────────────────── */
  T({
    /**
     * ⚠️ THE VERB IS `Go`, AND THAT IS A DECISION RATHER THAN A SYNONYM. He offered *"go or done,
     * based on what we've used before"*. The deck's commit corner wears each page's own verb
     * (deck UI-BIBLE §5.1), and **"Done" is already the ask-commit's word** — two different things
     * wearing one word on one device is how a press goes wrong. `Go` names the act.
     */
    id: "travel.go", group: "Travel", label: "Go", icon: "walk",
    when: () => { const s = travelState(); return s.routed && !s.walking; },
    sub: () => {
      const s = travelState();
      if (s.walking) return "walking…";
      if (!s.routed) return "draw a road first";
      return `${Math.round(s.miles)} mi · the clock runs`;
    },
    run: async () => {
      const g = packedGroup();
      if (!g) return { ok: false, reason: "form up first" };
      await runTravelJourney(g);
    },
  }),
  T({
    id: "travel.stop", group: "Travel", label: "Stop", icon: "stop",
    // ⚠️ Hidden rather than dim while nothing is walking: a Stop that is always there invites a
    // press, and this one leaves the game PAUSED on purpose.
    when: () => travelState().walking, hideWhenOff: true,
    sub: () => "halt · the game stays paused",
    run: () => { stopTravelJourney(); },
  }),
]);
