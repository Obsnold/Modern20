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

const ABILITY_NAMES = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
const SAVE_NAMES = { fort: "Fortitude", ref: "Reflex", will: "Will" };

/** A d20 roll with these named modifiers; zero terms are left out of the formula but kept in the breakdown. */
export function d20(title, terms, extra = {}) {
  const shown = terms.filter((t) => t.value !== 0 && t.value !== null && t.value !== undefined);
  const formula = ["1d20", ...shown.map((t) => (t.value < 0 ? `- ${-t.value}` : `+ ${t.value}`))].join(" ");
  return { title, terms: shown, formula, ...extra };
}

export const abilityCheck = (d, ability) => d20(`${ABILITY_NAMES[ability]} check`, [{ label: ABILITY_NAMES[ability], value: d.modifiers[ability] ?? 0 }]);

export const savingThrow = (d, save) => {
  const ability = { fort: "con", ref: "dex", will: "wis" }[save];
  const misc = d.saves[save] - d.baseSaves[save] - (d.modifiers[ability] ?? 0);
  return d20(`${SAVE_NAMES[save]} save`, [
    { label: "Base", value: d.baseSaves[save] },
    { label: ABILITY_NAMES[ability], value: d.modifiers[ability] ?? 0 },
    { label: "Feats", value: misc },
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
    { label: "Armor penalty", value: armor },
  ]);
}

export const initiative = (d) => d20("Initiative", [{ label: "Dexterity", value: d.modifiers.dex ?? 0 }, { label: "Feats", value: d.initiative - (d.modifiers.dex ?? 0) }]);

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
const SIZE_ATTACK = { fine: 8, diminutive: 4, tiny: 2, small: 1, medium: 0, large: -1, huge: -2, gargantuan: -4, colossal: -8 };

/**
 * An attack with a weapon: BAB, Str (melee) or Dex (ranged), size, and −4
 * without the weapon's proficiency feat. `feats` are the names of the feats
 * the character has.
 */
export function attack(d, weapon, feats) {
  const s = weapon.system;
  const melee = !!s.melee;
  const ability = melee ? "str" : "dex";
  const needs = s.proficiency?.value ?? "";
  // "Exotic Firearms Proficiency (grenade launchers)" is met by the feat taken for grenade launchers.
  const base = needs.replace(/\s*\(.*\)$/, "");
  const proficient = !needs || feats.some((f) => f === needs || f === base || f.startsWith(`${base} (`));
  return d20(`${weapon.name}: ${melee ? "melee" : "ranged"} attack`, [
    { label: "Base attack", value: d.baseAttackBonus },
    { label: ABILITY_NAMES[ability], value: d.modifiers[ability] ?? 0 },
    { label: "Size", value: SIZE_ATTACK[d.size] ?? 0 },
    { label: proficient ? "Proficient" : `Not proficient (${needs})`, value: proficient ? 0 : -4 },
  ], { critical: critical(s.critical) });
}

/**
 * A weapon's damage: its dice, plus Str for a melee weapon. Null when the
 * weapon's damage is not dice (special, see text).
 */
export function damage(d, weapon) {
  const s = weapon.system;
  const dice = s.damage?.formula;
  if (!dice) return null;
  const str = s.melee ? d.modifiers.str ?? 0 : 0;
  const terms = [{ label: "Weapon", value: dice }, ...(str ? [{ label: "Strength", value: str }] : [])];
  const formula = [dice, ...(str ? [str < 0 ? `- ${-str}` : `+ ${str}`] : [])].join(" ");
  return { title: `${weapon.name}: damage (${s.damageType || "untyped"})`, terms, formula, critical: critical(s.critical) };
}

/**
 * A creature's printed bonus, rolled: "Fort +5", "Spot +4", "Str 13".
 * Creatures carry totals, not their parts, so the breakdown is the total.
 */
export const printed = (title, bonus) => d20(title, [{ label: "Bonus", value: bonus ?? 0 }]);
