// Headless check of the action list the deck draws (§52, deck-command ledger 151): the Crooked Moon
// area and its requests, run end to end against a fake Foundry — no world, no server, no locks.
//
//   node tools/test-actions.mjs
//
// Numbered expected results, in order; the run STOPS at the first failure (CLAUDE.md test protocol).
import fs from "node:fs";
import path from "node:path";

import { installFakeFoundry } from "./fake-foundry.mjs";

const { A, live, store, fired, chats, rolls, seq, brekka, gorbon, outsider, MOD } = await installFakeFoundry();

/* ── the runner ───────────────────────────────────────────────────────────────────────────────── */
let n = 0;
function check(what, cond, got = "") {
  n += 1;
  if (cond) { console.log(`PASS ${n}. ${what}`); return; }
  console.log(`FAIL ${n}. ${what}${got ? ` — got ${got}` : ""}`);
  console.log("Stopped at the first failure.");
  process.exit(1);
}
const row = (area, id) => A.actionSnapshot({ area }).find((r) => r.id === id);
const areaOf = (id) => A.actionAreas().find((a) => a.id === id);
const run = (id, p) => A.runAction(id, p);

/* ── 1–3 the gate and the shape ──────────────────────────────────────────────────────────────── */
store.set("crookedMoonTools", false);
{
  const r = await run("cm.fiddle");
  check("tools off: no Crooked Moon area, and a Crooked Moon key refuses with a reason",
    !areaOf("cm") && r.ok === false && /Crooked Moon tools/.test(r.reason), JSON.stringify(r));
}
store.set("crookedMoonTools", true);
{
  const rows = A.actionSnapshot({ area: "cm" });
  const groups = [...new Set(rows.map((r) => r.group))];
  // "The house" joined after Intros on 2026-09-20 with the weasels' key (§53: the DM fires them, no timer does).
  const order = ["Intros", "The house", "Curses", "Fate", "Twists", "Druskenvald", "Tarot", "All aboard", "Boarding", "Ghostlight", "Séance"];
  check("tools on: 38 Crooked Moon keys, grouped in the panel's drawer order",
    rows.length === 38 && JSON.stringify(groups) === JSON.stringify(order), `${rows.length} · ${groups.join(", ")}`);
}
{
  store.set("curseTable", "RollTable.custom");
  const gone = !row("cm", "cm.curseHand");
  store.set("curseTable", "");
  const back = row("cm", "cm.curseHand");
  check("a custom curse table removes Pick a curse outright (not dim); without one it offers the hundred",
    gone && back?.enabled && back.choices.length === 100, `${gone} ${back?.choices?.length}`);
}

/* ── 4–8 curses ───────────────────────────────────────────────────────────────────────────────── */
{
  const r = row("cm", "cm.curseTarget");
  check("Curse who lists this scene's two PCs (not the NPC) with token art, the first chosen by default",
    r.choices.length === 2 && r.choices[0].img === "tokens/a1.webp" && r.choices[0].on === true && r.sub === "Brekka",
    JSON.stringify(r.choices.map((c) => [c.label, c.on])));
}
await run("cm.curseTarget", { choice: "a2" });
check("choosing Gorbon writes the shared state — the panel's reader sees the same target",
  live.curseState().target === "a2" && store.get("cmLiveState").curse.target === "a2", live.curseState().target);
{
  gorbon.name = "Gorbon Grayslayer";
  const sub = row("cm", "cm.curseRoll").sub;
  gorbon.name = "Gorbon";
  check("a caption names a character by first name — \"on Gorbon\", not a full name clipped at the edge",
    sub === "on Gorbon", sub);
}
{
  const before = row("cm", "cm.curseAccept");
  await run("cm.curseRoll");
  const after = row("cm", "cm.curseAccept");
  check("Roll curse stages one: Accept goes from dim to lit, glowing, captioned with the curse",
    before.enabled === false && after.enabled && after.alert === true && after.sub === "Hollowed", JSON.stringify(after));
}
await run("cm.curseMinutes", { choice: "30" });
await run("cm.curseAccept");
{
  const e = gorbon.effects.find((x) => x.flags?.[MOD]?.curse);
  check("Accept lands it on Gorbon for the chosen 30 minutes and clears the staged card",
    e?.name === "Hollowed" && e.flags[MOD].minutes === 30 && live.curseState().pick === null, JSON.stringify(e?.flags));
}
{
  const r = row("cm", "cm.curseLift");
  const id = r.choices[0]?.id;
  await run("cm.curseLift", { choice: id });
  check("Lift a curse lists Gorbon's curse with its clock, and lifting it removes it",
    r.enabled && /Hollowed · 30m/.test(r.choices[0]?.sub) && !gorbon.effects.some((x) => x.flags?.[MOD]?.curse), r.choices[0]?.sub);
}

