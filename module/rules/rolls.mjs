/**
 * What goes into each roll: the d20 and its modifiers, named, so the chat
 * card can show where every number came from.
 *
 * Plain functions over a character's derived data (rules/character.mjs) and
 * an item's system data, so `npm test` checks the arithmetic; module/roll.mjs
 * turns the result into a Foundry Roll and a chat message.
 *
 * A roll is `{ title, terms: [{ label, value }], formula }`, its formula
 * "1d20 + 3 + 2" so the dice and the numbers show in chat as rolled.
 */

import { chooses } from "./choices.mjs";
import { rulesFor } from "./feats.mjs";
import { slug } from "./identify.mjs";
import { MODES, extraDice, AUTOFIRE_DEFENSE } from "./ammo.mjs";

const ABILITY_NAMES = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
const ABILITY_LABELS = { str: "Str", dex: "Dex", con: "Con", int: "Int", wis: "Wis", cha: "Cha" };
const SAVE_NAMES = { fort: "Fortitude", ref: "Reflex", will: "Will" };

/** A d20 roll with these named modifiers; zero terms are left out of the formula but kept in the breakdown. */
export function d20(title, terms, extra = {}) {
  const shown = terms.filter((t) => t.value !== 0 && t.value !== null && t.value !== undefined);
  const formula = ["1d20", ...shown.map((t) => (t.value < 0 ? `- ${-t.value}` : `+ ${t.value}`))].join(" ");
  return { title, terms: shown, formula, ...extra };
}

export const abilityCheck = (d, ability) => d20(`${ABILITY_NAMES[ability]} check`, [{ label: ABILITY_NAMES[ability], value: d.modifiers[ability] ?? 0 }]);

/**
 * A bonus's named parts (rules/character.mjs `parts`), or, without them, its total under one label; any
 * of the total the parts do not account for is kept, under that label.
 */
function named(parts, total, label) {
  if (!parts) return [{ label, value: total ?? 0 }];
  const rest = (total ?? 0) - parts.reduce((n, p) => n + p.value, 0);
  return [...parts.map((p) => ({ label: p.label, value: p.value })), ...(rest ? [{ label, value: rest }] : [])];
}

export const savingThrow = (d, save) => {
  const ability = { fort: "con", ref: "dex", will: "wis" }[save];
  const misc = d.saves[save] - d.baseSaves[save] - (d.modifiers[ability] ?? 0);
  return d20(`${SAVE_NAMES[save]} save`, [
    { label: "Base", value: d.baseSaves[save] },
    { label: ABILITY_NAMES[ability], value: d.modifiers[ability] ?? 0 },
    ...named(d.parts?.saves?.[save]?.filter((p) => !["Base", ABILITY_LABELS[ability]].includes(p.label)), misc, "Feats and effects"),
  ]);
};

/** A skill check from its derived row; a trained-only skill without ranks cannot be rolled. */
export function skillCheck(d, row) {
  if (!row.usable) return { title: `${row.name}${row.specialty ? ` (${row.specialty})` : ""}`, unusable: "This skill can only be used with ranks in it." };
  const ability = row.ability ? d.modifiers[row.ability] ?? 0 : 0;
  const armor = row.armorPenalty ? d.defense.armorPenalty : 0;
  return d20(`${row.name}${row.specialty ? ` (${row.specialty})` : ""} check`, [
    { label: "Ranks", value: Math.floor(row.ranks) },
    { label: ABILITY_NAMES[row.ability] ?? "Ability", value: ability },
    { label: "Misc", value: row.misc },
    ...named(row.effectParts, row.effects, "Effects"),
    { label: "Armor penalty", value: armor },
  ]);
}

export const initiative = (d) => d20("Initiative", [{ label: "Dexterity", value: d.modifiers.dex ?? 0 }, ...named(d.parts?.initiative?.filter((p) => p.label !== "Dex"), d.initiative - (d.modifiers.dex ?? 0), "Feats")]);

