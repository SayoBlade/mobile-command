// The house stops repeating itself (mobile-command §53). TEST WORLD ONLY.
//
// DM 2026-09-20: "the looping creaks and wood groans in the house are too often, the whole soundscape is a bit
// crowded (running should be VERY rare, laughter rare, etc.)."
//
// MEASURED CAUSE. A Foundry ambient sound point ALWAYS loops — `repeat` is inert on it — so the length of the
// recording IS how often you hear it. Eleven of the house's standing sounds are short takes:
//     the bed breathes 1.3s · the cradle rocks 2.9s · Adela moans 3.0s · the chandelier sways 4.3s
//     the oven screams 5.7s · the ichor sizzles 7.9s · Arthur wails 8.8s · Petunia 11.5s
// A rustle every 1.3 seconds is a machine, not a bedroom. (The genuinely continuous ones stay as they are: the
// clock SHOULD tick every two seconds, and the hum, the cauldron, the drips, the hush, the wind, the waltz and
// the four floor beds are minutes long and belong on a loop.)
//
// THE FIX. Each of those eight becomes a §53 Sound cue over its own room, on a rule: one crossing in N while the
// party moves about, with a long quiet time after each. They are then occasional, which is what they always
// should have been — and each keeps its own rarity, his words: a wail is the nursery's signature and may come
// every half minute, a chandelier creak is rare.
//
// Nothing is deleted. The old ambient points are HIDDEN, so one flag puts any of them back.
(async () => {
  const MOD = "mobile-command";
  if (game.world?.id !== "offline-test") return ui.notifications.error("TEST WORLD ONLY — this is not the Offline test world.");
  if (!game.user?.isGM) return ui.notifications.error("Run this as a GM.");
  const G = 140;
  const rect = (c0, r0, c1, r1) => ({ type: "rectangle", x: c0 * G, y: r0 * G, width: (c1 - c0 + 1) * G, height: (r1 - r0 + 1) * G, rotation: 0, hole: false });

  // scene → [ cue key, what it is, the room, the ambient point it replaces, one-in-N, quiet seconds, volume, feet ]
  const PLAN = {
    skzmyUz6MM2U4862: [ // 12.1 First Floor
      ["room:chandelier", "The Foyer chandelier sways", rect(6, 13, 10, 17), "12.1:sound:0", 6, 25, 0.5, 15],
      ["room:oven", "Muffled screams behind the oven door", rect(11, 3, 16, 7), "12.1:sound:2", 4, 20, 0.7, 25],
      ["room:petunia", "Petunia stirs on her bench", rect(4, 2, 10, 7), "12.1:sound:5", 8, 30, 0.4, 15],
    ],
    LTGEO7JXWxFvbcIJ: [ // 12.2 Second Floor
      ["room:bed", "Something shifts under the bedcovers", rect(6, 8, 16, 12), "12.2:sound:3", 5, 20, 0.35, 12],
    ],
    gl3mouQf0eAdouY5: [ // 12.3 Third Floor
      ["room:arthur", "Arthur wails", rect(4, 5, 9, 8), "12.3:sound:0", 3, 25, 0.6, 30],
      ["room:cradle", "The cradle rocks", rect(4, 5, 9, 8), "12.3:sound:1", 4, 20, 0.45, 18],
    ],
    N7rxbhvGMk3cs6k5: [ // 12.4 Attic
      ["room:adela", "Adela moans in her nightmares", rect(9, 9, 14, 14), "12.4:sound:2", 5, 25, 0.5, 15],
      ["room:ichor", "The ichor eats the floor", rect(9, 9, 14, 14), "12.4:sound:1", 6, 25, 0.45, 12],
    ],
  };
  const E = CONST.REGION_EVENTS;
  const report = { madeCues: 0, keptCues: 0, hushed: 0, missing: [] };

  for (const [sceneId, rows] of Object.entries(PLAN)) {
    const scene = game.scenes.get(sceneId);
    if (!scene) { report.missing.push(sceneId); continue; }
    const newRegions = [];
    for (const [key, name, shape, soundKey, chance, cooldown, volume, radius] of rows) {
      const cm = `${key}`;
      const src = scene.sounds.find((s) => s.getFlag(MOD, "cm") === soundKey);
      if (!src) { report.missing.push(`${scene.name}: ${soundKey}`); continue; }

      if (scene.regions.find((r) => r.getFlag(MOD, "cm") === cm)) { report.keptCues++; }
      else {
        newRegions.push({
          name, color: "#6f8fae", visibility: CONST.REGION_VISIBILITY.LAYER,
          shapes: [shape], flags: { [MOD]: { cm, replaces: soundKey } },
          behaviors: [{
            name, type: "mobile-command.sound",
            system: {
              events: [E.TOKEN_MOVE_WITHIN, E.TOKEN_ANIMATE_IN],
              set: "", src: src.path, rule: "chance", chance, cooldown,
              volume, radius, walls: true, origin: "token", playersOnly: true, muted: false, passes: "",
            },
          }],
        });
      }
      // the metronome goes quiet — hidden, never deleted, so one flag brings it back
      if (!src.hidden) { await src.update({ hidden: true }); report.hushed++; }
    }
    if (newRegions.length) {
      await scene.createEmbeddedDocuments("Region", newRegions);
      report.madeCues += newRegions.length;
    }
  }

  console.log("Crooked House — quieter", report);
  ui.notifications.info(`The house is quieter: ${report.madeCues} occasional cues made, ${report.hushed} looping points hushed`
    + (report.keptCues ? `, ${report.keptCues} already there` : "")
    + (report.missing.length ? ` — could not find ${report.missing.join("; ")}` : "."));
  return report;
})();