/* ── 9–14 the séance ──────────────────────────────────────────────────────────────────────────── */
check("board off: the question d10 and the bite are dim",
  row("cm", "cm.seanceD10").enabled === false && row("cm", "cm.seanceBite").enabled === false);
{
  store.set("cmLiveState", { ...store.get("cmLiveState"), seance: { party: [], step: 3, armed: true, lastD10: 1 } });
  await run("cm.seance");
  const s = live.cmLive().seance;
  check("turning the board on resets the escalation left by an earlier séance",
    store.get("fxActive")?.seance === true && s.step === 0 && s.armed === false && s.lastD10 === null, JSON.stringify(s));
}
await Promise.all([run("cm.sitters", { choice: "a1" }), run("cm.sitters", { choice: "a2" })]);
check("two quick presses seat both PCs — neither write is lost",
  live.seanceSitters().length === 2 && row("cm", "cm.sitters").sub === "2 seated", JSON.stringify(live.cmLive().seance.party));
rolls.splice(0, rolls.length, 1);
await run("cm.seanceD10");
check("a d10 of 1 arms the bite: it glows, and the d10 goes dim until it is used",
  row("cm", "cm.seanceBite").alert === true && row("cm", "cm.seanceD10").enabled === false && chats.at(-1)?.rollMode === "gmroll");
{
  rolls.splice(0, rolls.length, 3);
  fired.length = 0;
  await run("cm.seanceBite");
  const glitch = fired.find((p) => p.id === "static");
  check("the bite: 3 psychic to both sitters, their phones and the TV glitch, next die 1d6, disarmed",
    brekka.damage.at(-1)?.[0]?.value === 3 && gorbon.damage.at(-1)?.[0]?.type === "psychic"
      && JSON.stringify([...glitch.users].sort()) === JSON.stringify(["tv", "u1", "u2"]) && glitch.level === 0.22
      && row("cm", "cm.seanceBite").sub === "1d6 psychic" && !row("cm", "cm.seanceBite").alert,
    JSON.stringify(glitch));
}
{
  const r = row("cm", "cm.seanceSay");
  fired.length = 0;
  await run("cm.seanceSay", { choice: "GOODBYE" });
  check("the board says: the four printed words, and the chosen one goes to the planchette",
    r.choices.map((c) => c.id).join() === "YES,NO,HELLO,GOODBYE" && fired[0]?.id === "seancePhrase" && fired[0].text === "GOODBYE");
}

/* ── 15–18 twists, fate, tarot ────────────────────────────────────────────────────────────────── */
await run("cm.twists", { choice: "a1", delta: -1 });
await run("cm.twists", { choice: "a1", delta: 1 });
await run("cm.twists", { choice: "a1", delta: 1 });
check("Twists: − never goes below 0, + counts up, and the step page shows the count",
  brekka.getFlag(MOD, "twists") === 2 && row("cm", "cm.twists").choices[0].value === "2", String(brekka.getFlag(MOD, "twists")));
{
  await run("cm.fateThread", { choice: "a1", delta: 1 });
  const first = brekka.getFlag(MOD, "fateThread")?.key;
  await gorbon.setFlag(MOD, "fateThread", { key: "duality", reached: 2 });
  const r = await run("cm.fateThread", { choice: "a2", delta: 1 });
  check("Threads: + gives Brekka the first thread; Gorbon, 2 steps in, is refused by name",
    first === "apocalypse" && r.ok === false && /Gorbon is 2 steps into Duality/.test(r.reason)
      && gorbon.getFlag(MOD, "fateThread").key === "duality", `${first} · ${JSON.stringify(r)}`);
}
{
  await run("cm.fateStep", { choice: "a1", delta: 1 });
  const up = brekka.getFlag(MOD, "fateThread").reached;
  const inspired = brekka.system.attributes.inspiration === true;
  await run("cm.fateStep", { choice: "a1", delta: -1 });
  check("Touchpoints: + reaches step 1 (Heroic Inspiration applies), − steps back to 0",
    up === 1 && inspired && brekka.getFlag(MOD, "fateThread").reached === 0, `${up} ${inspired}`);
}
{
  await outsider.setFlag(MOD, "tarot", { key: "fool", at: 0, shown: false });
  await run("cm.tarotCheat", { choice: "a1", delta: 1 });
  const forced = live.tarotForced("a1");
  await run("cm.tarotDeal", { choice: "a1" });
  check("Tarot: the cheat skips The Fool (someone holds it) to The Magician; Deal hands exactly that, then clears the cheat",
    forced === "magician" && brekka.getFlag(MOD, "tarot")?.key === "magician" && live.tarotForced("a1") === null, forced);
}

