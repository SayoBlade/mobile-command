"""Writes cards2.html: sixteen entrance cards built from one template, so every banner shares the same shape."""
from pathlib import Path

PLAY = ('<button class="play" type="button"><svg class="ico i-play" aria-hidden="true"><use href="#i-play"/></svg>'
        '<svg class="ico i-stop" aria-hidden="true"><use href="#i-stop"/></svg><span>Play</span></button>')


def dots(cls, spec, c, sz=".6cqh", t=None):
    out = []
    for i, (x, y) in enumerate(spec):
        extra = f";--t:{t}" if t else ""
        out.append(f'<span class="dot {cls}" style="--i:{i};--x:{x};--y:{y};--c:{c};--sz:{sz}{extra}"></span>')
    return "".join(out)


def fog(b, t, o=1):
    return f'<div class="fog" style="--b:{b};--t:{t};--o:{o}"></div>'


def halo(right, top, w, h):
    return f'<div class="halo" style="right:{right};top:{top};width:{w};height:{h}"></div>'


def shaded(src):
    return f'<img src="art/{src}.webp" alt=""><img class="shade" src="art/{src}.webp" alt="">'


BITS_DUST = '<span class="bit" style="--i:0;--x:58%;--dx:1cqh;--c:rgba(200,184,160,.55);--w:.45cqh;--h:.45cqh;--t:5.2s"></span><span class="bit" style="--i:1;--x:64%;--dx:-1cqh;--c:rgba(200,184,160,.55);--w:.45cqh;--h:.45cqh;--t:5.2s"></span><span class="bit" style="--i:2;--x:71%;--dx:2cqh;--c:rgba(200,184,160,.55);--w:.45cqh;--h:.45cqh;--t:5.2s"></span><span class="bit" style="--i:3;--x:79%;--dx:-1.5cqh;--c:rgba(200,184,160,.55);--w:.45cqh;--h:.45cqh;--t:5.2s"></span><span class="bit" style="--i:4;--x:86%;--dx:1cqh;--c:rgba(200,184,160,.55);--w:.45cqh;--h:.45cqh;--t:5.2s"></span><span class="bit" style="--i:5;--x:93%;--dx:0cqh;--c:rgba(200,184,160,.55);--w:.45cqh;--h:.45cqh;--t:5.2s"></span>'
BITS_FEATHERS = '<span class="feather" style="--i:0;--x:52%;--dx:4cqh;--c:rgba(236,232,244,.85);--w:1.1cqh;--h:2.3cqh;--t:3.4s"></span><span class="feather" style="--i:1;--x:58%;--dx:-3cqh;--c:rgba(236,232,244,.85);--w:1.1cqh;--h:2.3cqh;--t:3.4s"></span><span class="feather" style="--i:2;--x:64%;--dx:5cqh;--c:rgba(236,232,244,.85);--w:1.1cqh;--h:2.3cqh;--t:3.4s"></span><span class="feather" style="--i:3;--x:70%;--dx:-2cqh;--c:rgba(236,232,244,.85);--w:1.1cqh;--h:2.3cqh;--t:3.4s"></span><span class="feather" style="--i:4;--x:76%;--dx:3cqh;--c:rgba(236,232,244,.85);--w:1.1cqh;--h:2.3cqh;--t:3.4s"></span><span class="feather" style="--i:5;--x:82%;--dx:-4cqh;--c:rgba(236,232,244,.85);--w:1.1cqh;--h:2.3cqh;--t:3.4s"></span><span class="feather" style="--i:6;--x:88%;--dx:2cqh;--c:rgba(236,232,244,.85);--w:1.1cqh;--h:2.3cqh;--t:3.4s"></span><span class="feather" style="--i:7;--x:94%;--dx:-3cqh;--c:rgba(236,232,244,.85);--w:1.1cqh;--h:2.3cqh;--t:3.4s"></span>'

BITS_CONFETTI = '<span class="feather cf" style="--i:0;--x:52%;--dx:3cqh;--c:#b3202a;--w:.8cqh;--h:1.5cqh;--t:3.2s;--rot:560deg"></span><span class="feather cf" style="--i:1;--x:57%;--dx:-3cqh;--c:#e2b447;--w:.8cqh;--h:1.5cqh;--t:3.2s;--rot:560deg"></span><span class="feather cf" style="--i:2;--x:62%;--dx:4cqh;--c:#2f7a3a;--w:.8cqh;--h:1.5cqh;--t:3.2s;--rot:560deg"></span><span class="feather cf" style="--i:3;--x:67%;--dx:-2cqh;--c:#e2b447;--w:.8cqh;--h:1.5cqh;--t:3.2s;--rot:560deg"></span><span class="feather cf" style="--i:4;--x:72%;--dx:3cqh;--c:#b3202a;--w:.8cqh;--h:1.5cqh;--t:3.2s;--rot:560deg"></span><span class="feather cf" style="--i:5;--x:77%;--dx:-4cqh;--c:#2f7a3a;--w:.8cqh;--h:1.5cqh;--t:3.2s;--rot:560deg"></span><span class="feather cf" style="--i:6;--x:82%;--dx:2cqh;--c:#e2b447;--w:.8cqh;--h:1.5cqh;--t:3.2s;--rot:560deg"></span><span class="feather cf" style="--i:7;--x:87%;--dx:-3cqh;--c:#b3202a;--w:.8cqh;--h:1.5cqh;--t:3.2s;--rot:560deg"></span><span class="feather cf" style="--i:8;--x:92%;--dx:3cqh;--c:#2f7a3a;--w:.8cqh;--h:1.5cqh;--t:3.2s;--rot:560deg"></span><span class="feather cf" style="--i:9;--x:96%;--dx:-2cqh;--c:#e2b447;--w:.8cqh;--h:1.5cqh;--t:3.2s;--rot:560deg"></span>'

BITS_CROW = '<span class="feather bf" style="--i:0;--x:54%;--dx:3cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg"></span><span class="feather bf" style="--i:1;--x:60%;--dx:-4cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg"></span><span class="feather bf" style="--i:2;--x:66%;--dx:5cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg"></span><span class="feather bf" style="--i:3;--x:71%;--dx:-2cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg"></span><span class="feather bf" style="--i:4;--x:76%;--dx:4cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg"></span><span class="feather bf" style="--i:5;--x:81%;--dx:-5cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg"></span><span class="feather bf" style="--i:6;--x:86%;--dx:2cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg"></span><span class="feather bf" style="--i:7;--x:91%;--dx:-3cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg"></span><span class="feather bf" style="--i:8;--x:95%;--dx:4cqh;--w:1.3cqh;--h:3.2cqh;--t:4.2s;--rot:300deg"></span>'

