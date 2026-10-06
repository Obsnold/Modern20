/**
 * Rolling: a roll from rules/rolls.mjs, made in Foundry and posted to chat
 * with its breakdown.
 *
 * Before a d20 roll the player is asked for a situational modifier and, on a
 * character with action points, whether to spend one. Shift-click skips the
 * question (or asks it, with the "Ask before rolling" setting off). An attack's
 * card carries buttons for its damage, and on a threat for confirming the
 * critical and rolling critical damage.
 */
import { abilityModifier } from "./data/models.mjs";
import * as R from "./rules/rolls.mjs";
import { recordRoll } from "./log.mjs";
import { SYSTEM_ID } from "./config.mjs";
import { identify } from "./rules/identify.mjs";
import { rulesFor } from "./rules/feats.mjs";
import { readAttacks, attackRoll, damageRoll } from "./rules/attacks.mjs";
import { bindDamageButtons, bindSaveButtons } from "./damage.mjs";
import { bindLevelCheck } from "./casting.mjs";
import { spendAmmo } from "./ammo.mjs";
import { unarmedRules, unarmedWeapon, unarmedTerms } from "./rules/unarmed.mjs";
import { automatic, semiautomatic, AUTOFIRE_REFLEX_DC } from "./rules/ammo.mjs";
import { resolveValue, mechanicsContext } from "./rules/effects.mjs";
const signed = (n) => (typeof n === "number" ? (n >= 0 ? `+${n}` : `${n}`) : n);
const escape = (s) => foundry.utils.escapeHTML(String(s));

/** Settings for rolling; called from the init hook. */
export function registerRollSettings() {
  game.settings.register(SYSTEM_ID, "askBeforeRolling", {
    name: "Ask before rolling",
    hint: "Ask for a situational modifier, and whether to spend an action point, before a d20 roll. Shift-click does the opposite.",
    scope: "client", config: true, type: Boolean, default: true,
  });
}

/**
 * Ask for a modifier and an action point, and tick any `options` that apply
 * (`[{ name, label }]`, e.g. Point Blank Shot); null if the player cancels.
 */
async function ask(actor, spec, event, options = [], texts = []) {
  const wanted = game.settings.get(SYSTEM_ID, "askBeforeRolling") !== !!event?.shiftKey;
  if (!wanted) return {};
  const ap = actor.type === "character" ? actor.system.actionPoints.value : 0;
  const die = R.actionPointDie(actor.system.derived?.level ?? 1);
  const content = `
    <div class="form-group"><label>Situational modifier</label><input type="number" name="modifier" value="0" autofocus></div>
    ${options.map((o) => (o.choices
      ? `<div class="form-group"><label>${escape(o.label)}</label><select name="${o.name}">${o.choices.map(([v, l]) => `<option value="${escape(v)}">${escape(l)}</option>`).join("")}</select></div>`
      : `<div class="form-group"><label>${escape(o.label)}</label><input type="checkbox" name="${o.name}"></div>`)).join("")}
    ${texts.length ? `<ul class="m20-roll-notes">${texts.map((t) => `<li>${escape(t)}</li>`).join("")}</ul>` : ""}
    ${ap > 0 ? `<div class="form-group"><label>Spend an action point (${escape(die.label.replace(/^Action point /, ""))}; ${ap} left)</label><input type="checkbox" name="actionPoint"></div>` : ""}`;
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: spec.title },
    content,
    ok: { label: "Roll", callback: (ev, button) => ({
      modifier: button.form.elements.modifier.valueAsNumber || 0,
      actionPoint: !!button.form.elements.actionPoint?.checked,
      ...Object.fromEntries(options.map((o) => [o.name, o.choices ? button.form.elements[o.name]?.value : !!button.form.elements[o.name]?.checked])),
    }) },
    rejectClose: false,
  });
  if (!result) return null;
  return { ...result, actionPoint: result.actionPoint ? die : null };
}

