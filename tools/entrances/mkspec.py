import json, os
from pathlib import Path
D = Path(os.environ["LOCALAPPDATA"]) / "FoundryVTT/Data"
W = {"w1": ("assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav", 0.2, 2.6, 0.02, 0.5),
     "w2": ("assets/Personal/SFX/creepywind_darkfantasystudio/Dark Fantasy Studio- Creepy wind 32.wav", 0.1, 2.6, 0.02, 1.0),
     "w3": ("modules/psfx/library/creature/movement/flight/wings/beating-wings-small-001.ogg", 0.0, 2.3, 0.01, 0.3)}
L = {"vagrant": ("modules/ember/assets/audio/music/lyla-theme/solo-violin-melody.ogg", 0.6, 9.3, 0.05, 1.0),
     # druskenvald is not here: swing.py writes snd/druskenvald.mp3 (the generated swing).
     "vessla": ("modules/ember/assets/audio/environment/insects-and-minor-animals/loops/spider-scuttling-active.ogg", 4.5, 13.2, 0.5, 1.0),
     "crooked": ("modules/ambiences-vol-7-michael-ghelfi/shortloops/Rain (Interior Perspective).ogg", 4.2, 12.9, 0.4, 1.0),
     "jericho": ("assets/Personal/SFX/Forestscapes Vol 2/Country Day Crows.mp3", 7.0, 15.7, 0.5, 1.0),
     "harvest": ("modules/dnd-abomination-vaults/assets/audio/ambience/murder-of-crows.ogg", 12.5, 21.2, 0.5, 1.0),
     "abbot": ("assets/Personal/SFX/monk_darkfantasystudio/Dark Fantasy Studio- Monk 11.wav", 0.3, 9.0, 0.05, 1.0),
     "sinner": ("modules/dnd-abomination-vaults/assets/audio/ambience/swamp.ogg", 83.0, 91.7, 0.5, 1.0),
     "widow": ("modules/dnd-abomination-vaults/assets/audio/ambience/weeping-ghost-loop.ogg", 16.5, 25.2, 0.5, 1.0),
     "blight": ("modules/ember/assets/audio/environment/land-animals-and-beasts/one-shots/strange-beast-1.ogg", 0.0, 6.0, 0.02, 1.0),
     "reaper": ("modules/pf2e-ap178-punks-in-a-powderkeg/assets/audio/ghostlyChainsAndWails.ogg", 0.0, 8.7, 0.02, 1.0),
     "golub": ("modules/ember/assets/audio/environment/birds-and-winged-creatures/loops/flapping-wings.ogg", 2.5, 11.2, 0.5, 1.0),
     "fools": ("assets/Personal/SFX/Dark Fantasy Studio- Music box/Dark Fantasy Studio- Music box 26.wav", 0.0, 3.5, 0.01, 0.2),
     "wicker": ("assets/Personal/SFX/Dark Fantasy Studio- Dissonant vocals/Dark Fantasy Studio- Dissonant vocals 25.wav", 2.0, 10.7, 0.3, 1.5),
     "horned": ("modules/ember/assets/audio/environment/land-animals-and-beasts/one-shots/strange-beast-3.ogg", 1.4, 6.4, 0.02, 0.5),
     "abbotlong": ("assets/Personal/SFX/monk_darkfantasystudio/Dark Fantasy Studio- Monk 11.wav", 0.3, 9.9, 0.05, 1.2),
     "wings": ("assets/Personal/SFX/dragonwings_darkfantasystudio/NOISE ALCHEMY- DRAGON WINGS 2.wav", 0.0, 2.1, 0.005, 0.3),
     "growl": ("assets/Personal/SFX/Monsters and Beasts Vol 2/Growl.mp3", 0.0, 6.05, 0.3, 1.0),
     "toll": ("assets/Personal/SFX/oldclock_darkfantasystudio/Dark Fantasy Studio- Old Clock 37.wav", 0.0, 2.0, 0.003, 0.4),
     # second wave (DM 2026-09-19): the Trainhopper, the Mayor, Stonoga, Hugo, the White Worm, the Coven, Golub's reveal, the priors
     "ghostly2": ("assets/Personal/SFX/Dark Fantasy Studio- Ghostly/Dark Fantasy Studio-Ghostly 2.wav", 0.0, 3.1, 0.01, 0.4),
     "ghostly4": ("assets/Personal/SFX/Dark Fantasy Studio- Ghostly/Dark Fantasy Studio-Ghostly 4.wav", 0.0, 3.0, 0.01, 0.6),
     "handbell": ("assets/Personal/SFX/Dark Fantasy Studio- Bell/Dark Fantasy Studio- Bell (3).wav", 0.0, 2.1, 0.003, 0.3),
     "festival": ("modules/ember/assets/audio/environment/voices/loops/festival-crowd.ogg", 2.0, 10.7, 0.6, 1.0),
     "scuttlesoft": ("modules/ember/assets/audio/environment/insects-and-minor-animals/loops/spider-scuttling-subtle.ogg", 0.5, 9.2, 0.4, 1.0),
     "witch11": ("assets/Personal/SFX/witch_darkfantasystudio/Dark Fantasy Studio- Witch 11.wav", 0.0, 2.7, 0.02, 0.5),
     "abyss45": ("assets/Personal/SFX/Dark Fantasy Studio- Abyss/Dark Fantasy Studio- Abyss 45.wav", 0.0, 1.9, 0.02, 0.4),
     "abyss12": ("assets/Personal/SFX/Dark Fantasy Studio- Abyss/Dark Fantasy Studio- Abyss 12.wav", 0.0, 2.9, 0.02, 0.5),
     "abyss40": ("assets/Personal/SFX/Dark Fantasy Studio- Abyss/Dark Fantasy Studio- Abyss 40.wav", 0.0, 2.0, 0.05, 0.6),
     "abyss17": ("assets/Personal/SFX/Dark Fantasy Studio- Abyss/Dark Fantasy Studio- Abyss 17.wav", 0.0, 2.9, 0.05, 0.5),
     "abyss16": ("assets/Personal/SFX/Dark Fantasy Studio- Abyss/Dark Fantasy Studio- Abyss 16.wav", 0.0, 2.9, 0.02, 0.5),
     "laugh35": ("assets/Personal/SFX/evillaugh_darkfantasystudio/Dark Fantasy Studio- Evil laugh 35.wav", 0.0, 1.6, 0.005, 0.3),
     "creature4": ("assets/Personal/SFX/Dark Fantasy Studio- Creature/Dark Fantasy Studio- Creature 4.wav", 0.0, 2.1, 0.05, 0.4),
     "wings14": ("assets/Personal/SFX/dragonwings_darkfantasystudio/NOISE ALCHEMY- DRAGON WINGS 14.wav", 0.0, 1.3, 0.005, 0.2),
     "abyss53": ("assets/Personal/SFX/Dark Fantasy Studio- Abyss/Dark Fantasy Studio- Abyss 53.wav", 0.0, 2.0, 0.005, 0.4),
     # third wave (DM 2026-09-19): normal intros, shared banners, allies
     "hellhound": ("modules/monument-studios-sampler/audio/_4 One Shots/_4 Beasts/Hellhound.mp3", 0.0, 2.8, 0.01, 0.4),
     "lament2": ("assets/Personal/SFX/Dark Fantasy Studio- Lamentations/Dark Fantasy Studio- Lamentations 2.wav", 0.0, 8.7, 0.8, 1.2),
     "frogs": ("modules/ember/assets/audio/environment/insects-and-minor-animals/one-shots/strange-frogs.ogg", 2.0, 10.7, 0.8, 1.0),
     "creepy21": ("assets/Personal/SFX/creepyloops_darkfantasystudio/Dark Fantasy Studio- Creepy loops 21.wav", 0.0, 4.1, 0.4, 0.8),
     "murmur": ("modules/ember/assets/audio/environment/voices/loops/crowd-murmur.ogg", 1.0, 9.7, 0.8, 1.0),
     "cookfire": ("modules/mfg-mammoth-chronicles-book-i/assets/audio/sounds/cook fire.mp3", 2.0, 10.7, 0.8, 1.0),
     "cartgrass": ("modules/ember/assets/audio/effects/party/cart-grass.ogg", 0.0, 8.7, 0.8, 1.0),
     "frogsbirds": ("modules/ember/assets/audio/environment/insects-and-minor-animals/one-shots/frogs-and-birds.ogg", 1.0, 9.7, 0.8, 1.0),
     "choir": ("assets/Personal/SFX/SFX/Female Choir Sustain Morph.wav", 0.0, 8.7, 0.8, 1.2),
     "chime36": ("assets/Personal/SFX/oldclock_darkfantasystudio/Dark Fantasy Studio- Old Clock 36.wav", 0.0, 2.0, 0.003, 0.4),
     "footsteps": ("modules/psfx/library/creature/movement/footsteps/outdoors/001/footsteps-sequence-outdoors-001.ogg", 0.0, 2.9, 0.02, 0.4),
     "queen": ("modules/ember/assets/audio/environment/forest-and-jungle/one-shots/deep-tree-creaking-1.ogg", 0.0, 6.4, 0.02, 0.5),
     # fourth wave (DM 2026-09-19): Chuckles' true form, the Horned King's birth
     "swell5": ("assets/Personal/SFX/Dark Fantasy Studio- Ghostly/Dark Fantasy Studio-Ghostly 5.wav", 0.8, 3.0, 0.4, 0.02),
     "laugh23": ("assets/Personal/SFX/evillaugh_darkfantasystudio/Dark Fantasy Studio- Evil laugh 23.wav", 0.0, 1.6, 0.005, 0.3),
     "laugh2": ("assets/Personal/SFX/evillaugh_darkfantasystudio/Dark Fantasy Studio- Evil laugh 2.wav", 0.0, 3.0, 0.005, 0.6),
     "agony16": ("assets/Personal/SFX/Dark Fantasy Studio- Agony/Dark Fantasy Studio- Agony 16.wav", 0.0, 2.2, 0.01, 0.9),
     # fifth wave (DM 2026-09-19): the crow demon and Adelaide, Doctor Belkin, the White Worm's shriek
     "crow4": ("assets/Personal/SFX/crow_darkfantasystudio/Dark Fantasy Studio- Crow 4.wav", 0.0, 1.7, 0.005, 0.2),
     "crow1": ("assets/Personal/SFX/crow_darkfantasystudio/Dark Fantasy Studio- Crow 1.wav", 0.0, 2.1, 0.005, 0.3),
     "umbral1": ("modules/house-divided/assets/audio/sfx/scorncrow/umbral-crow-1.ogg", 0.0, 3.0, 0.05, 0.6),
     "ravenwhirl": ("modules/house-divided/assets/audio/sfx/scorncrow/raven-transformation.ogg", 0.2, 3.4, 0.1, 1.0),
     "laugh6": ("assets/Personal/SFX/evillaugh_darkfantasystudio/Dark Fantasy Studio- Evil laugh 6.wav", 0.0, 1.7, 0.005, 0.3),
     "facility": ("assets/Personal/Music/Horror Audio Bundle/MP3/Ambience/Disturbing Facilities Ambient.mp3", 2.0, 10.7, 0.8, 1.0),
     "glass21": ("assets/Personal/SFX/Dark Fantasy Studio- Broken glass/Dark Fantasy Studio- Broken glass 21.wav", 0.0, 2.4, 0.005, 0.4),
     "smashed13": ("assets/Personal/SFX/smashed_darkfantasystudio/Dark Fantasy Studio- Smashed 13.wav", 0.0, 1.2, 0.005, 0.3),
     "whispers6": ("assets/Personal/SFX/whispers_darkfantasystudio/Dark Fantasy Studio- Whispers 6.wav", 0.0, 2.1, 0.02, 0.4),
     "alien30": ("assets/Personal/SFX/alienvoices_darkfantasystudio/Dark Fantasy Studio- Alien voices-30.wav", 0.7, 2.4, 0.01, 0.5),
     "dragon30": ("assets/Personal/SFX/dragon_darkfantasystudio/Dark Fantasy Studio-Dragon 30.wav", 0.0, 2.1, 0.005, 0.5),
     "alien25": ("assets/Personal/SFX/alienvoices_darkfantasystudio/Dark Fantasy Studio- Alien voices-25.wav", 0.0, 2.3, 0.005, 0.5)}
spec = []
for k, (src, a, b, fi, fo) in W.items():
    assert (D / src).exists(), src
    spec.append({"out": f"snd/{k}.mp3", "src": str(D / src), "start": a, "end": b, "fin": fi, "fout": fo, "rms": -23})
for k, (src, a, b, fi, fo) in L.items():
    assert (D / src).exists(), src
    spec.append({"out": f"snd/{k}.mp3", "src": str(D / src), "start": a, "end": b, "fin": fi, "fout": fo, "rms": -21})
Path("sndspec.json").write_text(json.dumps(spec, indent=1), encoding="utf-8")
print(len(spec), "clips")
