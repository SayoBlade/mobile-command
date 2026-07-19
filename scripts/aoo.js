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
import { isExecutor, reactionTimeoutMs } from "./settings.js";
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
  registerSentinel();
}

function gridDistance(a, b) {
  return canvas.grid.measurePath([a, b]).distance; // honors the table's diagonal rule
}

// The attacker's best melee option: largest-reach weapon attack activity.
// Melee activities carry range.reach; ranged carry value/long — that's the filter.
// EQUIPPED weapons win; if none is equipped, fall back to any carried melee weapon
// (char-gen grants arrive unequipped — Grukk's whole arsenal read equipped=false and
// the DM's test silently found "no weapon", 2026-07-06). Warnings-not-walls: offer
// the OA with the best carried blade and let the owner decline.
// pamOnly narrows to Polearm Master weapons (2024 wording: a Quarterstaff, a Spear,
// or a weapon with the Heavy and Reach properties).
function meleeReachActivity(actor, { pamOnly = false } = {}) {
  let best = null;
  for (const item of actor.items) {
    if (item.type !== "weapon") continue;
    if (pamOnly && !isPamWeapon(item)) continue;
    const equipped = item.system?.equipped !== false;
    for (const act of item.system.activities ?? []) {
      if (act.type !== "attack") continue;
      const reach = Number(act.range?.reach);
      if (!Number.isFinite(reach) || reach <= 0) continue;
      const better = !best
        || (equipped && !best.equipped)                    // equipped beats unequipped
        || (equipped === best.equipped && reach > best.reach); // then longer reach
      if (better) best = { activity: act, reach, equipped };
    }
  }
  return best;
}

function isPamWeapon(item) {
  const base = item.system?.type?.baseItem ?? "";
  if (base === "quarterstaff" || base === "spear") return true;
  if (/quarterstaff|spear/i.test(item.name)) return true;
  const props = item.system?.properties;
  const has = p => props?.has ? props.has(p) : !!props?.[p];
  return has("hvy") && has("rch");
}

function hasFeat(actor, re) {
  return actor.items.some(i => i.type === "feat" && re.test(i.name ?? ""));
}
const PAM_RE = /polearm master/i;
const SENTINEL_RE = /^sentinel$/i;

async function checkAoO(moverDoc, from, to) {
  const combat = game.combat;
  const moverActor = moverDoc.actor;
  if (!moverActor || moverActor.type === "group") return;
  // Disengage respected — but per-ATTACKER now, not a global bail: a Sentinel
  // attacker ignores Disengage (2024 "Halt the Retreat"). The dnd5e/CE effect
  // name is the only portable marker.
  const disengaged = moverActor.statuses?.has?.("disengage")
    || moverActor.appliedEffects?.some(e => /disengag/i.test(e.name ?? ""));

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
    const sentinel = hasFeat(a, SENTINEL_RE);
    if (disengaged && !sentinel) continue; // Sentinel ignores Disengage
    const best = meleeReachActivity(a);
    if (!best) continue;
    const pad = (Math.max(t.document.width ?? 1, t.document.height ?? 1) - 1) * (dist / 2);
    const eff = best.reach + pad + moverPad + 0.5;
    const inStart = gridDistance(t.center, cFrom) <= eff;
    const inEnd = gridDistance(t.center, cTo) <= eff;
    // Leaving reach → the classic opportunity attack.
    if (inStart && !inEnd) {
      const key = `${t.id}:${moverDoc.id}:${combat.round}:${combat.turn}:leave`;
      if (prompted.has(key)) continue;
      prompted.add(key);
      dispatchAoO(t, moverDoc, best.activity).catch(e => console.warn(`${MODULE_ID} | AoO dispatch failed`, e));
      continue;
    }
    // Polearm Master: ENTERING reach also provokes — but only with a PAM weapon
    // (Quarterstaff / Spear / Heavy+Reach), so re-resolve the threat under that
    // filter rather than trusting the general pick.
    if (!inStart && inEnd && hasFeat(a, PAM_RE)) {
      const pamBest = meleeReachActivity(a, { pamOnly: true });
      if (!pamBest) continue;
      const pamEff = pamBest.reach + pad + moverPad + 0.5;
      if (gridDistance(t.center, cTo) > pamEff) continue; // entered general reach but not the polearm's
      const key = `${t.id}:${moverDoc.id}:${combat.round}:${combat.turn}:enter`;
      if (prompted.has(key)) continue;
      prompted.add(key);
      dispatchAoO(t, moverDoc, pamBest.activity, {
        title: "Polearm Master!",
        reason: `${moverDoc.name} entered ${t.name}'s polearm reach`
      }).catch(e => console.warn(`${MODULE_ID} | PAM dispatch failed`, e));
    }
  }
}

