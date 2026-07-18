// Session preflight (§16, DM milestone #1): a checks engine the DM panel's
// Preflight tab renders — is the table actually ready to play? Every check is
// READ-ONLY; where a safe one-tap remedy exists it ships as an explicit `fix`
// the DM taps (never auto-applied — warnings, not walls). Each check returns
// { id, label, status: "ok" | "warn" | "fail", detail, fix? }.
//
// Born from real landmines: the TV account swallowing reaction prompts
// (Rounds 27/28), unassigned user.character breaking midi routing (Round 28),
// sightless fresh tokens (Round 21), the stale party group (Round 27), and the
// destination-less teleport region that silently blocked ALL movement on Cave A
// (Round 32).
import { MODULE_ID } from "./preset.js";
import { resolveExecutorId } from "./settings.js";
import { diffPreset, applyPreset } from "./enforcer.js";
import { actorTokenSight } from "./rpc.js";

export let lastResults = null; // null until the first run; then Check[]
export let lastRunAt = null;

export function preflightFailCount() {
  return (lastResults ?? []).filter(c => c.status === "fail").length;
}

// The active scene's party-worthy PCs (mirrors dm-panel's scenePartyActors —
// kept local so preflight has no import cycle with the panel).
function partyPCs() {
  const seen = new Set(), out = [];
  for (const t of game.scenes?.active?.tokens ?? []) {
    const a = t.actor;
    if (!a || a.type === "group" || seen.has(a.id)) continue;
    if (!a.hasPlayerOwner) continue;
    if (t.disposition !== CONST.TOKEN_DISPOSITIONS.FRIENDLY) continue;
    if (a.flags?.["item-piles"]) continue;
    seen.add(a.id); out.push({ actor: a, token: t });
  }
  return out;
}

function displayUserId() {
  return game.settings.get(MODULE_ID, "displayOwnerUser") || null;
}

// ── The checks ──────────────────────────────────────────────────────────────

function checkExecutor() {
  const id = resolveExecutorId();
  const user = id ? game.users.get(id) : null;
  if (!user) return { id: "executor", label: "Executor client", status: "fail", detail: "No executor user resolved — phone actions have nowhere to run." };
  if (!user.active) return { id: "executor", label: "Executor client", status: "fail", detail: `${user.name} (executor) is not connected.` };
  return { id: "executor", label: "Executor client", status: "ok", detail: `${user.name} is online.` };
}

function checkDisplayAccount() {
  const id = displayUserId();
  if (!id) return { id: "display", label: "TV / display account", status: "warn", detail: "No display account set — shared-screen features (TV camera, party vision) are off." };
  const user = game.users.get(id);
  if (!user) return { id: "display", label: "TV / display account", status: "fail", detail: "The configured display user no longer exists." };
  const bits = [];
  if (!user.active) bits.push("not connected");
  if (user.character) bits.push(`has an assigned character (${user.character.name}) — it will swallow that PC's prompts`);
  if (bits.length) return { id: "display", label: "TV / display account", status: "warn", detail: `${user.name}: ${bits.join("; ")}.` };
  return { id: "display", label: "TV / display account", status: "ok", detail: `${user.name} is online, no character assigned.` };
}

function checkPresetDrift() {
  let drift;
  try { drift = diffPreset(); } catch (e) {
    return { id: "preset", label: "midi settings preset", status: "warn", detail: `Couldn't diff: ${e.message}` };
  }
  if (!drift.length) return { id: "preset", label: "midi settings preset", status: "ok", detail: "All preset values match." };
  const names = drift.slice(0, 4).map(d => d.path).join(", ");
  return {
    id: "preset", label: "midi settings preset", status: "warn",
    detail: `${drift.length} value${drift.length === 1 ? "" : "s"} drifted (${names}${drift.length > 4 ? ", …" : ""}). Deliberate deviations are fine — apply only if unintended.`,
    fix: { label: "Apply preset", run: () => applyPreset() }
  };
}

