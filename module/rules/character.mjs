/**
 * A character's derived statistics, worked out from what it owns.
 *
 * Plain functions over plain data, with nothing from Foundry, so the same code
 * runs in the actor's prepareDerivedData and in `npm test`, where it is held to
 * the characters the book prints.
 *
 *   classes   each class item's level table, at the level the character has in it
 *   abilities base scores, plus the species' adjustments
 *   size      the species' size (Medium without one)
 *   armor     the equipped armor and shield
 */
import { ABILITIES, abilityModifier } from "../data/models.mjs";
import { SKILLS, skillKey } from "../data/skills.mjs";

/** Size modifiers to attack rolls and Defense, and to grapple checks. */
export const SIZE_MODIFIERS = {
  fine: { defense: 8, grapple: -16 }, diminutive: { defense: 4, grapple: -12 }, tiny: { defense: 2, grapple: -8 },
  small: { defense: 1, grapple: -4 }, medium: { defense: 0, grapple: 0 }, large: { defense: -1, grapple: 4 },
  huge: { defense: -2, grapple: 8 }, gargantuan: { defense: -4, grapple: 12 }, colossal: { defense: -8, grapple: 16 },
};

/**
 * Feats whose benefit is a fixed bonus, by name, as their pages print it. Feats
 * with conditions or choices (Weapon Focus, Skill Emphasis) are not here: those
 * wait for effects a player can set up.
 */
export const FEAT_BONUSES = {
  "Great Fortitude": { fort: 2 },
  "Iron Will": { will: 2 },
  "Lightning Reflexes": { ref: 2 },
  "Improved Initiative": { initiative: 4 },
  "Renown": { reputation: 3 },
  "Toughness": { hp: 3 },
  "Improved Damage Threshold": { massiveDamage: 3 },
};

/** What a class contributes at a level: its row of the level table. */
export function classRow(cls, level) {
  const rows = cls.levels ?? [];
  return rows[Math.min(level, rows.length) - 1] ?? null;
}

/**
 * Everything derived for a character.
 *
 * `system` is the character's own data; `items` are its items as
 * `{ type, name, system }`, a class item carrying `system.level`.
 */