N = [
    dict(key="vagrant", t="t-vagrant", name="The Vagrant", sub="Just a humble ferryman", map="map-vagrant",
         art='<img src="art/vagrant.webp" alt="">', label="the Vagrant", where="the passenger car",
         weather='<video class="mistvid" src="fx/mist-thin-horizontal.webm" muted loop playsinline preload="auto"></video>',
         eyebrow="Chapter 10 · aboard the Ghostlight Express · a friend",
         artline="His portrait from the module, over the passenger-car battle map.",
         moves="Your thin horizontal mist (MattM's Animated Mist and Fog) drifts past like steam while the banner holds. No silhouette reveal: he's a friend."),
    dict(key="druskenvald", t="t-druskenvald", name="Phillip &amp; Adela", sub="The swellest couple aboard",
         map="map-druskenvald", pair=True,
         art='<span><img src="art/adela.webp" alt=""></span><span><img src="art/phillip.webp" alt=""></span>',
         label="Phillip and Adela Druskenvald", where="the lounge car",
         weather=dots("tw", [("58%", "18cqh"), ("64%", "34cqh"), ("71%", "12cqh"), ("80%", "28cqh"), ("88%", "40cqh")], "#f3d993", ".55cqh"),
         eyebrow="Chapter 10 · the lounge car · friends",
         artline="Both their portraits from the module, side by side, over the lounge-car battle map.",
         moves="A few champagne glints twinkle beside them."),
    dict(key="trainhopper", t="t-trainhopper", name="The Phantom Trainhopper", sub="", map="map-trainhopper",
         art=shaded("trainhopper"), label="the Phantom Trainhopper", where="the Tender",
         weather=halo("calc(11cqw + 6cqh)", "10cqh", "46cqh", "46cqh")
                 + dots("up", [("62%", "56cqh"), ("70%", "60cqh"), ("77%", "54cqh"), ("84%", "58cqh"), ("90%", "52cqh")], "#6dffb8", ".5cqh", "3.2s"),
         eyebrow="Chapter 10 · the Tender",
         artline="Its portrait from the module, over the Tender map.",
         moves="Revealed from a black silhouette in a green ghostlight glow; a few sparks drift up."),
    dict(key="mayor", t="t-mayor", name="Wendel Somerton", sub="Mayor of Wickermoor Village", map="map-mayor",
         art='<img src="art/mayor.webp" alt="">', label="Mayor Wendel Somerton", where="the Founder's Round",
         weather=dots("tw", [("56%", "16cqh"), ("63%", "30cqh"), ("88%", "14cqh"), ("92%", "34cqh")], "#ffd28a", ".55cqh"),
         eyebrow="Chapter 11 · Wickermoor Village · a friend",
         artline="His portrait from the module, over the Founder's Round map.",
         moves="A friend, so no silhouette; a few warm lantern glints. His subtitle is his own greeting."),
    dict(key="theodora0", t="t-postmaster", name='Theodora Mayville', sub='Postmaster of Wickermoor Village', map="map-mayor",
         art='<img src="art/theodora.webp" alt="">', label='Theodora Mayville', where='the Post Office',
         eyebrow='Chapter 11 · the Post Office · normal intro',
         artline='Her portrait from the module.',
         moves='The face the party meets first — no silhouette, no pause. The change has its own banner.',
         decide="The book's reveal later is 'Geneva' (her assistant) bursting into feathers — Geneva has no portrait, so the change banner opens on Theodora."),
    dict(key="law", t="t-law", name='Constable Squire & Deputy Butterman', sub='The law in Wickermoor Village', map="map-mayor",
         art='<span><img src="art/doris.webp" alt=""></span><span><img src="art/howie.webp" alt=""></span>', label='Constable Squire and Deputy Butterman', where="the Constable's Station",
         pair=True,
         eyebrow="Chapter 11 · the Constable's Station · a shared banner",
         artline='Their two portraits from the module.',
         moves='Met together, so one banner for both. Not monsters.'),
    dict(key="rain", t="t-rain", name='Sister Rain', sub='Preacher of the Patient Lady', map="map-mayor",
         art='<img src="art/rain.webp" alt="">', label='Sister Rain', where='Wickermoor Village',
         weather='<div class="halo" style="right:calc(9cqw + 6cqh);top:6cqh;width:46cqh;height:46cqh"></div>',
         eyebrow='Chapter 11 · Wickermoor Village · a friend',
         artline='Her portrait from the module.',
         moves="A soft halo behind her. Not a monster — so a proper banner doesn't telegraph one."),
    dict(key="weston", t="t-weston", name='Weston Murdoch', sub='Brightsinger pilgrim at the Abandoned Church', map="map-mayor",
         art='<img src="art/weston.webp" alt="">', label='Weston Murdoch', where='the Abandoned Church',
         weather='<div class="halo" style="right:calc(9cqw + 6cqh);top:6cqh;width:46cqh;height:46cqh"></div>',
         eyebrow='Chapter 11 · the Abandoned Church · a friend',
         artline='His portrait from the module.',
         moves='A warm light behind him. Not a monster.'),
    dict(key="rusty", t="t-rusty", name='Old Rusty', sub='Groundskeeper of Wickermoor Village', map="map-mayor",
         art='<img src="art/rusty.webp" alt="">', label='Old Rusty', where='the town square',
         eyebrow='Chapter 11 · the town square · neither friend nor foe',
         artline='His portrait from the module.',
         moves='Plain and quiet. Not a monster.'),
    dict(key="mori", t="t-mori", name='Mori Shade', sub='Undertaker at Shade Funeral Home', map="map-mayor",
         art='<img src="art/mori.webp" alt="">', label='Mori Shade', where='Shade Funeral Home',
         eyebrow='Chapter 11 · Shade Funeral Home · neither friend nor foe',
         artline='Her portrait from the module.',
         moves='One funeral bell. Not a monster.'),
    dict(key="jenkins", t="t-jenkins", name='The Jenkin family', sub='Caretakers of the Druskenvald Estate', map="map-crooked",
         art='<span><img src="art/walter.webp" alt=""></span><span><img src="art/gilly.webp" alt=""></span><span><img src="art/dani.webp" alt=""></span>', label='the Jenkin family', where='the Druskenvald Estate',
         pair=True,
         eyebrow='Chapter 12 · the estate on the hill · a shared banner',
         artline="Walter, Gilly and Dani's portraits from the module.",
         moves='Met together on the hill, so one banner for the three. Not monsters.'),
    dict(key="vessla", t="t-vessla", name="Vessla Browntooth", sub="", map="map-vessla",
         art=shaded("vessla"), label="Vessla Browntooth", where="the Crooked House attic",
                  extra='<img class="sprite scurry" src="art/weasel.webp" alt="">',
         eyebrow="Chapter 12 · the Crooked House attic",
         artline="Her portrait from the module (a rat on her shoulder), over the attic battle map. The running weasel is one of the book's margin drawings.",
         moves="She's revealed from a black silhouette, and a weasel scurries along the top of her banner."),
    dict(key="crooked", t="t-crooked", name="The Crooked Man", sub="", map="map-crooked",
         art='<img src="art/crooked.webp" alt="">', label="the Crooked Man", where="the Crooked House",
         weather='<div class="rain"><i></i><i></i></div>', front='<div class="flash"></div>',
         eyebrow="Chapters 12, 22 and 23 · the Crooked House",
         artline="His portrait from the module, over the Crooked House ground-floor map.",
         moves="A lightning flash shows him; rain falls across the map while the banner holds."),
    dict(key="farmers", t="t-farmers", name='Jeremiah Stover & William Lodge', sub='Farmers seeking help for Foxwillow', map="map-mayor",
         art='<span><img src="art/jeremiah.webp" alt=""></span><span><img src="art/william.webp" alt=""></span>', label='Jeremiah Stover and William Lodge', where='Wickermoor Village',
         pair=True,
         eyebrow='Chapter 13 · Wickermoor Village · a shared banner',
         artline='Their two portraits from the module.',
         moves='Jeremiah brings William to tell his tale — one banner for both. Not monsters.'),
    dict(key="jericho", t="t-jericho", name="The Scarecrow", sub="", map="map-harvest",
         art='<img src="art/jericho.webp" alt="">', label="Ol' Jericho Sticks", where="the windmill",
         weather=dots("tw", [("14%", "30cqh"), ("26%", "46cqh"), ("39%", "22cqh"), ("52%", "40cqh"), ("60%", "14cqh"), ("8%", "52cqh")], "#e3ff8a", ".6cqh"),
         eyebrow="Chapter 13 · the windmill at Foxwillow · a friend",
         artline="Cropped from the module's portrait, over the windmill battle map.",
         moves="Fireflies drift around him. No silhouette reveal: he's a friend.",
         decide="The module's portrait shows him with Raum, the crow demon inside him. It's cropped to Jericho alone here; the full picture would give the secret away."),
    dict(key="crowdemon", t="t-harvest t-crow", name="The Crow Demon", sub="Born of a buried secret", map="map-harvest",
         art=shaded("corvodaemon"), label="the crow demon", where="the Fields of the Crow",
         weather=BITS_CROW,
         eyebrow="Chapter 13 · the Fields of the Crow and the windmill cellar",
         artline="The module's Corvodaemon, over the Circle of Secrets map. No name: the players don't know who it is.",
         moves="Revealed from a black silhouette while black feathers drift down.",
         decide="The book has two: the one that bursts out of Isaac's body in the windmill cellar, and Adelaide herself in the maze. This banner fits both and names neither."),
    dict(key="adelaide", t="t-harvest t-crow tf tf-adelaide", name="Adelaide Langtree", sub="Martha's missing daughter",
         name1="The Crow Demon", sub1="Born of a buried secret", map="map-harvest", dur=10000,
         title="Adelaide Langtree, the reveal",
         art='<img src="art/corvodaemon.webp" alt="">', art2='<img src="art/adelaide.webp" alt="">',
         label="Adelaide's reveal", where="the Fields of the Crow",
         weather=BITS_CROW, extra='<div class="flash"></div>',
         eyebrow="Chapter 13 · the Fields of the Crow · the reveal",
         artline="The module's Corvodaemon, then Adelaide's portrait.",
         moves="Opens on the crow demon. At the change it breaks apart into a burst of black feathers, and the girl's face comes out of the dark. On the map: feathers burst from the demon's token.",
         decide="For the moment the party works out the demon is her: Martha realises it once they tell her about Isaac and show her the note, or they face it in the maze knowing."),
    dict(key="harvest", t="t-harvest", name="The Harvest Terror", sub="Every field keeps a secret", map="map-harvest",
         art=shaded("harvest"), label="the Harvest Terror", where="the Circle of Secrets",
                  eyebrow="Chapter 13 · the Circle of Secrets",
         artline="His boss art from the module, over the Circle of Secrets map.",
         moves="Revealed from a black silhouette."),
    dict(key="renathyrolaf", t="t-monastery", name='Father Renathyr', sub='Abbot of the Crimson Faith, with Friar Olaf', map="map-priors",
         art='<span><img src="art/abbot-kind.webp" alt=""></span><span><img src="art/olaf.webp" alt=""></span>', label='Father Renathyr and Friar Olaf', where='the Courtyard of the Rose',
         pair=True,
         eyebrow='Chapter 14 · the Night of Flames · a shared banner',
         artline="The module's plain-robed abbot (his NPC portrait shows red eyes and his younger self) and Olaf's portrait.",
         moves='Renathyr on the stair, Olaf preaching at the pyre — the party meets them together, but Renathyr is the focus: Olaf stands back, smaller and dimmer, half behind his shoulder. No silhouette, no pause. The change has its own banner.'),
    dict(key="jaeger0", t="t-monastery", name='Houndmaster Jaeger', sub="Trains the monastery's hounds", map="map-priors",
         art='<img src="art/jaeger.webp" alt="">', label='Houndmaster Jaeger', where='the Crimson Monastery',
         eyebrow='Chapter 14 · the Crimson Monastery · normal intro',
         artline='His portrait from the module.',
         moves='The face the party meets first — no silhouette, no pause. The change has its own banner.'),
    dict(key="cromwell0", t="t-monastery", name='Inquisitor Cromwell', sub='Head inquisitor of the monastery', map="map-priors",
         art='<img src="art/cromwell.webp" alt="">', label='Inquisitor Cromwell', where='the Crimson Monastery',
         eyebrow='Chapter 14 · the Crimson Monastery · normal intro',
         artline='Her portrait from the module.',
         moves='The face the party meets first — no silhouette, no pause. The change has its own banner.'),
    dict(key="abbottf", t="t-abbot tf tf-abbot", name="The Crimson Abbot", sub="Father Renathyr, unmasked",
         name1="Father Renathyr", sub1="Abbot of the Crimson Faith", map="map-abbot", dur=10000,
         title="The Crimson Abbot, transformation version",
         art='<img src="art/abbot-kind.webp" alt="">', art2='<img src="art/abbot-winged.webp" alt="">',
         label="the Crimson Abbot's transformation", where="the Sanguine Cathedral",
         extra='<div class="flash"></div>',
         eyebrow="Chapter 14 · the Sanguine Cathedral · transformation version",
         artline="His two boss portraits from the module: the abbot as the party knows him, then his true form.",
         moves="Opens on Father Renathyr as the party knows him. At the change his image shimmers and he grows to towering height, a blood-red flash, and the winged Abbot takes his place. Then it holds like the others. On the map: red bats burst from his token as it swaps.",
         decide="The book has him drop his disguise partway through the fight, in front of the party. The banner is timed for that moment."),
    dict(key="jaeger", t="t-prior tf tf-prior p-jaeger", name="Houndmaster Jaeger", sub="",
         name1="Houndmaster Jaeger", sub1="Trains the monastery's hounds", map="map-priors", dur=10000,
         title="Houndmaster Jaeger, transformation version",
         art='<img src="art/jaeger.webp" alt="">', art2='<img src="art/nightcreature.webp" alt="">',
         label="Houndmaster Jaeger's transformation", where="the Courtyard of the Rose",
         extra='<div class="flash"></div>',
         eyebrow="Chapter 14 · the Crimson Monastery · transformation",
         artline="His portrait from the module, then the module's Night Creature.",
         moves="Opens on the Houndmaster as the party meets him. Struck down, he slumps, a red flash, and a night creature rises in his place. On the map: red bats burst from the body as the creature's token takes its place.",
         decide="The book: the priors only show their true shape when they are \"killed\". The banner is timed for that moment."),
    dict(key="olaf", t="t-prior tf tf-prior p-olaf", name="Friar Olaf", sub="",
         name1="Friar Olaf", sub1="Preacher of the Crimson Rose", map="map-priors", dur=10000,
         title="Friar Olaf, transformation version",
         art='<img src="art/olaf.webp" alt="">', art2='<img src="art/nightcreature.webp" alt="">',
         label="Friar Olaf's transformation", where="the Courtyard of the Rose",
         extra='<div class="flash"></div>',
         eyebrow="Chapter 14 · the Crimson Monastery · transformation",
         artline="His portrait from the module, then the module's Night Creature.",
         moves="Opens on the friar as the party meets him. Struck down, he slumps, a red flash, and a night creature rises in his place. On the map: red bats burst from the body as the creature's token takes its place.",
         decide="The book: the priors only show their true shape when they are \"killed\". The banner is timed for that moment."),
    dict(key="cromwell", t="t-prior tf tf-prior p-cromwell", name="Inquisitor Cromwell", sub="",
         name1="Inquisitor Cromwell", sub1="Head inquisitor of the monastery", map="map-priors", dur=10000,
         title="Inquisitor Cromwell, transformation version",
         art='<img src="art/cromwell.webp" alt="">', art2='<img src="art/nightcreature.webp" alt="">',
         label="Inquisitor Cromwell's transformation", where="the Courtyard of the Rose",
         extra='<div class="flash"></div>',
         eyebrow="Chapter 14 · the Crimson Monastery · transformation",
         artline="Her portrait from the module, then the module's Night Creature.",
         moves="Opens on the Inquisitor as the party meets her. Struck down, she slumps, a red flash, and a night creature rises in her place. On the map: red bats burst from the body as the creature's token takes its place.",
         decide="The book: the priors only show their true shape when they are \"killed\". The banner is timed for that moment."),
    dict(key="crossroads0", t="t-crossroads", name='Mister Crossroads', sub='Deal-maker of the Drowned Crossroads', map="map-sinner",
         art='<img src="art/crossroads.webp" alt="">', label='Mister Crossroads', where="the Dead Man's Hand",
         eyebrow="Chapter 15 · his cabin on the Dead Man's Hand · normal intro",
         artline='His portrait from the module (a faded ghost of his younger self behind him — harmless).',
         moves='The face the party meets first — no silhouette, no pause. The change has its own banner.'),
    dict(key="sinner", t="t-sinner", name="The Grinning Sinner", sub="", map="map-sinner",
         art=shaded("sinner"), label="the Grinning Sinner", where="Dead Man's Hand",
                  eyebrow="Chapter 15 · Dead Man's Hand",
         artline="His boss art from the module (riding his wave of swamp water), over the Dead Man's Hand map.",
         moves="Revealed from a black silhouette; the neon line under his name stutters on."),
    dict(key="bayou", t="t-bayou", name='Vander & Lyla', sub='The Bayou King and his emissary', map="map-sinner",
         art='<span><img src="art/vander.webp" alt=""></span><span><img src="art/lyla.webp" alt=""></span>', label='Vander and Lyla', where='Murkwater Bend',
         pair=True,
         eyebrow='Chapter 15 · Murkwater Bend · a shared banner',
         artline='Their two portraits from the module.',
         moves="Lyla leads the party in to the Bayou King's throne — one banner for both. First names only: the book never has them say their surnames."),
    dict(key="stonoga", t="t-stonoga", name="Stonoga Blackstinger", sub="", map="map-stonoga",
         art=shaded("stonoga"), label="Stonoga Blackstinger", where="the Deep Drift",
         weather=BITS_DUST,
         eyebrow="Chapter 16 · Skitterdeep Mine, the Deep Drift",
         artline="Her portrait from the module (a centipede at her shoulder), over the Deep Drift map.",
         moves="Revealed from a black silhouette while dust sifts down from the mine's ceiling."),
    dict(key="lethica0", t="t-matron", name='Matron Lethica', sub="Runs Memory's Rest Sanatorium", map="map-hugo",
         art='<img src="art/widow.webp" alt="">', label='Matron Lethica', where='her office',
         eyebrow="Chapter 17 · Memory's Rest, her office · normal intro",
         artline='Her portrait from the module.',
         moves='The face the party meets first — no silhouette, no pause. The change has its own banner.'),
    dict(key="belkin", t="t-matron t-belkin", name="Doctor Belkin", sub="Examines new arrivals at Memory's Rest", map="map-hugo",
         art='<img src="art/belkin-capped.webp" alt="">', label="Doctor Belkin", where="the Examination Room",
         eyebrow="Chapter 17 · Memory's Rest, the Examination Room · first meeting",
         artline="His portrait from the module, cut at the brow and fading into shadow: the whole picture shows the open skull his cap hides.",
         moves="The face the party meets first. No silhouette and no pause; the reveal has its own banner."),
    dict(key="hugo", t="t-hugo", name="Hugo", sub="Keeps order at Memory's Rest", map="map-hugo",
         art=shaded("hugo"), label="Hugo", where="the sanatorium's first floor",
         weather='<div class="lockdown"></div>',
         eyebrow="Chapter 17 · Memory's Rest",
         artline="The module's Serum Brute art (Hugo's own stat block), over the first-floor map.",
         moves="Revealed from a black silhouette while the sanatorium's violet lockdown light pulses at the edges of the screen."),
    dict(key="belkintf", t="t-matron t-belkin tf tf-belkin", name="Doctor Belkin", sub="The worms do his thinking",
         name1="Doctor Belkin", sub1="Examines new arrivals at Memory's Rest", map="map-hugo", dur=10000,
         title="Doctor Belkin, the reveal",
         art='<img src="art/belkin-capped.webp" alt="">', art2='<img src="art/belkin.webp" alt="">',
         label="Doctor Belkin's reveal", where="the Experimental Wing",
         extra='<div class="flash"></div>',
         eyebrow="Chapter 17 · Memory's Rest, the Experimental Wing · the reveal",
         artline="The same portrait twice: from the brow down, then whole.",
         moves="Opens as the party first met him. At the change a sick violet pulse lifts the shadow off his head and the open skull shows; he twitches. On the map: a violet pulse on his token.",
         decide="The book: he covers his head with a surgical cap only on the first floor. Play it the first time the party sees him upstairs, in his lab or office."),
    dict(key="widow", t="t-widow", name="The Weeping Widow", sub="Matron of Memory's Rest", map="map-widow",
         art=shaded("widow"), label="the Weeping Widow", where="the Grotto of Tears",
         weather=halo("calc(10cqw - 4cqh)", "6cqh", "56cqh", "56cqh"),
         eyebrow="Chapter 17 · the Grotto of Tears",
         artline="Matron Lethica's portrait from the module, over the Grotto of Tears map.",
         moves="Revealed from a black silhouette, with a slow violet glow behind her."),
    dict(key="worm", t="t-worm", name="The White Worm", sub="", map="map-widow",
         art=shaded("worm"), label="the White Worm", where="the Grotto of Tears",
         weather=halo("calc(4cqw + 12cqh)", "30cqh", "70cqh", "44cqh"), extra='<div class="flash"></div>',
         eyebrow="Chapter 17 · the caverns under Memory's Rest",
         artline="Its boss art from the module, over the Grotto of Tears map.",
         moves="It rises from below instead of sliding in, revealed from a black silhouette; a pale flicker as it shrieks."),
    dict(key="blight", t="t-blight", name="The Beast of Blight", sub="", map="map-blight",
         art=shaded("blight"), label="the Beast of Blight", where="the Den of the Blighted One",
         weather=dots("up", [("12%", "70cqh"), ("24%", "76cqh"), ("37%", "68cqh"), ("50%", "74cqh"), ("63%", "70cqh")], "#d6e36a", ".55cqh", "4s"),
                  eyebrow="Chapter 18 · the Den of the Blighted One",
         artline="Gorthos's boss art from the module, over the Den of the Blighted One map.",
         moves="Revealed from a black silhouette; spores drift up."),
    dict(key="yorgrimisolde", t="t-keepers", name='Yorgrim and Isolde', sub='Gravedigger and hound of Maidenmist', map="map-reaper",
         art='<span><img src="art/yorgrim.webp" alt=""></span><span><img src="art/isolde.webp" alt=""></span>', label='Yorgrim and Isolde', where='the Great Sepulcher',
         pair=True,
         eyebrow='Chapter 19 · the Great Sepulcher · a shared banner',
         artline="Yorgrim's portrait (cropped to him alone) and Isolde's.",
         moves='Met together at the sepulcher doors. The face the party meets first — no silhouette, no pause. The change has its own banner.'),
    dict(key="reapertf", t="t-reaper tf tf-reaper", name="The Chained Reaper", sub="The dead will not stay buried",
         name1="Yorgrim", sub1="The gravedigger", map="map-reaper", dur=10000,
         title="The Chained Reaper, transformation version",
         art='<img src="art/yorgrim.webp" alt="">', art2='<img src="art/reaper.webp" alt="">',
         label="the Chained Reaper's transformation", where="the Tomb of the Shrouded",
         weather='<video class="mistvid" src="fx/fog-thick-drifting.webm" muted loop playsinline preload="auto"></video>'
                 + halo("calc(8cqw + 4cqh)", "8cqh", "52cqh", "52cqh"),
         extra='<video class="mistvid front" src="fx/rising-fog-thin.webm" muted loop playsinline preload="auto"></video>',
         eyebrow="Chapter 19 · the Tomb of the Shrouded · transformation version",
         artline="Yorgrim's portrait from the module (cropped to him alone), then the Reaper's boss art.",
         moves="Opens on Yorgrim in thin fog, as the party knows him. At the change the fog thickens and swallows him, and the Reaper grows out of it. Then it holds like the others. On the map: a puff of grey smoke as his token swaps.",
         decide="The book has him turn in the tomb once the six beacons are lit, with the party there. The banner is timed for that moment."),
    dict(key="golubtf", t="t-golub tf tf-golub", name="Golub Graygullet", sub="Postmaster no more",
         name1="Theodora Mayville", sub1="Wickermoor's postmaster", map="map-golub", dur=10000,
         title="Golub Graygullet, transformation version",
         art='<img src="art/theodora.webp" alt="">', art2='<img src="art/golub.webp" alt="">',
         label="Theodora Mayville's unmasking", where="the Walking Dovecote",
         weather=BITS_FEATHERS, extra='<div class="flash"></div>',
         eyebrow="Chapter 20 · the Walking Dovecote · transformation",
         artline="Two portraits from the module: Theodora, the postmaster the party knows from the village, then Golub.",
         moves="Opens on Theodora with her pigeon. At the change she startles, a pale pop, feathers burst, and the hag stands in her place. On the map: a burst of feathers on her token as it swaps.",
         decide="The book has two paths. Exposed as Theodora, she cackles and teleports to her dovecote; if the party never exposes her, Golub kills Geneva, the assistant, and wears her instead. In play the banner reads the map: if Geneva's token is the one standing there (and Theodora's isn't, or lies dead), it opens on Geneva Fairchild, the postmaster's assistant, with whatever picture her token carries, since the book gives her none. This page can only show the Theodora version."),
    dict(key="fools", t="t-fools", name="Chuckles the Clown", sub="The Great Fool of the festival", map="map-fools",
         art=shaded("chuckles"), label="Chuckles the Clown", where="the Festival of Fools",
         eyebrow="Chapter 21 · the Festival of Fools · first meeting",
         artline="His puppet portrait from the module: the jester the party meets in the festival square.",
         moves="Revealed from a black silhouette. No pause: it is a first meeting, not a fight.",
         decide="His real body is the balloon on the maypole. That stays hidden until the fight (the next card)."),
    dict(key="foolstf", t="t-fools tf tf-fools", name="Chuckles", sub="No strings on him now",
         name1="Chuckles the Clown", sub1="The Great Fool of the festival", map="map-fools", dur=10000,
         title="Chuckles, transformation version",
         art='<img src="art/chuckles.webp" alt="">', art2='<img src="art/balloon.webp" alt="">',
         label="Chuckles' true form", where="the Ring of Fools",
         weather=BITS_CONFETTI, extra='<div class="flash"></div>',
         eyebrow="Chapter 21 · the Ring of Fools · transformation",
         artline="Two pictures from the module: the jester puppet the party knows, then his boss art (the balloon, with the puppet riding on top).",
         moves="Opens on the jester. At the change he jerks on his strings and drops away, a burst of festival colours, and the balloon swells up in his place and bobs. On the map: a burst of sparks on the balloon's token.",
         decide="The book: halfway through the fight the balloon swells, rips its pole out of the ground and speaks with his voice. The banner is timed for that moment."),
    dict(key="coven", t="t-coven", name="The Coven Abomination", sub="", map="map-coven",
         art=shaded("coven"), label="the Coven Abomination", where="the Crooked House attic",
         extra='<img class="sprite scurry" src="art/weasel.webp" alt="">',
         eyebrow="Chapter 22 · the Crooked House attic",
         artline="Its boss art from the module, over the attic map.",
         moves="Revealed from a black silhouette; one weasel runs the length of the banner."),
    dict(key="wicker", t="t-wicker", name="The Wicker Man", sub="The Old Ways keep their vigil", map="map-wicker",
         art=shaded("wicker"), label="the Wicker Man", where="Wicker's Vigil",
         weather=halo("calc(9cqw - 2cqh)", "4cqh", "56cqh", "62cqh") + dots("up", [("58%", "74cqh"), ("64%", "70cqh"), ("70%", "76cqh"), ("76%", "68cqh"), ("82%", "74cqh"), ("88%", "70cqh")], "#ffb14a", ".6cqh", "3.2s"),
         eyebrow="Chapter 23 · Wicker's Vigil",
         artline="His boss art from the module, over the Wicker's Vigil map.",
         moves="Revealed from a black silhouette; embers rise and firelight pulses behind him."),
    dict(key="horned", t="t-horned tf tf-horned", name="The Horned King", sub="Live deliciously",
         name1="Phillip Druskenvald", sub1="Lord of Druskenvald", map="map-kehlenn", dur=10000,
         title="The Horned King, transformation version",
         art='<img src="art/phillip.webp" alt="">', art2='<img src="art/horned.webp" alt="">',
         label="the Horned King's birth", where="the Crooked Tree",
         extra='<div class="flash"></div>',
         weather=halo("calc(4cqw + 22cqh)", "6cqh", "52cqh", "52cqh") + dots("up", [("50%", "72cqh"), ("62%", "76cqh"), ("74%", "70cqh"), ("86%", "74cqh")], "#ff6a3a", ".55cqh", "3.6s"),
         eyebrow="Chapter 24 · the Crooked Tree · transformation",
         artline="Phillip's portrait from the module, then the Horned King's boss art (his born form).",
         moves="Opens on Phillip. At the change he shudders and is dragged up out of sight, a hellish red flash, and the Horned King rises in his place while embers climb. On the map: hellfire erupts as the King's token appears.",
         decide="The book: in the barrow the roots drag Phillip up into the tree and his screams turn into a goat's bleating; the Horned King waits outside. Play it as the party climbs out. The book only confirms who he was when he dies, but the players will have just heard it happen."),
    dict(key="queen", t="t-queen", name="The Crooked Queen", sub="The Wytchwood bows to her", map="map-kehlenn",
         art=shaded("kehlenn"), label="the Crooked Queen", where="the Crooked Tree",
         weather='<div class="moonlight"></div>',
         eyebrow="Chapter 24 · the Crooked Tree · the finale",
         artline="Kehlenn's portrait from the module, over the Crooked Tree map.",
         moves="Revealed from a black silhouette; one slow sweep of moonlight.",
         decide="She's the campaign's last reveal. Her banner could stay up until you tap, instead of leaving after about seven seconds."),
    dict(key="finale", t="t-finale", name='The Horned King & the Crooked Queen', sub="", map="map-kehlenn",
         art='<span><img src="art/horned.webp" alt=""><img class="shade" src="art/horned.webp" alt=""></span><span><img src="art/kehlenn.webp" alt=""><img class="shade" src="art/kehlenn.webp" alt=""></span>', label='the Horned King and the Crooked Queen', where='the Crooked Tree',
         pair=True,
         weather='<div class="halo" style="right:calc(3cqw + 16cqh);top:4cqh;width:60cqh;height:60cqh"></div>',
         eyebrow='Chapter 24 · the Crooked Tree · the finale, a shared banner',
         artline="The Horned King's boss art (his born form) and Kehlenn's portrait.",
         moves='They appear together as the party climbs out of the barrow — one banner, revealed from silhouettes.'),
]