/**
 * A weapon's critical as printed: "20" (threat on 20, ×2), "19–20", "20/x3",
 * "x3/x4" (a double weapon: ×3 with one end). Null when the weapon cannot
 * score a critical ("—").
 */
export function critical(text) {
  const t = (text ?? "").replace(/[¹²³]/g, "").trim();
  if (!t || t === "—") return null;
  const range = t.match(/^(\d+)(?:[–-](\d+))?/);
  const mult = t.match(/x(\d+)/);
  return { threat: range ? Number(range[1]) : 20, multiplier: mult ? Number(mult[1]) : 2 };
}

/** The size modifier on attack rolls (the same as on Defense). */
export const SIZE_ATTACK = { fine: 8, diminutive: 4, tiny: 2, small: 1, medium: 0, large: -1, huge: -2, gargantuan: -4, colossal: -8 };

/**
 * An attack with a weapon: BAB, Str (melee) or Dex (ranged, or a melee weapon
 * taken with Weapon Finesse), size, −4 without the weapon's proficiency feat,
 * Weapon Focus's +1, nonproficient armor's penalty, and effects. `feats` are
 * the character's feats and talents as `{ name, choice }`; `options` what was
 * ticked when asked (`pointBlank`, and `mode` a firing mode: "doubleTap", "burst",
 * "autofire"; rules/ammo.mjs), and `ammo` the special load it fires (rules/ammo.mjs
 * SPECIAL_AMMO, with its name), whose question, if it asks one, is `ammoAsk`.
 */
export function attack(d, weapon, feats, options = {}) {
  const s = weapon.system;
  const melee = !!s.melee;
  // Each feat with its identifier and rules (rules/feats.mjs); `{ name }` alone is identified by its name.
  const owned = feats.map((f) => ({ ...f, id: f.identifier || slug(f.name) })).map((f) => ({ ...f, rules: rulesFor(f.id) }));
  const forThisWeapon = (f) => chooses(f.choice, weapon.name);
  const finesse = melee && owned.some((f) => f.rules.finesse && forThisWeapon(f)) && (d.modifiers.dex ?? 0) > (d.modifiers.str ?? 0);
  const ability = melee && !finesse ? "str" : "dex";
  const needs = s.proficiency?.value ?? "";
  // "Exotic Firearms Proficiency (grenade launchers)" is met by that feat taken for grenade launchers,
  // and a specific exotic proficiency by the feat taken for this weapon.
  const base = slug(needs.replace(/\s*\(.*\)$/, ""));
  const group = needs.match(/\((.+)\)$/)?.[1];
  const proficient = !needs || owned.some((f) => f.id === slug(needs)
    || (f.id === base && (f.rules.proficiency !== "chosen" || chooses(f.choice, group ?? weapon.name) || forThisWeapon(f))));
  // Weapon Focus once for a weapon, however many give it (the feat, a Soldier's or Gunslinger's feature: "the
  // benefit of the feat"); Greater Weapon Focus, a feat of its own, besides.
  const focus = onceEach(owned.filter((f) => f.rules.weaponFocus && forThisWeapon(f)), "weaponFocus");
  const pointBlank = !melee && options.pointBlank ? Math.max(0, ...owned.map((f) => f.rules.pointBlank ?? 0)) : 0;
  const mode = MODES[options.mode];
  // Autofire without Advanced Firearms Proficiency: −4.
  const autofirePenalty = options.mode === "autofire" && !owned.some((f) => f.rules.autofire) ? -4 : 0;
  return d20(`${weapon.name}: ${melee ? "melee" : "ranged"} attack`, [
    { label: "Base attack", value: d.baseAttackBonus },
    { label: `${ABILITY_NAMES[ability]}${finesse ? " (Weapon Finesse)" : ""}`, value: d.modifiers[ability] ?? 0 },
    { label: "Size", value: SIZE_ATTACK[d.size] ?? 0 },
    { label: proficient ? "Proficient" : `Not proficient (${needs})`, value: proficient ? 0 : -4 },
    ...focus,
    { label: "Point Blank Shot", value: pointBlank },
    { label: mode?.label ?? "Firing mode", value: mode?.attack ?? 0 },
    { label: "Autofire (no Advanced Firearms Proficiency)", value: autofirePenalty },
    { label: "Armor (not proficient)", value: d.defense?.armorAttackPenalty ?? 0 },
    ...named(d.parts?.attack?.[melee ? "melee" : "ranged"], d.attackBonus?.[melee ? "melee" : "ranged"], "Effects"),
    ...ammoAttack(options.ammo, options),
  ], {
    critical: ammoThreat(critical(s.critical), options.ammo),
    ...(ammoHints(options.ammo, weapon).length ? { hints: ammoHints(options.ammo, weapon) } : {}),
    // Autofire is against a 10-foot square, Defense 10, not a target's Defense.
    // and an area attack scores no critical.
    ...(options.mode === "autofire" ? { againstDefense: AUTOFIRE_DEFENSE, title: `${weapon.name}: autofire`, critical: null } : {}),
  });
}