/**
 * Post a roll to chat as `actor`; returns the Roll. `flags` are kept on the
 * message for its buttons (an attack's weapon and critical); `judge(roll)`
 * adds flags that depend on the result (whether a critical was confirmed).
 */
export async function post(actor, spec, { flags = {}, judge } = {}) {
  if (!spec) return null;
  if (spec.unusable) { ui.notifications.warn(`${spec.title}: ${spec.unusable}`); return null; }
  const Roll = foundry.dice?.Roll ?? globalThis.Roll;
  const roll = await new Roll(spec.formula).evaluate();
  const lines = spec.terms.map((t) => `<li>${escape(t.label)} <strong>${escape(signed(t.value))}</strong></li>`).join("");
  const judged = judge?.(roll) ?? {};
  let note = "", threat = false;
  if (spec.critical && spec.formula.startsWith("1d20")) {
    // A threat is a hit in the weapon's range: a roll judged a miss is not one.
    threat = (roll.dice[0]?.total ?? 0) >= spec.critical.threat && !(judged.hit && !judged.hit.hit);
    if (threat) note = `<p class="m20-crit">Critical threat (×${spec.critical.multiplier}).</p>`;
  } else if (spec.critical) {
    note = `<p class="m20-hint">On a confirmed critical: ×${spec.critical.multiplier}.</p>`;
  }
  const flavor = `<div class="m20-roll"><h3>${escape(spec.title)}</h3>${lines ? `<ul>${lines}</ul>` : ""}${note}</div>`;
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor, flags: { [SYSTEM_ID]: { ...flags, ...judged, threat, critical: spec.critical ?? flags.critical, formula: spec.formula } } });
  await recordRoll(actor, spec.title, roll.total);
  return roll;
}

/**
 * Ask, spend the action point if one was chosen, and post. `rebuild` makes the
 * roll again from what was ticked (an attack with Point Blank Shot); `notes` are the
 * situational notes that apply (rules/rolls.mjs notesFor).
 */
async function rollD20(actor, spec, event, flags, { options = [], rebuild, before, notes = { ticks: [], texts: [] } } = {}) {
  if (!spec || spec.unusable) return post(actor, spec);
  // The notes that apply (Fast-Talk, a species' save bonus): those with a value as tick boxes, the rest as text.
  options = [...options, ...notes.ticks];
  const build = rebuild;
  rebuild = (ticked) => R.withNotes(build ? build(ticked) : spec, notes.ticks, ticked);
  const added = await ask(actor, spec, event, options, notes.texts);
  if (!added) return null;
  // What was chosen: a tick box's yes or no, a choice's value (or, not asked, its first).
  const ticked = Object.fromEntries(options.map((o) => [o.name, o.choices ? added[o.name] ?? o.choices[0][0] : !!added[o.name]]));
  // An action point is checked first, so a roll it stops has not spent anything else.
  if (added.actionPoint && actor.system.actionPoints.value < 1) { ui.notifications.warn(`${actor.name} has no action points left.`); return null; }
  // Anything the roll costs besides an action point (a weapon's rounds); it can stop the roll.
  if (before && (await before(ticked)) === false) return null;
  if (added.actionPoint) await actor.update({ "system.actionPoints.value": actor.system.actionPoints.value - 1 });
  // A critical is confirmed with the attack's own modifiers, the situational one included, but not an
  // action point's die: a point spent on a roll applies to that roll alone.
  spec = rebuild(ticked);
  const confirm = flags?.attack ? R.withAdditions(spec, { modifier: added.modifier }).formula : undefined;
  return post(actor, R.withAdditions(spec, added), {
    flags: flags ? { ...flags, confirm, attack: { ...flags.attack, ...ticked } } : {},
    judge: flags?.attack ? (roll) => (spec.againstDefense ? judgeAgainstArea(roll, spec.againstDefense) : judgeAgainstTarget(roll, { touch: flags.attack.touch })) : undefined,
  });
}