export function deriveCharacter(system, items) {
  const classes = items.filter((i) => i.type === "class" && (i.system.level ?? 0) > 0);
  const species = items.find((i) => i.type === "species");
  const occupation = items.find((i) => i.type === "occupation");
  const armor = items.filter((i) => i.type === "armor" && i.system.equipped);

  // Abilities: the base score, plus the species' adjustment.
  const scores = {}, modifiers = {};
  for (const a of ABILITIES) {
    const base = system.abilities?.[a]?.value;
    scores[a] = base === null || base === undefined ? null : base + (species?.system.abilities?.[a] ?? 0);
    modifiers[a] = abilityModifier(scores[a]);
  }
  const mod = (a) => modifiers[a] ?? 0;

  // Class levels: each class's table row at the level taken in it, summed.
  let level = 0, bab = 0, defenseClass = 0, reputation = 0;
  const base = { fort: 0, ref: 0, will: 0 };
  const breakdown = [];
  for (const c of classes) {
    const row = classRow(c.system, c.system.level);
    if (!row) continue;
    level += c.system.level;
    bab += row.baseAttackBonus.bonus;
    for (const s of Object.keys(base)) base[s] += row.saves[s];
    defenseClass += row.defense;
    reputation += row.reputation;
    breakdown.push({ name: c.name, level: c.system.level });
  }
  reputation += occupation?.system.reputationBonus ?? 0;

  // Feats with a fixed bonus. Toughness may be taken more than once.
  const bonus = { fort: 0, ref: 0, will: 0, initiative: 0, reputation: 0, hp: 0, massiveDamage: 0 };
  for (const f of items.filter((i) => i.type === "feat")) for (const [k, v] of Object.entries(FEAT_BONUSES[f.name] ?? {})) bonus[k] += v;
  reputation += bonus.reputation;

  // Size, from the species (Medium without one).
  const size = species?.system.size || "medium";
  const sizeMods = SIZE_MODIFIERS[size] ?? SIZE_MODIFIERS.medium;

  // Defense: 10 + class + Dex (up to the armor's limit) + size + armor + natural armor.
  const maxDex = armor.map((a) => a.system.maxDex).filter((m) => m !== null && m !== undefined);
  const dexToDefense = maxDex.length ? Math.min(mod("dex"), ...maxDex) : mod("dex");
  const equipment = armor.reduce((n, a) => n + (a.system.equipmentBonus ?? 0), 0);
  const natural = species?.system.naturalArmor ?? 0;
  const misc = system.defense?.misc ?? 0;
  const defense = 10 + defenseClass + dexToDefense + sizeMods.defense + equipment + natural + misc;
  const armorPenalty = armor.reduce((n, a) => n + (a.system.armorPenalty ?? 0), 0);

  // Class skills: every class's list, and the skills chosen from the occupation. A specialty skill
  // ("Knowledge (history)") is a class skill when the class lists it, or lists the skill with no specialty.
  const classSkills = new Set();
  const named = (s) => `${skillKey(s.name)}${s.specialty ? `:${s.specialty}` : ""}`;
  for (const c of classes) for (const s of c.system.classSkills ?? []) classSkills.add(named(s));
  for (const name of system.occupationSkills ?? []) {
    const m = name.match(/^(.+?)(?: \((.+)\))?$/);
    classSkills.add(named({ name: m[1], specialty: m[2] }));
  }
  const isClassSkill = (key, specialty) => classSkills.has(key) || (!!specialty && classSkills.has(`${key}:${specialty}`));

  const skillRow = (key, specialty, stored) => {
    const def = SKILLS[key];
    const ranks = stored?.ranks ?? 0;
    const isClass = isClassSkill(key, specialty);
    const total = ranks + (def.ability ? mod(def.ability) : 0) + (stored?.misc ?? 0) + (def.armorPenalty ? armorPenalty : 0);
    return {
      key, name: def.name, specialty: specialty ?? "", ability: def.ability, ranks, misc: stored?.misc ?? 0,
      classSkill: isClass, maxRanks: isClass ? level + 3 : (level + 3) / 2, overMax: ranks > (isClass ? level + 3 : (level + 3) / 2),
      total, usable: !def.trainedOnly || ranks > 0, trainedOnly: def.trainedOnly, armorPenalty: def.armorPenalty,
    };
  };
  const skills = [];
  for (const [key, def] of Object.entries(SKILLS)) {
    if (def.specialties) for (const s of (system.specialtySkills ?? []).filter((x) => x.skill === key)) skills.push(skillRow(key, s.specialty, s));
    else skills.push(skillRow(key, null, system.skills?.[key]));
  }

  // Hit points: each level's roll on its class's Hit Die, plus the Con modifier (at least 1 a level).
  // The character's first level is the die's maximum; a level with no roll counts the average, rounded up.
  let hp = 0, estimated = false, first = true;
  for (const c of classes) {
    const die = c.system.hitDie ?? 0;
    for (let l = 0; l < Math.min(c.system.level, c.system.levels?.length ?? 0); l++) {
      let roll = c.system.hitPoints?.[l];
      if (roll === undefined || roll === null) { roll = first ? die : Math.ceil((die + 1) / 2); estimated ||= !first; }
      hp += Math.max(roll + mod("con"), 1);
      first = false;
    }
  }

  return {
    level,
    hitPoints: { max: hp + bonus.hp, estimated },
    classes: breakdown,
    scores,
    modifiers,
    size,
    baseAttackBonus: bab,
    saves: { fort: base.fort + mod("con") + bonus.fort, ref: base.ref + mod("dex") + bonus.ref, will: base.will + mod("wis") + bonus.will },
    baseSaves: base,
    defense: { value: defense, touch: defense - equipment - natural, flatFooted: defense - Math.max(dexToDefense, 0), class: defenseClass, armorPenalty },
    reputation,
    initiative: mod("dex") + bonus.initiative,
    grapple: bab + mod("str") + sizeMods.grapple,
    massiveDamage: scores.con === null ? null : scores.con + bonus.massiveDamage,
    bonusHitPoints: bonus.hp,
    skills,
  };
}
