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
import { readDefenses, damageParts, reduceDamage } from "./rules/resistance.mjs";
import { characterRolls, creatureRolls } from "./roll.mjs";
import { SYSTEM_ID } from "./config.mjs";
import { exists } from "./presence.mjs";
const escape = (s) => foundry.utils.escapeHTML(String(s));

/** The conditions hit points set (rules/damage.mjs hpConditions). */
const HP_CONDITIONS = ["dead", "dying", "disabled", "stable", "unconscious"];

/** What rules/damage.mjs needs to know about an actor. */
function targetOf(actor) {
  if (actor.type === "character") {
    const d = actor.system.derived ?? {};
    return { hp: { value: actor.system.hp.value, temp: actor.system.hp.temp, max: actor.system.hp.max }, threshold: d.massiveDamage, type: d.creatureType };
  }
  const s = actor.system;
  // A stat block that prints no threshold has its Constitution score's (Modern/deathdyinghealing).
  return { hp: { value: s.hp.value ?? s.hp.max ?? 0, temp: 0, max: s.hp.max ?? s.hp.value ?? 0 }, threshold: s.massiveDamage ?? s.abilities?.con ?? null, type: s.type?.base };
}

/** The option marking a change of hit points this module made, with the conditions it sets itself. */
const OWN_CHANGE = "modern20HitPoints";

const destroyedAtZero = (actor) => ["construct", "undead"].includes(String(targetOf(actor).type ?? "").toLowerCase());

/**
 * Write hit points, and the conditions they put the actor in. `lost` (damage taken) makes a
 * stable character dying again; `stable`, `awake` and `recovering` set a character's progress
 * below 0 (rules/damage.mjs belowZeroSave).
 */
export async function setHitPoints(actor, hp, { lost = false, stable, awake, recovering } = {}) {
  const update = { "system.hp.value": hp.value };
  if (actor.type === "character") {
    if (hp.temp !== undefined) update["system.hp.temp"] = hp.temp;
    update["system.hp.recovering"] = hp.value >= 0 ? false : (recovering ?? actor.system.hp.recovering) && !lost;
  }
  // Marked, so the hook that sets conditions for hit points changed anywhere else leaves these to this.
  await actor.update(update, { [OWN_CHANGE]: true });
  return setConditions(actor, hp.value, { lost, stable, awake });
}

/**
 * The conditions hit points put the actor in, switched on and off to match (rules/damage.mjs hpConditions).
 * Unconscious is only switched off when hit points put it on (not one a sleep spell set).
 */
async function setConditions(actor, value, { lost = false, stable: nowStable, awake } = {}) {
  const was = new Set(actor.statuses);
  const stable = nowStable ?? (!lost && was.has("stable"));
  const c = D.hpConditions(value, { stable, awake: awake ?? (stable && !was.has("unconscious")), destroyedAtZero: destroyedAtZero(actor) });
  const fromHitPoints = was.has("dying") || was.has("stable");
  for (const id of HP_CONDITIONS) {
    if (id === "unconscious" && !c.unconscious && !fromHitPoints) continue;
    if (was.has(id) !== c[id]) await actor.toggleStatusEffect(id, { active: c[id], overlay: id === "dead" });
  }
  return c;
}

/** Hit points before a change made elsewhere (typed on the sheet, a token's bar), by actor, for the change after it. */
const before = new Map();

/**
 * Hit points changed anywhere but a damage card or a save (typed on the sheet, a token's bar, the maximum
 * followed): the conditions follow them, by the client that made the change. Called once, at init.
 */
export function registerHitPointConditionHooks() {
  // Ability damage and drain: their conditions follow them, and a Constitution of 0 is death (rules/damage.mjs).
  Hooks.on("updateActor", async (actor, changes, options, userId) => {
    if (userId !== game.user.id || actor.type !== "character" || !foundry.utils.hasProperty(changes, "system.abilities") || !exists(actor)) return;
    const c = D.abilityConditions(actor.system.abilities, actor.system.derived?.scores?.con);
    for (const id of ["abilityDamaged", "abilityDrained"]) if (actor.statuses.has(id) !== c[id]) await actor.toggleStatusEffect(id, { active: c[id] });
    // Death is not undone by the score coming back: that is the GM's to say.
    if (c.dead && !actor.statuses.has("dead")) await actor.toggleStatusEffect("dead", { active: true, overlay: true });
  });
  const changesHp = (changes) => foundry.utils.hasProperty(changes, "system.hp.value");
  Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
    if (userId !== game.user.id || options[OWN_CHANGE] || !changesHp(changes)) return;
    before.set(actor.uuid, actor.system.hp.value ?? actor.system.hp.max ?? 0);
  });
  Hooks.on("updateActor", async (actor, changes, options, userId) => {
    if (userId !== game.user.id || options[OWN_CHANGE] || !changesHp(changes)) return;
    // What they were, where the pre-update hook saw it (an unlinked token's may not come through it).
    const was = before.get(actor.uuid);
    before.delete(actor.uuid);
    const value = actor.system.hp.value;
    if (value === null || value === undefined || value === was || !exists(actor)) return;
    // Hit points the maximum took away (Constitution lost) are not damage: a stable character stays stable.
    const lost = was !== undefined && value < was && !options.modern20Following;
    if (actor.type === "character") {
      const recovering = value >= 0 ? false : actor.system.hp.recovering && !lost;
      if (recovering !== actor.system.hp.recovering) await actor.update({ "system.hp.recovering": recovering }, { [OWN_CHANGE]: true });
    }
    await setConditions(actor, value, { lost });
  });
}

