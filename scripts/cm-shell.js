import { MODULE_ID } from "./preset.js";
import { FATE_THREADS, FATE_STEPS } from "./fateweaving.js"; // §34 the player's thread card
import { actorCurses } from "./cm-curses.js"; // §35.1 the Crooked Moon tab lists them richly
import { actorCard as tarotCard, cardFace as tarotFace, tarotBack, revealActorCard, tarotCanDismiss, tarotEnabled, TAROT_FLIP_MS } from "./tarot.js"; // §42 the Fated Tarot

/**
 * ── THE CROOKED MOON TAB OF THE PHONE (§35.1) — a content pack's shellTab (§54) ───────────────
 *
 * Lifted out of shell.js on 2026-09-22, behaviour unchanged: the same sections, the same data-action
 * names, the same flag writes. The private fields that used to live on the ControllerShell class
 * (#twistDie, #twistNote, #tarotDismissed, #tarotTurning) are now this pack's `state` object on each
 * shell instance, handed in through `ctx` = { shell, actor, state, render, showEffectDetails }.
 */

export function initialState() {
  return { twistDie: 20, twistNote: "", tarotDismissed: null, tarotTurning: false };
}

  // §31 Twist of Fate — the spend panel (inline under the condition strip, like the condition
  // palette; phone inputs stay inline per the house rule). Book RAW: once per turn, when a
  // creature you can SEE makes an ability check, attack roll, or saving throw, expend one to
  // replace the d20 with a 1 or a 20. The spend is a REQUEST: it writes twistPending on the
  // actor (owner-writable) and the DM's panel applies or refunds — nothing rewinds on its own.
function twistPanelHTML(ctx) {
  const { actor, state } = ctx;
    const esc = foundry.utils.escapeHTML;
    const n = Number(actor.getFlag(MODULE_ID, "twists") ?? 0);
    const pending = actor.getFlag(MODULE_ID, "twistPending");
    let body;
    if (pending) {
      body = `
        <div class="mc-twist-wait"><i class="fas fa-shuffle"></i>
          You twist fate — a <b>natural ${pending.die === 1 ? "1" : "20"}</b>${pending.note ? ` <span class="mc-twist-waitnote">(${esc(pending.note)})</span>` : ""}.
          The DM holds the thread.</div>
        <button class="mc-twist-withdraw" data-action="twist-withdraw"><i class="fas fa-rotate-left"></i> Withdraw</button>`;
    } else if (n <= 0) {
      body = `<div class="mc-twist-none">Fate owes you nothing right now.</div>`;
    } else {
      body = `
        <div class="mc-twist-dies">
          <button class="mc-twist-die ${state.twistDie === 20 ? "mc-on" : ""}" data-action="twist-die" data-die="20"><span class="mc-twist-die-num">20</span><span class="mc-twist-die-sub">triumph</span></button>
          <button class="mc-twist-die mc-twist-die-1 ${state.twistDie === 1 ? "mc-on" : ""}" data-action="twist-die" data-die="1"><span class="mc-twist-die-num">1</span><span class="mc-twist-die-sub">ruin</span></button>
        </div>
        <input type="text" class="mc-twist-note" maxlength="80" placeholder="Whose roll? (say it aloud too)" value="${esc(state.twistNote)}" autocomplete="off" enterkeyhint="send">
        <button class="mc-twist-send" data-action="twist-send"><i class="fas fa-shuffle"></i> Twist Fate</button>`;
    }
    // §35.1: this panel lives INSIDE the Crooked Moon tab now (DM 2026-08-21, "tab only") —
    // a standing section needs no close button; leaving the tab is the close.
    return `<div class="mc-cond-panel mc-twist-panel">
      <div class="mc-cond-panel-head">
        <span>Twist of Fate ${n > 0 ? `<span class="mc-twist-count">×${n}</span>` : ""}</span>
      </div>
      <div class="mc-twist-rule">Once per turn, when a creature you can see makes an ability check,
        attack roll, or saving throw, spend a twist to replace the d20 with a natural 1 or 20.</div>
      ${body}
    </div>`;
  }

  // §35.1 THE CROOKED MOON TAB (planned with the DM 2026-08-21) — a HOME, not a new system.
  // The arc is deliberate: fate dealt → destiny chosen → fate's currency → fate's price.
  // Everything here is DM-granted, so an empty tab never nags — quiet lines, no instructions.