/**
 * A weapon's damage: its dice, plus Str for a melee weapon, and Weapon Specialization's bonus
 * with the weapon chosen (`options.feats`, the character's feats and features). Null when the
 * weapon's damage is not dice (special, see text).
 */
export function damage(d, weapon, options = {}) {
  const s = weapon.system;
  const ammo = options.ammo;
  // More dice from a firing mode, and from the load (High Explosive one more, Birdshot one fewer).
  const moreDice = (MODES[options.mode]?.dice ?? 0) + (ammo?.dice ?? 0);
  const dice = s.damage?.formula && moreDice ? extraDice(s.damage.formula, moreDice) : s.damage?.formula;
  if (!dice) return null;
  const str = s.melee ? d.modifiers.str ?? 0 : 0;
  const fx = d.damageBonus?.[s.melee ? "melee" : "ranged"] ?? 0;
  // The damage effects add, each by name (Melee Smash +1), or as one.
  const fxParts = named(d.parts?.damage?.[s.melee ? "melee" : "ranged"], fx, "Effects").map((p) => [p.label, p.value]);
  // Weapon Specialization (a class feature) with the weapon chosen, and its Greater form: +2 each.
  const owned = (options.feats ?? []).map((f) => ({ ...f, id: f.identifier || slug(f.name), rules: rulesFor(f.identifier || slug(f.name)) }));
  const special = onceEach(owned.filter((f) => f.rules.weaponSpecialization && chooses(f.choice, weapon.name)), "weaponSpecialization").map((p) => [p.label, p.value]);
  const ammoDamage = (ammo?.damage ?? 0) + (ammo?.ask?.roll === "damage" && options.ammoAsk ? ammo.ask.value : 0);
  const extra = [["Strength", str], ["Point Blank Shot", !s.melee && options.pointBlank ? 1 : 0], ...special, ...fxParts, [ammo?.name ?? "Ammunition", ammoDamage]].filter(([, v]) => v);
  const diceLabel = [MODES[options.mode]?.dice && `${MODES[options.mode].label}, +${MODES[options.mode].dice} di${MODES[options.mode].dice === 1 ? "e" : "ce"}`,
    ammo?.dice && `${ammo.name}, ${ammo.dice > 0 ? "+" : "−"}${Math.abs(ammo.dice)} die`].filter(Boolean).join("; ");
  const terms = [{ label: diceLabel ? `Weapon (${diceLabel})` : "Weapon", value: dice }, ...extra.map(([label, value]) => ({ label, value }))];
  // Damage of another kind besides (White Phosphorous: 1d6 fire), labelled so resistance meets it alone.
  const besides = ammo?.extra ? [`${ammo.extra}[${ammo.extraType}]`] : [];
  if (ammo?.extra) terms.push({ label: `${ammo.name} (${ammo.extraType})`, value: ammo.extra });
  // The extra kind is rolled once on a critical: kept apart from what is multiplied (criticalDamage).
  const multiplied = [dice, ...extra.map(([, v]) => (v < 0 ? `- ${-v}` : `+ ${v}`))].join(" ");
  const formula = [multiplied, ...besides.map((b) => `+ ${b}`)].join(" ");
  // What the load makes of the damage when it is applied: nonlethal, the damage reduction it gets past, half another kind.
  const type = [s.damageType || "", ammo?.overcomes ?? ""].filter(Boolean).join(", ");
  return {
    title: `${weapon.name}: damage (${type || "untyped"}${ammo?.nonlethal ? ", nonlethal" : ""})`, terms, formula, critical: critical(s.critical),
    ...(besides.length ? { multiplied, besides } : {}),
    type, nonlethal: !!ammo?.nonlethal, half: ammo?.half ?? null,
    ...(ammoHints(ammo, weapon).length ? { hints: ammoHints(ammo, weapon) } : {}),
  };
}