/* ── 19–21 requests ───────────────────────────────────────────────────────────────────────────── */
await brekka.setFlag(MOD, "twistPending", { die: 20, note: "the goblin's save" });
{
  const req = A.actionSnapshot({ area: "requests" });
  check("one twist request counts ONE waiting, though Spend and Keep are both offered",
    areaOf("requests").waiting === 1 && req.map((r) => r.id).join() === "cm.twistSpend,cm.twistKeep",
    `${areaOf("requests").waiting} · ${req.map((r) => r.id)}`);
}
await run("cm.twistSpend", { choice: "a1" });
check("Spend takes the twist, posts the public fate card, and the request leaves the list",
  brekka.getFlag(MOD, "twists") === 1 && /<b>natural 20<\/b>/.test(chats.at(-1)?.content ?? "") && areaOf("requests").waiting === 0);
{
  await gorbon.setFlag(MOD, "bargainPending", { at: 1 });
  await run("cm.bargainStrike", { choice: "a2" });
  const acc = row("requests", "cm.bargainAccept");
  await run("cm.bargainAccept");
  check("a bargain: Strike stages a curse on Gorbon, Accept waits in Requests glowing, and landing it strikes the bargain",
    acc?.alert === true && acc.sub === "Hollowed" && gorbon.getFlag(MOD, "bargainResult") === "struck"
      && !gorbon.getFlag(MOD, "bargainPending") && gorbon.effects.some((x) => x.flags?.[MOD]?.curse), JSON.stringify(acc));
}

/* ── 22–24 all aboard ─────────────────────────────────────────────────────────────────────────── */
{
  fired.length = 0;
  await run("cm.fiddle");
  await run("cm.engine");
  await run("cm.brakes");
  const s = live.cmLive();
  check("Fiddle fires its cue and stays on; Brakes stops the engine but the fiddle plays on",
    fired[0]?.id === "cmFiddle" && fired[0].on === true && s.fiddle === true && s.engine === false
      && row("cm", "cm.fiddle").on === true && row("cm", "cm.engine").on === false, JSON.stringify(fired.map((p) => p.id)));
}
{
  await run("cm.intro", { choice: "a2" });
  const up = store.get("fxActive").cmIntro?.actorId === "a2" && store.get("fxActive").cmStation === true;
  await run("cm.mist");
  check("Introduce raises the mist with Gorbon's card; closing the mist takes the card down too",
    up && !store.get("fxActive").cmStation && !store.get("fxActive").cmIntro, JSON.stringify(store.get("fxActive")));
}
{
  await run("cm.ticket", { choice: "u1" });
  const one = row("cm", "cm.ticketsAll").on === false && row("cm", "cm.ticket").sub === "1 out";
  await run("cm.ticketsAll");
  check("Tickets: one handed out reads 1 out; All tickets then gives everyone theirs and reads on",
    one && row("cm", "cm.ticketsAll").on === true && JSON.stringify(store.get("fxActive").cmTicket?.users) === '["u1","u2"]');
}

/* ── 25 never throws ──────────────────────────────────────────────────────────────────────────── */
{
  const a = await run("cm.nope");
  const b = await run("cm.curseLift", { choice: "zz:yy" }); // nobody by that id — a quiet no-op, not a throw
  check("runAction never throws: an unknown key and a stale choice both come back as answers",
    a.ok === false && /no action called cm.nope/.test(a.reason) && typeof b.ok === "boolean", JSON.stringify([a, b]));
}

