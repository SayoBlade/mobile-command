// §40.6 THE CROOKED MOON'S ENTRANCES — generated from the reviewed preview page (tools/entrances/gen_mc.py); edit the page's
// sources and regenerate rather than hand-editing, until the DM signs the set off. Book art and library audio are
// referenced by path, never copied. `sound` windows: play `src` from `from` to `to` seconds, starting `at` seconds
// into the entrance, at `gain` (the page's loudness match — can exceed 1). `hold` is when the banner starts to leave.
export const CM_ENTRANCES = [
 {
  "key": "vagrant",
  "short": "Vagrant",
  "name": "The Vagrant",
  "sub": "Just a humble ferryman",
  "classes": "mc-en-t-vagrant",
  "hold": 7100,
  "pause": false,
  "chapter": 10,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_The_Vagrant.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1056/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_The_Vagrant.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "<video class=\"mc-en-mistvid\" src=\"modules/animated-mist-and-fog-by-mattm/animations/mist_thin_horizontal.webm\" muted loop playsinline preload=\"auto\"></video>",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/creepywind_darkfantasystudio/Dark Fantasy Studio- Creepy wind 32.wav",
    "from": 0.1,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 1.0,
    "at": 0,
    "gain": 0.367
   },
   {
    "src": "modules/ember/assets/audio/music/lyla-theme/solo-violin-melody.ogg",
    "from": 0.6,
    "to": 9.3,
    "fadeIn": 0.05,
    "fadeOut": 1.0,
    "at": 0.25,
    "gain": 1.526
   }
  ],
  "match": [
   "Vagrant"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "druskenvald",
  "short": "The couple",
  "name": "Phillip & Adela",
  "sub": "The swellest couple aboard",
  "classes": "mc-en-t-druskenvald",
  "hold": 7100,
  "pause": false,
  "chapter": 10,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Adela_Druskenvald.webp",
  "art": "<span class=\"mc-en-pairbox\"><span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:541/1200;--ch:100.000%;--cw:100.555%;--cl:-0.555%;--ct:-0.000%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Adela_Druskenvald.webp\" alt=\"\"></span></span><span class=\"mc-en-pairbox\"><span class=\"mc-en-crop\" style=\"aspect-ratio:559/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Phillip_Druskenvald.webp\" alt=\"\"></span></span>",
  "pair": true,
  "weather": "<span class=\"mc-en-dot mc-en-tw\" style=\"--i:0;--x:58%;--y:18cqh;--c:#f3d993;--sz:.55cqh\"></span><span class=\"mc-en-dot mc-en-tw\" style=\"--i:1;--x:64%;--y:34cqh;--c:#f3d993;--sz:.55cqh\"></span><span class=\"mc-en-dot mc-en-tw\" style=\"--i:2;--x:71%;--y:12cqh;--c:#f3d993;--sz:.55cqh\"></span><span class=\"mc-en-dot mc-en-tw\" style=\"--i:3;--x:80%;--y:28cqh;--c:#f3d993;--sz:.55cqh\"></span><span class=\"mc-en-dot mc-en-tw\" style=\"--i:4;--x:88%;--y:40cqh;--c:#f3d993;--sz:.55cqh\"></span>",
  "extra": "",
  "sound": [
   {
    "src": "modules/mobile-command/sounds/entrances/swing.mp3",
    "from": 0,
    "to": 8.8,
    "fadeIn": 0,
    "fadeOut": 0.6,
    "at": 0.1,
    "gain": 0.567
   }
  ],
  "match": [
   "Phillip Druskenvald",
   "Adela Druskenvald"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "trainhopper",
  "short": "Trainhopper",
  "name": "The Phantom Trainhopper",
  "sub": "",
  "classes": "mc-en-t-trainhopper",
  "hold": 7100,
  "pause": true,
  "chapter": 10,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_The_Phantom_Trainhopper.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:961/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_The_Phantom_Trainhopper.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_The_Phantom_Trainhopper.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "<div class=\"mc-en-halo\" style=\"right:calc(11cqw + 6cqh);top:10cqh;width:46cqh;height:46cqh\"></div><span class=\"mc-en-dot mc-en-up\" style=\"--i:0;--x:62%;--y:56cqh;--c:#6dffb8;--sz:.5cqh;--t:3.2s\"></span><span class=\"mc-en-dot mc-en-up\" style=\"--i:1;--x:70%;--y:60cqh;--c:#6dffb8;--sz:.5cqh;--t:3.2s\"></span><span class=\"mc-en-dot mc-en-up\" style=\"--i:2;--x:77%;--y:54cqh;--c:#6dffb8;--sz:.5cqh;--t:3.2s\"></span><span class=\"mc-en-dot mc-en-up\" style=\"--i:3;--x:84%;--y:58cqh;--c:#6dffb8;--sz:.5cqh;--t:3.2s\"></span><span class=\"mc-en-dot mc-en-up\" style=\"--i:4;--x:90%;--y:52cqh;--c:#6dffb8;--sz:.5cqh;--t:3.2s\"></span>",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/creepywind_darkfantasystudio/Dark Fantasy Studio- Creepy wind 32.wav",
    "from": 0.1,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 1.0,
    "at": 0,
    "gain": 0.367
   },
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Ghostly/Dark Fantasy Studio-Ghostly 2.wav",
    "from": 0.0,
    "to": 3.1,
    "fadeIn": 0.01,
    "fadeOut": 0.4,
    "at": 0.25,
    "gain": 0.308
   },
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Ghostly/Dark Fantasy Studio-Ghostly 4.wav",
    "from": 0.0,
    "to": 3.0,
    "fadeIn": 0.01,
    "fadeOut": 0.6,
    "at": 1.6,
    "gain": 0.444
   }
  ],
  "match": [
   "Trainhopper"
  ],
  "appears": false,
  "reveal": true
 },
 {
  "key": "g-the-daydreamer",
  "short": "Daydreamer",
  "name": "The Daydreamer",
  "sub": "",
  "classes": "mc-en-t-generic mc-en-g-neutral",
  "hold": 7100,
  "pause": false,
  "chapter": 10,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_The_Daydreamer.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1046/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_The_Daydreamer.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_The_Daydreamer.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Daydreamer"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-the-harlequin",
  "short": "Harlequin",
  "name": "The Harlequin",
  "sub": "",
  "classes": "mc-en-t-generic mc-en-g-neutral",
  "hold": 7100,
  "pause": false,
  "chapter": 10,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_The_Harlequin.webp",
  "art": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:1118/1198;--ch:100.167%;--cw:100.000%;--cl:-0.000%;--ct:-0.167%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_The_Harlequin.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_The_Harlequin.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Harlequin"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-the-jailbird",
  "short": "Jailbird",
  "name": "The Jailbird",
  "sub": "",
  "classes": "mc-en-t-generic mc-en-g-neutral",
  "hold": 7100,
  "pause": false,
  "chapter": 10,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_The_Jailbird.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:989/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_The_Jailbird.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_The_Jailbird.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Jailbird"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-the-mariner",
  "short": "Mariner",
  "name": "The Mariner",
  "sub": "",
  "classes": "mc-en-t-generic mc-en-g-neutral",
  "hold": 7100,
  "pause": false,
  "chapter": 10,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_The_Mariner.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:764/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_The_Mariner.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_The_Mariner.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Mariner"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-the-songstress",
  "short": "Songstress",
  "name": "The Songstress",
  "sub": "",
  "classes": "mc-en-t-generic mc-en-g-neutral",
  "hold": 7100,
  "pause": false,
  "chapter": 10,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_The_Songstress.webp",
  "art": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:1013/1191;--ch:100.756%;--cw:100.790%;--cl:-0.099%;--ct:-0.000%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_The_Songstress.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_The_Songstress.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Songstress"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-the-lady-with-the-locket",
  "short": "Locket lady",
  "name": "The lady with the locket",
  "sub": "",
  "classes": "mc-en-t-generic mc-en-g-neutral",
  "hold": 7100,
  "pause": false,
  "chapter": 10,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_The_Sweetheart.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:966/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_The_Sweetheart.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_The_Sweetheart.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "lady with the locket"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "mayor",
  "short": "The Mayor",
  "name": "Wendel Somerton",
  "sub": "Mayor of Wickermoor Village",
  "classes": "mc-en-t-mayor",
  "hold": 7100,
  "pause": false,
  "chapter": 11,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Mayor_Wendel_Somerton.webp",
  "art": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:1032/1199;--ch:100.083%;--cw:100.000%;--cl:-0.000%;--ct:-0.000%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Mayor_Wendel_Somerton.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "<span class=\"mc-en-dot mc-en-tw\" style=\"--i:0;--x:56%;--y:16cqh;--c:#ffd28a;--sz:.55cqh\"></span><span class=\"mc-en-dot mc-en-tw\" style=\"--i:1;--x:63%;--y:30cqh;--c:#ffd28a;--sz:.55cqh\"></span><span class=\"mc-en-dot mc-en-tw\" style=\"--i:2;--x:88%;--y:14cqh;--c:#ffd28a;--sz:.55cqh\"></span><span class=\"mc-en-dot mc-en-tw\" style=\"--i:3;--x:92%;--y:34cqh;--c:#ffd28a;--sz:.55cqh\"></span>",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Bell/Dark Fantasy Studio- Bell (3).wav",
    "from": 0.0,
    "to": 2.1,
    "fadeIn": 0.003,
    "fadeOut": 0.3,
    "at": 0.15,
    "gain": 0.466
   },
   {
    "src": "modules/ember/assets/audio/environment/voices/loops/festival-crowd.ogg",
    "from": 2.0,
    "to": 10.7,
    "fadeIn": 0.6,
    "fadeOut": 1.0,
    "at": 0.3,
    "gain": 1.349
   }
  ],
  "match": [
   "Wendel Somerton"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "theodora0",
  "short": "Theodora",
  "name": "Theodora Mayville",
  "sub": "Postmaster of Wickermoor Village",
  "classes": "mc-en-t-postmaster",
  "hold": 7100,
  "pause": false,
  "chapter": 11,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Theodora_Mayville.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1146/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Theodora_Mayville.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Bell/Dark Fantasy Studio- Bell (3).wav",
    "from": 0.0,
    "to": 2.1,
    "fadeIn": 0.003,
    "fadeOut": 0.3,
    "at": 0.2,
    "gain": 0.466
   },
   {
    "src": "modules/ember/assets/audio/environment/birds-and-winged-creatures/loops/flapping-wings.ogg",
    "from": 2.5,
    "to": 11.2,
    "fadeIn": 0.5,
    "fadeOut": 1.0,
    "at": 0.6,
    "gain": 1.579
   }
  ],
  "match": [
   "Theodora"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "law",
  "short": "The Law",
  "name": "Constable Squire & Deputy Butterman",
  "sub": "The law in Wickermoor Village",
  "classes": "mc-en-t-law",
  "hold": 7100,
  "pause": false,
  "chapter": 11,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Doris_Squire.webp",
  "art": "<span class=\"mc-en-pairbox\"><span class=\"mc-en-crop\" style=\"aspect-ratio:999/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Doris_Squire.webp\" alt=\"\"></span></span><span class=\"mc-en-pairbox\"><span class=\"mc-en-crop\" style=\"aspect-ratio:848/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Howie_Butterman.webp\" alt=\"\"></span></span>",
  "pair": true,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Bell/Dark Fantasy Studio- Bell (3).wav",
    "from": 0.0,
    "to": 2.1,
    "fadeIn": 0.003,
    "fadeOut": 0.3,
    "at": 0.2,
    "gain": 0.408
   },
   {
    "src": "modules/ember/assets/audio/environment/voices/loops/crowd-murmur.ogg",
    "from": 1.0,
    "to": 9.7,
    "fadeIn": 0.8,
    "fadeOut": 1.0,
    "at": 0.3,
    "gain": 1.657
   }
  ],
  "match": [
   "Doris Squire",
   "Howie Butterman"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "rain",
  "short": "Sister Rain",
  "name": "Sister Rain",
  "sub": "Preacher of the Patient Lady",
  "classes": "mc-en-t-rain",
  "hold": 7100,
  "pause": false,
  "chapter": 11,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Sister_Rain.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:933/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Sister_Rain.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "<div class=\"mc-en-halo\" style=\"right:calc(9cqw + 6cqh);top:6cqh;width:46cqh;height:46cqh\"></div>",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/SFX/Female Choir Sustain Morph.wav",
    "from": 0.0,
    "to": 8.7,
    "fadeIn": 0.8,
    "fadeOut": 1.2,
    "at": 0.3,
    "gain": 4.564
   }
  ],
  "match": [
   "Sister Rain"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "weston",
  "short": "Weston",
  "name": "Weston Murdoch",
  "sub": "Brightsinger pilgrim at the Abandoned Church",
  "classes": "mc-en-t-weston",
  "hold": 7100,
  "pause": false,
  "chapter": 11,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Weston_Murdoch.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:884/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Weston_Murdoch.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "<div class=\"mc-en-halo\" style=\"right:calc(9cqw + 6cqh);top:6cqh;width:46cqh;height:46cqh\"></div>",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/oldclock_darkfantasystudio/Dark Fantasy Studio- Old Clock 36.wav",
    "from": 0.0,
    "to": 2.0,
    "fadeIn": 0.003,
    "fadeOut": 0.4,
    "at": 0.3,
    "gain": 0.765
   },
   {
    "src": "assets/Personal/SFX/SFX/Female Choir Sustain Morph.wav",
    "from": 0.0,
    "to": 8.7,
    "fadeIn": 0.8,
    "fadeOut": 1.2,
    "at": 0.6,
    "gain": 2.13
   }
  ],
  "match": [
   "Weston Murdoch"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "rusty",
  "short": "Old Rusty",
  "name": "Old Rusty",
  "sub": "Groundskeeper of Wickermoor Village",
  "classes": "mc-en-t-rusty",
  "hold": 7100,
  "pause": false,
  "chapter": 11,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Old_Rusty.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1070/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Old_Rusty.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "modules/psfx/library/creature/movement/footsteps/outdoors/001/footsteps-sequence-outdoors-001.ogg",
    "from": 0.0,
    "to": 2.9,
    "fadeIn": 0.02,
    "fadeOut": 0.4,
    "at": 0.2,
    "gain": 1.732
   }
  ],
  "match": [
   "Old Rusty"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "mori",
  "short": "Mori Shade",
  "name": "Mori Shade",
  "sub": "Undertaker at Shade Funeral Home",
  "classes": "mc-en-t-mori",
  "hold": 7100,
  "pause": false,
  "chapter": 11,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Mori_Shade.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:766/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Mori_Shade.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/oldclock_darkfantasystudio/Dark Fantasy Studio- Old Clock 37.wav",
    "from": 0.0,
    "to": 2.0,
    "fadeIn": 0.003,
    "fadeOut": 0.4,
    "at": 0.3,
    "gain": 0.645
   }
  ],
  "match": [
   "Mori Shade"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-alda-farnum",
  "short": "Alda Farnum",
  "name": "Alda Farnum",
  "sub": "Innkeeper of the Green Queen Inn",
  "classes": "mc-en-t-generic mc-en-g-neutral",
  "hold": 7100,
  "pause": false,
  "chapter": 11,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Alda_Farnum.webp",
  "art": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:888/1196;--ch:100.334%;--cw:100.000%;--cl:-0.000%;--ct:-0.000%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Alda_Farnum.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Alda_Farnum.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Alda Farnum"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-baltus-tolliver",
  "short": "Baltus",
  "name": "Baltus Tolliver",
  "sub": "Owner of Tolliver's Trading Post",
  "classes": "mc-en-t-generic mc-en-g-neutral",
  "hold": 7100,
  "pause": false,
  "chapter": 11,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Baltus_Tolliver.webp",
  "art": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:850/1200;--ch:100.000%;--cw:101.294%;--cl:-0.000%;--ct:-0.000%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Baltus_Tolliver.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Baltus_Tolliver.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Baltus Tolliver"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-beatrice-wells",
  "short": "Beatrice",
  "name": "Beatrice Wells",
  "sub": "Carpenter of Wickermoor Village",
  "classes": "mc-en-t-generic mc-en-g-neutral",
  "hold": 7100,
  "pause": false,
  "chapter": 11,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Beatrice_Fallowfield.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:880/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Beatrice_Fallowfield.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Beatrice_Fallowfield.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Beatrice Wells"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-constable-doris-squire",
  "short": "Constable",
  "name": "Constable Doris Squire",
  "sub": "Keeps the law in Wickermoor Village",
  "classes": "mc-en-t-generic mc-en-g-neutral",
  "hold": 7100,
  "pause": false,
  "chapter": 11,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Doris_Squire.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:999/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Doris_Squire.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Doris_Squire.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Constable Doris Squire"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-deputy-howie-butterman",
  "short": "Deputy",
  "name": "Deputy Howie Butterman",
  "sub": "Serves under Constable Doris Squire",
  "classes": "mc-en-t-generic mc-en-g-friend",
  "hold": 7100,
  "pause": false,
  "chapter": 11,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Howie_Butterman.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:848/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Howie_Butterman.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Howie_Butterman.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Deputy Howie Butterman"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-eleanor-heyling",
  "short": "Eleanor",
  "name": "Eleanor Heyling",
  "sub": "Bookseller of Wickermoor Village",
  "classes": "mc-en-t-generic mc-en-g-neutral",
  "hold": 7100,
  "pause": false,
  "chapter": 11,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Eleanor_Heyling.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1023/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Eleanor_Heyling.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Eleanor_Heyling.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Eleanor Heyling"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-finneas-trout",
  "short": "Finneas",
  "name": "Finneas Trout",
  "sub": "Schoolteacher of Wickermoor Village",
  "classes": "mc-en-t-generic mc-en-g-neutral",
  "hold": 7100,
  "pause": false,
  "chapter": 11,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Finneas_Trout.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:723/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Finneas_Trout.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Finneas_Trout.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Finneas Trout"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-gaston-doray",
  "short": "Gaston Doray",
  "name": "Gaston Doray",
  "sub": "Painter in Wickermoor Village",
  "classes": "mc-en-t-generic mc-en-g-neutral",
  "hold": 7100,
  "pause": false,
  "chapter": 11,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Gaston_Doray.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1061/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Gaston_Doray.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Gaston_Doray.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Gaston Doray"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-hilda-brom",
  "short": "Hilda Brom",
  "name": "Hilda Brom",
  "sub": "Huntress of Wickermoor Hollow",
  "classes": "mc-en-t-generic mc-en-g-neutral",
  "hold": 7100,
  "pause": false,
  "chapter": 11,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Hilda_Brom.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:981/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Hilda_Brom.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Hilda_Brom.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Hilda Brom"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-holly-aster",
  "short": "Holly Aster",
  "name": "Holly Aster",
  "sub": "Baker of Wickermoor Village",
  "classes": "mc-en-t-generic mc-en-g-neutral",
  "hold": 7100,
  "pause": false,
  "chapter": 11,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Holly_Aster.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:797/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Holly_Aster.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Holly_Aster.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Holly Aster"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-jean-myriel",
  "short": "Jean Myriel",
  "name": "Jean Myriel",
  "sub": "Blacksmith of Wickermoor Village",
  "classes": "mc-en-t-generic mc-en-g-neutral",
  "hold": 7100,
  "pause": false,
  "chapter": 11,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Jean_Myriel.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1200/1156\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Jean_Myriel.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Jean_Myriel.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Jean Myriel"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-jeremiah-stover",
  "short": "Jeremiah",
  "name": "Jeremiah Stover",
  "sub": "Spokesman for the village farmers",
  "classes": "mc-en-t-generic mc-en-g-friend",
  "hold": 7100,
  "pause": false,
  "chapter": 11,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Jeremiah_Stover.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1008/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Jeremiah_Stover.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Jeremiah_Stover.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Jeremiah Stover"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-marianna-grey",
  "short": "Marianna",
  "name": "Marianna Grey",
  "sub": "Stablemistress at the Green Queen Inn",
  "classes": "mc-en-t-generic mc-en-g-neutral",
  "hold": 7100,
  "pause": false,
  "chapter": 11,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Mariana_Grey.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:953/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Mariana_Grey.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Mariana_Grey.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Marianna Grey"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-morgan",
  "short": "Morgan",
  "name": "Morgan",
  "sub": "Apothecary of Wickermoor Village",
  "classes": "mc-en-t-generic mc-en-g-friend",
  "hold": 7100,
  "pause": false,
  "chapter": 11,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Morgan.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:913/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Morgan.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Morgan.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Morgan"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-oswick-frey",
  "short": "Oswick Frey",
  "name": "Oswick Frey",
  "sub": "Candlemaker at the Wickery",
  "classes": "mc-en-t-generic mc-en-g-friend",
  "hold": 7100,
  "pause": false,
  "chapter": 11,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Oswick_Frey.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:853/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Oswick_Frey.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Oswick_Frey.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Oswick Frey"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-randall-graham",
  "short": "Randall",
  "name": "Randall Graham",
  "sub": "Barber-surgeon of Wickermoor Village",
  "classes": "mc-en-t-generic mc-en-g-friend",
  "hold": 7100,
  "pause": false,
  "chapter": 11,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Randall_Graham.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:734/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Randall_Graham.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Randall_Graham.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Randall Graham"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-siv-harga",
  "short": "Siv Harga",
  "name": "Siv Harga",
  "sub": "Butcher at Harga's Meats",
  "classes": "mc-en-t-generic mc-en-g-neutral",
  "hold": 7100,
  "pause": false,
  "chapter": 11,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Siv_Harga.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:856/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Siv_Harga.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Siv_Harga.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Siv Harga"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-solomon-roderick",
  "short": "Solomon",
  "name": "Solomon Roderick",
  "sub": "Stonemason at Roderick Masonry",
  "classes": "mc-en-t-generic mc-en-g-neutral",
  "hold": 7100,
  "pause": false,
  "chapter": 11,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Solomon_Roderick.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:619/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Solomon_Roderick.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Solomon_Roderick.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Solomon Roderick"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-thomasin-ardor",
  "short": "Thomasin",
  "name": "Thomasin Ardor",
  "sub": "Tailor at A Stitch in Time",
  "classes": "mc-en-t-generic mc-en-g-neutral",
  "hold": 7100,
  "pause": false,
  "chapter": 11,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Thomasin_Ardor.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1110/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Thomasin_Ardor.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Thomasin_Ardor.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Thomasin Ardor"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "jenkins",
  "short": "The Jenkins",
  "name": "The Jenkin family",
  "sub": "Caretakers of the Druskenvald Estate",
  "classes": "mc-en-t-jenkins",
  "hold": 7100,
  "pause": false,
  "chapter": 12,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Dani_Jenkin.webp",
  "art": "<span class=\"mc-en-pairbox\"><span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:1080/1199;--ch:100.083%;--cw:100.000%;--cl:-0.000%;--ct:-0.000%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Dani_Jenkin.webp\" alt=\"\"></span></span><span class=\"mc-en-pairbox\"><span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:1062/1200;--ch:100.000%;--cw:100.094%;--cl:-0.000%;--ct:-0.000%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Gilly_Jenkin.webp\" alt=\"\"></span></span><span class=\"mc-en-pairbox\"><span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:898/1195;--ch:100.418%;--cw:100.557%;--cl:-0.111%;--ct:-0.000%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Walter_Jenkin.webp\" alt=\"\"></span></span>",
  "pair": true,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "modules/mfg-mammoth-chronicles-book-i/assets/audio/sounds/cook fire.mp3",
    "from": 2.0,
    "to": 10.7,
    "fadeIn": 0.8,
    "fadeOut": 1.0,
    "at": 0.2,
    "gain": 1.707
   }
  ],
  "match": [
   "Walter Jenkin",
   "Gilly Jenkin",
   "Dani Jenkin"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "vessla",
  "short": "Vessla",
  "name": "Vessla Browntooth",
  "sub": "",
  "classes": "mc-en-t-vessla",
  "hold": 7100,
  "pause": true,
  "chapter": 12,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Vessla_Browntooth.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:929/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Vessla_Browntooth.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Vessla_Browntooth.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "<img class=\"mc-en-sprite mc-en-scurry\" src=\"modules/the-crooked-moon-2014/assets/art/art book/Holly_DECO_Weasel 01.webp\" alt=\"\">",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.369
   },
   {
    "src": "modules/ember/assets/audio/environment/insects-and-minor-animals/loops/spider-scuttling-active.ogg",
    "from": 4.5,
    "to": 13.2,
    "fadeIn": 0.5,
    "fadeOut": 1.0,
    "at": 0.25,
    "gain": 1.128
   }
  ],
  "match": [
   "Vessla"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "boogle",
  "short": "Boogleswarm",
  "name": "The Boogleswarm",
  "sub": "",
  "classes": "mc-en-t-boogle",
  "hold": 7100,
  "pause": true,
  "chapter": 12,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art monster/MONSTER_Boogleswarm.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1200/640\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/MONSTER_Boogleswarm.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art monster/MONSTER_Boogleswarm.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "<img class=\"mc-en-sprite mc-en-scurry\" src=\"modules/the-crooked-moon-2014/assets/art/art book/Holly_DECO_Weasel 01.webp\" alt=\"\">",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.369
   },
   {
    "src": "modules/pf2e-beginner-box/assets/audio/fx/the-rats-on-fire.ogg",
    "from": 4.5,
    "to": 13.2,
    "fadeIn": 0.5,
    "fadeOut": 1.0,
    "at": 0.25,
    "gain": 1.255
   },
   {
    "src": "assets/Personal/SFX/whispers_darkfantasystudio/Dark Fantasy Studio- Whispers 33.wav",
    "from": 0.0,
    "to": 2.1,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 3.2,
    "gain": 0.44
   }
  ],
  "match": [
   "Boogleswarm",
   "Boogle Swarm",
   "Boogleswarms"
  ],
  "appears": true,
  "reveal": false
 },
 {
  "key": "wisp",
  "short": "Wisp",
  "name": "Wisp",
  "sub": "There's something off about that cat",
  "classes": "mc-en-t-wisp",
  "hold": 7100,
  "pause": true,
  "chapter": 12,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art monster/MONSTER_Ketgrin.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1200/829\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/MONSTER_Ketgrin.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art monster/MONSTER_Ketgrin.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.369
   },
   {
    "src": "assets/Personal/Music/Horror Audio Bundle/MP3/FX/Misc/Creepy Cat.mp3",
    "from": 0.0,
    "to": 1.5,
    "fadeIn": 0.02,
    "fadeOut": 1.0,
    "at": 0.35,
    "gain": 0.523
   },
   {
    "src": "assets/Personal/SFX/whispers_darkfantasystudio/Dark Fantasy Studio- Whispers 44.wav",
    "from": 0.0,
    "to": 2.1,
    "fadeIn": 0.02,
    "fadeOut": 0.55,
    "at": 1.9,
    "gain": 0.623
   }
  ],
  "match": [
   "Wisp",
   "Ketgrin"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "lurker",
  "short": "The Lurker",
  "name": "The Lurker in the Dark",
  "sub": "",
  "classes": "mc-en-t-lurker",
  "hold": 7100,
  "pause": true,
  "chapter": 12,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art monster/MONSTER_Lurker_in_the_Dark.webp",
  "art": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:1171/1200;--ch:100.000%;--cw:100.683%;--cl:-0.683%;--ct:-0.000%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/MONSTER_Lurker_in_the_Dark.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art monster/MONSTER_Lurker_in_the_Dark.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "<div class=\"mc-en-flash\"></div>",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.369
   },
   {
    "src": "assets/Personal/SFX/jumpscare_darkfantasystudio/Dark Fantasy Studio- Jump scare 50.wav",
    "from": 0.0,
    "to": 2.4,
    "fadeIn": 0.01,
    "fadeOut": 0.8,
    "at": 0.33,
    "gain": 0.233
   },
   {
    "src": "assets/Personal/SFX/whispers_darkfantasystudio/Dark Fantasy Studio- Whispers 44.wav",
    "from": 0.0,
    "to": 2.1,
    "fadeIn": 0.02,
    "fadeOut": 0.55,
    "at": 2.2,
    "gain": 0.534
   }
  ],
  "match": [
   "Lurker in the Dark",
   "Lurker"
  ],
  "appears": false,
  "reveal": false,
  "tokenFlash": {
   "at": 330,
   "ms": 1600,
   "curve": [
    [
     0,
     0
    ],
    [
     0.041,
     0.8
    ],
    [
     0.096,
     0.06
    ],
    [
     0.151,
     0.55
    ],
    [
     0.275,
     0.22
    ],
    [
     0.688,
     0.22
    ],
    [
     1,
     0
    ]
   ]
  }
 },
 {
  "key": "monweasel",
  "short": "Big weasel",
  "name": "A Monstrous Weasel",
  "sub": "",
  "classes": "mc-en-t-monweasel",
  "hold": 7100,
  "pause": true,
  "chapter": 12,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art monster/MONSTER_Vermin_Familiar_Weasel.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1200/1049\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/MONSTER_Vermin_Familiar_Weasel.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art monster/MONSTER_Vermin_Familiar_Weasel.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "<img class=\"mc-en-sprite mc-en-scurry\" src=\"modules/the-crooked-moon-2014/assets/art/art book/Holly_DECO_Weasel 01.webp\" alt=\"\">",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.369
   },
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Creature/Dark Fantasy Studio- Creature 16.wav",
    "from": 0.0,
    "to": 2.1,
    "fadeIn": 0.02,
    "fadeOut": 0.9,
    "at": 0.3,
    "gain": 1.325
   },
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Rip/Dark Fantasy Studio- Rip 10.wav",
    "from": 0.0,
    "to": 1.4,
    "fadeIn": 0.01,
    "fadeOut": 0.75,
    "at": 1.6,
    "gain": 0.635
   }
  ],
  "match": [
   "Filthy Jasper",
   "Vermin Familiar"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "toys",
  "short": "Playthings",
  "name": "The Playthings",
  "sub": "Three toys, and none of them are still",
  "classes": "mc-en-t-toys",
  "hold": 8200,
  "pause": true,
  "chapter": 12,
  "portrait": "mc-portraits/nursery/raven.webp",
  "art": "<span class=\"mc-en-pairbox\"><span class=\"mc-en-crop\" style=\"aspect-ratio:895/779\"><img src=\"mc-portraits/nursery/raven.webp\" alt=\"\"></span></span><span class=\"mc-en-pairbox\"><span class=\"mc-en-crop\" style=\"aspect-ratio:814/866\"><img src=\"mc-portraits/nursery/goat.webp\" alt=\"\"></span></span><span class=\"mc-en-pairbox\"><span class=\"mc-en-crop\" style=\"aspect-ratio:587/865\"><img src=\"mc-portraits/nursery/bunny.webp\" alt=\"\"></span></span>",
  "pair": true,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/Music/Horror Audio Bundle/MP3/Ambience/Dead Children Ambient.mp3",
    "from": 6.0,
    "to": 14.6,
    "fadeIn": 1.0,
    "fadeOut": 1.6,
    "at": 0.0,
    "gain": 0.952,
    "stream": true
   },
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Music box/Dark Fantasy Studio- Music box 12.wav",
    "from": 0.0,
    "to": 4.0,
    "fadeIn": 0.05,
    "fadeOut": 1.2,
    "at": 0.0,
    "gain": 0.468
   },
   {
    "src": "assets/Personal/Music/Horror Audio Bundle/MP3/FX/Misc/Creepy Crow.mp3",
    "from": 0.0,
    "to": 1.2,
    "fadeIn": 0.005,
    "fadeOut": 0.25,
    "at": 0.25,
    "gain": 0.532
   },
   {
    "src": "assets/Personal/Music/Western Audio Bundle/MP3/FX/Animals/Sheep 2.mp3",
    "from": 0.05,
    "to": 1.2,
    "fadeIn": 0.005,
    "fadeOut": 0.3,
    "at": 1.55,
    "gain": 0.612
   },
   {
    "src": "modules/ember/assets/audio/environment/voices/one-shots/children-playing-2.ogg",
    "from": 7.9,
    "to": 9.5,
    "fadeIn": 0.08,
    "fadeOut": 0.5,
    "at": 2.85,
    "gain": 0.913
   }
  ],
  "match": [
   "Crow",
   "Goat",
   "Bunny"
  ],
  "appears": false,
  "reveal": false,
  "tokenFlash": {
   "at": 4600,
   "ms": 1600,
   "curve": [
    [
     0,
     0
    ],
    [
     0.041,
     0.8
    ],
    [
     0.096,
     0.06
    ],
    [
     0.151,
     0.55
    ],
    [
     0.275,
     0.22
    ],
    [
     0.688,
     0.22
    ],
    [
     1,
     0
    ]
   ]
  },
  "troop": [
   {
    "at": 0.25,
    "match": [
     "Crow"
    ]
   },
   {
    "at": 1.55,
    "match": [
     "Goat"
    ]
   },
   {
    "at": 2.85,
    "match": [
     "Bunny"
    ]
   }
  ],
  "fx": [
   {
    "id": "lightning",
    "at": 4.6
   }
  ]
 },
 {
  "key": "crooked",
  "short": "Crooked Man",
  "name": "The Crooked Man",
  "sub": "",
  "classes": "mc-en-t-crooked",
  "hold": 7100,
  "pause": true,
  "chapter": 12,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_The_Crooked_Man.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:846/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_The_Crooked_Man.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "<div class=\"mc-en-rain\"><i></i><i></i></div>",
  "extra": "<div class=\"mc-en-flash\"></div>",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.369
   },
   {
    "src": "modules/ambiences-vol-7-michael-ghelfi/shortloops/Rain (Interior Perspective).ogg",
    "from": 4.2,
    "to": 12.9,
    "fadeIn": 0.4,
    "fadeOut": 1.0,
    "at": 0.25,
    "gain": 5.328,
    "stream": true
   }
  ],
  "match": [
   "Crooked Man"
  ],
  "appears": true,
  "reveal": false,
  "tokenFlash": {
   "at": 330,
   "ms": 1600,
   "curve": [
    [
     0,
     0
    ],
    [
     0.041,
     0.8
    ],
    [
     0.096,
     0.06
    ],
    [
     0.151,
     0.55
    ],
    [
     0.275,
     0.22
    ],
    [
     0.688,
     0.22
    ],
    [
     1,
     0
    ]
   ]
  }
 },
 {
  "key": "g-dani-jenkin",
  "short": "Dani Jenkin",
  "name": "Dani Jenkin",
  "sub": "",
  "classes": "mc-en-t-generic mc-en-g-friend",
  "hold": 7100,
  "pause": false,
  "chapter": 12,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Dani_Jenkin.webp",
  "art": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:1080/1199;--ch:100.083%;--cw:100.000%;--cl:-0.000%;--ct:-0.000%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Dani_Jenkin.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Dani_Jenkin.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Dani Jenkin"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-gilly-jenkin",
  "short": "Gilly Jenkin",
  "name": "Gilly Jenkin",
  "sub": "Caretaker of the Druskenvald Estate",
  "classes": "mc-en-t-generic mc-en-g-friend",
  "hold": 7100,
  "pause": false,
  "chapter": 12,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Gilly_Jenkin.webp",
  "art": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:1062/1200;--ch:100.000%;--cw:100.094%;--cl:-0.000%;--ct:-0.000%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Gilly_Jenkin.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Gilly_Jenkin.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Gilly Jenkin"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-walter-jenkin",
  "short": "Walter",
  "name": "Walter Jenkin",
  "sub": "Butler of the Druskenvald Estate",
  "classes": "mc-en-t-generic mc-en-g-friend",
  "hold": 7100,
  "pause": false,
  "chapter": 12,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Walter_Jenkin.webp",
  "art": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:898/1195;--ch:100.418%;--cw:100.557%;--cl:-0.111%;--ct:-0.000%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Walter_Jenkin.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Walter_Jenkin.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Walter Jenkin"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "farmers",
  "short": "Farmers",
  "name": "Jeremiah Stover & William Lodge",
  "sub": "Farmers seeking help for Foxwillow",
  "classes": "mc-en-t-farmers",
  "hold": 7100,
  "pause": false,
  "chapter": 13,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Jeremiah_Stover.webp",
  "art": "<span class=\"mc-en-pairbox\"><span class=\"mc-en-crop\" style=\"aspect-ratio:1008/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Jeremiah_Stover.webp\" alt=\"\"></span></span><span class=\"mc-en-pairbox\"><span class=\"mc-en-crop\" style=\"aspect-ratio:898/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_William_Lodge.webp\" alt=\"\"></span></span>",
  "pair": true,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "modules/ember/assets/audio/effects/party/cart-grass.ogg",
    "from": 0.0,
    "to": 8.7,
    "fadeIn": 0.8,
    "fadeOut": 1.0,
    "at": 0.1,
    "gain": 0.76
   }
  ],
  "match": [
   "Jeremiah Stover",
   "William Lodge"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "jericho",
  "short": "Jericho",
  "name": "The Scarecrow",
  "sub": "",
  "classes": "mc-en-t-jericho",
  "hold": 7100,
  "pause": false,
  "chapter": 13,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Raum_and_Jericho.webp",
  "art": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:501/888;--ch:135.135%;--cw:178.643%;--cl:-78.643%;--ct:-0.000%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Raum_and_Jericho.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "<span class=\"mc-en-dot mc-en-tw\" style=\"--i:0;--x:14%;--y:30cqh;--c:#e3ff8a;--sz:.6cqh\"></span><span class=\"mc-en-dot mc-en-tw\" style=\"--i:1;--x:26%;--y:46cqh;--c:#e3ff8a;--sz:.6cqh\"></span><span class=\"mc-en-dot mc-en-tw\" style=\"--i:2;--x:39%;--y:22cqh;--c:#e3ff8a;--sz:.6cqh\"></span><span class=\"mc-en-dot mc-en-tw\" style=\"--i:3;--x:52%;--y:40cqh;--c:#e3ff8a;--sz:.6cqh\"></span><span class=\"mc-en-dot mc-en-tw\" style=\"--i:4;--x:60%;--y:14cqh;--c:#e3ff8a;--sz:.6cqh\"></span><span class=\"mc-en-dot mc-en-tw\" style=\"--i:5;--x:8%;--y:52cqh;--c:#e3ff8a;--sz:.6cqh\"></span>",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/creepywind_darkfantasystudio/Dark Fantasy Studio- Creepy wind 32.wav",
    "from": 0.1,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 1.0,
    "at": 0,
    "gain": 0.367
   },
   {
    "src": "assets/Personal/SFX/Forestscapes Vol 2/Country Day Crows.mp3",
    "from": 7.0,
    "to": 15.7,
    "fadeIn": 0.5,
    "fadeOut": 1.0,
    "at": 0.25,
    "gain": 1.191,
    "stream": true
   }
  ],
  "match": [
   "Jericho",
   "Scarecrow"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "crowdemon",
  "short": "Crow demon",
  "name": "The Crow Demon",
  "sub": "Born of a buried secret",
  "classes": "mc-en-t-harvest mc-en-t-crow",
  "hold": 7100,
  "pause": true,
  "chapter": 13,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art monster/MONSTER_Corvodaemon.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1200/969\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/MONSTER_Corvodaemon.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art monster/MONSTER_Corvodaemon.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "<span class=\"mc-en-feather mc-en-bf\" style=\"--i:0;--x:54%;--dx:3cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg\"></span><span class=\"mc-en-feather mc-en-bf\" style=\"--i:1;--x:60%;--dx:-4cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg\"></span><span class=\"mc-en-feather mc-en-bf\" style=\"--i:2;--x:66%;--dx:5cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg\"></span><span class=\"mc-en-feather mc-en-bf\" style=\"--i:3;--x:71%;--dx:-2cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg\"></span><span class=\"mc-en-feather mc-en-bf\" style=\"--i:4;--x:76%;--dx:4cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg\"></span><span class=\"mc-en-feather mc-en-bf\" style=\"--i:5;--x:81%;--dx:-5cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg\"></span><span class=\"mc-en-feather mc-en-bf\" style=\"--i:6;--x:86%;--dx:2cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg\"></span><span class=\"mc-en-feather mc-en-bf\" style=\"--i:7;--x:91%;--dx:-3cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg\"></span><span class=\"mc-en-feather mc-en-bf\" style=\"--i:8;--x:95%;--dx:4cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg\"></span>",
  "extra": "",
  "sound": [
   {
    "src": "modules/psfx/library/creature/movement/flight/wings/beating-wings-small-001.ogg",
    "from": 0.0,
    "to": 2.3,
    "fadeIn": 0.01,
    "fadeOut": 0.3,
    "at": 0,
    "gain": 0.839
   },
   {
    "src": "assets/Personal/SFX/crow_darkfantasystudio/Dark Fantasy Studio- Crow 4.wav",
    "from": 0.0,
    "to": 1.7,
    "fadeIn": 0.005,
    "fadeOut": 0.2,
    "at": 0.3,
    "gain": 0.446
   },
   {
    "src": "modules/house-divided/assets/audio/sfx/scorncrow/umbral-crow-1.ogg",
    "from": 0.0,
    "to": 3.0,
    "fadeIn": 0.05,
    "fadeOut": 0.6,
    "at": 0.9,
    "gain": 0.597
   }
  ],
  "match": [
   "Corvodaemon",
   "Crow Demon",
   "Adelaide"
  ],
  "appears": true,
  "reveal": false
 },
 {
  "key": "adelaide",
  "short": "Adelaide",
  "name": "Adelaide Langtree",
  "sub": "Martha's missing daughter",
  "classes": "mc-en-t-harvest mc-en-t-crow mc-en-tf mc-en-tf-adelaide",
  "hold": 10000,
  "pause": true,
  "chapter": 13,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art monster/MONSTER_Corvodaemon.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1200/969\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/MONSTER_Corvodaemon.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "<span class=\"mc-en-feather mc-en-bf\" style=\"--i:0;--x:54%;--dx:3cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg\"></span><span class=\"mc-en-feather mc-en-bf\" style=\"--i:1;--x:60%;--dx:-4cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg\"></span><span class=\"mc-en-feather mc-en-bf\" style=\"--i:2;--x:66%;--dx:5cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg\"></span><span class=\"mc-en-feather mc-en-bf\" style=\"--i:3;--x:71%;--dx:-2cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg\"></span><span class=\"mc-en-feather mc-en-bf\" style=\"--i:4;--x:76%;--dx:4cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg\"></span><span class=\"mc-en-feather mc-en-bf\" style=\"--i:5;--x:81%;--dx:-5cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg\"></span><span class=\"mc-en-feather mc-en-bf\" style=\"--i:6;--x:86%;--dx:2cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg\"></span><span class=\"mc-en-feather mc-en-bf\" style=\"--i:7;--x:91%;--dx:-3cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg\"></span><span class=\"mc-en-feather mc-en-bf\" style=\"--i:8;--x:95%;--dx:4cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg\"></span>",
  "extra": "<div class=\"mc-en-flash\"></div>",
  "sound": [
   {
    "src": "assets/Personal/SFX/crow_darkfantasystudio/Dark Fantasy Studio- Crow 1.wav",
    "from": 0.0,
    "to": 2.1,
    "fadeIn": 0.005,
    "fadeOut": 0.3,
    "at": 0.3,
    "gain": 0.275
   },
   {
    "src": "modules/house-divided/assets/audio/sfx/scorncrow/raven-transformation.ogg",
    "from": 0.2,
    "to": 3.4,
    "fadeIn": 0.1,
    "fadeOut": 1.0,
    "at": 2.4,
    "gain": 0.433
   },
   {
    "src": "assets/Personal/SFX/evillaugh_darkfantasystudio/Dark Fantasy Studio- Evil laugh 6.wav",
    "from": 0.0,
    "to": 1.7,
    "fadeIn": 0.005,
    "fadeOut": 0.3,
    "at": 3.7,
    "gain": 0.621
   }
  ],
  "art2": "<span class=\"mc-en-crop\" style=\"aspect-ratio:892/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Adelaide_Langtree.webp\" alt=\"\"></span>",
  "name1": "The Crow Demon",
  "sub1": "Born of a buried secret",
  "match": [
   "Adelaide",
   "Corvodaemon"
  ],
  "swapFx": "jb2a.swirling_feathers.outburst.01.textured",
  "appears": false,
  "reveal": false
 },
 {
  "key": "harvest",
  "short": "Harvest",
  "name": "The Harvest Terror",
  "sub": "Every field keeps a secret",
  "classes": "mc-en-t-harvest",
  "hold": 7100,
  "pause": true,
  "chapter": 13,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Harvest_Terror.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1200/1016\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Harvest_Terror.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Harvest_Terror.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "modules/psfx/library/creature/movement/flight/wings/beating-wings-small-001.ogg",
    "from": 0.0,
    "to": 2.3,
    "fadeIn": 0.01,
    "fadeOut": 0.3,
    "at": 0,
    "gain": 0.839
   },
   {
    "src": "modules/dnd-abomination-vaults/assets/audio/ambience/murder-of-crows.ogg",
    "from": 12.5,
    "to": 21.2,
    "fadeIn": 0.5,
    "fadeOut": 1.0,
    "at": 0.25,
    "gain": 2.667,
    "stream": true
   }
  ],
  "match": [
   "Harvest Terror",
   "Raum"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-jonah-sawyer",
  "short": "Jonah Sawyer",
  "name": "Jonah Sawyer",
  "sub": "Butcher of Foxwillow",
  "classes": "mc-en-t-generic mc-en-g-neutral",
  "hold": 7100,
  "pause": false,
  "chapter": 13,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Jonah_Sawyer.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:786/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Jonah_Sawyer.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Jonah_Sawyer.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Jonah Sawyer"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-martha-langtree",
  "short": "Martha",
  "name": "Martha Langtree",
  "sub": "Runs the Langtree farm in Foxwillow",
  "classes": "mc-en-t-generic mc-en-g-neutral",
  "hold": 7100,
  "pause": false,
  "chapter": 13,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Martha_Langtree.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:679/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Martha_Langtree.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Martha_Langtree.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Martha Langtree"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-william-lodge",
  "short": "William",
  "name": "William Lodge",
  "sub": "Foxwillow farmer seeking help",
  "classes": "mc-en-t-generic mc-en-g-friend",
  "hold": 7100,
  "pause": false,
  "chapter": 13,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_William_Lodge.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:898/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_William_Lodge.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_William_Lodge.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "William Lodge"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "renathyrolaf",
  "short": "Renathyr",
  "name": "Father Renathyr",
  "sub": "Abbot of the Crimson Faith, with Friar Olaf",
  "classes": "mc-en-t-monastery",
  "hold": 7100,
  "pause": false,
  "chapter": 14,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Crimson_Abbot_Normal.webp",
  "art": "<span class=\"mc-en-pairbox\"><span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:615/1199;--ch:100.083%;--cw:100.000%;--cl:-0.000%;--ct:-0.000%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Crimson_Abbot_Normal.webp\" alt=\"\"></span></span><span class=\"mc-en-pairbox\"><span class=\"mc-en-crop\" style=\"aspect-ratio:871/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Friar_Olaf.webp\" alt=\"\"></span></span>",
  "pair": true,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/monk_darkfantasystudio/Dark Fantasy Studio- Monk 11.wav",
    "from": 0.3,
    "to": 9.9,
    "fadeIn": 0.05,
    "fadeOut": 1.2,
    "at": 0.25,
    "gain": 0.656
   }
  ],
  "match": [
   "Renathyr",
   "Olaf"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "jaeger0",
  "short": "Jaeger",
  "name": "Houndmaster Jaeger",
  "sub": "Trains the monastery's hounds",
  "classes": "mc-en-t-monastery",
  "hold": 7100,
  "pause": false,
  "chapter": 14,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Sigmund_Jaeger.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:953/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Sigmund_Jaeger.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "modules/monument-studios-sampler/audio/_4 One Shots/_4 Beasts/Hellhound.mp3",
    "from": 0.0,
    "to": 2.8,
    "fadeIn": 0.01,
    "fadeOut": 0.4,
    "at": 0.3,
    "gain": 0.618
   },
   {
    "src": "assets/Personal/SFX/monk_darkfantasystudio/Dark Fantasy Studio- Monk 11.wav",
    "from": 0.3,
    "to": 9.9,
    "fadeIn": 0.05,
    "fadeOut": 1.2,
    "at": 0.25,
    "gain": 0.422
   }
  ],
  "match": [
   "Jaeger"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "cromwell0",
  "short": "Cromwell",
  "name": "Inquisitor Cromwell",
  "sub": "Head inquisitor of the monastery",
  "classes": "mc-en-t-monastery",
  "hold": 7100,
  "pause": false,
  "chapter": 14,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Leona_Cromwell.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1013/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Leona_Cromwell.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Lamentations/Dark Fantasy Studio- Lamentations 2.wav",
    "from": 0.0,
    "to": 8.7,
    "fadeIn": 0.8,
    "fadeOut": 1.2,
    "at": 0.2,
    "gain": 0.471
   }
  ],
  "match": [
   "Cromwell"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "abbottf",
  "short": "The Abbot",
  "name": "The Crimson Abbot",
  "sub": "Father Renathyr, unmasked",
  "classes": "mc-en-t-abbot mc-en-tf mc-en-tf-abbot",
  "hold": 10000,
  "pause": true,
  "chapter": 14,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Crimson_Abbot_Normal.webp",
  "art": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:615/1199;--ch:100.083%;--cw:100.000%;--cl:-0.000%;--ct:-0.000%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Crimson_Abbot_Normal.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "<div class=\"mc-en-flash\"></div>",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.369
   },
   {
    "src": "assets/Personal/SFX/monk_darkfantasystudio/Dark Fantasy Studio- Monk 11.wav",
    "from": 0.3,
    "to": 9.9,
    "fadeIn": 0.05,
    "fadeOut": 1.2,
    "at": 0.25,
    "gain": 0.843
   },
   {
    "src": "assets/Personal/SFX/dragonwings_darkfantasystudio/NOISE ALCHEMY- DRAGON WINGS 2.wav",
    "from": 0.0,
    "to": 2.1,
    "fadeIn": 0.005,
    "fadeOut": 0.3,
    "at": 2.75,
    "gain": 0.333
   },
   {
    "src": "assets/Personal/SFX/Monsters and Beasts Vol 2/Growl.mp3",
    "from": 0.0,
    "to": 6.05,
    "fadeIn": 0.3,
    "fadeOut": 1.0,
    "at": 4.9,
    "gain": 0.23
   }
  ],
  "art2": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1200/936\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Crimson_Abbot_Transformed.webp\" alt=\"\"></span>",
  "name1": "Father Renathyr",
  "sub1": "Abbot of the Crimson Faith",
  "match": [
   "Crimson Abbot"
  ],
  "match1": [
   "Renathyr"
  ],
  "change": 2.6,
  "swapFx": "jb2a.bats.complete.01.red",
  "appears": false,
  "reveal": true
 },
 {
  "key": "jaeger",
  "short": "Jaeger turns",
  "name": "Houndmaster Jaeger",
  "sub": "",
  "classes": "mc-en-t-prior mc-en-tf mc-en-tf-prior mc-en-p-jaeger",
  "hold": 10000,
  "pause": true,
  "chapter": 14,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Sigmund_Jaeger.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:953/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Sigmund_Jaeger.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "<div class=\"mc-en-flash\"></div>",
  "sound": [
   {
    "src": "assets/Personal/SFX/monk_darkfantasystudio/Dark Fantasy Studio- Monk 11.wav",
    "from": 0.3,
    "to": 9.9,
    "fadeIn": 0.05,
    "fadeOut": 1.2,
    "at": 0.25,
    "gain": 0.562
   },
   {
    "src": "assets/Personal/SFX/dragonwings_darkfantasystudio/NOISE ALCHEMY- DRAGON WINGS 14.wav",
    "from": 0.0,
    "to": 1.3,
    "fadeIn": 0.005,
    "fadeOut": 0.2,
    "at": 2.85,
    "gain": 0.403
   },
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Abyss/Dark Fantasy Studio- Abyss 16.wav",
    "from": 0.0,
    "to": 2.9,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 3.05,
    "gain": 0.263
   }
  ],
  "art2": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1200/1123\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/MONSTER_Night_Creature.webp\" alt=\"\"></span>",
  "name1": "Houndmaster Jaeger",
  "sub1": "Trains the monastery's hounds",
  "match": [
   "Night Creature"
  ],
  "match1": [
   "Jaeger"
  ],
  "change": 2.8,
  "swapFx": "jb2a.bats.complete.01.red",
  "appears": false,
  "reveal": false
 },
 {
  "key": "olaf",
  "short": "Olaf turns",
  "name": "Friar Olaf",
  "sub": "",
  "classes": "mc-en-t-prior mc-en-tf mc-en-tf-prior mc-en-p-olaf",
  "hold": 10000,
  "pause": true,
  "chapter": 14,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Friar_Olaf.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:871/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Friar_Olaf.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "<div class=\"mc-en-flash\"></div>",
  "sound": [
   {
    "src": "assets/Personal/SFX/monk_darkfantasystudio/Dark Fantasy Studio- Monk 11.wav",
    "from": 0.3,
    "to": 9.9,
    "fadeIn": 0.05,
    "fadeOut": 1.2,
    "at": 0.25,
    "gain": 0.562
   },
   {
    "src": "assets/Personal/SFX/dragonwings_darkfantasystudio/NOISE ALCHEMY- DRAGON WINGS 14.wav",
    "from": 0.0,
    "to": 1.3,
    "fadeIn": 0.005,
    "fadeOut": 0.2,
    "at": 2.85,
    "gain": 0.403
   },
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Abyss/Dark Fantasy Studio- Abyss 16.wav",
    "from": 0.0,
    "to": 2.9,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 3.05,
    "gain": 0.263
   }
  ],
  "art2": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1200/1123\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/MONSTER_Night_Creature.webp\" alt=\"\"></span>",
  "name1": "Friar Olaf",
  "sub1": "Preacher of the Crimson Rose",
  "match": [
   "Night Creature"
  ],
  "match1": [
   "Olaf"
  ],
  "change": 2.8,
  "swapFx": "jb2a.bats.complete.01.red",
  "appears": false,
  "reveal": false
 },
 {
  "key": "cromwell",
  "short": "Cromwell turns",
  "name": "Inquisitor Cromwell",
  "sub": "",
  "classes": "mc-en-t-prior mc-en-tf mc-en-tf-prior mc-en-p-cromwell",
  "hold": 10000,
  "pause": true,
  "chapter": 14,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Leona_Cromwell.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1013/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Leona_Cromwell.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "<div class=\"mc-en-flash\"></div>",
  "sound": [
   {
    "src": "assets/Personal/SFX/monk_darkfantasystudio/Dark Fantasy Studio- Monk 11.wav",
    "from": 0.3,
    "to": 9.9,
    "fadeIn": 0.05,
    "fadeOut": 1.2,
    "at": 0.25,
    "gain": 0.562
   },
   {
    "src": "assets/Personal/SFX/dragonwings_darkfantasystudio/NOISE ALCHEMY- DRAGON WINGS 14.wav",
    "from": 0.0,
    "to": 1.3,
    "fadeIn": 0.005,
    "fadeOut": 0.2,
    "at": 2.85,
    "gain": 0.403
   },
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Abyss/Dark Fantasy Studio- Abyss 16.wav",
    "from": 0.0,
    "to": 2.9,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 3.05,
    "gain": 0.263
   }
  ],
  "art2": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1200/1123\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/MONSTER_Night_Creature.webp\" alt=\"\"></span>",
  "name1": "Inquisitor Cromwell",
  "sub1": "Head inquisitor of the monastery",
  "match": [
   "Night Creature"
  ],
  "match1": [
   "Cromwell"
  ],
  "change": 2.8,
  "swapFx": "jb2a.bats.complete.01.red",
  "appears": false,
  "reveal": false
 },
 {
  "key": "crossroads0",
  "short": "Crossroads",
  "name": "Mister Crossroads",
  "sub": "Deal-maker of the Drowned Crossroads",
  "classes": "mc-en-t-crossroads",
  "hold": 7100,
  "pause": false,
  "chapter": 15,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Mr_Crossroads_and_Briggsy.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1096/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Mr_Crossroads_and_Briggsy.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "modules/ember/assets/audio/environment/insects-and-minor-animals/one-shots/strange-frogs.ogg",
    "from": 2.0,
    "to": 10.7,
    "fadeIn": 0.8,
    "fadeOut": 1.0,
    "at": 0.2,
    "gain": 3.305
   }
  ],
  "match": [
   "Crossroads"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "sinner",
  "short": "The Sinner",
  "name": "The Grinning Sinner",
  "sub": "",
  "classes": "mc-en-t-sinner",
  "hold": 7100,
  "pause": true,
  "chapter": 15,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Grinning_Sinner.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:964/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Grinning_Sinner.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Grinning_Sinner.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.369
   },
   {
    "src": "modules/dnd-abomination-vaults/assets/audio/ambience/swamp.ogg",
    "from": 83.0,
    "to": 91.7,
    "fadeIn": 0.5,
    "fadeOut": 1.0,
    "at": 0.25,
    "gain": 3.392,
    "stream": true
   }
  ],
  "match": [
   "Grinning Sinner",
   "Crossroads"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "bayou",
  "short": "Vander",
  "name": "Vander & Lyla",
  "sub": "The Bayou King and his emissary",
  "classes": "mc-en-t-bayou",
  "hold": 7100,
  "pause": false,
  "chapter": 15,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Vander_Boone.webp",
  "art": "<span class=\"mc-en-pairbox\"><span class=\"mc-en-crop\" style=\"aspect-ratio:738/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Vander_Boone.webp\" alt=\"\"></span></span><span class=\"mc-en-pairbox\"><span class=\"mc-en-crop\" style=\"aspect-ratio:776/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Lyla_Webb.webp\" alt=\"\"></span></span>",
  "pair": true,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "modules/ember/assets/audio/environment/insects-and-minor-animals/one-shots/frogs-and-birds.ogg",
    "from": 1.0,
    "to": 9.7,
    "fadeIn": 0.8,
    "fadeOut": 1.0,
    "at": 0.2,
    "gain": 6.912
   }
  ],
  "match": [
   "Vander",
   "Lyla"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-lyla",
  "short": "Lyla",
  "name": "Lyla",
  "sub": "Emissary of the Bayou King",
  "classes": "mc-en-t-generic mc-en-g-friend",
  "hold": 7100,
  "pause": false,
  "chapter": 15,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Lyla_Webb.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:776/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Lyla_Webb.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Lyla_Webb.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Lyla"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-the-gaunt-waiter",
  "short": "Gaunt Waiter",
  "name": "The Gaunt Waiter",
  "sub": "Long dead, yet struggling to speak",
  "classes": "mc-en-t-generic mc-en-g-neutral",
  "hold": 7100,
  "pause": false,
  "chapter": 15,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Elias_Greaves.webp",
  "art": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:1023/1200;--ch:100.000%;--cw:100.098%;--cl:-0.000%;--ct:-0.000%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Elias_Greaves.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Elias_Greaves.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Gaunt Waiter"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-vander",
  "short": "Vander",
  "name": "Vander",
  "sub": "The Bayou King of Murkwater Bend",
  "classes": "mc-en-t-generic mc-en-g-friend",
  "hold": 7100,
  "pause": false,
  "chapter": 15,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Vander_Boone.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:738/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Vander_Boone.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Vander_Boone.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Vander"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "stonoga",
  "short": "Stonoga",
  "name": "Stonoga Blackstinger",
  "sub": "",
  "classes": "mc-en-t-stonoga",
  "hold": 7100,
  "pause": true,
  "chapter": 16,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Stonoga_Blackstinger.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1200/1000\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Stonoga_Blackstinger.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Stonoga_Blackstinger.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "<span class=\"mc-en-bit\" style=\"--i:0;--x:58%;--dx:1cqh;--c:rgba(200,184,160,.55);--w:.45cqh;--h:.45cqh;--t:5.2s\"></span><span class=\"mc-en-bit\" style=\"--i:1;--x:64%;--dx:-1cqh;--c:rgba(200,184,160,.55);--w:.45cqh;--h:.45cqh;--t:5.2s\"></span><span class=\"mc-en-bit\" style=\"--i:2;--x:71%;--dx:2cqh;--c:rgba(200,184,160,.55);--w:.45cqh;--h:.45cqh;--t:5.2s\"></span><span class=\"mc-en-bit\" style=\"--i:3;--x:79%;--dx:-1.5cqh;--c:rgba(200,184,160,.55);--w:.45cqh;--h:.45cqh;--t:5.2s\"></span><span class=\"mc-en-bit\" style=\"--i:4;--x:86%;--dx:1cqh;--c:rgba(200,184,160,.55);--w:.45cqh;--h:.45cqh;--t:5.2s\"></span><span class=\"mc-en-bit\" style=\"--i:5;--x:93%;--dx:0cqh;--c:rgba(200,184,160,.55);--w:.45cqh;--h:.45cqh;--t:5.2s\"></span>",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.369
   },
   {
    "src": "modules/ember/assets/audio/environment/insects-and-minor-animals/loops/spider-scuttling-active.ogg",
    "from": 4.5,
    "to": 13.2,
    "fadeIn": 0.5,
    "fadeOut": 1.0,
    "at": 0.25,
    "gain": 1.072
   },
   {
    "src": "assets/Personal/SFX/witch_darkfantasystudio/Dark Fantasy Studio- Witch 11.wav",
    "from": 0.0,
    "to": 2.7,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 1.5,
    "gain": 0.225
   }
  ],
  "match": [
   "Stonoga"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "lethica0",
  "short": "Lethica",
  "name": "Matron Lethica",
  "sub": "Runs Memory's Rest Sanatorium",
  "classes": "mc-en-t-matron",
  "hold": 7100,
  "pause": false,
  "chapter": 17,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Matron_Lethica.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:903/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Matron_Lethica.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/creepyloops_darkfantasystudio/Dark Fantasy Studio- Creepy loops 21.wav",
    "from": 0.0,
    "to": 4.1,
    "fadeIn": 0.4,
    "fadeOut": 0.8,
    "at": 0.3,
    "gain": 0.453
   }
  ],
  "match": [
   "Lethica"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "belkin",
  "short": "Doctor Belkin",
  "name": "Doctor Belkin",
  "sub": "Examines new arrivals at Memory's Rest",
  "classes": "mc-en-t-matron mc-en-t-belkin",
  "hold": 7100,
  "pause": false,
  "chapter": 17,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Doctor_Belkin.webp",
  "art": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:878/894;--ch:134.228%;--cw:100.000%;--cl:-0.000%;--ct:-33.557%;-webkit-mask:linear-gradient(to bottom,transparent 0,rgba(0,0,0,.16) 2.35%,rgba(0,0,0,.5) 4.7%,rgba(0,0,0,.84) 7.04%,#000 9.39%);-webkit-mask-composite:source-in;mask:linear-gradient(to bottom,transparent 0,rgba(0,0,0,.16) 2.35%,rgba(0,0,0,.5) 4.7%,rgba(0,0,0,.84) 7.04%,#000 9.39%);mask-composite:intersect\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Doctor_Belkin.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/Music/Horror Audio Bundle/MP3/Ambience/Disturbing Facilities Ambient.mp3",
    "from": 2.0,
    "to": 10.7,
    "fadeIn": 0.8,
    "fadeOut": 1.0,
    "at": 0.2,
    "gain": 1.043
   },
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Broken glass/Dark Fantasy Studio- Broken glass 21.wav",
    "from": 0.0,
    "to": 2.4,
    "fadeIn": 0.005,
    "fadeOut": 0.4,
    "at": 1.2,
    "gain": 0.494
   }
  ],
  "match": [
   "Belkin"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "hugo",
  "short": "Hugo",
  "name": "Hugo",
  "sub": "Keeps order at Memory's Rest",
  "classes": "mc-en-t-hugo",
  "hold": 7100,
  "pause": true,
  "chapter": 17,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art monster/MONSTER_Serum_Brute.webp",
  "art": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:1087/1198;--ch:100.167%;--cw:100.000%;--cl:-0.000%;--ct:-0.000%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/MONSTER_Serum_Brute.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art monster/MONSTER_Serum_Brute.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "<div class=\"mc-en-lockdown\"></div>",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.369
   },
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Abyss/Dark Fantasy Studio- Abyss 45.wav",
    "from": 0.0,
    "to": 1.9,
    "fadeIn": 0.02,
    "fadeOut": 0.4,
    "at": 0.3,
    "gain": 0.215
   },
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Abyss/Dark Fantasy Studio- Abyss 12.wav",
    "from": 0.0,
    "to": 2.9,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 1,
    "gain": 0.26
   }
  ],
  "match": [
   "Hugo",
   "Serum Brute"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "belkintf",
  "short": "Belkin reveal",
  "name": "Doctor Belkin",
  "sub": "The worms do his thinking",
  "classes": "mc-en-t-matron mc-en-t-belkin mc-en-tf mc-en-tf-belkin",
  "hold": 10000,
  "pause": true,
  "chapter": 17,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Doctor_Belkin.webp",
  "art": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:878/894;--ch:134.228%;--cw:100.000%;--cl:-0.000%;--ct:-33.557%;-webkit-mask:linear-gradient(to bottom,transparent 0,rgba(0,0,0,.16) 2.35%,rgba(0,0,0,.5) 4.7%,rgba(0,0,0,.84) 7.04%,#000 9.39%);-webkit-mask-composite:source-in;mask:linear-gradient(to bottom,transparent 0,rgba(0,0,0,.16) 2.35%,rgba(0,0,0,.5) 4.7%,rgba(0,0,0,.84) 7.04%,#000 9.39%);mask-composite:intersect\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Doctor_Belkin.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "<div class=\"mc-en-flash\"></div>",
  "sound": [
   {
    "src": "assets/Personal/Music/Horror Audio Bundle/MP3/Ambience/Disturbing Facilities Ambient.mp3",
    "from": 2.0,
    "to": 10.7,
    "fadeIn": 0.8,
    "fadeOut": 1.0,
    "at": 0.2,
    "gain": 0.913
   },
   {
    "src": "assets/Personal/SFX/smashed_darkfantasystudio/Dark Fantasy Studio- Smashed 13.wav",
    "from": 0.0,
    "to": 1.2,
    "fadeIn": 0.005,
    "fadeOut": 0.3,
    "at": 2.8,
    "gain": 0.89
   },
   {
    "src": "assets/Personal/SFX/whispers_darkfantasystudio/Dark Fantasy Studio- Whispers 6.wav",
    "from": 0.0,
    "to": 2.1,
    "fadeIn": 0.02,
    "fadeOut": 0.4,
    "at": 3,
    "gain": 0.525
   },
   {
    "src": "assets/Personal/SFX/alienvoices_darkfantasystudio/Dark Fantasy Studio- Alien voices-30.wav",
    "from": 0.7,
    "to": 2.4,
    "fadeIn": 0.01,
    "fadeOut": 0.5,
    "at": 3.4,
    "gain": 0.617
   }
  ],
  "art2": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:878/1194;--ch:100.503%;--cw:100.000%;--cl:-0.000%;--ct:-0.000%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Doctor_Belkin.webp\" alt=\"\"></span>",
  "name1": "Doctor Belkin",
  "sub1": "Examines new arrivals at Memory's Rest",
  "match": [
   "Belkin"
  ],
  "swapFx": "jb2a.particle_burst.01.circle.bluepurple",
  "appears": false,
  "reveal": false
 },
 {
  "key": "widow",
  "short": "The Widow",
  "name": "The Weeping Widow",
  "sub": "Matron of Memory's Rest",
  "classes": "mc-en-t-widow",
  "hold": 7100,
  "pause": true,
  "chapter": 17,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Matron_Lethica.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:903/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Matron_Lethica.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Matron_Lethica.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "<div class=\"mc-en-halo\" style=\"right:calc(10cqw - 4cqh);top:6cqh;width:56cqh;height:56cqh\"></div>",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/creepywind_darkfantasystudio/Dark Fantasy Studio- Creepy wind 32.wav",
    "from": 0.1,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 1.0,
    "at": 0,
    "gain": 0.367
   },
   {
    "src": "modules/dnd-abomination-vaults/assets/audio/ambience/weeping-ghost-loop.ogg",
    "from": 16.5,
    "to": 25.2,
    "fadeIn": 0.5,
    "fadeOut": 1.0,
    "at": 0.25,
    "gain": 1.24,
    "stream": true
   }
  ],
  "match": [
   "Weeping Widow",
   "Lethica"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "worm",
  "short": "White Worm",
  "name": "The White Worm",
  "sub": "",
  "classes": "mc-en-t-worm",
  "hold": 7100,
  "pause": true,
  "chapter": 17,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art monster/BOSS_White_Worm.webp",
  "art": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:1196/978;--ch:100.000%;--cw:100.334%;--cl:-0.334%;--ct:-0.000%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_White_Worm.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_White_Worm.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "<div class=\"mc-en-halo\" style=\"right:calc(4cqw + 12cqh);top:30cqh;width:70cqh;height:44cqh\"></div>",
  "extra": "<div class=\"mc-en-flash\"></div>",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Abyss/Dark Fantasy Studio- Abyss 40.wav",
    "from": 0.0,
    "to": 2.0,
    "fadeIn": 0.05,
    "fadeOut": 0.6,
    "at": 0,
    "gain": 0.362
   },
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Abyss/Dark Fantasy Studio- Abyss 17.wav",
    "from": 0.0,
    "to": 2.9,
    "fadeIn": 0.05,
    "fadeOut": 0.5,
    "at": 0.7,
    "gain": 0.322
   },
   {
    "src": "assets/Personal/SFX/dragon_darkfantasystudio/Dark Fantasy Studio-Dragon 30.wav",
    "from": 0.0,
    "to": 2.1,
    "fadeIn": 0.005,
    "fadeOut": 0.5,
    "at": 2.2,
    "gain": 0.319
   },
   {
    "src": "assets/Personal/SFX/alienvoices_darkfantasystudio/Dark Fantasy Studio- Alien voices-25.wav",
    "from": 0.0,
    "to": 2.3,
    "fadeIn": 0.005,
    "fadeOut": 0.5,
    "at": 2.25,
    "gain": 0.89
   }
  ],
  "match": [
   "White Worm"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-nurse-godlee",
  "short": "Nurse Godlee",
  "name": "Nurse Godlee",
  "sub": "Second to Matron Lethica",
  "classes": "mc-en-t-generic mc-en-g-neutral",
  "hold": 7100,
  "pause": false,
  "chapter": 17,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Sarah_Godlee.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:974/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Sarah_Godlee.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Sarah_Godlee.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Nurse Godlee"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "blight",
  "short": "Gorthos",
  "name": "The Beast of Blight",
  "sub": "",
  "classes": "mc-en-t-blight",
  "hold": 7100,
  "pause": true,
  "chapter": 18,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Beast_of_Blight.webp",
  "art": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:1200/1108;--ch:100.090%;--cw:100.000%;--cl:-0.000%;--ct:-0.090%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Beast_of_Blight.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Beast_of_Blight.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "<span class=\"mc-en-dot mc-en-up\" style=\"--i:0;--x:12%;--y:70cqh;--c:#d6e36a;--sz:.55cqh;--t:4s\"></span><span class=\"mc-en-dot mc-en-up\" style=\"--i:1;--x:24%;--y:76cqh;--c:#d6e36a;--sz:.55cqh;--t:4s\"></span><span class=\"mc-en-dot mc-en-up\" style=\"--i:2;--x:37%;--y:68cqh;--c:#d6e36a;--sz:.55cqh;--t:4s\"></span><span class=\"mc-en-dot mc-en-up\" style=\"--i:3;--x:50%;--y:74cqh;--c:#d6e36a;--sz:.55cqh;--t:4s\"></span><span class=\"mc-en-dot mc-en-up\" style=\"--i:4;--x:63%;--y:70cqh;--c:#d6e36a;--sz:.55cqh;--t:4s\"></span>",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/creepywind_darkfantasystudio/Dark Fantasy Studio- Creepy wind 32.wav",
    "from": 0.1,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 1.0,
    "at": 0,
    "gain": 0.367
   },
   {
    "src": "modules/ember/assets/audio/environment/land-animals-and-beasts/one-shots/strange-beast-1.ogg",
    "from": 0.0,
    "to": 6.0,
    "fadeIn": 0.02,
    "fadeOut": 1.0,
    "at": 0.25,
    "gain": 3.337
   }
  ],
  "match": [
   "Beast of Blight",
   "Gorthos"
  ],
  "appears": false,
  "reveal": true
 },
 {
  "key": "yorgrimisolde",
  "short": "Yorgrim",
  "name": "Yorgrim and Isolde",
  "sub": "Gravedigger and hound of Maidenmist",
  "classes": "mc-en-t-keepers",
  "hold": 7100,
  "pause": false,
  "chapter": 19,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Yorgrim.webp",
  "art": "<span class=\"mc-en-pairbox\"><span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:642/929;--ch:129.171%;--cw:147.040%;--cl:-0.000%;--ct:-28.418%;-webkit-mask:radial-gradient(ellipse 50% 34.3% at 100% 0,transparent 48%,#000 100%),linear-gradient(to left,transparent 0,#000 10%);-webkit-mask-composite:source-in;mask:radial-gradient(ellipse 50% 34.3% at 100% 0,transparent 48%,#000 100%),linear-gradient(to left,transparent 0,#000 10%);mask-composite:intersect\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Yorgrim.webp\" alt=\"\"></span></span><span class=\"mc-en-pairbox\"><span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:1199/1185;--ch:100.084%;--cw:100.083%;--cl:-0.083%;--ct:-0.000%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Isolde.webp\" alt=\"\"></span></span>",
  "pair": true,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/creepywind_darkfantasystudio/Dark Fantasy Studio- Creepy wind 32.wav",
    "from": 0.1,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 1.0,
    "at": 0,
    "gain": 0.294
   },
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Ghostly/Dark Fantasy Studio-Ghostly 2.wav",
    "from": 0.0,
    "to": 3.1,
    "fadeIn": 0.01,
    "fadeOut": 0.4,
    "at": 0.4,
    "gain": 0.206
   }
  ],
  "match": [
   "Yorgrim",
   "Isolde"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "reapertf",
  "short": "Reaper",
  "name": "The Chained Reaper",
  "sub": "The dead will not stay buried",
  "classes": "mc-en-t-reaper mc-en-tf mc-en-tf-reaper",
  "hold": 10000,
  "pause": true,
  "chapter": 19,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Yorgrim.webp",
  "art": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:642/929;--ch:129.171%;--cw:147.040%;--cl:-0.000%;--ct:-28.418%;-webkit-mask:radial-gradient(ellipse 50% 34.3% at 100% 0,transparent 48%,#000 100%),linear-gradient(to left,transparent 0,#000 10%);-webkit-mask-composite:source-in;mask:radial-gradient(ellipse 50% 34.3% at 100% 0,transparent 48%,#000 100%),linear-gradient(to left,transparent 0,#000 10%);mask-composite:intersect\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Yorgrim.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "<video class=\"mc-en-mistvid\" src=\"modules/animated-mist-and-fog-by-mattm/animations/fog_thick_drifting.webm\" muted loop playsinline preload=\"auto\"></video><div class=\"mc-en-halo\" style=\"right:calc(8cqw + 4cqh);top:8cqh;width:52cqh;height:52cqh\"></div>",
  "extra": "<video class=\"mc-en-mistvid mc-en-front\" src=\"modules/animated-mist-and-fog-by-mattm/animations/rising_fog_thin.webm\" muted loop playsinline preload=\"auto\"></video>",
  "sound": [
   {
    "src": "assets/Personal/SFX/creepywind_darkfantasystudio/Dark Fantasy Studio- Creepy wind 32.wav",
    "from": 0.1,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 1.0,
    "at": 0,
    "gain": 0.367
   },
   {
    "src": "assets/Personal/SFX/oldclock_darkfantasystudio/Dark Fantasy Studio- Old Clock 37.wav",
    "from": 0.0,
    "to": 2.0,
    "fadeIn": 0.003,
    "fadeOut": 0.4,
    "at": 2.7,
    "gain": 0.766
   },
   {
    "src": "modules/pf2e-ap178-punks-in-a-powderkeg/assets/audio/ghostlyChainsAndWails.ogg",
    "from": 0.0,
    "to": 8.7,
    "fadeIn": 0.02,
    "fadeOut": 1.0,
    "at": 3,
    "gain": 0.78
   }
  ],
  "art2": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:1089/1200;--ch:100.000%;--cw:100.092%;--cl:-0.092%;--ct:-0.000%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Chained_Reaper.webp\" alt=\"\"></span>",
  "name1": "Yorgrim",
  "sub1": "The gravedigger",
  "match": [
   "Chained Reaper"
  ],
  "match1": [
   "Yorgrim"
  ],
  "change": 2.8,
  "swapFx": "jb2a.smoke.puff.centered.grey",
  "appears": false,
  "reveal": true
 },
 {
  "key": "g-isolde",
  "short": "Isolde",
  "name": "Isolde",
  "sub": "Spirit hound guarding Maidenmist Cemetery",
  "classes": "mc-en-t-generic mc-en-g-friend",
  "hold": 7100,
  "pause": false,
  "chapter": 19,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Isolde.webp",
  "art": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:1199/1185;--ch:100.084%;--cw:100.083%;--cl:-0.083%;--ct:-0.000%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Isolde.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Isolde.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.246
   }
  ],
  "generic": true,
  "match": [
   "Isolde"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "golubtf",
  "short": "Golub",
  "name": "Golub Graygullet",
  "sub": "Postmaster no more",
  "classes": "mc-en-t-golub mc-en-tf mc-en-tf-golub",
  "hold": 10000,
  "pause": true,
  "chapter": 20,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Theodora_Mayville.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1146/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Theodora_Mayville.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "<span class=\"mc-en-feather\" style=\"--i:0;--x:52%;--dx:4cqh;--c:rgba(236,232,244,.85);--w:1.1cqh;--h:2.3cqh;--t:3.4s\"></span><span class=\"mc-en-feather\" style=\"--i:1;--x:58%;--dx:-3cqh;--c:rgba(236,232,244,.85);--w:1.1cqh;--h:2.3cqh;--t:3.4s\"></span><span class=\"mc-en-feather\" style=\"--i:2;--x:64%;--dx:5cqh;--c:rgba(236,232,244,.85);--w:1.1cqh;--h:2.3cqh;--t:3.4s\"></span><span class=\"mc-en-feather\" style=\"--i:3;--x:70%;--dx:-2cqh;--c:rgba(236,232,244,.85);--w:1.1cqh;--h:2.3cqh;--t:3.4s\"></span><span class=\"mc-en-feather\" style=\"--i:4;--x:76%;--dx:3cqh;--c:rgba(236,232,244,.85);--w:1.1cqh;--h:2.3cqh;--t:3.4s\"></span><span class=\"mc-en-feather\" style=\"--i:5;--x:82%;--dx:-4cqh;--c:rgba(236,232,244,.85);--w:1.1cqh;--h:2.3cqh;--t:3.4s\"></span><span class=\"mc-en-feather\" style=\"--i:6;--x:88%;--dx:2cqh;--c:rgba(236,232,244,.85);--w:1.1cqh;--h:2.3cqh;--t:3.4s\"></span><span class=\"mc-en-feather\" style=\"--i:7;--x:94%;--dx:-3cqh;--c:rgba(236,232,244,.85);--w:1.1cqh;--h:2.3cqh;--t:3.4s\"></span>",
  "extra": "<div class=\"mc-en-flash\"></div>",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Bell/Dark Fantasy Studio- Bell (3).wav",
    "from": 0.0,
    "to": 2.1,
    "fadeIn": 0.003,
    "fadeOut": 0.3,
    "at": 0.3,
    "gain": 0.466
   },
   {
    "src": "modules/ember/assets/audio/environment/birds-and-winged-creatures/loops/flapping-wings.ogg",
    "from": 2.5,
    "to": 11.2,
    "fadeIn": 0.5,
    "fadeOut": 1.0,
    "at": 2.5,
    "gain": 3.158
   },
   {
    "src": "assets/Personal/SFX/evillaugh_darkfantasystudio/Dark Fantasy Studio- Evil laugh 35.wav",
    "from": 0.0,
    "to": 1.6,
    "fadeIn": 0.005,
    "fadeOut": 0.3,
    "at": 3,
    "gain": 0.454
   },
   {
    "src": "assets/Personal/SFX/witch_darkfantasystudio/Dark Fantasy Studio- Witch 11.wav",
    "from": 0.0,
    "to": 2.7,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 4.6,
    "gain": 0.185
   }
  ],
  "art2": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1200/1114\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Gollub_Graygullet.webp\" alt=\"\"></span>",
  "name1": "Theodora Mayville",
  "sub1": "Wickermoor's postmaster",
  "match": [
   "Golub",
   "Gollub",
   "Pigeon Hag"
  ],
  "match1": [
   "Theodora"
  ],
  "change": 2.6,
  "alts": [
   {
    "match": [
     "Geneva"
    ],
    "name": "Geneva Fairchild",
    "sub": "The postmaster's assistant"
   }
  ],
  "swapFx": "jb2a.swirling_feathers.outburst.01.textured",
  "appears": false,
  "reveal": false
 },
 {
  "key": "fools",
  "short": "Chuckles",
  "name": "Chuckles the Clown",
  "sub": "The Great Fool of the festival",
  "classes": "mc-en-t-fools",
  "hold": 7100,
  "pause": false,
  "chapter": 21,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Chuckles.webp",
  "art": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:931/1196;--ch:100.334%;--cw:100.322%;--cl:-0.322%;--ct:-0.334%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Chuckles.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Chuckles.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.369
   },
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Music box/Dark Fantasy Studio- Music box 26.wav",
    "from": 0.0,
    "to": 3.5,
    "fadeIn": 0.01,
    "fadeOut": 0.2,
    "at": 0.25,
    "gain": 0.48
   }
  ],
  "match": [
   "Lord of Fools",
   "Chuckles"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "foolstf",
  "short": "Chuckles turns",
  "name": "Chuckles",
  "sub": "No strings on him now",
  "classes": "mc-en-t-fools mc-en-tf mc-en-tf-fools",
  "hold": 10000,
  "pause": true,
  "chapter": 21,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Chuckles.webp",
  "art": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:931/1196;--ch:100.334%;--cw:100.322%;--cl:-0.322%;--ct:-0.334%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Chuckles.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "<span class=\"mc-en-feather mc-en-cf\" style=\"--i:0;--x:52%;--dx:3cqh;--c:#b3202a;--w:.8cqh;--h:1.5cqh;--t:3.2s;--rot:560deg\"></span><span class=\"mc-en-feather mc-en-cf\" style=\"--i:1;--x:57%;--dx:-3cqh;--c:#e2b447;--w:.8cqh;--h:1.5cqh;--t:3.2s;--rot:560deg\"></span><span class=\"mc-en-feather mc-en-cf\" style=\"--i:2;--x:62%;--dx:4cqh;--c:#2f7a3a;--w:.8cqh;--h:1.5cqh;--t:3.2s;--rot:560deg\"></span><span class=\"mc-en-feather mc-en-cf\" style=\"--i:3;--x:67%;--dx:-2cqh;--c:#e2b447;--w:.8cqh;--h:1.5cqh;--t:3.2s;--rot:560deg\"></span><span class=\"mc-en-feather mc-en-cf\" style=\"--i:4;--x:72%;--dx:3cqh;--c:#b3202a;--w:.8cqh;--h:1.5cqh;--t:3.2s;--rot:560deg\"></span><span class=\"mc-en-feather mc-en-cf\" style=\"--i:5;--x:77%;--dx:-4cqh;--c:#2f7a3a;--w:.8cqh;--h:1.5cqh;--t:3.2s;--rot:560deg\"></span><span class=\"mc-en-feather mc-en-cf\" style=\"--i:6;--x:82%;--dx:2cqh;--c:#e2b447;--w:.8cqh;--h:1.5cqh;--t:3.2s;--rot:560deg\"></span><span class=\"mc-en-feather mc-en-cf\" style=\"--i:7;--x:87%;--dx:-3cqh;--c:#b3202a;--w:.8cqh;--h:1.5cqh;--t:3.2s;--rot:560deg\"></span><span class=\"mc-en-feather mc-en-cf\" style=\"--i:8;--x:92%;--dx:3cqh;--c:#2f7a3a;--w:.8cqh;--h:1.5cqh;--t:3.2s;--rot:560deg\"></span><span class=\"mc-en-feather mc-en-cf\" style=\"--i:9;--x:96%;--dx:-2cqh;--c:#e2b447;--w:.8cqh;--h:1.5cqh;--t:3.2s;--rot:560deg\"></span>",
  "extra": "<div class=\"mc-en-flash\"></div>",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Music box/Dark Fantasy Studio- Music box 26.wav",
    "from": 0.0,
    "to": 3.5,
    "fadeIn": 0.01,
    "fadeOut": 0.2,
    "at": 0.25,
    "gain": 0.427
   },
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Ghostly/Dark Fantasy Studio-Ghostly 5.wav",
    "from": 0.8,
    "to": 3.0,
    "fadeIn": 0.4,
    "fadeOut": 0.02,
    "at": 0.6,
    "gain": 0.313
   },
   {
    "src": "assets/Personal/SFX/evillaugh_darkfantasystudio/Dark Fantasy Studio- Evil laugh 23.wav",
    "from": 0.0,
    "to": 1.6,
    "fadeIn": 0.005,
    "fadeOut": 0.3,
    "at": 2.8,
    "gain": 0.89
   },
   {
    "src": "assets/Personal/SFX/evillaugh_darkfantasystudio/Dark Fantasy Studio- Evil laugh 2.wav",
    "from": 0.0,
    "to": 3.0,
    "fadeIn": 0.005,
    "fadeOut": 0.6,
    "at": 4.6,
    "gain": 0.623
   }
  ],
  "art2": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:1200/1036;--ch:100.290%;--cw:100.000%;--cl:-0.000%;--ct:-0.000%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Lord_of_Fools.webp\" alt=\"\"></span>",
  "name1": "Chuckles the Clown",
  "sub1": "The Great Fool of the festival",
  "match": [
   "Lord of Fools"
  ],
  "match1": [
   "Chuckles"
  ],
  "change": 2.8,
  "swapFx": "jb2a.particle_burst.01.star.bluepurple",
  "appears": false,
  "reveal": false
 },
 {
  "key": "coven",
  "short": "The Coven",
  "name": "The Coven Abomination",
  "sub": "",
  "classes": "mc-en-t-coven",
  "hold": 7100,
  "pause": true,
  "chapter": 22,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Vermintoll_Abomination.webp",
  "art": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:967/1199;--ch:100.083%;--cw:100.000%;--cl:-0.000%;--ct:-0.083%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Vermintoll_Abomination.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Vermintoll_Abomination.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "<img class=\"mc-en-sprite mc-en-scurry\" src=\"modules/the-crooked-moon-2014/assets/art/art book/Holly_DECO_Weasel 01.webp\" alt=\"\">",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.369
   },
   {
    "src": "modules/ember/assets/audio/environment/insects-and-minor-animals/loops/spider-scuttling-subtle.ogg",
    "from": 0.5,
    "to": 9.2,
    "fadeIn": 0.4,
    "fadeOut": 1.0,
    "at": 0.25,
    "gain": 4.721
   },
   {
    "src": "assets/Personal/SFX/evillaugh_darkfantasystudio/Dark Fantasy Studio- Evil laugh 35.wav",
    "from": 0.0,
    "to": 1.6,
    "fadeIn": 0.005,
    "fadeOut": 0.3,
    "at": 1.4,
    "gain": 0.427
   },
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Creature/Dark Fantasy Studio- Creature 4.wav",
    "from": 0.0,
    "to": 2.1,
    "fadeIn": 0.05,
    "fadeOut": 0.4,
    "at": 2.3,
    "gain": 0.839
   }
  ],
  "match": [
   "Vermintoll Abomination",
   "Coven Abomination"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "wicker",
  "short": "Wicker Man",
  "name": "The Wicker Man",
  "sub": "The Old Ways keep their vigil",
  "classes": "mc-en-t-wicker",
  "hold": 7100,
  "pause": true,
  "chapter": 23,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Wicker_Man.webp",
  "art": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:918/1198;--ch:100.167%;--cw:100.000%;--cl:-0.000%;--ct:-0.167%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Wicker_Man.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Wicker_Man.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "<div class=\"mc-en-halo\" style=\"right:calc(9cqw - 2cqh);top:4cqh;width:56cqh;height:62cqh\"></div><span class=\"mc-en-dot mc-en-up\" style=\"--i:0;--x:58%;--y:74cqh;--c:#ffb14a;--sz:.6cqh;--t:3.2s\"></span><span class=\"mc-en-dot mc-en-up\" style=\"--i:1;--x:64%;--y:70cqh;--c:#ffb14a;--sz:.6cqh;--t:3.2s\"></span><span class=\"mc-en-dot mc-en-up\" style=\"--i:2;--x:70%;--y:76cqh;--c:#ffb14a;--sz:.6cqh;--t:3.2s\"></span><span class=\"mc-en-dot mc-en-up\" style=\"--i:3;--x:76%;--y:68cqh;--c:#ffb14a;--sz:.6cqh;--t:3.2s\"></span><span class=\"mc-en-dot mc-en-up\" style=\"--i:4;--x:82%;--y:74cqh;--c:#ffb14a;--sz:.6cqh;--t:3.2s\"></span><span class=\"mc-en-dot mc-en-up\" style=\"--i:5;--x:88%;--y:70cqh;--c:#ffb14a;--sz:.6cqh;--t:3.2s\"></span>",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.369
   },
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Dissonant vocals/Dark Fantasy Studio- Dissonant vocals 25.wav",
    "from": 2.0,
    "to": 10.7,
    "fadeIn": 0.3,
    "fadeOut": 1.5,
    "at": 0.25,
    "gain": 1.127
   }
  ],
  "match": [
   "Wicker Man"
  ],
  "appears": false,
  "reveal": true
 },
 {
  "key": "horned",
  "short": "Horned King",
  "name": "The Horned King",
  "sub": "Live deliciously",
  "classes": "mc-en-t-horned mc-en-tf mc-en-tf-horned",
  "hold": 10000,
  "pause": true,
  "chapter": 24,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Phillip_Druskenvald.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:559/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Phillip_Druskenvald.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "<div class=\"mc-en-halo\" style=\"right:calc(4cqw + 22cqh);top:6cqh;width:52cqh;height:52cqh\"></div><span class=\"mc-en-dot mc-en-up\" style=\"--i:0;--x:50%;--y:72cqh;--c:#ff6a3a;--sz:.55cqh;--t:3.6s\"></span><span class=\"mc-en-dot mc-en-up\" style=\"--i:1;--x:62%;--y:76cqh;--c:#ff6a3a;--sz:.55cqh;--t:3.6s\"></span><span class=\"mc-en-dot mc-en-up\" style=\"--i:2;--x:74%;--y:70cqh;--c:#ff6a3a;--sz:.55cqh;--t:3.6s\"></span><span class=\"mc-en-dot mc-en-up\" style=\"--i:3;--x:86%;--y:74cqh;--c:#ff6a3a;--sz:.55cqh;--t:3.6s\"></span>",
  "extra": "<div class=\"mc-en-flash\"></div>",
  "sound": [
   {
    "src": "assets/Personal/SFX/creepywind_darkfantasystudio/Dark Fantasy Studio- Creepy wind 32.wav",
    "from": 0.1,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 1.0,
    "at": 0,
    "gain": 0.343
   },
   {
    "src": "modules/ember/assets/audio/environment/forest-and-jungle/one-shots/deep-tree-creaking-1.ogg",
    "from": 0.0,
    "to": 6.4,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0.3,
    "gain": 3.819
   },
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Agony/Dark Fantasy Studio- Agony 16.wav",
    "from": 0.0,
    "to": 2.2,
    "fadeIn": 0.01,
    "fadeOut": 0.9,
    "at": 2.3,
    "gain": 0.39
   },
   {
    "src": "modules/ember/assets/audio/environment/land-animals-and-beasts/one-shots/strange-beast-3.ogg",
    "from": 1.4,
    "to": 6.4,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 3.1,
    "gain": 2.348
   },
   {
    "src": "assets/Personal/SFX/dragonwings_darkfantasystudio/NOISE ALCHEMY- DRAGON WINGS 2.wav",
    "from": 0.0,
    "to": 2.1,
    "fadeIn": 0.005,
    "fadeOut": 0.3,
    "at": 4.2,
    "gain": 0.25
   }
  ],
  "art2": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1200/762\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Horned_King.webp\" alt=\"\"></span>",
  "name1": "Phillip Druskenvald",
  "sub1": "Lord of Druskenvald",
  "match": [
   "Horned King"
  ],
  "match1": [
   "Phillip Druskenvald"
  ],
  "change": 2.8,
  "swapFx": "jb2a.explosion.01.orange",
  "appears": false,
  "reveal": false
 },
 {
  "key": "queen",
  "short": "The Queen",
  "name": "The Crooked Queen",
  "sub": "The Wytchwood bows to her",
  "classes": "mc-en-t-queen",
  "hold": 7100,
  "pause": true,
  "chapter": 24,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art npc/NPC_Kehlenn.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1137/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Kehlenn.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Kehlenn.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "<div class=\"mc-en-moonlight\"></div>",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/creepywind_darkfantasystudio/Dark Fantasy Studio- Creepy wind 32.wav",
    "from": 0.1,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 1.0,
    "at": 0,
    "gain": 0.367
   },
   {
    "src": "modules/ember/assets/audio/environment/forest-and-jungle/one-shots/deep-tree-creaking-1.ogg",
    "from": 0.0,
    "to": 6.4,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0.25,
    "gain": 6.364
   }
  ],
  "match": [
   "Crooked Queen",
   "Kehlenn"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "finale",
  "short": "The Finale",
  "name": "The Horned King & the Crooked Queen",
  "sub": "",
  "classes": "mc-en-t-finale",
  "hold": 7100,
  "pause": true,
  "chapter": 24,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Horned_King.webp",
  "art": "<span class=\"mc-en-pairbox\"><span class=\"mc-en-crop\" style=\"aspect-ratio:1200/762\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Horned_King.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Horned_King.webp\" alt=\"\"></span></span><span class=\"mc-en-pairbox\"><span class=\"mc-en-crop\" style=\"aspect-ratio:1137/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Kehlenn.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art npc/NPC_Kehlenn.webp\" alt=\"\"></span></span>",
  "pair": true,
  "weather": "<div class=\"mc-en-halo\" style=\"right:calc(3cqw + 16cqh);top:4cqh;width:60cqh;height:60cqh\"></div>",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0,
    "gain": 0.369
   },
   {
    "src": "modules/ember/assets/audio/environment/land-animals-and-beasts/one-shots/strange-beast-3.ogg",
    "from": 1.4,
    "to": 6.4,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0.3,
    "gain": 2.224
   },
   {
    "src": "modules/ember/assets/audio/environment/forest-and-jungle/one-shots/deep-tree-creaking-1.ogg",
    "from": 0.0,
    "to": 6.4,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0.9,
    "gain": 5.091
   }
  ],
  "match": [
   "Horned King",
   "Crooked Queen",
   "Kehlenn"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-the-barrow-king",
  "short": "Barrow King",
  "name": "The Barrow King",
  "sub": "Long-dead king of the Maidenmist barrow",
  "classes": "mc-en-t-generic mc-en-g-foe",
  "hold": 7100,
  "pause": true,
  "chapter": 26,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Barrow_King.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:853/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Barrow_King.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Barrow_King.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/creepywind_darkfantasystudio/Dark Fantasy Studio- Creepy wind 32.wav",
    "from": 0.1,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 1.0,
    "at": 0,
    "gain": 0.367
   },
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0.15,
    "gain": 0.172
   }
  ],
  "generic": true,
  "match": [
   "Barrow King"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-the-brimstone-behemoth",
  "short": "Behemoth",
  "name": "The Brimstone Behemoth",
  "sub": "",
  "classes": "mc-en-t-generic mc-en-g-foe",
  "hold": 7100,
  "pause": true,
  "chapter": 26,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Brimstone_Behemoth.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1067/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Brimstone_Behemoth.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Brimstone_Behemoth.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/creepywind_darkfantasystudio/Dark Fantasy Studio- Creepy wind 32.wav",
    "from": 0.1,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 1.0,
    "at": 0,
    "gain": 0.367
   },
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0.15,
    "gain": 0.172
   }
  ],
  "generic": true,
  "match": [
   "Brimstone Behemoth"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-the-dusk-mother",
  "short": "Dusk Mother",
  "name": "The Dusk Mother",
  "sub": "Ghostly witch of the Webwoods",
  "classes": "mc-en-t-generic mc-en-g-foe",
  "hold": 7100,
  "pause": true,
  "chapter": 26,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Dusk_Mother.webp",
  "art": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:904/1200;--ch:100.000%;--cw:100.332%;--cl:-0.332%;--ct:-0.000%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Dusk_Mother.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Dusk_Mother.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/creepywind_darkfantasystudio/Dark Fantasy Studio- Creepy wind 32.wav",
    "from": 0.1,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 1.0,
    "at": 0,
    "gain": 0.367
   },
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0.15,
    "gain": 0.172
   }
  ],
  "generic": true,
  "match": [
   "Dusk Mother"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-the-galloping-headsman",
  "short": "Headsman",
  "name": "The Galloping Headsman",
  "sub": "",
  "classes": "mc-en-t-generic mc-en-g-foe",
  "hold": 7100,
  "pause": true,
  "chapter": 26,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Galloping_Headsman.webp",
  "art": "<span class=\"mc-en-crop mc-en-cropped\" style=\"aspect-ratio:1200/1121;--ch:100.178%;--cw:100.000%;--cl:-0.000%;--ct:-0.000%\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Galloping_Headsman.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Galloping_Headsman.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/creepywind_darkfantasystudio/Dark Fantasy Studio- Creepy wind 32.wav",
    "from": 0.1,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 1.0,
    "at": 0,
    "gain": 0.367
   },
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0.15,
    "gain": 0.172
   }
  ],
  "generic": true,
  "match": [
   "Galloping Headsman"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-the-jinxed-leviathan",
  "short": "Leviathan",
  "name": "The Jinxed Leviathan",
  "sub": "",
  "classes": "mc-en-t-generic mc-en-g-foe",
  "hold": 7100,
  "pause": true,
  "chapter": 26,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Jinxed_Leviathan.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:1200/680\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Jinxed_Leviathan.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_Jinxed_Leviathan.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/creepywind_darkfantasystudio/Dark Fantasy Studio- Creepy wind 32.wav",
    "from": 0.1,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 1.0,
    "at": 0,
    "gain": 0.367
   },
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0.15,
    "gain": 0.172
   }
  ],
  "generic": true,
  "match": [
   "Jinxed Leviathan"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-the-tall-man",
  "short": "Tall Man",
  "name": "The Tall Man",
  "sub": "Stalker of Hartsblight Forest",
  "classes": "mc-en-t-generic mc-en-g-foe",
  "hold": 7100,
  "pause": true,
  "chapter": 26,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art monster/BOSS_The_Tall_Man.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:465/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_The_Tall_Man.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art monster/BOSS_The_Tall_Man.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/creepywind_darkfantasystudio/Dark Fantasy Studio- Creepy wind 32.wav",
    "from": 0.1,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 1.0,
    "at": 0,
    "gain": 0.367
   },
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0.15,
    "gain": 0.172
   }
  ],
  "generic": true,
  "match": [
   "Tall Man"
  ],
  "appears": false,
  "reveal": false
 },
 {
  "key": "g-the-wild-titan",
  "short": "Wild Titan",
  "name": "The Wild Titan",
  "sub": "",
  "classes": "mc-en-t-generic mc-en-g-foe",
  "hold": 7100,
  "pause": true,
  "chapter": 26,
  "portrait": "modules/the-crooked-moon-2014/assets/art/art monster/MONSTER_Wild_Titan.webp",
  "art": "<span class=\"mc-en-crop\" style=\"aspect-ratio:939/1200\"><img src=\"modules/the-crooked-moon-2014/assets/art/art monster/MONSTER_Wild_Titan.webp\" alt=\"\"><img class=\"mc-en-shade\" src=\"modules/the-crooked-moon-2014/assets/art/art monster/MONSTER_Wild_Titan.webp\" alt=\"\"></span>",
  "pair": false,
  "weather": "",
  "extra": "",
  "sound": [
   {
    "src": "assets/Personal/SFX/creepywind_darkfantasystudio/Dark Fantasy Studio- Creepy wind 32.wav",
    "from": 0.1,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 1.0,
    "at": 0,
    "gain": 0.367
   },
   {
    "src": "assets/Personal/SFX/Dark Fantasy Studio- Whooshes/Dark Fantasy Studio- Whooshes 36.wav",
    "from": 0.2,
    "to": 2.6,
    "fadeIn": 0.02,
    "fadeOut": 0.5,
    "at": 0.15,
    "gain": 0.172
   }
  ],
  "generic": true,
  "match": [
   "Wild Titan"
  ],
  "appears": false,
  "reveal": false
 }
];
