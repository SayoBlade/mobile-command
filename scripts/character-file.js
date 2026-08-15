import { MODULE_ID, TABLE_SEATS } from "./preset.js";
import { isExecutor } from "./settings.js";
import * as DT from "./downtime.js";
import { FATE_THREADS, FATE_STEPS } from "./fateweaving.js";
import { actorCurses } from "./cm-curses.js";
import { actorCard, cardFace, ARCANA_REWARD, tarotEnabled } from "./tarot.js";

// §44 THE CHARACTER FILE — a book per PC, compiled from what the game already knows.
//
// The premise (§44.1): this is a COMPILE, not a capture. Story answers have carried the question
// that prompted them, their author, a real timestamp and an in-world date since §38.4 — nobody
// has ever read them back, because there was never a view. Six chapters are a read over records
// that already exist; only Deeds (§44.4, slice B) needs a recorder.
//
// TWO DOCUMENTS, ONE DIRECTION (§44.2). "Player Stories" is authored by players from their phones
// and must NEVER be overwritten. This book is generated and is overwritten on every compile. They
// stay separate documents and the flow runs one way, because the failure mode of merging them is
// a recompile eating somebody's backstory.

const esc = (v) => foundry.utils.escapeHTML(String(v ?? ""));

/* -------------------------------------------- */
/*  Which characters get a file                 */
/* -------------------------------------------- */

function filedActors() {
  return game.actors.filter(a => a.type === "character" && a.hasPlayerOwner);
}
function playerOf(actor) {
  return game.users.find(u => !u.isGM && (u.character?.id === actor.id || actor.testUserPermission(u, "OWNER"))) ?? null;
}
function seatOf(user) {
  if (!user) return null;
  try {
    const seats = game.settings.get(MODULE_ID, "tableSeats") ?? {};
    const id = Object.entries(seats).find(([, uid]) => uid === user.id)?.[0];
    return TABLE_SEATS.find(s => s.id === id)?.label ?? null;
  } catch (e) { return null; }
}

/* -------------------------------------------- */
/*  The chapters                                */
/* -------------------------------------------- */

// Each returns HTML, or "" to omit the chapter entirely — an empty chapter is worse than none.
// The classes are all mc-cf-* and styled in shell.css; a world that later removes the module
// keeps every page as plain, readable HTML, which is the point of writing to a journal at all.

function chCover(actor) {
  const u = playerOf(actor);
  const cls = actor.items.find(i => i.type === "class");
  const lvl = actor.system?.details?.level ?? "";
  const line = [cls?.name, lvl ? `Level ${lvl}` : ""].filter(Boolean).join(" · ");
  return `<div class="mc-cf-cover">
    <img class="mc-cf-portrait" src="${esc(actor.img)}" alt="">
    <div class="mc-cf-cover-name">${esc(actor.name)}</div>
    ${line ? `<div class="mc-cf-cover-sub">${esc(line)}</div>` : ""}
    ${u ? `<div class="mc-cf-cover-player">played by ${esc(u.name)}</div>` : ""}
    <div class="mc-cf-cover-link">@UUID[Actor.${actor.id}]{Open the character sheet}</div>
  </div>`;
}

function chCharacter(actor) {
  const byType = (t) => actor.items.find(i => i.type === t);
  const u = playerOf(actor);
  const rows = [
    ["Species", byType("race")?.name],
    ["Background", byType("background")?.name],
    ["Class", actor.items.filter(i => i.type === "class").map(i => `${i.name} ${i.system?.levels ?? ""}`.trim()).join(" / ")],
    ["Level", actor.system?.details?.level],
    ["Player", u?.name],
    ["Seat", seatOf(u)],
    ["Main weapon", actor.items.get(actor.getFlag(MODULE_ID, "mainWeapon") ?? "")?.name]
  ].filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!rows.length) return "";
  return `<dl class="mc-cf-facts">${rows.map(([k, v]) =>
    `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
}