function checkAssignments() {
  const tvId = displayUserId();
  const pcs = partyPCs();
  if (!pcs.length) return { id: "assign", label: "PC ↔ player assignment", status: "warn", detail: "No party PCs on the active scene to check." };
  const unassigned = pcs.filter(({ actor }) =>
    !game.users.some(u => !u.isGM && u.id !== tvId && u.character?.id === actor.id));
  if (!unassigned.length) return { id: "assign", label: "PC ↔ player assignment", status: "ok", detail: "Every party PC is some player's assigned character." };
  const fixable = [];
  for (const { actor } of unassigned) {
    const owners = game.users.filter(u => !u.isGM && u.id !== tvId && actor.testUserPermission(u, "OWNER"));
    if (owners.length === 1 && !owners[0].character) fixable.push({ actor, user: owners[0] });
  }
  return {
    id: "assign", label: "PC ↔ player assignment", status: "fail",
    detail: `${unassigned.map(p => p.actor.name).join(", ")}: not assigned in any User Configuration — midi routes their save/reaction prompts to the wrong client (the Shield bug).`,
    fix: fixable.length ? {
      label: `Assign ${fixable.length} by ownership`,
      run: async () => { for (const f of fixable) await f.user.update({ character: f.actor.id }); }
    } : null
  };
}

function checkTokenSight() {
  const pcs = partyPCs();
  if (!pcs.length) return { id: "sight", label: "PC token senses", status: "warn", detail: "No party PCs on the active scene to check." };
  const stale = [];
  for (const { actor, token } of pcs) {
    let expected;
    try { expected = actorTokenSight(actor); } catch (e) { continue; }
    if (!expected?.sight) continue;
    const wantRange = Number(expected.sight.range ?? 0);
    const haveRange = Number(token.sight?.range ?? 0);
    const wantMode = expected.sight.visionMode ?? "basic";
    const haveMode = token.sight?.visionMode ?? "basic";
    if (wantRange !== haveRange || wantMode !== haveMode) stale.push({ token, expected });
  }
  if (!stale.length) return { id: "sight", label: "PC token senses", status: "ok", detail: "Placed PC tokens match their actors' senses." };
  return {
    id: "sight", label: "PC token senses", status: "fail",
    detail: `${stale.map(s => s.token.name).join(", ")}: token sight doesn't match the sheet (blind-on-the-TV bug).`,
    fix: { label: "Sync senses", run: async () => { for (const s of stale) await s.token.update(s.expected); } }
  };
}

function checkPartyGroup() {
  const pcs = partyPCs();
  const groups = game.actors.filter(a => a.type === "group");
  if (!groups.length) {
    if (!pcs.length) return { id: "party", label: "Party group", status: "warn", detail: "No group actor and no party PCs on the active scene yet." };
    return { id: "party", label: "Party group", status: "warn", detail: "No group actor — Form up / party mode unavailable. The panel's Create party button sets one up." };
  }
  const g = groups.find(x => (x.system?.members ?? []).some(m => m.actor)) ?? groups[0];
  const memberIds = new Set((g.system?.members ?? []).map(m => m.actor?.id).filter(Boolean));
  const missing = pcs.filter(p => !memberIds.has(p.actor.id)).map(p => p.actor.name);
  const sceneActorIds = new Set((game.scenes.active?.tokens ?? []).map(t => t.actor?.id).filter(Boolean));
  const gone = (g.system?.members ?? []).map(m => m.actor).filter(a => a && !sceneActorIds.has(a.id)).map(a => a.name);
  if (!missing.length && !gone.length) return { id: "party", label: "Party group", status: "ok", detail: `${g.name}: members match the active scene.` };
  const bits = [];
  if (missing.length) bits.push(`not members: ${missing.join(", ")}`);
  if (gone.length) bits.push(`members with no token here: ${gone.join(", ")}`);
  return { id: "party", label: "Party group", status: "warn", detail: `${g.name} is stale (${bits.join("; ")}) — use the panel's ⟳ / checklist.` };
}

