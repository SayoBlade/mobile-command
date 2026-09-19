// The REAL action list, in a believable mid-session state, as JSON — for the deck's mockups, so what
// the DM is shown is what will run (deck-command ledger 151). Uses the same fake Foundry as the
// numbered test; nothing here touches a real world.
//
//   node tools/dump-actions.mjs <out.json>
import fs from "node:fs";
import { installFakeFoundry } from "./fake-foundry.mjs";

const out = process.argv[2];
if (!out) { console.error("usage: node tools/dump-actions.mjs <out.json>"); process.exit(2); }

const { A, store, rolls, brekka, gorbon, MOD } = await installFakeFoundry();
const run = async (id, p) => {
  const r = await A.runAction(id, p);
  if (r.ok === false) throw new Error(`${id}: ${r.reason}`);
};

// Stand-in token art: Foundry's own default token, so a mockup shows WHERE their picture sits.
for (const a of [brekka, gorbon]) a.prototypeToken.texture.src = "icons/svg/mystery-man.svg";
brekka.name = "Brekka Mirefoot";
gorbon.name = "Gorbon Grayslayer";

store.set("crookedMoonTools", true);
store.set("fxActive", { rain: true, heartbeat: { users: ["u2"] } });

// Crooked Moon, mid-session: a curse rolled and waiting for Accept, the fiddle under the narration,
// the mist up with the train in, the séance running with its bite armed, a twist request waiting.
await run("cm.curseTarget", { choice: "a2" });
await run("cm.curseRoll");
await run("cm.mist");
await run("cm.fiddle");
await run("cm.train");
await run("cm.seance");
await run("cm.sitters", { choice: "a1" });
await run("cm.sitters", { choice: "a2" });
rolls.push(1);
await run("cm.seanceD10");
await brekka.setFlag(MOD, "twists", 2);
await gorbon.setFlag(MOD, "twists", 1);
await brekka.setFlag(MOD, "fateThread", { key: "apocalypse", reached: 2 });
await gorbon.setFlag(MOD, "tarot", { key: "tower", at: 0, shown: false });
await brekka.setFlag(MOD, "twistPending", { die: 20, note: "the goblin's save" });

const dump = {
  note: "mobile-command action list, fake mid-session state (tools/dump-actions.mjs)",
  areas: A.actionAreas(),
  effects: A.actionSnapshot({ area: "effects" }),
  cm: A.actionSnapshot({ area: "cm" }),
  requests: A.actionSnapshot({ area: "requests" }),
};
fs.writeFileSync(out, JSON.stringify(dump, null, 1));
console.log(`wrote ${out}: ${dump.effects.length} effects · ${dump.cm.length} crooked moon · ${dump.requests.length} requests`);