function chBackstory(actor) {
  // dnd5e keeps the biography as authored HTML. Passed through as-is — it is the player's own
  // formatting, and re-escaping it would print their <p> tags at them.
  const bio = actor.system?.details?.biography?.value?.trim();
  return bio ? `<div class="mc-cf-bio">${bio}</div>` : "";
}

/** The player's story chapter — the page §38.4 writes, read here and never written. */
function storyEntries(actor) {
  try {
    const book = game.journal.find(j => j.getFlag(MODULE_ID, "storyJournal"));
    const page = book?.pages.find(p => p.getFlag(MODULE_ID, "storyChapter") === actor.id);
    const list = page?.getFlag(MODULE_ID, "entries");
    return Array.isArray(list) ? [...list].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0)) : [];
  } catch (e) { return []; }
}

function chWords(actor) {
  // The creation beats have their own chapter, so this is everything they said AFTERWARDS —
  // the answers given at the table, in order, each under the question that drew it out.
  const list = storyEntries(actor).filter(e => !e.step);
  if (!list.length) return "";
  return `<div class="mc-cf-words">${list.map(e => `
    <blockquote class="mc-cf-entry">
      ${e.q ? `<div class="mc-cf-q">${esc(e.q)}</div>` : ""}
      <div class="mc-cf-a">${esc(e.text)}</div>
      <div class="mc-cf-when">${esc([e.wd, e.by?.name].filter(Boolean).join(" · "))}</div>
    </blockquote>`).join("")}</div>`;
}

function chCreation(actor) {
  // Step-tagged answers: the beat they gave as each choice was made at session zero.
  const list = storyEntries(actor).filter(e => e.step);
  if (!list.length) return "";
  const LABEL = { species: "Species", background: "Background", class: "Class", abilities: "Abilities",
    spells: "Spells", gear: "Gear", closer1: "Looking back", closer2: "Looking forward" };
  return `<div class="mc-cf-words">${list.map(e => `
    <blockquote class="mc-cf-entry">
      <div class="mc-cf-step">${esc(LABEL[e.step] ?? e.step)}</div>
      ${e.q ? `<div class="mc-cf-q">${esc(e.q)}</div>` : ""}
      <div class="mc-cf-a">${esc(e.text)}</div>
    </blockquote>`).join("")}</div>`;
}

function chFate(actor) {
  if (!tarotEnabled()) return "";
  const bits = [];
  const card = actorCard(actor);
  if (card) {
    const reward = ARCANA_REWARD[card.key];
    const face = cardFace(card);
    // THE SPOILER LIVES HERE AND ONLY HERE. The card's meaning — which heirloom it unlocks and
    // where — is never written to the actor and never reaches a phone (§44.2); it is looked up at
    // compile time into a DM-owned book. There is nothing on the player's side to leak.
    bits.push(`<div class="mc-cf-tarot">
      ${face ? `<img class="mc-cf-card" src="${esc(face)}" alt="">` : ""}
      <div>
        <div class="mc-cf-tarot-name">${esc(card.name)}</div>
        ${card.shown ? "" : `<div class="mc-cf-quiet">not yet turned over</div>`}
        ${reward ? `<div class="mc-cf-unlock"><b>Unlocks:</b> ${esc(reward.item)}<br>
          <span class="mc-cf-quiet">${esc(reward.where)}</span></div>` : ""}
      </div>
    </div>`);
  }
  const ft = actor.getFlag(MODULE_ID, "fateThread");
  const thread = ft?.key ? FATE_THREADS[ft.key] : null;
  if (thread) {
    const reached = Math.min(Number(ft.reached ?? 0), FATE_STEPS.length);
    bits.push(`<div class="mc-cf-block"><h4>${esc(thread.name)}</h4>
      <p><em>${esc(thread.goal ?? "")}</em></p>
      <p class="mc-cf-quiet">${reached} of ${FATE_STEPS.length} touchpoints reached</p></div>`);
  }
  const twists = Number(actor.getFlag(MODULE_ID, "twists") ?? 0);
  if (twists > 0) bits.push(`<p><b>Twists of Fate held:</b> ${twists}</p>`);
  const curses = actorCurses(actor);
  if (curses.length) {
    bits.push(`<div class="mc-cf-block"><h4>Under</h4><ul>${curses
      .map(c => `<li>${esc(c.name)}</li>`).join("")}</ul></div>`);
  }
  return bits.join("");
}

