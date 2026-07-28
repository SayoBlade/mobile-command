import { MODULE_ID } from "./preset.js";

// §33 Chaotic Curses — fleeting, RP-focused afflictions per the book's Appendix C shape:
// they last REAL-WORLD minutes (default 20), alter perception/behavior/body, and stay light
// on combat math. EVERY entry below is our own original writing (the DM-approved seed voice:
// losses framed as transactions — something took, borrowed, or is collecting). The book's own
// 156 curses are never shipped; a DM who owns the-crooked-moon-2014 can point the flow at any
// RollTable via the `curseTable` setting (UUID) instead of this list.
//
// A curse = a self-reverting ActiveEffect: mechanics only as effect deltas (temp-max HP, AC
// bonus, sense override) — base actor data is never written. Real-time expiry rides
// flags[MODULE_ID].curse.expiresAt; ONE GM client (activeGM) sweeps every 30s.

// 1–10: the mechanical ladder (pairs). 11–100: pure RP. `changes` builds per-actor deltas.
const M = () => CONST.ACTIVE_EFFECT_MODES;
const HOLLOWED = {
  name: "Hollowed",
  text: "Something is wearing part of you. Half your life is elsewhere until it gives it back.",
  changes: (a) => [{ key: "system.attributes.hp.tempmax", mode: M().ADD, value: String(-Math.floor((a.system.attributes.hp.max ?? 0) / 2)) }]
};
const UNSHELLED = {
  name: "Unshelled",
  text: "Your skin forgets it is armor. Blades remember you fondly.",
  changes: () => [{ key: "system.attributes.ac.bonus", mode: M().ADD, value: "-2" }]
};
const PALSIED = {
  name: "Palsied Hand",
  text: "Your left hand answers to someone else now. It rests only when watched."
};
const DIMMED = {
  name: "Dimmed",
  text: "The dark took back its gift. It says you never thanked it.",
  changes: () => [{ key: "system.attributes.senses.darkvision", mode: M().OVERRIDE, value: "0" }]
};
const COTTON = {
  name: "Cotton Ears",
  text: "All sound reaches you through six feet of earth. Someone down there is listening with you."
};