export function crookedTabHTML(ctx) {
  const { actor, state } = ctx;
    const esc = foundry.utils.escapeHTML;
    const sections = [];

    // 1. Your card (§42) — SEALED (DM 2026-08-21): face + name after the turn, nothing else.
    //    Adela's words, the reward, the place it unlocks — all stay in the DM's mouth.
    const tCard = tarotEnabled() ? tarotCard(actor) : null;
    if (tCard) {
      sections.push(`<div class="mc-cm-sec">
        <div class="mc-cm-label">Your card</div>
        <button class="mc-cm-card ${tCard.shown ? "" : "mc-cm-facedown"}" data-action="tarot-open"
          title="${tCard.shown ? "Your card" : "Your card — still face down"}">
          <img src="${esc(tCard.shown ? tarotFace(tCard) : tarotBack())}" alt="">
          <span class="mc-cm-cardname">${tCard.shown ? esc(tCard.name) : "Still face down"}</span>
        </button>
      </div>`);
    }

    // 2. Your thread (§34) — the spoiler-safe card, standing instead of chip-hidden:
    //    goal + reached touchpoints named; the road ahead stays dark.
    const ft = actor.getFlag(MODULE_ID, "fateThread");
    const thread = ft?.key ? FATE_THREADS[ft.key] : null;
    if (thread) {
      const reached = Math.min(Number(ft.reached ?? 0), 6);
      const steps = FATE_STEPS.map((s, i) =>
        i < reached
          ? `<li class="mc-fate-step mc-fate-done"><i class="fas fa-check"></i> ${esc(s.name)}</li>`
          : `<li class="mc-fate-step"><i class="fas fa-circle"></i> <span class="mc-fate-unknown">— the thread runs on into the dark —</span></li>`
      ).join("");
      sections.push(`<div class="mc-cm-sec">
        <div class="mc-cm-label">Your thread</div>
        <div class="mc-cm-thread"><i class="fas fa-scroll"></i> ${esc(thread.name)}</div>
        <p class="mc-cm-goal"><em>${esc(thread.goal)}</em></p>
        <ol class="mc-fate-steps">${steps}</ol>
      </div>`);
    }

    // 3. Twists of Fate (§31) — the full spend flow, resident here (the old popup, sans close).
    const twists = Number(actor.getFlag(MODULE_ID, "twists") ?? 0);
    const twistPending = actor.getFlag(MODULE_ID, "twistPending");
    if (twists > 0 || twistPending) {
      sections.push(`<div class="mc-cm-sec mc-cm-sec-twist">${twistPanelHTML(ctx)}</div>`);
    }

    // 4. Curses (§33) — richly listed here; their chips STAY in the condition strip too
    //    (a curse is a live condition like Prone). Time bar when the cast stored its length;
    //    a plain minutes-left line for curses cast before that was recorded.
    const curses = actorCurses(actor);
    if (curses.length) {
      const rows = curses.map(e => {
        const f = e.flags?.[MODULE_ID] ?? {};
        const leftMs = Math.max(0, (f.expiresAt ?? 0) - Date.now());
        const leftMin = Math.ceil(leftMs / 60000);
        const total = Number(f.minutes ?? 0) * 60000;
        const pct = total > 0 ? Math.max(2, Math.min(100, Math.round(leftMs / total * 100))) : null;
        const desc = String(e.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        return `<div class="mc-cm-curse" data-action="cond-open" data-effect-id="${e.id}">
          <div class="mc-cm-cursehead"><span class="mc-cm-cursename">${esc(e.name)}</span>
            <span class="mc-cm-curseleft">${f.expiresAt ? `${leftMin}m left` : ""}</span></div>
          ${desc ? `<div class="mc-cm-cursetext"><em>${esc(desc)}</em></div>` : ""}
          ${pct !== null ? `<div class="mc-cm-cursebar"><span style="width:${pct}%"></span></div>` : ""}
        </div>`;
      }).join("");
      sections.push(`<div class="mc-cm-sec">
        <div class="mc-cm-label">Curses</div>${rows}
      </div>`);
    }

    // 5. The bargain (§33 bargain mode) — ask to reroll, at a curse's price. Gated on the
    //    DM's toggle, but a pending ask or an unseen answer always renders (turning the mode
    //    off mid-flight must not strand a live state invisible).
    const bargainOn = (() => { try { return !!game.settings.get(MODULE_ID, "bargainMode"); } catch (e) { return false; } })();
    const bPending = actor.getFlag(MODULE_ID, "bargainPending");
    const bResult = actor.getFlag(MODULE_ID, "bargainResult");
    if (bargainOn || bPending || bResult) {
      let bBody;
      if (bResult === "struck") {
        bBody = `<div class="mc-cm-bargain-ans"><i class="fas fa-scale-unbalanced"></i>
            The bargain is struck — the price is on you. Roll again.</div>
          <button class="mc-cm-bargain-btn" data-action="bargain-done"><i class="fas fa-check"></i> Done</button>`;
      } else if (bResult === "declined") {
        bBody = `<div class="mc-cm-bargain-ans"><i class="fas fa-scale-unbalanced"></i>
            The Moon declines. The roll stands.</div>
          <button class="mc-cm-bargain-btn" data-action="bargain-done"><i class="fas fa-check"></i> Done</button>`;
      } else if (bPending) {
        bBody = `<div class="mc-cm-bargain-ans"><i class="fas fa-moon"></i>
            The Moon is considering your offer…</div>
          <button class="mc-cm-bargain-btn" data-action="bargain-withdraw"><i class="fas fa-rotate-left"></i> Withdraw</button>`;
      } else {
        bBody = `<p class="mc-cm-goal"><em>A poor roll can be rolled again — for a price.
            The Moon chooses the curse.</em></p>
          <button class="mc-cm-bargain-btn" data-action="bargain-ask"><i class="fas fa-scale-unbalanced"></i> Request Reroll</button>`;
      }
      sections.push(`<div class="mc-cm-sec">
        <div class="mc-cm-label">The bargain</div>${bBody}
      </div>`);
    }

    const body = sections.length
      ? sections.join("")
      : `<div class="mc-cm-quiet">The Moon has not taken notice of you yet.</div>`;
    return `<div class="mc-cm-tab">${body}</div>`;
  }

  // §42.2 THE CARD IN THEIR HAND (DM 2026-08-11: "a full size card back, no text, when clicked
  // it animates a flip to the full sized card front, no text, nothing more, freeze for 5 seconds,
  // and then an additional click closes the card").
  //
  // The card and nothing else. No name, no caption, no button, no reading — Adela's words are the
  // DM's to say out loud, and every label we added was the interface talking over them. What is
  // left is the object: a back that fills the phone, a turn, and a face.
  //
  // VERTICAL FLIP, on purpose. A horizontal flip is how a UI reveals a panel; lifting the near
  // edge of a card toward you is how a hand actually turns one over at a table.

  //
  // THE FIVE SECONDS ARE A GUARD, not a delay. The tap that turns the card and the tap that puts
  // it away are the same gesture in the same place — without a dead window, the second half of an
  // eager double-tap dismisses the card the player never actually saw.
export function tarotHandHTML(ctx) {
  const { actor, state } = ctx;
    if (!tarotEnabled()) return "";
    const c = tarotCard(actor);
    if (!c || (c.shown && state.tarotDismissed === `${c.key}:${c.at}`)) return "";
    const esc = foundry.utils.escapeHTML;
    const face = tarotFace(c);
    return `<div class="mc-tarot-hand ${c.shown ? "mc-tarot-turned" : ""}">
      <div class="mc-tarot-hand-card" data-action="tarot-card">
        <div class="mc-tarot-hand-inner">
          <div class="mc-tarot-hand-back" style="background-image:url('${esc(tarotBack())}')"></div>
          <div class="mc-tarot-hand-face" style="background-image:url('${esc(face)}')"></div>
        </div>
      </div>
    </div>`;
  }

  // §31: the spend request / its withdrawal (async pair — #onClick itself is not async).
async function twistSend(ctx) {
  const { actor, state } = ctx;
    if (Number(actor.getFlag(MODULE_ID, "twists") ?? 0) <= 0) return;
    await actor.setFlag(MODULE_ID, "twistPending", { die: state.twistDie, note: state.twistNote.trim().slice(0, 80), ts: Date.now() });
    state.twistNote = "";
    ctx.render();
  }
async function twistWithdraw(ctx) {
  const { actor } = ctx;
    await actor.unsetFlag(MODULE_ID, "twistPending");
    ctx.render();
  }

/** The tab's own data-action handlers; true = handled. */
export function onAction(action, el, ctx) {
  const { actor, state } = ctx;
  switch (action) {
      // §31 Twist of Fate: open/choose/send/withdraw. The send writes twistPending on the
      // actor; the DM's panel is the only thing that spends or refunds the token.
      case "twist-die":
        state.twistDie = Number(el.dataset.die) === 1 ? 1 : 20; { ctx.render(); return true; }
      case "twist-send": { twistSend(ctx); return true; }
      case "twist-withdraw": { twistWithdraw(ctx); return true; }
      // §33 bargain mode: the ask/withdraw pair writes the player's own actor flag (the
      // twist idiom — no RPC); the DM's drawer answers by swapping it for bargainResult,
      // and Done clears the answer once it's been seen.
      case "bargain-ask":
        actor?.setFlag(MODULE_ID, "bargainPending", { ts: Date.now() })
          .catch(e => console.warn(`${MODULE_ID} | bargain ask failed`, e));
        return true;
      case "bargain-withdraw":
        actor?.unsetFlag(MODULE_ID, "bargainPending")
          .catch(e => console.warn(`${MODULE_ID} | bargain withdraw failed`, e));
        return true;
      case "bargain-done":
        actor?.unsetFlag(MODULE_ID, "bargainResult")
          .catch(e => console.warn(`${MODULE_ID} | bargain clear failed`, e));
        return true;
      case "tarot-open": { state.tarotDismissed = null; { ctx.render(); return true; } }
      // §42.2 one target, two meanings: face down it turns over, face up it goes away. The
      // player owns their own actor, so the reveal is a direct flag write — no RPC, same as a
      // twist spend.
      case "tarot-card": {
        const held = tarotCard(actor);
        if (!held) return;
        if (!held.shown) {
          if (state.tarotTurning) return; // a touch screen sends a second, synthesised click
          state.tarotTurning = true;
          // TURN THE ELEMENT THAT IS ALREADY ON SCREEN. Writing the flag first would re-render the
          // shell, rebuilding the card with the turned class already applied — a CSS transition
          // needs an element that PERSISTS across the change, so the flip would be replaced by a
          // jump cut. So: animate the live card, and only persist once it has finished turning.
          el.closest(".mc-tarot-hand")?.classList.add("mc-tarot-turned");
          setTimeout(() => {
            state.tarotTurning = false;
            revealActorCard(actor, true); // now the re-render lands on an already-finished flip
          }, TAROT_FLIP_MS);
          // NO WAKE-UP RE-RENDER when the hold expires. There was one, and it was pointless as
          // well as visible: nothing about the card CHANGES at five seconds — tarotCanDismiss is
          // read at click time, from the card's own timestamp — so the render had nothing to
          // repaint. What it did do was rebuild .mc-tarot-hand, which replays its entrance
          // animation: the card faded out and back in for no reason, five seconds after the turn
          // (DM 2026-08-11). Deleting the timer is the whole fix.
          return true;
        }
        // The guard is read from the card itself, so a ghost click arriving after the reveal has
        // landed cannot put away a card nobody has looked at yet.
        if (!tarotCanDismiss(held)) return;
        state.tarotDismissed = `${held.key}:${held.at}`;
        ctx.render();
        return true;
      }
    default: return false;
  }
}

/** The shellTab contribution (§54). `id` stays "crooked" so every class name and tab id is unchanged. */
export const crookedShellTab = {
  id: "crooked",
  icon: "mc-icon-cmoon",
  label: "The Crooked Moon",
  initialState,
  body: crookedTabHTML,
  header: tarotHandHTML, // §42.2 the dealt card fills the phone above the tab bar
  onAction,
  // §31: keep the "whose roll" draft across re-renders (the shell's input listener asks each pack).
  onInput: (t, ctx) => { if (t instanceof HTMLInputElement && t.classList.contains("mc-twist-note")) { ctx.state.twistNote = t.value; return true; } return false; },
  // A curse is a live condition like Prone: its chip stays in the strip, marked (§35.1).
  chipClass: (e) => (e?.flags?.[MODULE_ID]?.curse ? "mc-curse-chip" : ""),
  // Dot = business waiting in the tab: a twist the DM holds, or a bargain answer not yet seen (§6.5).
  dot: (ctx) => !!(ctx.actor?.getFlag(MODULE_ID, "twistPending") || ctx.actor?.getFlag(MODULE_ID, "bargainResult"))
};