function chDowntime(actor) {
  let st; try { st = DT.normalizeState(game.settings.get(MODULE_ID, "downtimeState")); } catch (e) { return ""; }
  const list = st.activities?.[actor.id] ?? [];
  if (!list.length) return "";
  return `<ul class="mc-cf-downtime">${list.map(a => `
    <li><b>${esc(a.name)}</b>${a.status && a.status !== "active" ? ` <span class="mc-cf-quiet">(${esc(a.status)})</span>` : ""}
      ${a.plan ? `<div class="mc-cf-a">${esc(a.plan)}</div>` : ""}</li>`).join("")}</ul>`;
}

// Order is the reading order of the book. `key` is the page's identity across recompiles.
const CHAPTERS = [
  { key: "cover", name: "Cover", build: chCover },
  { key: "character", name: "The Character", build: chCharacter },
  { key: "backstory", name: "Backstory", build: chBackstory },
  { key: "words", name: "In Their Own Words", build: chWords },
  { key: "creation", name: "Creation", build: chCreation },
  { key: "fate", name: "Fate", build: chFate },
  { key: "downtime", name: "Downtime", build: chDowntime }
];

/* -------------------------------------------- */
/*  The compile                                 */
/* -------------------------------------------- */

// FNV-1a. Not for security — just a cheap, stable fingerprint so a page is only WRITTEN when its
// content actually changed (§44.6). Without this an automatic compile would push ~45 journal-page
// updates a minute to every connected client, all session, for nothing.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

const DM_ONLY = { default: 0 }; // CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE — §44.3, DM decision

async function ensureBook(actor) {
  let book = game.journal.find(j => j.getFlag(MODULE_ID, "charFile") === actor.id);
  if (!book) {
    book = await JournalEntry.create({
      name: actor.name,
      ownership: DM_ONLY,
      flags: { [MODULE_ID]: { charFile: actor.id } }
    });
  } else if (book.name !== actor.name) {
    await book.update({ name: actor.name }); // they renamed the character; the book follows
  }
  return book;
}

/** One PC's book. Returns how many pages were actually written. */
async function compileBook(actor) {
  const book = await ensureBook(actor);
  let writes = 0;
  let sort = 0;
  for (const ch of CHAPTERS) {
    sort += 100;
    let html = "";
    try { html = ch.build(actor) ?? ""; } catch (e) {
      console.warn(`${MODULE_ID} | character file: chapter "${ch.key}" failed for ${actor.name}`, e);
      continue; // one bad chapter must never cost the DM the whole book
    }
    const page = book.pages.find(p => p.getFlag(MODULE_ID, "charChapter") === ch.key);
    if (!html) { // nothing to say — drop a chapter that has emptied out, never leave a stale one
      if (page) { await page.delete(); writes++; }
      continue;
    }
    const sig = hash(html);
    if (page) {
      if (page.getFlag(MODULE_ID, "charHash") === sig && page.sort === sort) continue; // unchanged
      await page.update({ "text.content": html, sort, [`flags.${MODULE_ID}.charHash`]: sig });
    } else {
      await book.createEmbeddedDocuments("JournalEntryPage", [{
        name: ch.name, type: "text", sort, "text.content": html,
        flags: { [MODULE_ID]: { charChapter: ch.key, charHash: sig } }
      }]);
    }
    writes++;
  }
  // The DM's own chapter: created once, at the back, and NEVER regenerated (§44.5). Anything else
  // the DM adds by hand carries no charChapter flag, so the loop above never touches it either.
  if (!book.pages.find(p => p.getFlag(MODULE_ID, "charNotes"))) {
    await book.createEmbeddedDocuments("JournalEntryPage", [{
      name: "DM's Notes", type: "text", sort: 9000,
      text: { content: "<p><em>Yours. Nothing here is ever overwritten.</em></p>" },
      flags: { [MODULE_ID]: { charNotes: true } }
    }]);
    writes++;
  }
  return writes;
}

