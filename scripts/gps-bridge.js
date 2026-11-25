// Gambit's Premades on a Mobile Command table (DM 2026-11-25: "give it a chance" — GPS 3.0.8 goes ON in crooked-moon-6x).
//
// Read from GPS 3.0.8 on disk (scripts/utils/helpers.js, queryUtils.js, automations/genericFeatures/opportunityAttack.js):
//   - A reaction prompt is `process3rdPartyReactionDialog`, sent with core's `User#query` to `getBrowserUser` =
//     `MidiQOL.playerForActor(actor)` (the player whose ASSIGNED character it is — MC's preflight already checks that), or
//     the primary GM when that player is not connected. It is a framed ApplicationV2 (`AutomationDialog`,
//     `gps-automation-*`), so on a phone shell.js liftDialogAboveShell already lifts it above the shell as a bottom sheet.
//     Nothing to build for the prompt itself.
//   - After "Yes", GPS asks the SAME player's client to run the item: `remoteCompleteItemUse` (opportunity attacks,
//     Sentinel, Counterspell, Mage Slayer…), `gpsActivityUse` and `useRegionEscape`, each a midi `completeItemUse` /
//     `completeActivityUse`. A phone has no canvas (core.noCanvas, main.js D2) and midi resolves tokens through the
//     canvas — the reason every phone action already runs on the executor (Route B). So on a phone those three are
//     handed to the executor (a GM client with the map), which runs GPS's own handler with the same data. GPS's own
//     NPC path (source "gm") does exactly that already. Dice and any dialog then show on the DM's watched screen.
//   - GPS's spell visuals check `canvas.ready` themselves, and a plain `rollAsUser` needs no canvas: left alone.
//
// Where GPS and MC do the same job (opportunity attacks, Sentinel), ONE of them acts: `reactionOwner`. The world
// setting `gpsReactions`: "auto" (default) — GPS's when GPS is on AND its own switch for that reaction is on, else ours;
// "ours" — always ours; "gambit" — never ours while GPS is on. So the DM chooses with GPS's own toggles, no code change.
// Legendary Resistance is deck-command's (its key rim) and is switched there the same way (legres.js gpsOwnsLegres).

export const GPS_ID = "gambits-premades";
/** GPS's own world switch for each reaction MC also handles. */
export const GPS_SWITCH = Object.freeze({ oa: "Enable Opportunity Attack", sentinel: "Enable Sentinel" });
/** GPS user queries that run a midi workflow on the receiving client. */
export const GPS_WORKFLOW_QUERIES = Object.freeze(["remoteCompleteItemUse", "gpsActivityUse", "useRegionEscape"]);
export const REACTION_CHOICES = Object.freeze({ auto: "Automatic", ours: "Mobile Command", gambit: "Gambit's Premades" });

export const gpsBridgeState = { wrapped: [], forwarded: 0, last: "", owner: {} };
try { globalThis.mcGps = gpsBridgeState; } catch (e) { /* no global */ }

/** Who handles this reaction: "gambit" | "ours". Pure. */
export function reactionOwner({ active, switchOn, choice = "auto" } = {}) {
  if (!active) return "ours";
  if (choice === "ours") return "ours";
  if (choice === "gambit") return "gambit";
  return switchOn ? "gambit" : "ours";
}

export function gpsActive(g = globalThis.game) {
  try { return g?.modules?.get?.(GPS_ID)?.active === true; } catch (e) { return false; }
}

function read(g, ns, key, fallback) {
  try { const v = g?.settings?.get?.(ns, key); return v === undefined ? fallback : v; } catch (e) { return fallback; }
}

/** Does Mobile Command handle this reaction kind ("oa" | "sentinel") right now? */
export function oursHandles(kind, { g = globalThis.game, moduleId = "mobile-command" } = {}) {
  const owner = reactionOwner({
    active: gpsActive(g),
    switchOn: read(g, GPS_ID, GPS_SWITCH[kind], false) === true,
    choice: read(g, moduleId, "gpsReactions", "auto"),
  });
  gpsBridgeState.owner[kind] = owner;
  return owner === "ours";
}

/**
 * On a phone, hand GPS's workflow queries to the executor. `queries` = CONFIG.queries; `isPhone()` and `executor()`
 * (a User) are read at call time. Returns how many were wrapped; a second call wraps nothing.
 */
export function forwardGpsWorkflows({ queries = globalThis.CONFIG?.queries, isPhone = () => false, executor = () => null } = {}) {
  if (!queries) return 0;
  let n = 0;
  for (const name of GPS_WORKFLOW_QUERIES) {
    const key = `${GPS_ID}.${name}`;
    const orig = queries[key];
    if (typeof orig !== "function" || orig.__mcForward) continue;
    const wrapped = async function (data, ctx) {
      let ex = null;
      try { ex = isPhone() ? executor() : null; } catch (e) { ex = null; }
      if (ex && ex.active && !ex.isSelf && typeof ex.query === "function") {
        gpsBridgeState.forwarded += 1; gpsBridgeState.last = name;
        return ex.query(key, data);                    // GPS's own handler, on the client with the map
      }
      return orig.call(this, data, ctx);
    };
    wrapped.__mcForward = true;
    queries[key] = wrapped;
    gpsBridgeState.wrapped.push(name);
    n += 1;
  }
  return n;
}
