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

/** The conditions hit points set (rules/damage.mjs hpConditions). */
const HP_CONDITIONS = ["dead", "dying", "disabled", "stable", "unconscious"];

const destroyedAtZero = (actor) => ["construct", "undead"].includes(String(targetOf(actor).type ?? "").toLowerCase());

/**
 * Write hit points, and the conditions they put the actor in. `lost` (damage taken) makes a
 * stable character dying again; `stable`, `awake` and `recovering` set a character's progress
 * below 0 (rules/damage.mjs belowZeroSave).
 * Unconscious is only switched off when hit points put it on (not one a sleep spell set).
 */
export async function setHitPoints(actor, hp, { lost = false, stable: nowStable, awake, recovering } = {}) {
  const was = new Set(actor.statuses);
  const stable = nowStable ?? (!lost && was.has("stable"));
  const c = D.hpConditions(hp.value, { stable, awake: awake ?? (stable && !was.has("unconscious")), destroyedAtZero: destroyedAtZero(actor) });
  const update = { "system.hp.value": hp.value };
  if (actor.type === "character") {
    if (hp.temp !== undefined) update["system.hp.temp"] = hp.temp;
    update["system.hp.recovering"] = hp.value >= 0 ? false : (recovering ?? actor.system.hp.recovering) && !lost;
  }
  await actor.update(update);
  const fromHitPoints = was.has("dying") || was.has("stable");
  for (const id of HP_CONDITIONS) {
    if (id === "unconscious" && !c.unconscious && !fromHitPoints) continue;
    if (was.has(id) !== c[id]) await actor.toggleStatusEffect(id, { active: c[id], overlay: id === "dead" });
  }
  return c;
}

/** Apply `amount` to an actor (`{ healing, nonlethal }`), and post what it did. */
export async function applyToActor(actor, amount, options = {}) {
  if (!actor.isOwner) return ui.notifications.warn(`Only the GM or ${actor.name}'s owner can change its hit points.`);
  const target = targetOf(actor);
  const result = D.applyHit(target, amount, options);
  await setHitPoints(actor, result.hp, { lost: !options.healing && result.hp.value < target.hp.value });
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

/** Post a card asking `actor` for a Fortitude save of `kind` ("massive", "nonlethal", "dying", "waking", "recovery"). */
export async function askForSave(actor, kind, text) {
  const dc = ["dying", "waking", "recovery"].includes(kind) ? D.DYING_DC : D.MASSIVE_DC;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="m20-roll"><p class="m20-crit">${escape(text)}</p></div>`,
    flags: { [SYSTEM_ID]: { save: { actor: actor.uuid, dc, kind } } },
  });
}

/** Roll a Fortitude save of `kind` for `actor`, and apply what follows from it. */
export async function rollSave(actor, kind, event) {
  const dc = ["dying", "waking", "recovery"].includes(kind) ? D.DYING_DC : D.MASSIVE_DC;
  const rolls = actor.type === "character" ? characterRolls(actor) : creatureRolls(actor);
  const roll = await rolls.save("fort", event);
  if (!roll) return null;
  const passed = roll.total >= dc;
  const value = actor.system.hp.value ?? actor.system.hp.max ?? 0;
  let text;
  if (kind === "massive") {
    if (passed) text = "Saves against massive damage: no effect beyond the hit points lost.";
    else {
      const after = D.failedMassive(value);
      await setHitPoints(actor, { value: after }, { lost: true });
      text = `Fails against massive damage: hit points drop to ${after}.`;
    }
  } else if (kind === "nonlethal") {
    await actor.toggleStatusEffect(passed ? "dazed" : "unconscious", { active: true });
    text = passed ? "Saves against nonlethal damage: dazed for 1 round." : "Fails against nonlethal damage: unconscious for 1d4+1 rounds.";
  } else {
    const r = D.belowZeroSave(kind, value, passed);
    await setHitPoints(actor, { value: r.value }, { lost: r.value < value, stable: r.stable, awake: r.awake, recovering: r.recovering });
    text = r.text;
  }
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="m20-roll"><p>${escape(text)}</p></div>` });
  return passed;
}

/** The save a card asks for: a button for the actor's owner. */
export function bindSaveButtons(message, html, flags) {
  const { actor: uuid, dc, kind } = flags.save;
  const actor = fromUuidSync(uuid);
  if (!actor?.isOwner) return;
  const buttons = document.createElement("div");
  buttons.className = "m20-card-buttons";
  const b = button(`Fortitude save (DC ${dc})`, async (event) => {
    const done = await rollSave(actor, kind, event);
    if (done !== null) b.disabled = true;
  });
  buttons.append(b);
  (html.querySelector(".message-content") ?? html).append(buttons);
}

/**
 * At the start of a dying combatant's turn, a card asks for its save. Posted by the active GM
 * alone, so once.
 */
export function registerDyingHooks() {
  Hooks.on("updateCombat", (combat, changes) => {
    if (!game.user.isActiveGM || !("turn" in changes || "round" in changes)) return;
    const actor = combat.combatant?.actor;
    if (!actor || !actor.statuses.has("dying") || actor.statuses.has("stable")) return;
    askForSave(actor, "dying", `${actor.name} is dying (${actor.system.hp.value} hit points): a Fortitude save (DC ${D.DYING_DC}) to stabilise, or lose 1 hit point.`);
  });
}