// The Cave A landmine (Round 32): an ENABLED teleportToken behavior with no
// (or unresolvable) destination makes core throw during movement segmentation,
// silently no-op'ing every token move whose path tests against the region.
function checkTeleportRegions() {
  const bad = [];
  for (const scene of game.scenes) {
    for (const region of scene.regions ?? []) {
      for (const b of region.behaviors ?? []) {
        if (b.type !== "teleportToken" || b.disabled) continue;
        const dests = [...(b.system?.destinations ?? [])];
        let broken = !dests.length;
        for (const uuid of dests) {
          let doc = null;
          try { doc = fromUuidSync(uuid, { relative: b }); } catch (e) { /* unresolvable */ }
          if (!doc) broken = true;
        }
        if (broken) bad.push({ scene, region, behavior: b });
      }
    }
  }
  if (!bad.length) return { id: "teleport", label: "Teleport regions", status: "ok", detail: "No enabled teleport behaviors with missing destinations." };
  return {
    id: "teleport", label: "Teleport regions", status: "fail",
    detail: bad.map(x => `${x.scene.name} / ${x.region.name}`).join(", ") + ": enabled teleport with no valid destination — SILENTLY BLOCKS token movement on that scene.",
    fix: { label: `Disable ${bad.length}`, run: async () => { for (const x of bad) await x.behavior.update({ disabled: true }); } }
  };
}

function checkModuleStack() {
  const bits = [];
  const dnd = game.system.version;
  if (!dnd.startsWith("5.")) bits.push(`dnd5e ${dnd} (pinned: 5.3.x)`);
  const midi = game.modules.get("midi-qol");
  if (!midi?.active) bits.push("midi-qol inactive");
  else if (!String(midi.version).startsWith("14.")) bits.push(`midi-qol ${midi.version} (pinned: 14.0.x — note: version string can read stale on symlinked worlds)`);
  if (!game.modules.get("socketlib")?.active) bits.push("socketlib inactive (RPC dead)");
  for (const legacy of ["chris-premades", "gambits-premades"]) {
    const m = game.modules.get(legacy);
    if (m?.active) bits.push(`${m.title} is v13-era — expect breakage on Foundry 14`);
  }
  if (!bits.length) return { id: "stack", label: "Module stack", status: "ok", detail: `dnd5e ${dnd}, midi-qol ${midi?.version}, socketlib on.` };
  const fatal = bits.some(b => b.includes("inactive"));
  return { id: "stack", label: "Module stack", status: fatal ? "fail" : "warn", detail: bits.join("; ") + "." };
}

// §18 travel: for the journey's sun-setting-over-time effect to show, the overworld scene
// needs darkness that can move AND matter — Global Illumination OFF, darkness unlocked, token
// vision ON (Foundry core doesn't tie worldTime to lighting; the travel loop drives
// environment.darknessLevel). Only relevant once an overworld map is chosen; a warn, not a fail.
function checkTravelLighting() {
  const id = "travelLighting", label = "Travel lighting";
  const over = game.scenes.get(game.settings.get(MODULE_ID, "travelOverworldSceneId") || "");
  if (!over) return { id, label, status: "ok", detail: "No overworld map set — skipped." };
  const env = over.environment ?? {};
  const problems = [];
  if (env.globalLight?.enabled) problems.push("Global Illumination is ON");
  if (env.darknessLock) problems.push("Darkness is locked");
  if (!over.tokenVision) problems.push("Token Vision is OFF");
  if (!problems.length) return { id, label, status: "ok", detail: `${over.name}: ready for time-of-day lighting.` };
  return {
    id, label, status: "warn",
    detail: `${over.name}: ${problems.join(", ")} — travel's sunset/night won't show until this is fixed.`,
    fix: { label: "Fix scene", run: async () => { await over.update({ "environment.globalLight.enabled": false, "environment.darknessLock": false, tokenVision: true }); } }
  };
}

// ── Runner ──────────────────────────────────────────────────────────────────

export async function runPreflight() {
  const checks = [checkExecutor, checkDisplayAccount, checkPresetDrift, checkAssignments,
    checkTokenSight, checkPartyGroup, checkTeleportRegions, checkTravelLighting, checkModuleStack];
  const out = [];
  for (const fn of checks) {
    try { out.push(await fn()); }
    catch (e) {
      console.error(`${MODULE_ID} | preflight check ${fn.name} threw`, e);
      out.push({ id: fn.name, label: fn.name.replace(/^check/, ""), status: "warn", detail: `Check errored: ${e.message}` });
    }
  }
  lastResults = out;
  lastRunAt = new Date();
  return out;
}

export async function runPreflightFix(checkId) {
  const check = (lastResults ?? []).find(c => c.id === checkId);
  if (!check?.fix?.run) return;
  await check.fix.run();
  await runPreflight(); // re-validate everything — a fix may cascade
}