/**
 * A creature's printed bonus, rolled: "Fort +5", "Spot +4", "Str 13". Creatures carry totals, not
 * their parts, so the breakdown is the total, and what its conditions change (rules/conditions.mjs
 * creatureConditions).
 */
export const printed = (title, bonus, conditions = 0) => d20(title, [{ label: "Bonus", value: bonus ?? 0 }, { label: "Conditions", value: conditions }]);

/**
 * The die an action point adds to a d20 roll, by character level: 1d6 at 1st
 * to 7th, the higher of 2d6 at 8th to 14th, the highest of 3d6 at 15th to 20th.
 */
export function actionPointDie(level) {
  if (level >= 15) return { formula: "3d6kh", label: "Action point (highest of 3d6)" };
  if (level >= 8) return { formula: "2d6kh", label: "Action point (higher of 2d6)" };
  return { formula: "1d6", label: "Action point (1d6)" };
}

/**
 * A roll with what the player added when asked: a situational modifier, and
 * an action point's die. The die joins the formula; the breakdown names both.
 */
export function withAdditions(spec, { modifier = 0, actionPoint = null } = {}) {
  if (!spec || spec.unusable) return spec;
  let { formula, terms } = spec;
  if (modifier) {
    formula += modifier < 0 ? ` - ${-modifier}` : ` + ${modifier}`;
    terms = [...terms, { label: "Situational", value: modifier }];
  }
  if (actionPoint) {
    formula += ` + ${actionPoint.formula}`;
    terms = [...terms, { label: actionPoint.label, value: actionPoint.formula }];
  }
  return { ...spec, formula, terms };
}

/**
 * Damage on a confirmed critical: the damage rolled that many times and added
 * up, dice and bonuses alike, as the SRD multiplies it.
 */
export function criticalDamage(spec, multiplier) {
  if (!spec) return null;
  // Damage of another kind besides (a load's 1d6 fire) is rolled once, as extra dice are.
  const formula = [Array.from({ length: multiplier }, () => `(${spec.multiplied ?? spec.formula})`).join(" + "), ...(spec.besides ?? [])].join(" + ");
  return { ...spec, title: `${spec.title}: critical (×${multiplier})`, formula, critical: null };
}

/**
 * The buttons an attack's chat card offers, from what the card records:
 *
 *   an attack that missed:      nothing (judged against a target's Defense; a miss is never a threat)
 *   an attack with no threat:   Damage
 *   an attack with a threat:    Confirm critical, and no damage until it is resolved
 *   the confirmation:           against a target's Defense, the one damage it earned;
 *                               without a target, both, for the table to choose
 *
 * Each is `{ kind: "damage" | "critical" | "confirm", label }`.
 */
export function cardButtons(flags) {
  const m = flags.critical?.multiplier ?? 2;
  if (!flags.confirming && flags.hit && !flags.hit.hit) return [];
  if (flags.confirming) {
    if (flags.against) return [flags.against.confirmed ? { kind: "critical", label: `Critical damage (×${m})` } : { kind: "damage", label: "Damage" }];
    return [{ kind: "critical", label: `Confirmed: critical damage (×${m})` }, { kind: "damage", label: "Not confirmed: damage" }];
  }
  if (flags.threat && flags.critical) return [{ kind: "confirm", label: "Confirm critical" }];
  return [{ kind: "damage", label: "Damage" }];
}

