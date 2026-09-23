import { MODULE_ID } from "./preset.js";
import { FATE_THREADS, FATE_STEPS } from "./fateweaving.js";
import { actorCurses } from "./cm-curses.js";
import { actorCard, cardFace, ARCANA_REWARD, tarotEnabled, cmRewardUuid, cmRewardTableUuid } from "./tarot.js";

// §44's "Fate" chapter — the Crooked Moon's card, thread and curses in the Character File. Lifted out of
// character-file.js on 2026-09-22 (§54): it is the one chapter that reads campaign content, so it is the
// pack's `chapters` contribution and the compiler no longer imports tarot, fateweaving or the curses.
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

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
    // DM ask 2026-08-21 ("give a link to the fate"): the reward links to the BOOK'S OWN item
    // document, so one click lands on the full text; a boon with no item falls back to the
    // book's 1d22 reward table. Labels stay unescaped — they are enricher text from our own
    // const map, and pre-escaping would print entities inside the link.
    const rewardUuid = reward ? cmRewardUuid(card.key) : null;
    const tableUuid = reward && !rewardUuid ? cmRewardTableUuid() : null;
    bits.push(`<div class="mc-cf-tarot">
      ${face ? `<img class="mc-cf-card" src="${esc(face)}" alt="">` : ""}
      <div>
        <div class="mc-cf-tarot-name">${esc(card.name)}</div>
        ${card.shown ? "" : `<div class="mc-cf-quiet">not yet turned over</div>`}
        ${reward ? `<div class="mc-cf-unlock"><b>Unlocks:</b> ${rewardUuid ? `@UUID[${rewardUuid}]{${reward.item}}` : esc(reward.item)}<br>
          <span class="mc-cf-quiet">${esc(reward.where)}</span>
          ${tableUuid ? `<br><span class="mc-cf-quiet">Full text: @UUID[${tableUuid}]{the book's reward list}</span>` : ""}</div>` : ""}
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

export const fateChapter = { key: "fate", name: "Fate", build: chFate };