/* ── 26–28 what a key changes, shown (DM 2026-09-18) ──────────────────────────────────────────── */
{
  const fx = A.actionSnapshot({ area: "effects" });
  const bare = fx.filter((r) => r.id !== "fx.playerStopAll" && !(r.does === "scene" && r.art));
  check("Loudness is off the deck, and every effect but the stop-all changes what's seen and wears a painted picture",
    !fx.some((r) => r.id === "fx.loudness") && fx.length === 20 && bare.length === 0, `${fx.length} · ${bare.map((r) => r.id).join()}`);
}
{
  const all = [...A.actionSnapshot({ area: "cm" }), ...A.actionSnapshot({ area: "effects" })];
  const sounds = all.filter((r) => r.does === "sound").map((r) => r.id).sort();
  // The weasels joined on 2026-09-20: a scurry inside a wall changes nothing you can see, so it is sound, not scene.
  // "Teddy returned" is the counter-example in the same group: it puts a light out, so it is scene, painted.
  check("sound only: the fiddle, engine, whistle, brakes and the weasels — and none of them carries a picture",
    sounds.join() === "cm.brakes,cm.engine,cm.fiddle,cm.weasels,cm.whistle" && all.filter((r) => r.does === "sound").every((r) => !r.art), sounds.join());
}
{
  const PUBLIC = "C:/Program Files/Foundry Virtual Tabletop 14/resources/app/public";
  const have = fs.existsSync(PUBLIC);
  const arts = [...A.actionSnapshot({ area: "cm" }), ...A.actionSnapshot({ area: "effects" })].filter((r) => r.art).map((r) => r.art);
  const missing = have ? arts.filter((p) => !fs.existsSync(path.join(PUBLIC, p))) : [];
  check(`every painted picture exists in Foundry's own icons folder (${arts.length} checked${have ? "" : " — Foundry not found, skipped"})`,
    missing.length === 0, missing.join(", "));
}