cards = []
for n in N:
    art_cls = "art pair" if n.get("pair") else "art"
    if n.get("art2"):  # transformation: the form the party knows (a1, n1), then the monster (a2, n2)
        art_html = f'<div class="art a1">{n["art"]}</div><div class="art a2">{n["art2"]}</div>'
        names = (f'<p class="name n1">{n["name1"]}</p><p class="sub n1">{n["sub1"]}</p>'
                 f'<p class="name n2">{n["name"]}</p><p class="sub n2">{n["sub"]}</p>')
    else:
        art_html = f'<div class="{art_cls}">{n["art"]}</div>'
        names = f'<p class="name">{n["name"]}</p><p class="sub">{n["sub"]}</p>'
    decide = f'<dt>Worth deciding</dt><dd>{n["decide"]}</dd>' if n.get("decide") else ""
    dur = n.get("dur", 7100)
    cards.append(f'''<article class="card {n["t"]}" data-cue="{n["key"]}" data-dur="{dur}" style="--dur:{dur / 1000:g}s">
  <div class="screen" role="img" aria-label="Entrance banner for {n["label"]}, over the map of {n["where"]}">
    <img class="map" src="art/{n["map"]}.webp" alt="">
    <div class="stage">
      <div class="dim"></div>
      <div class="weather">{n.get("weather", "")}</div>
      {art_html}
      <div class="band side-b"><div class="plate"><div class="strip s1"></div><div class="strip s2"></div><div class="strip s3"></div>
        {names}</div></div>
      {n.get("extra", "")}{n.get("front", "")}
    </div>
    {PLAY}
    <button class="fs" type="button" aria-label="Show {n["label"]} full screen" title="Full screen"><svg class="ico" aria-hidden="true"><use href="#i-full"/></svg></button>
  </div>
  <div class="info">
    <p class="eyebrow">{n["eyebrow"]}</p>
    <h2>{n.get("title", n["name"])}</h2>
    <dl class="meta">
      <dt>Art</dt><dd>{n["artline"]}</dd>
      <dt>Moves</dt><dd>{n["moves"]}</dd>
      <dt>Sound</dt><dd>%%SOUND:{n["key"]}%%</dd>
      {decide}
    </dl>
  </div>
</article>''')

