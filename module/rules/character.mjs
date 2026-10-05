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
import { chosenSkills } from "./choices.mjs";
import { rulesFor } from "./feats.mjs";
import { advancement } from "./advancement.mjs";
import { casters } from "./casting.mjs";
import { identify } from "./identify.mjs";
import { racialHitDice } from "./creature.mjs";

/** Size modifiers to attack rolls and Defense, and to grapple checks. */
export const SIZE_MODIFIERS = {
  fine: { defense: 8, grapple: -16 }, diminutive: { defense: 4, grapple: -12 }, tiny: { defense: 2, grapple: -8 },
  small: { defense: 1, grapple: -4 }, medium: { defense: 0, grapple: 0 }, large: { defense: -1, grapple: 4 },
  huge: { defense: -2, grapple: 8 }, gargantuan: { defense: -4, grapple: 12 }, colossal: { defense: -8, grapple: 16 },
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
  // A creature built from parts: its type (with how many Hit Dice it has), and any templates.
  const creatureType = items.find((i) => i.type === "creatureType");
  const templates = items.filter((i) => i.type === "template");
  // Feats and talents, each with its rules (rules/feats.mjs).
  const feats = items.filter((i) => i.type === "feat" || i.type === "talent").map((i) => ({ ...i, rules: rulesFor(identify(i)) }));
  const armorProficiencies = new Set(feats.map((f) => f.rules.armorProficiency).filter(Boolean));

  // Bonuses from active effects (applied by Foundry before this runs; zero without any).
  const fx = system.bonuses ?? {};
  const fxv = (path, fallback = 0) => path.split(".").reduce((o, k) => o?.[k], fx) ?? fallback;

  // Abilities: the base score, plus the species' adjustment, the +1s chosen every four levels, and any effect.
  const scores = {}, modifiers = {};
  const increases = (a) => (system.abilityIncreases ?? []).filter((x) => x === a).length;
  for (const a of ABILITIES) {
    const base = system.abilities?.[a]?.value;
    const lost = templates.some((t) => t.system.abilities?.lost?.includes(a));   // an undead has no Constitution
    const fromTemplates = templates.reduce((n, t) => n + (t.system.abilities?.changes?.[a] ?? 0), 0);
    scores[a] = base === null || base === undefined || lost ? null : base + (species?.system.abilities?.[a] ?? 0) + fromTemplates + increases(a) + fxv(`abilities.${a}`);
    modifiers[a] = abilityModifier(scores[a]);
  }
  const mod = (a) => modifiers[a] ?? 0;

  // Class levels: each class's table row at the level taken in it, summed.
  let level = 0, bab = 0, defenseClass = 0, reputation = 0;
  const base = { fort: 0, ref: 0, will: 0 };
  const breakdown = [];
  // A creature's own Hit Dice. One with 1 Hit Die or less that takes class levels "advances as human
  // characters do": its class levels replace its Hit Die.
  const hd = creatureType ? creatureType.system.count ?? 0 : 0;
  const replaced = hd > 0 && hd <= 1 && classes.length > 0;
  const creatureSize = system.size || species?.system.size || "medium";
  const racial = replaced ? null : racialHitDice(creatureType?.system, hd, mod("con"), creatureType?.system.hitPoints, creatureSize);
  if (racial) {
    level += racial.level;
    bab += racial.baseAttack;
    for (const s of Object.keys(base)) base[s] += racial.saves[s];
    breakdown.push({ name: `${creatureType.name} (Hit Dice)`, level: racial.hitDice });
  }
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
  reputation += (occupation?.system.reputationBonus ?? 0) + fxv("reputation");
  const bonus = {
    fort: fxv("saves.fort"), ref: fxv("saves.ref"), will: fxv("saves.will"),
    initiative: fxv("initiative"), hp: fxv("hitPoints"), massiveDamage: fxv("massiveDamage"),
  };

  // Size: the character's own (a creature's), else the species', else Medium.
  const size = creatureSize;
  const sizeMods = SIZE_MODIFIERS[size] ?? SIZE_MODIFIERS.medium;

  // Defense: 10 + class + Dex (up to the armor's limit) + size + armor + natural armor.
  const maxDex = armor.map((a) => a.system.maxDex).filter((m) => m !== null && m !== undefined);
  // A character that loses its Dexterity bonus keeps a Dexterity penalty.
  const dexCapped = maxDex.length ? Math.min(mod("dex"), ...maxDex) : mod("dex");
  const dexToDefense = fxv("loseDexBonus") > 0 ? Math.min(dexCapped, 0) : dexCapped;
  // Armor worn without its proficiency feat gives only its nonproficient bonus, and its armor
  // penalty applies to attack rolls too (Armor Proficiency, "Normal").
  const proficientIn = (a) => a.system.weightClass === "shield" || !a.system.weightClass || armorProficiencies.has(a.system.weightClass);
  const equipment = armor.reduce((n, a) => n + ((proficientIn(a) ? a.system.equipmentBonus : a.system.nonproficientBonus) ?? 0), 0);
  const armorAttackPenalty = armor.filter((a) => !proficientIn(a)).reduce((n, a) => n + (a.system.armorPenalty ?? 0), 0);
  const natural = (species?.system.naturalArmor ?? 0) + (system.naturalArmor ?? 0);
  const misc = (system.defense?.misc ?? 0) + fxv("defense");
  const defense = 10 + defenseClass + dexToDefense + sizeMods.defense + equipment + natural + misc;
  const armorPenalty = armor.reduce((n, a) => n + (a.system.armorPenalty ?? 0), 0);

  // Class skills, and where each comes from: a class's list, a feat that grants them (Arcane Skills), the
  // skills chosen from the occupation, or a skill marked by hand. A specialty skill ("Knowledge (history)")
  // is a class skill when its source names it, or names the skill with no specialty.
  const named = (s) => `${skillKey(s.name)}${s.specialty ? `:${s.specialty}` : ""}`;
  const parse = (text) => { const m = text.match(/^(.+?)(?: [\(\[](.+)[\)\]])?$/); return { name: m[1], specialty: m[2] ?? "" }; };
  const sources = { class: new Set(), feat: new Set(), occupation: new Set() };
  for (const c of classes) for (const s of c.system.classSkills ?? []) sources.class.add(named(s));
  for (const f of feats) for (const s of f.rules.classSkills ?? []) sources.feat.add(named(parse(s)));
  for (const s of occupation?.system.chosenSkills ?? []) sources.occupation.add(named(parse(s)));
  const from = (set, key, specialty) => set.has(key) || (!!specialty && set.has(`${key}:${specialty}`));
  const classSource = (key, specialty, stored) =>
    from(sources.class, key, specialty) ? "class" : from(sources.feat, key, specialty) ? "feat"
      : from(sources.occupation, key, specialty) ? "occupation" : stored?.classSkill ? "chosen" : "";

  // A bonus to chosen skills: Skill Emphasis (a Dedicated hero talent) +3, Educated +2 to each of two.
  const choiceBonus = (key, specialty) => feats.reduce((n, f) => {
    const per = f.rules.skillBonus;
    if (!per) return n;
    return n + (chosenSkills(f.system.choice).some((c) => skillKey(c.name) === key && (!c.specialty || c.specialty === (specialty ?? ""))) ? per : 0);
  }, 0);
  const skillRow = (key, specialty, stored) => {
    const def = SKILLS[key];
    const ranks = stored?.ranks ?? 0;
    const source = classSource(key, specialty, stored);
    const isClass = !!source;
    // An occupation skill that is already a class skill (from a class or a feat) gives +1 instead.
    const occupationBonus = from(sources.occupation, key, specialty) && (from(sources.class, key, specialty) || from(sources.feat, key, specialty)) ? 1 : 0;
    const effects = fxv(`skills.${key}`) + fxv("allSkills") + choiceBonus(key, specialty) + occupationBonus;
    // Cross-class ranks are bought in halves; only whole ranks add to a check.
    const total = Math.floor(ranks) + (def.ability ? mod(def.ability) : 0) + (stored?.misc ?? 0) + effects + (def.armorPenalty ? armorPenalty : 0);
    return {
      key, name: def.name, specialty: specialty ?? "", ability: def.ability, ranks, misc: stored?.misc ?? 0, effects,
      classSkill: isClass, classSource: source, occupationBonus,
      // FX skills: "Other classes may not buy ranks in these skills without this feat" (Arcane Skills).
      restricted: !!def.fx && !isClass && ranks > 0,
      maxRanks: isClass ? level + 3 : (level + 3) / 2, overMax: ranks > (isClass ? level + 3 : (level + 3) / 2),
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
  // A creature's Hit Dice come first, and then its first class level is rolled like any other.
  let hp = racial?.hitPoints ?? 0, estimated = racial?.estimated ?? false, first = !racial;
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
    // What the creature is: its type, or the type a template makes it (a zombie is undead).
    creatureType: templates.map((t) => t.system.type).filter(Boolean).at(-1) || creatureType?.name || "",
    racialHitDice: racial ? racial.hitDice : 0,
    replacedHitDice: replaced,
    hitPoints: { max: hp + bonus.hp, estimated },
    classes: breakdown,
    scores,
    modifiers,
    size,
    baseAttackBonus: bab,
    saves: { fort: base.fort + mod("con") + bonus.fort, ref: base.ref + mod("dex") + bonus.ref, will: base.will + mod("wis") + bonus.will },
    baseSaves: base,
    defense: { value: defense, touch: defense - equipment - natural, flatFooted: defense - Math.max(dexToDefense, 0), class: defenseClass, armorPenalty, armorAttackPenalty },
    reputation,
    initiative: mod("dex") + bonus.initiative,
    attackBonus: { melee: fxv("attack.melee"), ranged: fxv("attack.ranged") },
    damageBonus: { melee: fxv("damage.melee"), ranged: fxv("damage.ranged") },
    grapple: bab + mod("str") + sizeMods.grapple,
    massiveDamage: scores.con === null ? null : scores.con + bonus.massiveDamage,
    bonusHitPoints: bonus.hp,
    skills,
    // Spellcasting and psionic classes: slots, spells known, caster levels, power points (rules/casting.mjs).
    casters: casters(classes, scores, level),
    // Points to spend and spent, and what the levels are owed (rules/advancement.mjs).
    advancement: advancement({
      level, heroicLevel: classes.reduce((n, c) => n + c.system.level, 0), classes, intMod: mod("int"),
      // d20 Future's classes give a nonhuman a point fewer; a character with no species is human.
      nonhuman: !!species && !/human$/i.test(species.name ?? ""), skills,
      counts: { feats: items.filter((i) => i.type === "feat").length, talents: items.filter((i) => i.type === "talent").length },
      granted: system.actionPoints?.granted ?? 0, increases: system.abilityIncreases ?? [],
    }),
  };
}