/** Apply `amount` to an actor (`{ healing, nonlethal }`), and post what it did. */
export async function applyToActor(actor, amount, options = {}) {
  if (!actor.isOwner) return ui.notifications.warn(`Only the GM or ${actor.name}'s owner can change its hit points.`);
  const target = targetOf(actor);
  // Damage reduction, resistance and immunity, part by part (rules/resistance.mjs).
  let reduced = null;
  if (!options.healing && options.parts?.length) {
    const defenses = actor.type === "character" ? actor.system.derived?.defenses ?? { dr: [], resist: {}, immune: [] } : readDefenses(actor.system.specialQualities);
    reduced = reduceDamage(options.parts, defenses, { ignoreDR: options.ignoreDR });
    amount = reduced.total;
  }
  const result = D.applyHit(target, amount, options);
  await setHitPoints(actor, result.hp, { lost: !options.healing && result.hp.value < target.hp.value });
  const label = result.state ? ` — ${CONFIG.statusEffects.find((e) => e.id === result.state)?.name ?? result.state}` : "";
  const stopped = reduced?.stopped.length ? `<p class="m20-hint">Stopped: ${reduced.stopped.map((x) => `${x.amount} by ${escape(x.by)}`).join("; ")}.</p>` : "";
  const save = result.save
    ? `<p class="m20-crit">${result.save.kind === "massive" ? "Massive damage" : "Nonlethal damage at the threshold"}: Fortitude DC ${result.save.dc}.</p>` : "";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="m20-roll"><h3>${escape(actor.name)}: ${escape(result.text)}</h3><p>Hit points ${target.hp.value} → ${result.hp.value}${result.hp.temp !== target.hp.temp ? ` (temporary ${target.hp.temp} → ${result.hp.temp})` : ""}${escape(label)}</p>${stopped}${save}</div>`,
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
  // The roll's parts by the labels on its dice ("plus 1d6 fire"), the rest of the weapon's type.
  const terms = roll.terms.map((t) => (t.operator ? { operator: t.operator } : { flavor: t.flavor, total: t.total }));
  const parts = damageParts(terms, roll.total, flags.damage.type ?? "");
  // A load that makes half of the damage another kind (plasma-coated: fire): the weapon's part split.
  if (flags.damage.half && parts[0]?.type === (flags.damage.type ?? "")) {
    const half = Math.floor(parts[0].amount / 2);
    parts.splice(0, 1, { type: flags.damage.type ?? "", amount: parts[0].amount - half }, { type: flags.damage.half, amount: half });
  }
  const apply = (factor, { healing = false, ignoreDR = false } = {}) => async () => {
    const tokens = chosenTokens();
    if (!tokens.length) return ui.notifications.warn("Target or select the tokens to apply it to.");
    const scaled = parts.map((p) => ({ ...p, amount: Math.floor(p.amount * factor) }));
    for (const t of tokens) {
      if (t.actor) await applyToActor(t.actor, Math.floor(roll.total * factor), { nonlethal: nonlethal && !healing, healing, parts: healing ? null : scaled, ignoreDR });
    }
  };
  const buttons = document.createElement("div");
  buttons.className = "m20-card-buttons";
  buttons.append(
    button(nonlethal ? "Apply (nonlethal)" : "Apply", apply(1)),
    button("Half", apply(0.5)),
    button("Heal", apply(1, { healing: true })),
  );
  // Damage reduction a magic or silver weapon overcomes ("10/+1", "5/silver"): the card cannot know the weapon is one.
  const ignore = button("Ignore DR", apply(1, { ignoreDR: true }));
  ignore.dataset.tooltip = "Apply without damage reduction: a weapon that overcomes it (magic, silver, ...)";
  buttons.append(ignore);
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

/**
 * Stabilised by another's Treat Injury check (DC 15): stable and unconscious, and, being tended,
 * recovering hit points naturally from now on, even while unconscious (Modern/deathdyinghealing,
 * Recovering with Help). Only the hourly save to wake is left.
 */
export async function stabiliseWithHelp(actor) {
  const value = actor.system.hp.value;
  if (value >= 0) return;
  await setHitPoints(actor, { value }, { stable: true, awake: false, recovering: true });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="m20-roll"><p>${escape(actor.name)} is stabilised with Treat Injury: unconscious, with a Fortitude save (DC ${D.DYING_DC}) each hour to wake, and healing naturally from now on.</p></div>` });
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
/**
 * At the start of a combatant's turn, the round-long actions it took end: fighting defensively and total
 * defense (rules/conditions.mjs ACTIONS). Done by the active GM alone.
 */
export function registerTurnHooks() {
  Hooks.on("updateCombat", async (combat, changes) => {
    if (!game.user.isActiveGM || !("turn" in changes || "round" in changes)) return;
    const actor = combat.combatant?.actor;
    for (const id of ["fightingDefensively", "totalDefense"]) if (actor?.statuses.has(id)) await actor.toggleStatusEffect(id, { active: false });
  });
}

export function registerDyingHooks() {
  Hooks.on("updateCombat", (combat, changes) => {
    if (!game.user.isActiveGM || !("turn" in changes || "round" in changes)) return;
    const actor = combat.combatant?.actor;
    if (!actor || !actor.statuses.has("dying") || actor.statuses.has("stable")) return;
    askForSave(actor, "dying", `${actor.name} is dying (${actor.system.hp.value} hit points): a Fortitude save (DC ${D.DYING_DC}) to stabilise, or lose 1 hit point.`);
  });
}