/* ── §40.6 intros ─────────────────────────────────────────────────────────────────────────────── */
{
  const r = row("cm", "cm.entrance");
  const long = r?.choices?.filter((c) => c.label.length > 14).map((c) => c.label) ?? [];
  // The picture is the book's plate for all but the nursery toys, whose three the DM generated himself in the book's
  // style (2026-09-20) — they live in his Foundry data, so the check is "a picture we know the home of", not "the
  // module's folder".
  const OWN = ["modules/the-crooked-moon-2014/", "mc-portraits/"];
  const stray = r?.choices?.filter((c) => !OWN.some((d) => String(c.img ?? "").startsWith(d))).map((c) => c.label) ?? [];
  check("Intro lists every Crooked Moon entrance, a short label and a portrait each, as a painted scene key",
    r?.kind === "pick" && r.does === "scene" && r.choices.length === 94 && long.length === 0 && stray.length === 0,
    `${r?.choices?.length} · ${long.join()} · ${stray.join()}`);
}
{
  fired.length = 0;
  game.paused = false;
  const r = await run("cm.entrance", { choice: "vagrant" });
  const friendPaused = game.paused;
  const r2 = await run("cm.entrance", { choice: "crooked" });
  check("a friend's intro plays without pausing; a foe's pauses first — each fires the entrance one-shot with only its key",
    r.ok && r2.ok && friendPaused === false && game.paused === true
      && fired.filter((p) => p.id === "entrance").map((p) => p.key).join() === "vagrant,crooked",
    `${friendPaused} ${game.paused} ${JSON.stringify(fired)}`);
}
{
  // DM 2026-09-19, Golub: "change the name based on token present" — with Geneva's the live token on the map the banner
  // opens on her (her token's picture: the book gives her none); Theodora standing there alive takes precedence; dead,
  // she doesn't.
  const scene = game.scenes.active;
  // (the token's picture here is a real portrait file, not token art — token art would give the silhouette instead)
  const mk = (name) => ({ name, parent: scene, actor: { name, img: "icons/svg/mystery-man.svg", system: { attributes: { hp: { value: 4 } } } }, texture: { src: `portraits/${name.split(" ")[0].toLowerCase()}.webp` } });
  const geneva = mk("Geneva Fairchild");
  const theodora = mk("Theodora Mayville");
  theodora.actor.img = "art/theodora.webp";
  const kept = scene.tokens.length;
  const forms = [];
  scene.tokens.push(geneva);
  fired.length = 0; await run("cm.entrance", { choice: "golubtf" }); forms.push(fired.at(-1)?.form);
  scene.tokens.push(theodora);
  fired.length = 0; await run("cm.entrance", { choice: "golubtf" }); forms.push(fired.at(-1)?.form);
  theodora.actor.statuses = new Set(["dead"]);
  fired.length = 0; await run("cm.entrance", { choice: "golubtf" }); forms.push(fired.at(-1)?.form);
  scene.tokens.length = kept;
  check("Golub's banner opens on Geneva when hers is the live token (with her token's picture), on Theodora while she stands there alive",
    forms[0]?.name === "Geneva Fairchild" && forms[0]?.sub === "The postmaster's assistant" && forms[0]?.art === "portraits/geneva.webp"
      && forms[1] === null && forms[2]?.name === "Geneva Fairchild",
    JSON.stringify(forms));
}
{
  // DM 2026-09-19: "can you place them in the map if they are missing?" — an intro whose NPC must be on the map (it
  // arrives, it's a reveal, or a transformation's monster) puts the token there itself when none is: hidden first, a
  // couple of squares from the party, flagged as its own, then treated as arriving.
  const scene = game.scenes.active;
  const kept = scene.tokens.length;
  fired.length = 0;
  await run("cm.entrance", { choice: "crooked" });
  const t = scene.tokens.find((x) => x.name === "Crooked Man");
  const near = t && Math.max(Math.abs(t.x - 550), Math.abs(t.y - 500)) <= 300 && !scene.tokens.some((o) => o !== t && o.x === t.x && o.y === t.y);
  check("the Crooked Man's intro places his token near the party when none is there, flagged as its own, and unhides it as he arrives",
    Boolean(t) && t.hidden === false && near && t.getFlag(MOD, "placedBy") === "crooked" && fired.at(-1)?.focus?.tokenIds?.[0] === t.id,
    JSON.stringify({ t: t && [t.name, t.hidden, t.x, t.y], focus: fired.at(-1)?.focus }));
  // a transformation: the monster is placed hidden, and at the change the known form hides, the monster shows, and
  // the map bursts on it (DM 2026-09-19 "sure": feathers, through Sequencer)
  scene.tokens.push({ id: "tk9", name: "Theodora Mayville", hidden: false, x: 700, y: 500, width: 1, height: 1, parent: scene,
    actor: { name: "Theodora Mayville", img: "art/theodora.webp", system: { attributes: { hp: { value: 9 } } } } });
  fired.length = 0; seq.length = 0;
  await run("cm.entrance", { choice: "golubtf" });
  const hag = scene.tokens.find((x) => x.name === "Pigeon Hag");
  const hiddenAtStart = hag?.hidden === true;
  const formAtStart = fired.at(-1)?.form;
  await new Promise((r) => setTimeout(r, 2900));
  const theo = scene.tokens.find((x) => x.id === "tk9");
  check("Golub's change: the hag's token is placed hidden; at the change Theodora's hides, the hag's shows, and feathers burst on it",
    hiddenAtStart && formAtStart === null && hag.hidden === false && theo.hidden === true
      && seq[0]?.file === "jb2a.swirling_feathers.outburst.01.textured" && seq[0]?.at?.x === hag.x + 50 && seq[0]?.size?.width === 250,
    JSON.stringify({ hiddenAtStart, formAtStart, hag: hag && [hag.hidden, hag.x, hag.y], theo: theo?.hidden, seq }));
  scene.tokens.length = kept;
}
{
  // a token picture is no portrait: an alternate form met only as top-down token art gets the silhouette (art "")
  const scene = game.scenes.active;
  const kept = scene.tokens.length;
  scene.tokens.push({ id: "tk8", name: "Geneva Fairchild", hidden: false, x: 900, y: 500, width: 1, height: 1, parent: scene,
    actor: { name: "Geneva Fairchild", img: "systems/dnd5e/tokens/humanoid/Commoner.webp", system: { attributes: { hp: { value: 4 } } } },
    texture: { src: "modules/the-crooked-moon-2014/assets/tokens/tokens%20vtt/VTTTOKEN_NPC_x_Medium_1x1.webp" } });
  fired.length = 0;
  await run("cm.entrance", { choice: "golubtf" });
  const form = fired.find((p) => p.id === "entrance")?.form;
  scene.tokens.length = kept;
  check("Geneva met only as token art: her form carries no picture, so the banner draws its silhouette",
    form?.name === "Geneva Fairchild" && form?.art === "", JSON.stringify(form));
}
{
  fired.length = 0;
  const r = await run("cm.entrance", {});
  const s = await run("cm.entranceStop");
  check("Intro with nothing picked refuses with a reason; Stop intro fires the stop one-shot",
    r.ok === false && /pick an intro/.test(r.reason) && s.ok && fired.some((p) => p.id === "entranceStop"), JSON.stringify([r, s, fired]));
}