/** Autofire: against the square's Defense, not a token's. */
function judgeAgainstArea(roll, defense) {
  const natural = roll.dice[0]?.total;
  return { hit: { name: "the 10-foot square", defense, touch: false, hit: natural === 20 || (natural !== 1 && roll.total >= defense) } };
}

/**
 * An attack against the one token targeted, if one is: whether it hits its Defense (touch
 * Defense for a touch attack). A natural 20 always hits and a natural 1 always misses.
 */
function judgeAgainstTarget(roll, { touch = false } = {}) {
  const targets = [...(game.user.targets ?? [])];
  if (targets.length !== 1) return {};
  const defense = defenseOf(targets[0].actor, { touch });
  if (defense === null || defense === undefined) return {};
  const natural = roll.dice[0]?.total;
  const hit = natural === 20 || (natural !== 1 && roll.total >= defense);
  return { hit: { name: targets[0].name, defense, touch, hit } };
}

/** Every roll a character's sheet offers, by name. Pass the click event so shift works. */
export function characterRolls(actor) {
  const d = actor.system.derived;
  const feats = actor.items.filter((i) => i.type === "feat" || i.type === "talent").map((i) => ({ name: i.name, identifier: identify(i), choice: i.system.choice ?? "" }));
  const notes = (targets) => R.notesFor(notesOf(actor), targets, resolverFor(actor));
  return {
    ability: (key, event) => rollD20(actor, R.abilityCheck(d, key), event, undefined, { notes: notes(R.rollTargets.ability(key)) }),
    save: (key, event) => rollD20(actor, R.savingThrow(d, key), event, undefined, { notes: notes(R.rollTargets.save(key)) }),
    skill: (key, specialty, event) => {
      const row = d.skills.find((s) => s.key === key && s.specialty === (specialty ?? ""));
      return rollD20(actor, R.skillCheck(d, row), event, undefined, { notes: row ? notes(R.rollTargets.skill(row)) : undefined });
    },
    attack: (item, event) => {
      // Point Blank Shot is the player's call: the SRD's "within 30 feet" is not something the sheet can see.
      const options = !item.system.melee && feats.some((f) => rulesFor(f.identifier).pointBlank) ? [{ name: "pointBlank", label: "Within 30 feet (Point Blank Shot: +1 attack and damage)" }] : [];
      const modes = firingModes(item, feats);
      if (modes.length > 1) options.unshift({ name: "mode", label: "Firing mode", choices: modes });
      return rollD20(actor, R.attack(d, item, feats, { mode: modes[0]?.[0] }), event, { attack: { actor: actor.uuid, item: item.id } }, {
        options, notes: notes(R.rollTargets.attack(!!item.system.melee)),
        rebuild: (ticked) => R.attack(d, item, feats, ticked),
        // A firearm spends its rounds as it fires: none left, no attack.
        before: (ticked) => (item.system.melee ? true : spendAmmo(actor, item, ticked.mode ?? modes[0]?.[0] ?? "single")),
      });
    },
    /**
     * An unarmed strike: nonlethal, or lethal (−4 without Combat Martial Arts), with the
     * unarmed feats' die, bonus and critical (rules/unarmed.mjs).
     */
    unarmed: (event) => {
      const u = unarmedRules(feats.map((f) => rulesFor(f.identifier)));
      const options = [{ name: "lethal", label: u.lethalAllowed ? "Lethal damage (Combat Martial Arts)" : "Lethal damage (−4 on the attack)" }];
      if (u.streetfighting) options.push({ name: "streetfighting", label: `Streetfighting: +${u.streetfighting} damage (once a round)` });
      const build = (ticked = {}) => withTerms(R.attack(d, unarmedWeapon(u, ticked), feats), unarmedTerms(u, ticked));
      return rollD20(actor, build(), event, { attack: { actor: actor.uuid, item: "unarmed" } }, { options, rebuild: build, notes: notes(R.rollTargets.attack(true, true)) });
    },
    /** Starting a grapple: a melee touch attack to grab, judged against the target's touch Defense. */
    grab: (event) => {
      const spec = R.d20("Grab: melee touch attack (to start a grapple)", [
        { label: "Base attack", value: d.baseAttackBonus }, { label: "Strength", value: d.modifiers.str ?? 0 },
        { label: "Size", value: R.SIZE_ATTACK[d.size] ?? 0 }, { label: "Effects", value: d.attackBonus?.melee ?? 0 },
      ]);
      return rollD20(actor, spec, event, { attack: { actor: actor.uuid, item: "grab", touch: true } }, { notes: notes([...R.rollTargets.attack(true), ...R.rollTargets.grapple()]) });
    },
    /** A grapple check: base attack + Str + the size's grapple modifier, opposed by the target's. */
    grapple: (event) => rollD20(actor, R.d20("Grapple check (opposed)", [
      { label: "Base attack", value: d.baseAttackBonus }, { label: "Strength", value: d.modifiers.str ?? 0 },
      { label: "Size and effects", value: d.grapple - d.baseAttackBonus - (d.modifiers.str ?? 0) },
    ]), event, undefined, { notes: notes(R.rollTargets.grapple()) }),
    damage: (item, { multiplier = 1, pointBlank = false, mode, lethal = false, streetfighting = false } = {}) => {
      // The unarmed strike is not an item: rebuilt from the feats, as it was attacked with.
      const u = item === "unarmed" ? unarmedRules(feats.map((f) => rulesFor(f.identifier))) : null;
      if (u) item = unarmedWeapon(u, { lethal });
      const spec = R.damage(d, item, { pointBlank, mode });
      if (!spec) return ui.notifications.info(`${item.name}: its damage is not a roll (${item.system.damage.value || "see its description"}).`);
      const nonlethal = /nonlethal/i.test(item.system.damageType ?? "");
      if (mode === "autofire") spec.title += ` — everyone in the square: Reflex DC ${AUTOFIRE_REFLEX_DC} or take it`;
      let rolled = multiplier > 1 ? R.criticalDamage(spec, multiplier) : spec;
      // Streetfighting's extra die, once a round, is not multiplied on a critical.
      if (u?.streetfighting && streetfighting) rolled = { ...rolled, formula: `${rolled.formula} + ${u.streetfighting}`, terms: [...rolled.terms, { label: "Streetfighting", value: u.streetfighting }] };
      // The weapon's damage type, for damage reduction and resistance when it is applied (an unarmed strike's is bludgeoning).
      return post(actor, rolled, { flags: { damage: { nonlethal, type: u ? "bludgeoning" : item.system.damageType ?? "" } } });
    },
  };
}

