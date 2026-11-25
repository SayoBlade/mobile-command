import { defineActions } from "./actions.js";
import { startRest, advanceRest, passWatch, endRest, restState, restCanStart, restDraftPlan } from "./dm-panel.js";

/**
 * -- REST ON THE DECK (DM 2026-11-26, the redesign's question 9: "add a rest subdrawer to party and place them there") --
 *
 * Three keys for the deck's Rest drawer (inside its Party drawer): Start rest · Pass watch · Finish. Each is the panel's
 * own rest step (dm-panel.js, Time › Rest), so the deck and the panel run one rest. The watch grid stays on the panel:
 * a rest with watches stops at "set the watches", and the same Start key then begins it (the panel's Begin Rest), so a
 * rest never needs a fourth key. The size and the phases are the panel's current picks (long, watches, by default);
 * the key's sub-line says which. Cancel stays on the panel: a rest called off from a key pressed by accident is
 * nothing a table needs at arm's length.
 */
const words = (p) => [p.size === "long" ? "long" : "short", p.downtime ? "activities" : null, p.watches ? (p.size === "short" ? "a watch" : "watches") : null].filter(Boolean).join(" · ");
const stage = () => restState()?.stage ?? null;

defineActions([
  {
    id: "rest.start", area: "rest", group: "Rest", label: "Start rest", icon: "pause",
    // not resting: start one; stopped at the watch grid or activities: begin / move on (the panel's Begin Rest, To Watches)
    when: () => (restState() ? ["assign", "downtime"].includes(stage()) : restCanStart()),
    sub: () => {
      const st = stage();
      if (st === "assign") return "set the watches, then press to begin";
      if (st === "downtime") return "press when activities are done";
      if (restState()) return "under way";
      return restCanStart() ? words(restDraftPlan()) : "form a party group first";
    },
    run: async () => {
      if (!restState()) { await startRest(); return undefined; }
      if (["assign", "downtime"].includes(stage())) { await advanceRest(); return undefined; }
      return { ok: false, reason: "a rest is already under way" };
    },
  },
  {
    id: "rest.pass", area: "rest", group: "Rest", label: "Pass watch", icon: "clock",
    when: () => stage() === "watches",
    sub: () => (stage() === "watches" ? "time passes, next watch" : "during the watches"),
    run: async () => { await passWatch(); },
  },
  {
    id: "rest.finish", area: "rest", group: "Rest", label: "Finish", icon: "ok",
    when: () => !!restState(),
    sub: () => (restState() ? "apply the rest" : "no rest under way"),
    run: async () => { await endRest(true); },
  },
]);