GENERIC_CARD = r'''<article class="card t-generic g-neutral gen" data-cue="gfriend" data-dur="7100" style="--dur:7.1s">
  <div class="screen" role="img" aria-label="A generic entrance banner, over a chapter map">
    <img class="map" src="art/map-vagrant.webp" alt="">
    <div class="stage">
      <div class="dim"></div>
      <div class="weather"></div>
      <div class="art"><img src="art/g-the-daydreamer.webp" alt=""><img class="shade" src="art/g-the-daydreamer.webp" alt=""></div>
      <div class="band side-b"><div class="plate"><div class="strip s1"></div><div class="strip s2"></div><div class="strip s3"></div>
        <p class="name">The Daydreamer</p><p class="sub"></p></div></div>
    </div>
    {PLAY}
    <button class="fs" type="button" aria-label="Show this intro full screen" title="Full screen"><svg class="ico" aria-hidden="true"><use href="#i-full"/></svg></button>
  </div>
  <div class="info">
    <p class="eyebrow">Everyone else · 43 generic intros</p>
    <h2>Everyone else</h2>
    <dl class="meta">
      <dt>Look</dt><dd>One quiet look for all of them. The accent line says friend (gold), neither (pewter) or foe (crimson); only a foe gets the black silhouette and pauses the game. A line under the name only when it is a job or eerie.</dd>
      <dt>Sound</dt><dd>%%SOUND:gfriend%% A foe: %%SOUND:gfoe%%</dd>
      <dt>Pick one</dt><dd><div class="gen-list"><p class="gen-ch">Chapter 10</p><button class="gen-pick" type="button" data-i="0" data-name="The Daydreamer" data-sub="" data-stance="neutral" data-img="art/g-the-daydreamer.webp" data-map="art/map-vagrant.webp">The Daydreamer</button><button class="gen-pick" type="button" data-i="1" data-name="The Harlequin" data-sub="" data-stance="neutral" data-img="art/g-the-harlequin.webp" data-map="art/map-vagrant.webp">The Harlequin</button><button class="gen-pick" type="button" data-i="2" data-name="The Jailbird" data-sub="" data-stance="neutral" data-img="art/g-the-jailbird.webp" data-map="art/map-vagrant.webp">The Jailbird</button><button class="gen-pick" type="button" data-i="3" data-name="The Mariner" data-sub="" data-stance="neutral" data-img="art/g-the-mariner.webp" data-map="art/map-vagrant.webp">The Mariner</button><button class="gen-pick" type="button" data-i="4" data-name="The Songstress" data-sub="" data-stance="neutral" data-img="art/g-the-songstress.webp" data-map="art/map-vagrant.webp">The Songstress</button><button class="gen-pick" type="button" data-i="5" data-name="The lady with the locket" data-sub="" data-stance="neutral" data-img="art/g-the-lady-with-the-locket.webp" data-map="art/map-vagrant.webp">The lady with the locket</button><p class="gen-ch">Chapter 11</p><button class="gen-pick" type="button" data-i="6" data-name="Alda Farnum" data-sub="Innkeeper of the Green Queen Inn" data-stance="neutral" data-img="art/g-alda-farnum.webp" data-map="art/map-mayor.webp">Alda Farnum</button><button class="gen-pick" type="button" data-i="7" data-name="Baltus Tolliver" data-sub="Owner of Tolliver's Trading Post" data-stance="neutral" data-img="art/g-baltus-tolliver.webp" data-map="art/map-mayor.webp">Baltus Tolliver</button><button class="gen-pick" type="button" data-i="8" data-name="Beatrice Wells" data-sub="Carpenter of Wickermoor Village" data-stance="neutral" data-img="art/g-beatrice-wells.webp" data-map="art/map-mayor.webp">Beatrice Wells</button><button class="gen-pick" type="button" data-i="9" data-name="Constable Doris Squire" data-sub="Keeps the law in Wickermoor Village" data-stance="neutral" data-img="art/g-constable-doris-squire.webp" data-map="art/map-mayor.webp">Constable Doris Squire</button><button class="gen-pick" type="button" data-i="10" data-name="Deputy Howie Butterman" data-sub="Serves under Constable Doris Squire" data-stance="friend" data-img="art/g-deputy-howie-butterman.webp" data-map="art/map-mayor.webp">Deputy Howie Butterman</button><button class="gen-pick" type="button" data-i="11" data-name="Eleanor Heyling" data-sub="Bookseller of Wickermoor Village" data-stance="neutral" data-img="art/g-eleanor-heyling.webp" data-map="art/map-mayor.webp">Eleanor Heyling</button><button class="gen-pick" type="button" data-i="12" data-name="Finneas Trout" data-sub="Schoolteacher of Wickermoor Village" data-stance="neutral" data-img="art/g-finneas-trout.webp" data-map="art/map-mayor.webp">Finneas Trout</button><button class="gen-pick" type="button" data-i="13" data-name="Gaston Doray" data-sub="Painter in Wickermoor Village" data-stance="neutral" data-img="art/g-gaston-doray.webp" data-map="art/map-mayor.webp">Gaston Doray</button><button class="gen-pick" type="button" data-i="14" data-name="Hilda Brom" data-sub="Huntress of Wickermoor Hollow" data-stance="neutral" data-img="art/g-hilda-brom.webp" data-map="art/map-mayor.webp">Hilda Brom</button><button class="gen-pick" type="button" data-i="15" data-name="Holly Aster" data-sub="Baker of Wickermoor Village" data-stance="neutral" data-img="art/g-holly-aster.webp" data-map="art/map-mayor.webp">Holly Aster</button><button class="gen-pick" type="button" data-i="16" data-name="Jean Myriel" data-sub="Blacksmith of Wickermoor Village" data-stance="neutral" data-img="art/g-jean-myriel.webp" data-map="art/map-mayor.webp">Jean Myriel</button><button class="gen-pick" type="button" data-i="17" data-name="Jeremiah Stover" data-sub="Spokesman for the village farmers" data-stance="friend" data-img="art/g-jeremiah-stover.webp" data-map="art/map-mayor.webp">Jeremiah Stover</button><button class="gen-pick" type="button" data-i="18" data-name="Marianna Grey" data-sub="Stablemistress at the Green Queen Inn" data-stance="neutral" data-img="art/g-marianna-grey.webp" data-map="art/map-mayor.webp">Marianna Grey</button><button class="gen-pick" type="button" data-i="19" data-name="Morgan" data-sub="Apothecary of Wickermoor Village" data-stance="friend" data-img="art/g-morgan.webp" data-map="art/map-mayor.webp">Morgan</button><button class="gen-pick" type="button" data-i="20" data-name="Oswick Frey" data-sub="Candlemaker at the Wickery" data-stance="friend" data-img="art/g-oswick-frey.webp" data-map="art/map-mayor.webp">Oswick Frey</button><button class="gen-pick" type="button" data-i="21" data-name="Randall Graham" data-sub="Barber-surgeon of Wickermoor Village" data-stance="friend" data-img="art/g-randall-graham.webp" data-map="art/map-mayor.webp">Randall Graham</button><button class="gen-pick" type="button" data-i="22" data-name="Siv Harga" data-sub="Butcher at Harga's Meats" data-stance="neutral" data-img="art/g-siv-harga.webp" data-map="art/map-mayor.webp">Siv Harga</button><button class="gen-pick" type="button" data-i="23" data-name="Solomon Roderick" data-sub="Stonemason at Roderick Masonry" data-stance="neutral" data-img="art/g-solomon-roderick.webp" data-map="art/map-mayor.webp">Solomon Roderick</button><button class="gen-pick" type="button" data-i="24" data-name="Thomasin Ardor" data-sub="Tailor at A Stitch in Time" data-stance="neutral" data-img="art/g-thomasin-ardor.webp" data-map="art/map-mayor.webp">Thomasin Ardor</button><p class="gen-ch">Chapter 12</p><button class="gen-pick" type="button" data-i="25" data-name="Dani Jenkin" data-sub="" data-stance="friend" data-img="art/g-dani-jenkin.webp" data-map="art/map-mayor.webp">Dani Jenkin</button><button class="gen-pick" type="button" data-i="26" data-name="Gilly Jenkin" data-sub="Caretaker of the Druskenvald Estate" data-stance="friend" data-img="art/g-gilly-jenkin.webp" data-map="art/map-mayor.webp">Gilly Jenkin</button><button class="gen-pick" type="button" data-i="27" data-name="Walter Jenkin" data-sub="Butler of the Druskenvald Estate" data-stance="friend" data-img="art/g-walter-jenkin.webp" data-map="art/map-mayor.webp">Walter Jenkin</button><p class="gen-ch">Chapter 13</p><button class="gen-pick" type="button" data-i="28" data-name="Jonah Sawyer" data-sub="Butcher of Foxwillow" data-stance="neutral" data-img="art/g-jonah-sawyer.webp" data-map="art/map-jericho.webp">Jonah Sawyer</button><button class="gen-pick" type="button" data-i="29" data-name="Martha Langtree" data-sub="Runs the Langtree farm in Foxwillow" data-stance="neutral" data-img="art/g-martha-langtree.webp" data-map="art/map-jericho.webp">Martha Langtree</button><button class="gen-pick" type="button" data-i="30" data-name="William Lodge" data-sub="Foxwillow farmer seeking help" data-stance="friend" data-img="art/g-william-lodge.webp" data-map="art/map-jericho.webp">William Lodge</button><p class="gen-ch">Chapter 15</p><button class="gen-pick" type="button" data-i="31" data-name="Lyla" data-sub="Emissary of the Bayou King" data-stance="friend" data-img="art/g-lyla.webp" data-map="art/map-sinner.webp">Lyla</button><button class="gen-pick" type="button" data-i="32" data-name="The Gaunt Waiter" data-sub="Long dead, yet struggling to speak" data-stance="neutral" data-img="art/g-the-gaunt-waiter.webp" data-map="art/map-sinner.webp">The Gaunt Waiter</button><button class="gen-pick" type="button" data-i="33" data-name="Vander" data-sub="The Bayou King of Murkwater Bend" data-stance="friend" data-img="art/g-vander.webp" data-map="art/map-sinner.webp">Vander</button><p class="gen-ch">Chapter 17</p><button class="gen-pick" type="button" data-i="34" data-name="Nurse Godlee" data-sub="Second to Matron Lethica" data-stance="neutral" data-img="art/g-nurse-godlee.webp" data-map="art/map-hugo.webp">Nurse Godlee</button><p class="gen-ch">Chapter 19</p><button class="gen-pick" type="button" data-i="35" data-name="Isolde" data-sub="Spirit hound guarding Maidenmist Cemetery" data-stance="friend" data-img="art/g-isolde.webp" data-map="art/map-reaper.webp">Isolde</button><p class="gen-ch">Chapter 26</p><button class="gen-pick" type="button" data-i="36" data-name="The Barrow King" data-sub="Long-dead king of the Maidenmist barrow" data-stance="foe" data-img="art/g-the-barrow-king.webp" data-map="art/map-kehlenn.webp">The Barrow King</button><button class="gen-pick" type="button" data-i="37" data-name="The Brimstone Behemoth" data-sub="" data-stance="foe" data-img="art/g-the-brimstone-behemoth.webp" data-map="art/map-kehlenn.webp">The Brimstone Behemoth</button><button class="gen-pick" type="button" data-i="38" data-name="The Dusk Mother" data-sub="Ghostly witch of the Webwoods" data-stance="foe" data-img="art/g-the-dusk-mother.webp" data-map="art/map-kehlenn.webp">The Dusk Mother</button><button class="gen-pick" type="button" data-i="39" data-name="The Galloping Headsman" data-sub="" data-stance="foe" data-img="art/g-the-galloping-headsman.webp" data-map="art/map-kehlenn.webp">The Galloping Headsman</button><button class="gen-pick" type="button" data-i="40" data-name="The Jinxed Leviathan" data-sub="" data-stance="foe" data-img="art/g-the-jinxed-leviathan.webp" data-map="art/map-kehlenn.webp">The Jinxed Leviathan</button><button class="gen-pick" type="button" data-i="41" data-name="The Tall Man" data-sub="Stalker of Hartsblight Forest" data-stance="foe" data-img="art/g-the-tall-man.webp" data-map="art/map-kehlenn.webp">The Tall Man</button><button class="gen-pick" type="button" data-i="42" data-name="The Wild Titan" data-sub="" data-stance="foe" data-img="art/g-the-wild-titan.webp" data-map="art/map-kehlenn.webp">The Wild Titan</button></div></dd>
    </dl>
  </div>
</article>'''
cards.append(GENERIC_CARD.replace("{PLAY}", PLAY))
Path(__file__).with_name("cards2.html").write_text("\n\n".join(cards), encoding="utf-8")
print(len(cards), "cards")
