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
import { resolveExecutorId, isOverworldScene } from "./settings.js";
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
  // The two ways a display account still steals prompts, both checked against midi's
  // playerForActor (midi-qol.js:18174): an assigned character wins outright (branch 1 ignores
  // ownership entirely), and OWNER wins the active-owner fallback. OBSERVER — what the module
  // grants now — matches neither, which is the point.
  if (user.character) bits.push(`has an assigned character (${user.character.name}) — it will swallow that PC's prompts`);
  const owns = game.actors.filter(a => a.type === "character" && a.hasPlayerOwner
    && (a.ownership?.[user.id] ?? 0) > 2).map(a => a.name);
  if (owns.length) bits.push(`holds Owner (not Observer) on ${owns.length}: ${owns.slice(0, 3).join(", ")}${owns.length > 3 ? ", …" : ""} — it can intercept their save prompts`);
  if (bits.length) {
    return {
      id: "display", label: "TV / display account", status: "warn", detail: `${user.name}: ${bits.join("; ")}.`,
      fix: owns.length ? {
        label: `Lower ${owns.length} to Observer`,
        run: async () => { const { syncDisplayObserver } = await import("./settings.js"); await syncDisplayObserver(user.id); }
      } : null
    };
  }
  return { id: "display", label: "TV / display account", status: "ok", detail: `${user.name} is online, sees the party as Observer, no character assigned.` };
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

// Can every player-owned token on this scene actually reach a phone when midi asks it something?
//
// This replaced the old "PC ↔ player assignment" check (2026-07-21). That one demanded every PC be
// some user's assigned character — arithmetically impossible the moment a player runs a familiar or
// a second PC, since Foundry gives each user exactly ONE character slot. It reported a permanent,
// unfixable failure for doing nothing wrong. The underlying risk was never assignment: it was the
// TV account holding OWNER and winning midi's routing fallback. That's fixed at the source now
// (DISPLAY_LEVEL, settings.js), so the only question left is the one a DM can act on — is there a
// connected human who owns this creature? Note this deliberately does NOT filter on disposition:
// a neutral pet is exactly as routable-or-not as a friendly one.
function checkPromptRouting() {
  const id = "prompts", label = "Player prompts";
  const tvId = displayUserId();
  const owned = [];
  const seen = new Set();
  for (const t of game.scenes?.active?.tokens ?? []) {
    const a = t.actor;
    if (!a || a.type === "group" || seen.has(a.id) || a.flags?.["item-piles"]) continue;
    if (!a.hasPlayerOwner) continue;
    seen.add(a.id); owned.push({ actor: a, token: t });
  }
  if (!owned.length) return { id, label, status: "warn", detail: "No player-owned tokens on the active scene to check." };
  // Two very different states, and conflating them was the first version's mistake (DM screenshot,
  // 2026-07-21: a red wall before the players had even logged in). "Nobody owns this" is a config
  // error only the DM can fix — red. "Their player hasn't joined yet" is the normal state of every
  // pre-session table and clears itself when they connect — amber, and it names the PERSON, since
  // that's the actionable half.
  const ownerless = [], waiting = new Map(); // userName -> [actor names]
  for (const { actor } of owned) {
    const owners = game.users.filter(u => !u.isGM && u.id !== tvId && actor.testUserPermission(u, "OWNER"));
    if (!owners.length) { ownerless.push(actor.name); continue; }
    if (owners.some(u => u.active)) continue;
    for (const u of owners) waiting.set(u.name, [...(waiting.get(u.name) ?? []), actor.name]);
  }
  if (ownerless.length) {
    return {
      id, label, status: "fail",
      detail: `Nobody owns ${ownerless.join(", ")}. Give a player Owner on the sheet.`
    };
  }
  if (waiting.size) {
    const who = [...waiting].map(([user, actors]) => `${user} (${actors.join(", ")})`).join("; ");
    return { id, label, status: "warn", detail: `Not connected yet: ${who}.` };
  }
  return { id, label, status: "ok", detail: `${owned.length} token${owned.length === 1 ? "" : "s"} — all reach a phone.` };
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

// §18 travel: an overworld where the WHOLE map stays visible but dims with the clock (DM
// 2026-07-18: "still lets players see all of it"). Token Vision OFF = no fog / no sight-range
// circle; darkness still tints the fully-visible scene. Global Illumination OFF (it would cancel
// the dimming); darkness unlocked so the travel loop can drive environment.darknessLevel. Warn.
function checkTravelLighting() {
  const id = "travelLighting", label = "Travel lighting";
  // The scene you're actually on wins when it's a detected overworld (grid ≥ threshold ft/cell);
  // else fall back to the hand-picked overworld. Auto-detection means any big map is covered.
  const active = canvas?.scene;
  const over = (active && isOverworldScene(active))
    ? active
    : game.scenes.get(game.settings.get(MODULE_ID, "travelOverworldSceneId") || "");
  if (!over) return { id, label, status: "ok", detail: "No overworld map open or set — skipped." };
  const env = over.environment ?? {};
  const problems = [];
  if (over.tokenVision) problems.push("Token Vision is ON (players only see around their token)");
  if (env.globalLight?.enabled) problems.push("Global Illumination is ON (it cancels the day/night dimming)");
  if (env.darknessLock) problems.push("Darkness is locked");
  if (!problems.length) return { id, label, status: "ok", detail: `${over.name}: the whole map stays visible and dims with the clock.` };
  return {
    id, label, status: "warn",
    detail: `${over.name}: ${problems.join("; ")} — the party won't see the whole map dim with day/night until fixed.`,
    fix: { label: "Fix scene", run: async () => { await over.update({ tokenVision: false, "environment.globalLight.enabled": false, "environment.darknessLock": false }); } }
  };
}

// ── Runner ──────────────────────────────────────────────────────────────────

export async function runPreflight() {
  const checks = [checkExecutor, checkDisplayAccount, checkPresetDrift, checkPromptRouting,
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
