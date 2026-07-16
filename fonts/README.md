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

**Latin subsets only.** Shippori Mincho's full Japanese set is several MB; we render English titles,
so only the Latin subset ships (~28KB). Total for all six: ~114KB.

Refetch with `python tools/fetch_fonts.py`.