async function dispatchAoO(attackerToken, moverDoc, activity, opts = {}) {
  const actor = attackerToken.actor;
  const payload = {
    activityUuid: activity.uuid,
    targetUuid: moverDoc.uuid,
    // The reacting creature (this player's PC/pet) — lets the phone's pending-action queue tie the
    // card to a token, so the attention bell can hop to it (DM 2026-07-19).
    reactorUuid: actor?.uuid ?? null,
    reactorTokenUuid: attackerToken.document?.uuid ?? attackerToken.uuid ?? null,
    attackerName: attackerToken.name,
    moverName: moverDoc.name,
    weaponName: activity.item?.name ?? "",
    title: opts.title ?? null,   // phone card header override (PAM / Sentinel)
    reason: opts.reason ?? null, // phone card body override
    ttlMs: reactionTimeoutMs(),  // an AoO is a reaction — same phone-time bonus as the reaction relay
    ts: Date.now()
  };
  console.log(`${MODULE_ID} | ${opts.title ?? "AoO"}: ${opts.reason ?? `${moverDoc.name} leaves ${attackerToken.name}'s reach`} (${activity.item?.name})`);

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

  // Fell through to the DM — say WHY, so a mis-routed reaction (DM 2026-07-19: "Polearm Master popped on
  // the DM screen, not the app") is diagnosable: for each non-GM user, is it connected, does it own the
  // reactor, and is it the excluded display/TV account?
  console.warn(`${MODULE_ID} | ${opts.title ?? "AoO"} for "${actor.name}" found NO phone owner → DM policy. candidates:`,
    game.users.filter(u => !u.isGM).map(u => ({ user: u.name, active: u.active, ownsReactor: actor.testUserPermission(u, "OWNER"), isDisplayAccount: u.id === displayUser })));

  // NPC attacker — or a PC with no player at the table → DM policy.
  const mode = game.settings.get(MODULE_ID, "aooNpcMode");
  if (mode === "off") return;
  if (mode === "prompt") {
    // Non-modal by design (DM 2026-07-07: a dialog interrupts whatever the DM is
    // doing) — a chip in the DM panel's reaction widget, expiring with the window.
    Hooks.callAll("mobile-command.dmReaction", {
      id: foundry.utils.randomID(),
      kind: "aoo",
      label: `${opts.title ? opts.title.replace(/!$/, "") + ": " : ""}${attackerToken.name} ⚔ ${moverDoc.name}`,
      weapon: activity.item?.name ?? "weapon",
      activityUuid: activity.uuid,
      targetUuid: moverDoc.uuid,
      expiresAt: Date.now() + payload.ttlMs
    });
    return;
  }
  await fireAoO(activity.uuid, moverDoc.uuid);
}

// ── Sentinel (2024 "Guardian"): a creature within your melee reach attacks a
// target other than you → you may make a melee attack against it. Executor-side
// midi hook — fires AFTER the triggering attack resolves (the reaction doesn't
// modify that attack, so post-roll timing is safe and needs no interruption).
// v1 limits (documented): the 2014 "target doesn't also have Sentinel" clause is
// skipped; "hit by your OA → speed 0" is bookkeeping the DM narrates.
function registerSentinel() {
  Hooks.on("midi-qol.AttackRollComplete", (wf) => {
    try {
      if (!isExecutor()) return;
      if (!game.combat?.started) return;
      if (!game.settings.get(MODULE_ID, "aooEnabled")) return;
      checkSentinel(wf).catch(e => console.warn(`${MODULE_ID} | Sentinel check failed`, e));
    } catch (e) { /* never break an attack workflow */ }
  });
}

async function checkSentinel(wf) {
  const attacker = wf.token?.object ?? wf.token; // midi hands a Token or TokenDocument by build
  const attackerDoc = attacker?.document ?? attacker;
  if (!attackerDoc?.actor) return;
  const targets = new Set([...(wf.targets ?? [])].map(t => (t.document ?? t).id));
  const combat = game.combat;
  const dist = canvas.scene.grid.distance;
  const aw = attackerDoc.width ?? 1, ah = attackerDoc.height ?? 1;
  const attackerPad = (Math.max(aw, ah) - 1) * (dist / 2);
  const attackerCenter = (attacker.center ?? canvas.tokens.get(attackerDoc.id)?.center);
  if (!attackerCenter) return;

  for (const t of canvas.tokens.placeables) {
    const a = t.actor;
    if (!a || t.id === attackerDoc.id) continue;
    if (targets.has(t.id)) continue; // it attacked YOU — that's not Sentinel, fight back on your turn
    if (!hasFeat(a, SENTINEL_RE)) continue;
    if (((t.document.disposition ?? 0) * (attackerDoc.disposition ?? 0)) >= 0) continue; // enemies only
    if (!combat.combatants.some(c => c.tokenId === t.id)) continue;
    if (a.statuses && INCAPACITATED.some(s => a.statuses.has(s))) continue;
    if (foundry.utils.getProperty(a, "flags.midi-qol.actions.reaction") === true) continue;
    const best = meleeReachActivity(a);
    if (!best) continue;
    const pad = (Math.max(t.document.width ?? 1, t.document.height ?? 1) - 1) * (dist / 2);
    const eff = best.reach + pad + attackerPad + 0.5;
    if (gridDistance(t.center, attackerCenter) > eff) continue; // out of the sentinel's reach
    const key = `${t.id}:${attackerDoc.id}:${combat.round}:${combat.turn}:sentinel`;
    if (prompted.has(key)) continue;
    prompted.add(key);
    dispatchAoO(t, attackerDoc, best.activity, {
      title: "Sentinel!",
      reason: `${attackerDoc.name} attacked an ally within ${t.name}'s reach`
    }).catch(e => console.warn(`${MODULE_ID} | Sentinel dispatch failed`, e));
  }
}

// Fire an opportunity attack fully fast-forwarded (midi charges the reaction via
// recordAOO). Shared by the auto mode and the DM panel's reaction-widget chip.
// NOTE the nesting: midi reads the auto-roll overrides from workflow.workflowOptions
// (getAutoRollAttack, midi-qol.js:16950) — top-level midiOptions keys are IGNORED
// and the D4 preset's "players roll" settings win, parking the OA forever
// (found live 2026-07-08: the fired attack posted its card and never rolled).
export async function fireAoO(activityUuid, targetUuid) {
  await MidiQOL.completeActivityUse(activityUuid, {
    midiOptions: {
      targetUuids: [targetUuid], ignoreUserTargets: true,
      workflowOptions: {
        autoRollAttack: true, fastForwardAttack: true,
        autoRollDamage: "always", fastForwardDamage: true,
        autoConsumeResource: "both"
      }
    }
  }, { configure: false }, {});
}