/**
 * What a roll is, for the notes that apply to it (tools/build/mechanics.mjs): a skill check is
 * "check", "skill", "skill.<key>" and "skill.<ability>"; a save "save" and "save.<save>"; and so on.
 */
export const rollTargets = {
  ability: (a) => ["check", "ability", `ability.${a}`],
  skill: (row) => ["check", "skill", `skill.${row.key}`, ...(row.ability ? [`skill.${row.ability}`] : [])],
  save: (k) => ["save", `save.${k}`],
  attack: (melee, unarmed = false) => ["attack", melee ? "attack.melee" : "attack.ranged", ...(unarmed ? ["attack.unarmed"] : [])],
  grapple: () => ["grapple"],
  casterLevel: () => ["casterLevel"],
};

/**
 * The notes of `notes` (each `{ rolls, text, value, source }`) that apply to a roll of `targets`:
 * those with a value as tick boxes (`{ name, label, value, term }`), the rest as text. A value is
 * worked out with `resolve` (a formula of class levels and the like).
 */
export function notesFor(notes, targets, resolve = Number) {
  const ticks = [], texts = [];
  notes.forEach((n, i) => {
    if (!(n.rolls ?? []).some((r) => targets.includes(r))) return;
    const value = n.value === "" || n.value === undefined ? null : resolve(n.value, n);
    if (value) ticks.push({ name: `note${i}`, label: `${n.text} (${value > 0 ? "+" : ""}${value})`, value, term: n.text.split(":")[0] });
    else texts.push(n.text);
  });
  return { ticks, texts };
}

/** A roll with the notes ticked added as terms. */
export function withNotes(spec, ticks, ticked) {
  const on = ticks.filter((t) => ticked[t.name]);
  if (!on.length || !spec || spec.unusable) return spec;
  return d20(spec.title, [...spec.terms, ...on.map((t) => ({ label: t.term, value: t.value }))], { critical: spec.critical, ...(spec.againstDefense ? { againstDefense: spec.againstDefense } : {}), ...(spec.hints ? { hints: spec.hints } : {}) });
}

/** What a special load adds to an attack: its own bonus or penalty, on autofire Tracer's, and its question if ticked. */
function ammoAttack(ammo, options) {
  if (!ammo) return [];
  return [
    { label: ammo.name, value: (ammo.attack ?? 0) + (options.mode === "autofire" ? ammo.autofire ?? 0 : 0) },
    { label: `${ammo.name} (target in armor)`, value: ammo.ask?.roll === "attack" && options.ammoAsk ? ammo.ask.value : 0 },
  ];
}

/** A weapon's critical with a load's wider threat range (Flechette: one more). */
function ammoThreat(crit, ammo) {
  return crit && ammo?.threat ? { ...crit, threat: crit.threat - ammo.threat } : crit;
}

/** What a card says of a special load: what else it does, and a weapon it was not made for. */
function ammoHints(ammo, weapon) {
  if (!ammo) return [];
  return [
    ammo.note && `${ammo.name}: ${ammo.note}`,
    ammo.only && !ammo.only.test(`${weapon.name} ${weapon.system?.category ?? ""}`) && `${ammo.name} is made for ${ammo.onlyText}, not this weapon.`,
  ].filter(Boolean);
}

/**
 * A bonus that the same feat gives once, however many items give it (`rule` the bonus in each one's
 * rules): the feat, and a class feature giving "the benefit of the feat", are one. `[{ label, value }]`,
 * one for each feat, by its name.
 */
function onceEach(owned, rule) {
  const byFeat = new Map();
  for (const f of owned) if (!byFeat.has(f.id) || byFeat.get(f.id).value < f.rules[rule]) byFeat.set(f.id, { label: f.name, value: f.rules[rule] });
  return [...byFeat.values()];
}