const RP = [
  // 11–20 — the approved seeds
  ["Counted", "You must count every door you pass through, aloud. You are somewhere in the high hundreds, and something is waiting for a particular number."],
  ["Paranoia", "One member of your party casts no reflection when nobody is watching. You have almost caught it twice."],
  ["Wet Footprints", "Wet footprints appear where you walked a minute ago. Yours. Never quite where you stepped."],
  ["The Smell of Rain", "You smell rain just before something bad happens. You smell it now."],
  ["Borrowed Voice", "Your laugh belongs to someone older. It comes out on schedule, not on humor."],
  ["Candle Debt", "Flames lean toward you. Light is collecting. Sooner or later it will want carrying."],
  ["Second Shadow", "Your shadow arrives half a second late. It is getting later."],
  ["Salt Hunger", "Unsalted food tastes of nothing at all. The salt is the only part still on your side."],
  ["The Polite Guest", "You must thank every room as you leave it. The rooms have started to expect it."],
  ["Cold Seat", "Every chair you take is already cold in the shape of a person. Recently vacated. For you."],
  // 21–36 — compulsions
  ["Knock Twice", "Every door you open must be knocked on first. Whatever is on the other side already heard you."],
  ["The Borrowed Step", "Your left foot insists on going first. It knows where it is going; you don't."],
  ["Say It Back", "You must repeat the last word anyone says to you, quietly. They notice on the third time."],
  ["Inventory", "Every hour you must name aloud everything you carry. Something new keeps appearing on the list."],
  ["The Long Way", "You cannot take the shortest path to anything. The middle of the floor is not to be trusted."],
  ["Held Breath", "You hold your breath crossing every threshold. You started doing this for a reason you can't remember."],
  ["Grave Manners", "You must introduce yourself to every corpse you meet. It would be worse to be rude."],
  ["The Tally", "You must announce your remaining hit points to the room whenever they change. Someone is keeping score."],
  ["Small Payments", "Every container you open costs a copper, left inside. The prices are not negotiable."],
  ["Candle Courtesy", "You cannot be the one to put out a flame. Ask someone. The flame remembers who."],
  ["Still Here", "When your name is spoken you must answer \"still here.\" One day you will be glad you confirmed."],
  ["The Seam", "You must run a finger along every wall you walk beside. You are checking for the seam. You'll know it."],
  ["Last Sip", "You can never finish a drink. The last sip belongs to someone else now."],
  ["Doorman", "You must hold every door for whoever comes behind you. Wait. Someone always comes."],
  ["Introductions", "You must announce each spell you cast like a guest at court: name, then school. They like being presented."],
  ["Backwards Grace", "Before eating you must thank the meal itself, not any god. Meat thanked is meat calmed."],
  // 37–56 — perceptions (only you)
  ["The Third Knock", "Every knock you hear gains one extra knock only you hear. There is one more of whoever is knocking than everyone else thinks."],
  ["Low Tide", "All water looks an inch lower to you than it is. Something under the surface is drinking."],
  ["The Understudy", "In every mirror you pass, you stand a step behind where you are. It is rehearsing."],
  ["Old Acquaintance", "Every stranger's face looks, for a heartbeat, like someone you buried."],
  ["Sweet Rot", "Everything smells faintly of flowers a day past their best. Near danger, the flowers freshen."],
  ["The Draft", "A cold draft finds the back of your neck in every closed room. Sealed rooms are the coldest."],
  ["Wrong Clock", "Every clock you read runs a minute behind for you. You are owed those minutes. Something is collecting them."],
  ["The Choir", "Wind through anything — grass, windows, teeth — carries a hum in a language you almost know."],
  ["Second Voice", "Your echo runs half a word long. It adds one small word. Listen: it is always \"soon.\""],
  ["Wet Light", "Candlelight looks wet to you, and torchlight drips upward. Don't stand under it."],
  ["The Milk Tooth", "One of your teeth feels loose. A different one each time you check. None are loose. Keep checking."],
  ["Doorframes", "Every doorway looks half a head too short for you. Duck or don't; it will only matter once."],
  ["The Crowd", "Every room sounds like it holds one more person than you can count. Counting aloud stops it. For a while."],
  ["The Slow Blink", "Everyone around you blinks a beat too slowly. Whatever they see mid-blink, they are not telling you."],
  ["Name Tags", "Over sleeping creatures you briefly see names. Not their names. Their next names."],
  ["Wet Wool", "All cloth near you smells of wet wool. Sheep know something — about the weather, or about you."],
  ["The Restless Star", "One star in any night sky refuses to hold still. It is not a star, and it has noticed the attention."],
  ["Breadcrumbs", "You keep spotting little piles of crumbs leading somewhere. Always away from where you are going."],
  ["The Held Note", "Any bell you hear keeps ringing faintly under everything for an hour. It is a long name, being spelled."],
  ["Room Temperature", "You can feel exactly where someone died in any room. It is the warm spot, not the cold one."],
  // 57–72 — social curses
  ["Father's Name", "Your own name comes out as your father's when you say it. He has started answering."],
  ["The Compliment", "You must compliment every enemy before your first attack. Be sincere. They can tell."],
  ["First Yawn", "Every yawn in the party starts with you. You are not tired. Something is, through you."],
  ["The Notary", "You cannot agree to anything without shaking on it. Every handshake feels witnessed."],
  ["Formal Address", "You must address everything by title, even the vermin — \"Master Rat.\" Titles are protection. Mostly yours."],
  ["The Apology", "You apologize to objects you bump into. Today, the third one accepted."],
  ["Old Tongue", "Once an hour a word leaves you in a dead language. Your friends don't know it. The dead do."],
  ["Court Manners", "You must bow to anything taller than you. The trees are the problem."],
  ["The Middleman", "You cannot hand anything directly to anyone; it must be set down between you. Whatever taxes the exchange has taken nothing. Yet."],
  ["Loud Thoughts", "You must narrate your plans aloud, in the third person. Somewhere, minutes are being taken."],
  ["The Toast", "Before drinking you must toast someone dead. They take turns being thirsty."],
  ["The Signature", "Blank lines ask to be signed, and you oblige. You have signed four things today. What were they?"],
  ["State Your Business", "Entering any building you must state your business to the doorframe. It has let worse in."],
  ["Honest Coin", "You cannot lie while holding money. Your purse has never felt heavier."],
  ["A Scratch", "You must describe every wound as \"a scratch.\" The wounds are starting to believe you."],
  ["Last Word", "You must have the last word in every conversation, even if the word is \"anyway.\" Something waits for conversations to truly end."],
  // 73–88 — body-wrongness
  ["Cold Hands", "Your hands are grave-cold. Everyone you touch flinches, then asks if you are all right. You are not sure."],
  ["The Parting", "Your hair keeps a parting no comb can move. Something walks that path at night."],
  ["Second Pulse", "Your left wrist carries a second, slower pulse. It is not yours. It is patient."],
  ["The New Fit", "All your clothes fit like they were made for someone slightly taller. You are growing into them. That is the plan."],
  ["Knee Music", "Your joints click in little tunes. Familiar ones. Your knees know the funeral march."],
  ["The Shed", "You find your own nail-clippings wherever you rest. More than ten."],
  ["Loose Thread", "A thread hangs from your sleeve and returns when cut. Do not pull it. It is load-bearing."],
  ["Ill-Fitting Face", "Your smile takes one second too long to start, and to stop. Everyone pretends not to notice."],
  ["The Tide Line", "A faint waterline sits at your collarbone. It rises while you sleep."],
  ["Numb Word", "Your tongue goes numb whenever you try to say \"safe.\" Say something else. It will be more honest."],
  ["The Weight", "Your shadow is heavier on the left; you list slightly. Whatever it is carrying, it is yours."],
  ["Borrowed Height", "Sitting down, you are briefly the wrong height — an inch of you is standing up somewhere else."],
  ["Sleep Ledger", "You recite lists in your sleep: doors, names, debts. The party has started taking notes."],
  ["The Extra Knuckle", "Counting your own knuckles gives a different number each time. Never a lower one."],
  ["Winter Breath", "Your breath fogs in any season. Something in you is keeping cold for later."],
  ["The Itch", "An itch crosses your back tracing letters. It is spelling something long, and it is halfway done."],
  // 89–100 — debts and bargains
  ["Small Debt", "You owe three copper. You cannot remember to whom. Interest is being calculated."],
  ["The Ledger", "Every kindness done to you appears that night in a dream, as a line in a ledger. The column is headed OWED."],
  ["Bought Time", "You lost an hour today. It was taken fairly. The receipt is under your pillow."],
  ["Collateral", "One of your memories is held as collateral. You cannot remember which. That is the point."],
  ["First Fruits", "The first coin of any treasure is already spoken for. Leave it. You will know where."],
  ["The Retainer", "Something considers you employed. You do not know the job. Payment keeps arriving in dreams, so you must be good at it."],
  ["Cosigned", "Your next promise binds two of you: you, and the listener below."],
  ["Rent", "Your shadow pays rent to stay attached — one warm breath a minute. On cold nights you can watch the payments."],
  ["The Finder's Fee", "Anything you find was placed for you to find. The fee will be collected in kind."],
  ["Layaway", "Something has put you on layaway. Small installments are already paid for: a laugh, a habit, the way you hold a cup."],
  ["The Guarantor", "Long ago — drunk, maybe — you guaranteed someone safe passage. They are moving again. You had best hope they arrive."],
  ["Paid in Full", "For one hour, everything is free: doors open, guards nod, dogs keep quiet. Something has covered your costs, and it will want to discuss the repayment schedule."]
];

