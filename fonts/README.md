# Bundled title fonts

These are the **display faces for theme titles** (`--mc-font-title`, UI-BIBLE §11.3). Foundry's 18
core faces are all Latin text faces, so a blackletter or a mincho simply doesn't exist in core —
hence bundling (DM approved 2026-07-17).

Every one is licensed under the **SIL Open Font License 1.1**, which permits redistribution inside
this module. The full licence text is in [OFL.txt](OFL.txt); the copyright line for each font is
below, as the licence requires.

| File | Family | Used by | Copyright |
|---|---|---|---|
| `UnifrakturMaguntia.woff2` | UnifrakturMaguntia | gothic | Copyright (c) 2010, j. 'mach' wust, with Reserved Font Name UnifrakturMaguntia |
| `GrenzeGotisch.woff2` | Grenze Gotisch | warlock | Copyright 2020 The Grenze Gotisch Project Authors (https://github.com/Omnibus-Type/Grenze-Gotisch) |
| `ShipporiMincho.woff2` | Shippori Mincho | monk | Copyright 2021 The Shippori Mincho Project Authors (https://github.com/fontdasu/ShipporiMincho) |
| `Cinzel.woff2` | Cinzel | cleric, paladin | Copyright 2020 The Cinzel Project Authors (https://github.com/NDISCOVER/Cinzel) |
| `Metamorphous.woff2` | Metamorphous | barbarian | Copyright (c) 2011-2012 by Sorkin Type Co (www.sorkintype.com) |
| `Orbitron.woff2` | Orbitron | artificer | Copyright 2018 The Orbitron Project Authors (https://github.com/theleagueof/orbitron), with Reserved Font Name "Orbitron" |

**The entrance banners' faces** (§40.6 Intros — the Crooked Moon's themed NPC banners; DM approved the download
2026-09-19). Declared in `styles/entrances.css`, which gen_mc.py generates; a browser fetches one only when a
banner uses it, and phones never show banners.

| File | Family | Used by | Copyright |
|---|---|---|---|
| `IMFellEnglish-Italic.woff2`, `IMFellEnglish.woff2` | IM Fell English | every intro's subtitle | Copyright (c) 2010, Igino Marini (mail@iginomarini.com) |
| `IMFellEnglishSC.woff2` | IM Fell English SC | the Crooked Man, the Jenkins | Copyright (c) 2010, Igino Marini (mail@iginomarini.com) |
| `CinzelDecorative.woff2` | Cinzel Decorative | the Crimson Abbot, Sister Rain | Copyright (c) 2012 Natanael Gama (info@ndiscovered.com), with Reserved Font Name 'Cinzel' |
| `Eater.woff2` | Eater | Gorthos | Copyright (c) 2011, Typomondo, with Reserved Font Name "Eater" |
| `Limelight.woff2` | Limelight | Phillip and Adela | Copyright (c) 2011 by Sorkin Type Co (www.sorkintype.com), with Reserved Font Name "Limelight" |
| `PoiretOne.woff2` | Poiret One | Phillip and Adela's subtitle | Copyright 2011 The Poiret One Project Authors (https://github.com/alexeiva/poiretone) |
| `MedievalSharp.woff2` | MedievalSharp | the Crooked Queen | Copyright (c) 2011, wmk69 (wmk69@o2.pl), with Reserved Font Name MedievalSharp |
| `PinyonScript.woff2` | Pinyon Script | Golub, Theodora | Copyright 2024 The Pinyon Project Authors (https://github.com/SorkinType/Pinyon) |
| `PirataOne.woff2` | Pirata One | the Chained Reaper, the Old Ways' keepers | Copyright (c) 2012, Rodrigo Fuenzalida, Nicolas Massi (www.taip.com.ar / abc.taip.com.ar), with Reserved Font Name 'Pirata' |
| `Rye.woff2` | Rye | Chuckles, Vander and Lyla | Copyright (c) 2011 by Sorkin Type Co (www.sorkintype.com), with Reserved Font Name "Rye" |
| `Sacramento.woff2` | Sacramento | the Grinning Sinner, Mister Crossroads | Copyright (c) 2012, Brian J. Bonislawsky DBA Astigmatic (AOETI) (astigma@astigmatic.com), with Reserved Font Names 'Sacramento' |
| `Sancreek.woff2` | Sancreek | Jericho, the farmers | Copyright 2011 The Sancreek Project Authors (https://github.com/googlefonts/sancreek) |
| `UncialAntiqua.woff2` | Uncial Antiqua | Vessla, Stonoga, the Wicker Man | Copyright (c) 2011 by Brian J. Bonislawsky DBA Astigmatic (AOETI) (astigma@astigmatic.com), with Reserved Font Names "Uncial Antiqua" |

**Latin subsets only.** Shippori Mincho's full Japanese set is several MB; we render English titles,
so only the Latin subset ships (~28KB). Total for the six title faces: ~114KB; the banner faces add ~430KB.

Refetch with `python tools/fetch_fonts.py`.