/** Every note the actor's feats, talents and species carry (tools/build/mechanics.mjs), each with its source. */
export function notesOf(actor) {
  return actor.items.filter((i) => ["feat", "talent", "species"].includes(i.type))
    .flatMap((i) => (i.system.notes ?? []).map((n) => ({ ...n, source: i.name })));
}

/** A note's value worked out for the actor: a number, or a formula of its class levels, level and ability modifiers. */
export function resolverFor(actor) {
  const d = actor.system.derived ?? {};
  const classes = actor.items.filter((i) => i.type === "class");
  const context = mechanicsContext(classes, d.level ?? 0, d.modifiers ?? {});
  return (value) => resolveValue(value, context);
}

/** A roll with more named terms, its formula rebuilt (an unarmed strike's Brawl bonus). */
function withTerms(spec, terms) {
  return R.d20(spec.title, [...spec.terms, ...terms], { critical: spec.critical });
}

/**
 * The firing modes a ranged weapon offers, as `[value, label]`: single shots, a double tap
 * (a semiautomatic, with Double Tap), a burst (an automatic, with Burst Fire) and autofire.
 * A weapon that fires only on automatic (a machine gun) offers autofire first.
 */
function firingModes(item, feats) {
  if (item.system.melee) return [];
  const has = (mode) => feats.some((f) => rulesFor(f.identifier).fireMode === mode);
  const modes = [];
  const semi = semiautomatic(item), auto = automatic(item);
  if (semi || !auto) modes.push(["single", "Single shot"]);
  if (semi && has("doubleTap")) modes.push(["doubleTap", "Double tap (2 rounds: −2 attack, +1 die)"]);
  if (auto && has("burst")) modes.push(["burst", "Burst fire (5 rounds: −4 attack, +2 dice)"]);
  if (auto) modes.push(["autofire", `Autofire (10 rounds: a 10-ft. square, Defense 10; Reflex DC ${AUTOFIRE_REFLEX_DC})`]);
  if (!semi && auto) modes.push(["single", "Single shot"]);
  return modes;
}