// The full 1–100: mechanical pairs at 1–10, then the RP list.
export const CURSES = [
  HOLLOWED, HOLLOWED, UNSHELLED, UNSHELLED, PALSIED, PALSIED, DIMMED, DIMMED, COTTON, COTTON,
  ...RP.map(([name, text]) => ({ name, text }))
];

export function curseTableUuid() {
  try { return game.settings.get(MODULE_ID, "curseTable") || ""; } catch (e) { return ""; }
}

// Roll a curse: the custom RollTable when configured (the DM's own content — e.g. the book's
// 1d156), else our d100. Returns { n, name, text, builtin }.
export async function rollCurse() {
  const uuid = curseTableUuid();
  if (uuid) {
    try {
      const table = await fromUuid(uuid);
      if (table?.roll) {
        const { roll, results } = await table.roll();
        const r = results?.[0];
        if (r) {
          const raw = (r.name || r.text || r.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          const name = (r.name && r.name !== raw ? r.name : raw.split(/[.:!]/)[0]).slice(0, 40) || "A curse";
          return { n: roll?.total ?? 0, name, text: raw, builtin: false };
        }
      }
    } catch (e) { console.warn(`${MODULE_ID} | curse table roll failed — falling back to the built-in d100`, e); }
  }
  const n = Math.ceil(CONFIG.Dice.randomUniform() * 100);
  const c = CURSES[n - 1];
  return { n, name: c.name, text: c.text, builtin: true };
}

export function pickCurse(n) {
  const c = CURSES[Math.max(1, Math.min(100, n)) - 1];
  return { n, name: c.name, text: c.text, builtin: true };
}

// Apply: one self-reverting ActiveEffect; real-time expiry in the flag (the sweep enforces
// it), a matching game-time duration so the sheet shows something sensible.
export async function applyCurse(actor, pick, minutes = 20) {
  const builtinChanges = pick.builtin ? (CURSES[pick.n - 1]?.changes?.(actor) ?? []) : [];
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: pick.name,
    img: "icons/svg/eye.svg",
    description: `<p><em>${foundry.utils.escapeHTML(pick.text)}</em></p><p>This will pass on its own. Probably.</p>`,
    duration: { seconds: Math.round(minutes * 60) },
    changes: builtinChanges,
    flags: { [MODULE_ID]: { curse: true, expiresAt: Date.now() + minutes * 60000, roll: pick.n } }
  }]);
}

export function actorCurses(actor) {
  return (actor?.effects ?? []).filter(e => e.flags?.[MODULE_ID]?.curse);
}

// The sweep: exactly ONE GM client (activeGM) lifts expired curses, every 30s. Timestamp is
// data, not a timer — reloads and downtime can't strand a curse (the séance-era lesson:
// world-state effects need a guaranteed off ramp).
let sweepTimer = null;
export function initCurseSweep() {
  if (sweepTimer) return;
  sweepTimer = setInterval(async () => {
    if (!game.ready || game.users.activeGM?.id !== game.user.id) return;
    const now = Date.now();
    for (const a of game.actors) {
      const expired = actorCurses(a).filter(e => (e.flags[MODULE_ID].curse ? e.flags[MODULE_ID].expiresAt : 0) <= now && e.flags[MODULE_ID].expiresAt);
      if (expired.length) {
        try { await a.deleteEmbeddedDocuments("ActiveEffect", expired.map(e => e.id)); }
        catch (e) { console.warn(`${MODULE_ID} | curse sweep failed on ${a.name}`, e); }
      }
    }
  }, 30000);
}
