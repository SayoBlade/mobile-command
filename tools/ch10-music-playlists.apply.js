// Chapter 10 music playlists (MUSIC-LAYER.md, picks from _audio-tools/MUSIC-PICKS-ch10.md). TEST WORLD ONLY.
//
// Creates a "Music" playlist folder with four sub-folders (Rooms, Fights, Cues, Moods) and one playlist per
// area, fight, cue and mood. ⚠️ PATHS ONLY: every sound points at the loudness-normalised OGG (-18 LUFS) in his
// Foundry Data folder (assets/Personal/Music/BGM-ogg/...). No audio is copied anywhere, and never the WAVs.
//
// Fades are the crossfade (MUSIC-LAYER open question 4): 3 s rooms and moods, 1 s battle, 0.5 s cues.
// Rooms, fights and moods SHUFFLE (they loop for as long as they hold); cues are SOUNDBOARD, so a cue
// plays once and stops, which is how the engine knows to return.
// Every playlist carries flags.mobile-command.music = { role, key } — what the engine reads, never the name.
// Idempotent by that flag: a second run updates in place and creates nothing twice.
(async () => {
  const MOD = "mobile-command";
  if (game.world?.id !== "crooked-moon-test") return ui.notifications.error("TEST WORLD ONLY — this is not crooked-moon-test.");
  if (!game.user?.isGM) return ui.notifications.error("Run this as a GM.");
  // group → playlist → files under BGM-ogg (each one is a PlaylistSound PATH, nothing more)
  const BASE = "assets/Personal/Music/BGM-ogg/";
  const PICKS = {
    "Rooms": {
      "Passenger Car": ["agraveaffair_gothichorror/Gothic Horror/Carriage Through Fog.ogg", "agraveaffair_gothichorror/Gothic Horror/Guest at the Gate.ogg", "agraveaffair_gothichorror/Gothic Horror/False Warmth.ogg"],
      "Lounge Car": ["agraveaffair_gothichorror/Gothic Horror/Widow at the Piano.ogg", "agraveaffair_gothichorror/Gothic Horror/The Last Dance in the Ballroom.ogg", "agraveaffair_gothichorror/Gothic Horror/Velvet Drapes, Red Flags.ogg"],
      "Dining Car": ["agraveaffair_gothichorror/Gothic Horror/Stiff Upper Class.ogg", "agraveaffair_gothichorror/Gothic Horror/No Rest for the Wealthy.ogg", "agraveaffair_gothichorror/Gothic Horror/Old Money, Older Curse.ogg"],
      "Sleeper Car": ["agraveaffair_gothichorror/Gothic Horror/Ashes in Snow.ogg", "agraveaffair_gothichorror/Gothic Horror/Mourning Person.ogg", "livingrent-free_psychologicalhorror/Psychological Horror/Still There When You Close Your Eyes.ogg"],
      "Mail Car": ["agraveaffair_gothichorror/Gothic Horror/Mother's Locket.ogg", "livingrent-free_psychologicalhorror/Psychological Horror/Someone Read the Journal.ogg", "agraveaffair_gothichorror/Gothic Horror/Mourning Dress Code.ogg"],
      "Circus Car": ["livingrent-free_psychologicalhorror/Psychological Horror/Laugh in the Wall.ogg", "livingrent-free_psychologicalhorror/Psychological Horror/Crowd Without Faces.ogg", "hexappeal_occultfolkhorror/Occult Folk Horror/Children Know the Tune.ogg"],
      "Baggage Car": ["cuttothechase_slasherhorror/Slasher Horror/Breathing Behind the Door.ogg", "cuttothechase_slasherhorror/Slasher Horror/Hide and Seek Champion.ogg", "agraveaffair_gothichorror/Gothic Horror/The Unseen Host.ogg"],
      "Off the Spectral Rails": ["voidwhereprohibited_eldritchhorror/Eldritch Horror/Tides Move Inward.ogg", "voidwhereprohibited_eldritchhorror/Eldritch Horror/Sky Behind the Sky.ogg", "voidwhereprohibited_eldritchhorror/Eldritch Horror/Architecture That Watches.ogg"],
      "Wickermoor Hollow": ["hexappeal_occultfolkhorror/Occult Folk Horror/Lanterns Between Trees.ogg", "hexappeal_occultfolkhorror/Occult Folk Horror/Hollow Oak.ogg", "hexappeal_occultfolkhorror/Occult Folk Horror/Wicker Gate.ogg", "hexappeal_occultfolkhorror/Occult Folk Horror/Blackwater Marsh.ogg"]
    },
    "Fights": {
      "Haint Fight": ["cuttothechase_slasherhorror/Slasher Horror/Blood In The Hall.ogg", "cuttothechase_slasherhorror/Slasher Horror/Killer Gets Up Again.ogg", "agraveaffair_gothichorror/Gothic Horror/Relentless Pursuit.ogg", "agraveaffair_gothichorror/Gothic Horror/The Pursuit.ogg"],
      "Locomotive Phase 1": ["demonitized_occultmetalhorror/Occult Metal Horror/Amped for the Apocalypse.ogg", "demonitized_occultmetalhorror/Occult Metal Horror/The Pit Opens.ogg", "demonitized_occultmetalhorror/Occult Metal Horror/Double Kick from Below.ogg"],
      "Locomotive Phase 2": ["demonitized_occultmetalhorror/Occult Metal Horror/Turn It Up to 11.ogg", "demonitized_occultmetalhorror/Occult Metal Horror/Satanic Panic.ogg", "demonitized_occultmetalhorror/Occult Metal Horror/Final Power Chord.ogg"]
    },
    "Cues": {
      "Locomotive Breaks Free": ["demonitized_occultmetalhorror/Occult Metal Horror/The Gates Come Down.ogg"],
      "The Crash": ["voidwhereprohibited_eldritchhorror/Eldritch Horror/Reality Peels Back.ogg"],
      "Haint Freed": ["agraveaffair_gothichorror/Gothic Horror/Before Dawn.ogg", "agraveaffair_gothichorror/Gothic Horror/Silent Aftermath.ogg"],
      "Fight Won": ["hexappeal_occultfolkhorror/Occult Folk Horror/Dawn Over the Empty Village.ogg"]
    },
    "Moods": {
      "Tension": ["livingrent-free_psychologicalhorror/Psychological Horror/Creeping Dread.ogg", "agraveaffair_gothichorror/Gothic Horror/Grounds for Suspicion.ogg"],
      "Eerie": ["voidwhereprohibited_eldritchhorror/Eldritch Horror/Architecture That Watches.ogg", "voidwhereprohibited_eldritchhorror/Eldritch Horror/Doorway Wider Inside.ogg"],
      "Calm": ["agraveaffair_gothichorror/Gothic Horror/False Warmth.ogg", "agraveaffair_gothichorror/Gothic Horror/Before Dawn.ogg"],
      "Chase": ["cuttothechase_slasherhorror/Slasher Horror/Final Girl Run.ogg", "cuttothechase_slasherhorror/Slasher Horror/Run Like You Mean It.ogg"]
    }
  };
  const ROLE = { Rooms: "room", Fights: "battle", Cues: "cue", Moods: "mood" };
  const FADE = { Rooms: 3000, Fights: 1000, Cues: 500, Moods: 3000 };
  const MODE = { Rooms: 1, Fights: 1, Cues: 2, Moods: 1 };
  const SINGULAR = { Rooms: "Room", Fights: "Fight", Cues: "Cue", Moods: "Mood" };
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  for (const g of Object.values(PICKS)) for (const list of Object.values(g)) for (const f of list)
    if (!/\.ogg$/i.test(f) || f.includes("..")) throw new Error(`not a BGM-ogg file: ${f}`);

  const folderOf = async (name, parent = null, sort = 0) => {
    const f = game.folders.find((x) => x.type === "Playlist" && x.name === name && (x.folder?.id ?? null) === (parent?.id ?? null));
    return f ?? Folder.create({ name, type: "Playlist", folder: parent?.id ?? null, sorting: "m", sort });
  };
  const top = await folderOf("Music");
  const made = [], updated = [];
  let gi = 0;
  for (const [group, lists] of Object.entries(PICKS)) {
    const sub = await folderOf(group, top, (++gi) * 100000);
    let i = 0;
    for (const [name, tracks] of Object.entries(lists)) {
      i++;
      const key = slug(name);
      const role = ROLE[group];
      const data = {
        name: `${SINGULAR[group]} · ${name}`, folder: sub.id, mode: MODE[group], fade: FADE[group], channel: "music",
        sorting: "m", sort: i * 1000, flags: { [MOD]: { music: { role, key } } },
      };
      const sounds = tracks.map((f, j) => ({ name: f.split("/").pop().replace(/\.ogg$/i, ""), path: BASE + f, volume: 0.8, repeat: false, fade: FADE[group], sort: j * 1000, channel: "music" }));
      const have = game.playlists.find((p) => p.getFlag(MOD, "music")?.key === key && p.getFlag(MOD, "music")?.role === role);
      if (!have) { await Playlist.create({ ...data, sounds }); made.push(data.name); continue; }
      await have.update(data);
      const byPath = new Map(have.sounds.map((s) => [s.path, s]));
      const add = sounds.filter((s) => !byPath.has(s.path));
      if (add.length) await have.createEmbeddedDocuments("PlaylistSound", add);
      updated.push(data.name);
    }
  }
  const summary = { made, updated };
  console.log(`${MOD} | ch10 music playlists`, summary);
  ui.notifications.info(`Music playlists: ${made.length} made, ${updated.length} updated.`);
  return summary;
})();
