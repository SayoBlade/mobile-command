// Opportunity attacks (DM 2026-07-06): midi doesn't watch movement — it only
// CHARGES the reaction once an off-turn attack rolls (recordAOO, already in the
// D4 preset). Gambit's Premades would do this but isn't v14 yet, so this is the
// in-house watcher: every move already flows through the EXECUTOR (phone pad via
// handleMoveRequest, DM drags on the same client), which also has the canvas for
// reach math. When a token leaves an enemy's melee reach in combat:
//   - player-owned attacker → a tappable card on their phone (Attack → the normal
//     two-tap attack flow with the mover pre-targeted; reaction charged by midi)
//   - NPC attacker → per the aooNpcMode setting: prompt the DM / auto-roll / off
// Warnings-not-walls: v1 does NOT interrupt movement mid-path, doesn't check
// vision, and keys reach off equipped melee weapon activities (largest reach).
import { MODULE_ID } from "./preset.js";
import { isExecutor } from "./settings.js";
import { aooPromptUser } from "./rpc.js";

const INCAPACITATED = ["incapacitated", "stunned", "paralyzed", "unconscious", "petrified", "dead"];
const prompted = new Set(); // "attacker:mover:round:turn" — one prompt per pair per turn

export function registerAoO() {
  // Old position is read PRE-update (the doc still holds it); detection runs
  // fire-and-forget so the move itself is never blocked or slowed.
  Hooks.on("preUpdateToken", (doc, changes) => {
    try {
      if (changes.x === undefined && changes.y === undefined) return;
      if (!isExecutor()) return; // one deciding client — the one performing moves
      if (!game.combat?.started) return;
      if (!game.settings.get(MODULE_ID, "aooEnabled")) return;
      const from = { x: doc.x, y: doc.y };
      const to = { x: changes.x ?? doc.x, y: changes.y ?? doc.y };
      checkAoO(doc, from, to).catch(e => console.warn(`${MODULE_ID} | AoO check failed`, e));
    } catch (e) { /* never break a move */ }
  });
  Hooks.on("updateCombat", (_c, changed) => {
    if (("turn" in changed) || ("round" in changed)) prompted.clear();
  });
  Hooks.on("deleteCombat", () => prompted.clear());
}

function gridDistance(a, b) {
  return canvas.grid.measurePath([a, b]).distance; // honors the table's diagonal rule
}

// The attacker's best melee option: largest-reach equipped weapon attack activity.
// Melee activities carry range.reach; ranged carry value/long — that's the filter.
function meleeReachActivity(actor) {
  let best = null;
  for (const item of actor.items) {
    if (item.type !== "weapon") continue;
    if (item.system?.equipped === false) continue;
    for (const act of item.system.activities ?? []) {
      if (act.type !== "attack") continue;
      const reach = Number(act.range?.reach);
      if (!Number.isFinite(reach) || reach <= 0) continue;
      if (!best || reach > best.reach) best = { activity: act, reach };
    }
  }
  return best;
}

async function checkAoO(moverDoc, from, to) {
  const combat = game.combat;
  const moverActor = moverDoc.actor;
  if (!moverActor || moverActor.type === "group") return;
  // Disengage respected: the dnd5e/CE effect name is the only portable marker.
  if (moverActor.statuses?.has?.("disengage")
    || moverActor.appliedEffects?.some(e => /disengag/i.test(e.name ?? ""))) return;

  const grid = canvas.scene.grid.size;
  const dist = canvas.scene.grid.distance; // ft per square
  const mw = moverDoc.width ?? 1, mh = moverDoc.height ?? 1;
  const cFrom = { x: from.x + (mw * grid) / 2, y: from.y + (mh * grid) / 2 };
  const cTo = { x: to.x + (mw * grid) / 2, y: to.y + (mh * grid) / 2 };
  const moverPad = (Math.max(mw, mh) - 1) * (dist / 2); // big tokens: edge ≈ center − size/2

  for (const t of canvas.tokens.placeables) {
    const a = t.actor;
    if (!a || t.id === moverDoc.id) continue;
    if (((t.document.disposition ?? 0) * (moverDoc.disposition ?? 0)) >= 0) continue; // enemies only
    if (!combat.combatants.some(c => c.tokenId === t.id)) continue; // reactions live in combat
    if (a.statuses && INCAPACITATED.some(s => a.statuses.has(s))) continue;
    if (foundry.utils.getProperty(a, "flags.midi-qol.actions.reaction") === true) continue; // spent
    const best = meleeReachActivity(a);
    if (!best) continue;
    const pad = (Math.max(t.document.width ?? 1, t.document.height ?? 1) - 1) * (dist / 2);
    const eff = best.reach + pad + moverPad + 0.5;
    if (gridDistance(t.center, cFrom) > eff) continue; // wasn't threatened
    if (gridDistance(t.center, cTo) <= eff) continue;  // still threatened — no OA
    const key = `${t.id}:${moverDoc.id}:${combat.round}:${combat.turn}`;
    if (prompted.has(key)) continue;
    prompted.add(key);
    dispatchAoO(t, moverDoc, best.activity).catch(e => console.warn(`${MODULE_ID} | AoO dispatch failed`, e));
  }
}

async function dispatchAoO(attackerToken, moverDoc, activity) {
  const actor = attackerToken.actor;
  const timeout = game.settings.get("midi-qol", "ConfigSettings")?.playerSaveTimeout ?? 30;
  const payload = {
    activityUuid: activity.uuid,
    targetUuid: moverDoc.uuid,
    attackerName: attackerToken.name,
    moverName: moverDoc.name,
    weaponName: activity.item?.name ?? "",
    ttlMs: timeout > 0 ? timeout * 1000 : 30000,
    ts: Date.now()
  };
  console.log(`${MODULE_ID} | AoO: ${moverDoc.name} leaves ${attackerToken.name}'s reach (${activity.item?.name})`);

  // Player-owned attacker → the phone card. EXCLUDE the shared TV/display account:
  // it auto-owns every PC (displayOwnerUser), so it was swallowing the prompt on a
  // client with no shell (DM solo-test 2026-07-06: "nothing happened" — the card
  // went to the TV). No phone-capable owner online → fall through to the DM path.
  const displayUser = game.settings.get(MODULE_ID, "displayOwnerUser") || null;
  const owners = game.users.filter(u => u.active && !u.isGM && u.id !== displayUser
    && actor.testUserPermission(u, "OWNER"));
  if (owners.length) {
    for (const u of owners) aooPromptUser(u.id, payload);
    return;
  }

  // NPC attacker — or a PC with no player at the table → DM policy.
  const mode = game.settings.get(MODULE_ID, "aooNpcMode");
  if (mode === "off") return;
  if (mode === "prompt") {
    const yes = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Opportunity attack" },
      content: `<p><b>${foundry.utils.escapeHTML(moverDoc.name)}</b> is leaving <b>${foundry.utils.escapeHTML(attackerToken.name)}</b>'s reach.<br>Take the opportunity attack with ${foundry.utils.escapeHTML(activity.item?.name ?? "its weapon")}?</p>`,
      modal: false
    }).catch(() => false);
    if (!yes) return;
  }
  // Fire the NPC's attack fully fast-forwarded (midi charges the reaction via recordAOO).
  await MidiQOL.completeActivityUse(activity.uuid, {
    midiOptions: {
      targetUuids: [moverDoc.uuid], ignoreUserTargets: true,
      autoRollAttack: true, fastForwardAttack: true,
      autoRollDamage: "always", fastForwardDamage: true,
      workflowOptions: { autoConsumeResource: "both" }
    }
  }, { configure: false }, {});
}