/** A creature's rolls, from its printed bonuses. */
export function creatureRolls(actor) {
  const s = actor.system;
  return {
    ability: (key, event) => rollD20(actor, R.printed(`${key.toUpperCase()} check`, abilityModifier(s.abilities[key])), event),
    save: (key, event) => rollD20(actor, R.printed(`${{ fort: "Fortitude", ref: "Reflex", will: "Will" }[key]} save`, s.saves[key]), event),
    skill: (index, event) => {
      const k = s.skills[index];
      return rollD20(actor, R.printed(`${k.name}${k.specialty ? ` (${k.specialty})` : ""} check`, k.bonus), event);
    },
    grapple: (event) => rollD20(actor, R.printed("Grapple check (opposed)", s.grapple), event),
    // An attack from the printed Attack or Full Attack line (rules/attacks.mjs): its choice, its place in that
    // choice, and which of its iterative bonuses.
    attack: (line, choice, index, bonus, event) => {
      const a = readAttacks(s[line])[choice]?.[index];
      if (!a) return null;
      return rollD20(actor, attackRoll(a, bonus), event, { attack: { actor: actor.uuid, line, choice, index, touch: a.touch } });
    },
    damage: (line, choice, index, multiplier = 1) => {
      const a = readAttacks(s[line])[choice]?.[index];
      if (!a) return null;
      const spec = damageRoll(a, multiplier);
      if (!spec) return ui.notifications.info(`${a.name}: its damage is not a roll (${a.note || "see the creature's description"}).`);
      // A natural or weapon attack's damage: physical, any energy it adds labelled on its dice ("1d6[fire]").
      return post(actor, spec, { flags: { damage: { nonlethal: spec.nonlethal, type: "" } } });
    },
  };
}

/** The initiative bonus Foundry's combat tracker rolls with: `1d20 + @init`. */
export function initiativeBonus(actor) {
  if (actor.type === "character") return actor.system.derived?.initiative ?? 0;
  return actor.system.initiative ?? 0;
}

/** A token's Defense, or its touch Defense: a character's worked out, a creature's as printed. */
function defenseOf(actor, { touch = false } = {}) {
  const defense = actor?.type === "character" ? actor.system.derived?.defense : actor?.system.defense;
  return touch ? defense?.touch : defense?.value;
}

/**
 * Confirm a critical: the attack rolled again with the same modifiers. With
 * one token targeted, the card compares the roll with its Defense.
 */
async function confirmCritical(actor, name, flags) {
  const targets = [...(game.user.targets ?? [])];
  const target = targets.length === 1 ? targets[0] : null;
  const defense = target ? defenseOf(target.actor, { touch: flags.attack.touch }) : null;
  return post(actor, { title: `${name}: confirming the critical`, terms: [], formula: flags.confirm ?? flags.formula }, {
    flags: { attack: flags.attack, confirming: true, critical: flags.critical },
    judge: (roll) => (defense === null || defense === undefined ? {} : { against: { name: target.name, defense, confirmed: roll.total >= defense } }),
  });
}