/** The index: every PC's portrait, linking to their book. */
async function compileIndex(actors) {
  let entry = game.journal.find(j => j.getFlag(MODULE_ID, "charFileIndex"));
  const cards = actors.map(a => {
    const book = game.journal.find(j => j.getFlag(MODULE_ID, "charFile") === a.id);
    const cls = a.items.find(i => i.type === "class");
    return `<div class="mc-cf-idx-card">
      <img src="${esc(a.img)}" alt="">
      <div class="mc-cf-idx-name">${book ? `@UUID[JournalEntry.${book.id}]{${esc(a.name)}}` : esc(a.name)}</div>
      <div class="mc-cf-quiet">${esc([cls?.name, a.system?.details?.level ? `level ${a.system.details.level}` : ""].filter(Boolean).join(" · "))}</div>
    </div>`;
  }).join("");
  const html = `<div class="mc-cf-index">${cards || "<p>No player characters yet.</p>"}</div>`;
  const sig = hash(html);
  if (!entry) {
    entry = await JournalEntry.create({
      name: "Character Files", ownership: DM_ONLY,
      flags: { [MODULE_ID]: { charFileIndex: true } }
    });
  }
  const page = entry.pages.find(p => p.getFlag(MODULE_ID, "charChapter") === "index");
  if (page) {
    if (page.getFlag(MODULE_ID, "charHash") === sig) return 0;
    await page.update({ "text.content": html, [`flags.${MODULE_ID}.charHash`]: sig });
  } else {
    await entry.createEmbeddedDocuments("JournalEntryPage", [{
      name: "The Party", type: "text", "text.content": html,
      flags: { [MODULE_ID]: { charChapter: "index", charHash: sig } }
    }]);
  }
  return 1;
}

let compiling = false;
export let lastCompile = { at: 0, writes: 0 };

/** Compile every PC's file. Executor-only: five GM clients each writing the same book is five
 *  times the traffic and a guaranteed race. Returns the number of pages actually written. */
export async function compileCharacterFiles() {
  if (compiling || !game.user?.isGM || !isExecutor()) return 0;
  compiling = true;
  let writes = 0;
  try {
    const actors = filedActors();
    for (const a of actors) writes += await compileBook(a);
    writes += await compileIndex(actors);
    lastCompile = { at: Date.now(), writes };
  } catch (e) {
    console.error(`${MODULE_ID} | character file compile failed`, e);
  } finally { compiling = false; }
  return writes;
}

// Every 3 minutes (§44.6). The cadence is cheap only BECAUSE of the hash check above: on a normal
// tick nothing has changed — no story answer, no level-up, no card turned — and the pass writes
// nothing at all. What it costs then is building a few strings and comparing them.
const COMPILE_EVERY_MS = 3 * 60 * 1000;
let timer = null;

export function registerCharacterFiles() {
  Hooks.once("ready", () => {
    if (!game.user?.isGM) return;
    clearInterval(timer);
    timer = setInterval(() => { compileCharacterFiles(); }, COMPILE_EVERY_MS);
    // One pass shortly after load so a DM who opens the journal straight away finds it current,
    // rather than waiting out the first interval.
    setTimeout(() => compileCharacterFiles(), 20000);
  });
}
