/**
 * Damage applied from chat: a damage card's buttons apply it, halve it, or heal by it, to the
 * tokens targeted (or, with none targeted, those selected). What it does to hit points, and
 * the save it calls for, is rules/damage.mjs; this writes it to the actor, sets the disabled,
 * dying and dead conditions, and posts what happened, with a button for any save.
 *
 * Only an owner can change an actor, so a player applies damage to their own character and
 * the GM to everything else.
 */
import * as D from "./rules/damage.mjs";
import { characterRolls, creatureRolls } from "./roll.mjs";
import { SYSTEM_ID } from "./config.mjs";
const escape = (s) => foundry.utils.escapeHTML(String(s));

/** The conditions hit points set; the one that applies is on, the others off. */
const HP_STATES = ["disabled", "dying", "dead"];

/** What rules/damage.mjs needs to know about an actor. */
function targetOf(actor) {
  if (actor.type === "character") {
    const d = actor.system.derived ?? {};
    return { hp: { value: actor.system.hp.value, temp: actor.system.hp.temp, max: actor.system.hp.max }, threshold: d.massiveDamage, type: d.creatureType };
  }
  const s = actor.system;
  return { hp: { value: s.hp.value ?? s.hp.max ?? 0, temp: 0, max: s.hp.max ?? s.hp.value ?? 0 }, threshold: s.massiveDamage, type: s.type?.base };
}

/** Write hit points, and the condition they put the actor in. */
async function setHitPoints(actor, hp, state) {
  const update = { "system.hp.value": hp.value };
  if (actor.type === "character") update["system.hp.temp"] = hp.temp;
  await actor.update(update);
  for (const id of HP_STATES) await actor.toggleStatusEffect(id, { active: id === state, overlay: id === "dead" });
}

/** Apply `amount` to an actor (`{ healing, nonlethal }`), and post what it did. */
export async function applyToActor(actor, amount, options = {}) {
  if (!actor.isOwner) return ui.notifications.warn(`Only the GM or ${actor.name}'s owner can change its hit points.`);
  const target = targetOf(actor);
  const result = D.applyHit(target, amount, options);
  await setHitPoints(actor, result.hp, result.state);
  const label = result.state ? ` — ${CONFIG.statusEffects.find((e) => e.id === result.state)?.name ?? result.state}` : "";
  const save = result.save
    ? `<p class="m20-crit">${result.save.kind === "massive" ? "Massive damage" : "Nonlethal damage at the threshold"}: Fortitude DC ${result.save.dc}.</p>` : "";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="m20-roll"><h3>${escape(actor.name)}: ${escape(result.text)}</h3><p>Hit points ${target.hp.value} → ${result.hp.value}${result.hp.temp !== target.hp.temp ? ` (temporary ${target.hp.temp} → ${result.hp.temp})` : ""}${escape(label)}</p>${save}</div>`,
    flags: { [SYSTEM_ID]: result.save ? { save: { actor: actor.uuid, ...result.save } } : {} },
  });
}

/** The tokens a button applies to: those targeted, or else those selected. */
function chosenTokens() {
  const targets = [...(game.user.targets ?? [])];
  return targets.length ? targets : canvas?.tokens?.controlled ?? [];
}

const button = (label, handler) => {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", handler);
  return b;
};

/** A damage card's buttons: Apply, Half, Heal. */
export function bindDamageButtons(message, html, flags) {
  const roll = message.rolls?.[0];
  if (!roll) return;
  const nonlethal = !!flags.damage.nonlethal;
  const apply = (factor, healing = false) => async () => {
    const tokens = chosenTokens();
    if (!tokens.length) return ui.notifications.warn("Target or select the tokens to apply it to.");
    for (const t of tokens) if (t.actor) await applyToActor(t.actor, Math.floor(roll.total * factor), { nonlethal: nonlethal && !healing, healing });
  };
  const buttons = document.createElement("div");
  buttons.className = "m20-card-buttons";
  buttons.append(
    button(nonlethal ? "Apply (nonlethal)" : "Apply", apply(1)),
    button("Half", apply(0.5)),
    button("Heal", apply(1, true)),
  );
  (html.querySelector(".message-content") ?? html).append(buttons);
}

/** The save a hit called for: a button for the actor's owner, and what follows from the roll. */
export function bindSaveButtons(message, html, flags) {
  const { actor: uuid, dc, kind } = flags.save;
  const actor = fromUuidSync(uuid);
  if (!actor?.isOwner) return;
  const buttons = document.createElement("div");
  buttons.className = "m20-card-buttons";
  const b = button(`Fortitude save (DC ${dc})`, async (event) => {
    const rolls = actor.type === "character" ? characterRolls(actor) : creatureRolls(actor);
    const roll = await rolls.save("fort", event);
    if (!roll) return;
    b.disabled = true;
    const passed = roll.total >= dc;
    let text;
    if (kind === "massive") {
      if (passed) text = "Saves against massive damage: no effect beyond the hit points lost.";
      else {
        const value = D.failedMassive(actor.system.hp.value ?? 0);
        await setHitPoints(actor, { value, temp: actor.system.hp.temp ?? 0 }, D.hpState(value));
        text = `Fails against massive damage: hit points drop to ${value}.`;
      }
    } else {
      await actor.toggleStatusEffect(passed ? "dazed" : "unconscious", { active: true });
      text = passed ? "Saves against nonlethal damage: dazed for 1 round." : "Fails against nonlethal damage: unconscious for 1d4+1 rounds.";
    }
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="m20-roll"><p>${escape(text)}</p></div>` });
  });
  buttons.append(b);
  (html.querySelector(".message-content") ?? html).append(buttons);
}