/**
 * Buttons on an attack's chat card. Bound on renderChatMessageHTML, which
 * since v13 passes an HTMLElement.
 *
 *   an attack with no threat:   Damage
 *   an attack with a threat:    Confirm critical (and nothing else until it is resolved)
 *   the confirmation:           against a targeted token's Defense, Critical damage or Damage;
 *                               without a target, both, for the table to choose
 */
export function bindAttackButtons(message, html) {
  const flags = message.flags?.[SYSTEM_ID];
  if (flags?.damage) return bindDamageButtons(message, html, flags);
  if (flags?.save) return bindSaveButtons(message, html, flags);
  if (flags?.levelCheck) return bindLevelCheck(message, html, flags);
  if (!flags?.attack) return;
  const actor = fromUuidSync(flags.attack.actor);
  // Only those who can roll for the actor get its buttons: a player cannot roll another's damage.
  if (!actor || !actor.isOwner) return;
  const multiplier = flags.critical?.multiplier ?? 2;
  let name, normal, critical;
  if (flags.attack.item === "grab") {
    // A grab that hits goes on to the opposed grapple check to hold.
    if (flags.hit && !flags.hit.hit) return;
    name = "Grab";
    normal = () => characterRolls(actor).grapple();
  } else if (flags.attack.item === "unarmed") {
    const lethal = !!flags.attack.lethal, streetfighting = !!flags.attack.streetfighting;
    name = "Unarmed strike";
    normal = () => characterRolls(actor).damage("unarmed", { lethal, streetfighting });
    critical = () => characterRolls(actor).damage("unarmed", { lethal, streetfighting, multiplier });
  } else if (flags.attack.item) {
    // A character's weapon.
    const item = actor.items?.get(flags.attack.item);
    if (!item) return;
    const pointBlank = !!flags.attack.pointBlank;
    const mode = flags.attack.mode;
    name = item.name;
    normal = () => characterRolls(actor).damage(item, { pointBlank, mode });
    critical = () => characterRolls(actor).damage(item, { multiplier, pointBlank, mode });
  } else {
    // A creature's printed attack.
    const { line, choice, index } = flags.attack;
    const a = readAttacks(actor.system[line])[choice]?.[index];
    if (!a) return;
    name = a.name;
    normal = () => creatureRolls(actor).damage(line, choice, index);
    critical = () => creatureRolls(actor).damage(line, choice, index, multiplier);
  }

  const buttons = document.createElement("div");
  buttons.className = "m20-card-buttons";
  const add = (label, handler) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", handler);
    buttons.append(b);
  };

  if (flags.hit && !flags.confirming) {
    const verdict = document.createElement("p");
    verdict.className = flags.hit.hit ? "m20-crit" : "m20-hint";
    verdict.textContent = `${flags.hit.hit ? "Hits" : "Misses"} ${flags.hit.name} (${flags.hit.touch ? "touch " : ""}Defense ${flags.hit.defense}).`;
    buttons.append(verdict);
  }
  if (flags.confirming && flags.against) {
    const verdict = document.createElement("p");
    verdict.className = flags.against.confirmed ? "m20-crit" : "m20-hint";
    verdict.textContent = flags.against.confirmed
      ? `Confirmed against ${flags.against.name} (Defense ${flags.against.defense}).`
      : `Not confirmed against ${flags.against.name} (Defense ${flags.against.defense}): a normal hit.`;
    buttons.append(verdict);
  }
  const handlers = { damage: normal, critical, confirm: () => confirmCritical(actor, name, flags) };
  if (flags.attack.item === "grab") add("Grapple check to hold", normal);
  else for (const b of R.cardButtons(flags)) add(b.label, handlers[b.kind]);
  (html.querySelector(".message-content") ?? html).append(buttons);
}

/** A Wealth check against `dc`, asked and posted like any d20 roll; returns the Roll, or null if cancelled. */
export function wealthCheck(actor, dc, title, event) {
  const wealth = actor.system.wealth.value ?? 0;
  return rollD20(actor, R.d20(`${title} (purchase DC ${dc})`, [{ label: "Wealth bonus", value: wealth }]), event);
}