/* ── layered weather (DM 2026-09-19: "make sure I can have fog and rain simultaneously") ──────── */
{
  const fx = await import("../scripts/effects.js");
  const W = { fog: { effects: [{ id: "fogShader" }] }, rain: { effects: [{ id: "rainShader" }] },
    rainStorm: { effects: [{ id: "fogShader" }, { id: "rainShader" }] }, snow: { effects: [{ id: "snowShader" }] },
    blizzard: { effects: [{ id: "snowShader" }] }, leaves: { effects: [{ id: "leavesParticles" }] } };
  globalThis.CONFIG.weatherEffects = W;
  fx.registerLayeredWeather();
  const storm = W["mcFog+rainStorm"]?.effects?.map((e) => e.id);
  check("each precipitation gets a fog-over entry, and Downpour's own fog shader keeps its id beside ours",
    ["rain", "rainStorm", "snow", "blizzard", "leaves"].every((p) => W[`mcFog+${p}`]) && storm?.join() === "fogShader,rainShader,mcFogLayer",
    JSON.stringify(storm));
}
{
  const scene = game.scenes.active;
  scene.weather = "";
  store.set("fxActive", {});
  await run("fx.fog");
  await run("fx.rain");
  const both = row("effects", "fx.fog").on === true && row("effects", "fx.rain").on === true;
  check("Fog, then Rain: both stay on, the map shows both, and the rain's loop is still wanted",
    both && scene.weather === "mcFog+rain" && store.get("fxActive").rain === true, `${scene.weather} · ${JSON.stringify(store.get("fxActive"))}`);
}
{
  const scene = game.scenes.active;
  await run("fx.snow");
  check("Snow while it rains in the fog: the snow replaces the rain (and its loop), the fog stays",
    scene.weather === "mcFog+snow" && !store.get("fxActive").rain && row("effects", "fx.rain").on === false && row("effects", "fx.fog").on === true,
    `${scene.weather} · ${JSON.stringify(store.get("fxActive"))}`);
  await run("fx.fog");
  check("Fog off again leaves the snow alone",
    scene.weather === "snow" && row("effects", "fx.snow").on === true && row("effects", "fx.fog").on === false, scene.weather);
}
{
  const scene = game.scenes.active;
  await run("fx.dust");
  const dustOn = row("effects", "fx.dust").on === true && row("effects", "fx.fog").on === false && scene.weather === "mcFog+snow";
  await run("fx.fog");
  check("the dust storm and fog share the air: dust over the snow reads as dust, not fog; then Fog replaces the dust",
    dustOn && row("effects", "fx.fog").on === true && row("effects", "fx.dust").on === false && !store.get("fxActive").dust && scene.weather === "mcFog+snow",
    `${dustOn} · ${scene.weather} · ${JSON.stringify(store.get("fxActive"))}`);
}
{
  // Rain turned on elsewhere (the scene's own config) while MC still remembers blizzard: the keys follow the map.
  const scene = game.scenes.active;
  store.set("fxActive", { blizzard: true });
  scene.weather = "rain";
  check("keys read the map, not a stale memory: the scene says rain, so Rain is on and Blizzard is off",
    row("effects", "fx.rain").on === true && row("effects", "fx.blizzard").on === false);
  scene.weather = "";
  store.set("fxActive", {});
}

console.log(`\nAll ${n} passed.`);
process.exit(0);
