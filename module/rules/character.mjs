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
 *   armor     the equipped armor and shield, with its quality (rules/quality.mjs)
 */
import { ABILITIES, abilityModifier } from "../data/models.mjs";
import { SKILLS, skillKey } from "../data/skills.mjs";
import { chosenSkills } from "./choices.mjs";
import { rulesFor } from "./feats.mjs";
import { advancement, featGrants, inOrder } from "./advancement.mjs";
import { casters } from "./casting.mjs";
import { withSystemBonuses, mechanicsContext, partsOf } from "./effects.mjs";
import { characterDefenses } from "./resistance.mjs";
import { carrying, carriedWeight, LOAD_SKILLS } from "./load.mjs";
import { armorQuality } from "./quality.mjs";

/**
 * Speed in armor: the armor's printed speed for a base of 30 feet ("20"), or for 20 feet where
 * it prints both ("20 ft./15 ft."); another base slowed in the same proportion, to the 5 feet.
 */
export function armoredSpeed(base, armor) {
  const parts = String(armor.system.speed?.value ?? "").split("/").map((p) => Number(p.match(/\d+/)?.[0] ?? NaN));
  if (Number.isNaN(parts[0])) return base;
  if (base === 20 && !Number.isNaN(parts[1] ?? NaN)) return parts[1];
  if (base === 30) return parts[0];
  return Math.min(base, Math.ceil((base * parts[0]) / 30 / 5) * 5);
}
import { identify } from "./identify.mjs";
import { racialHitDice } from "./creature.mjs";

const ABILITY_LABELS = { str: "Str", dex: "Dex", con: "Con", int: "Int", wis: "Wis", cha: "Cha" };

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
  // The class its 1st level was in first (rules/advancement.mjs inOrder).
  const classes = inOrder(items.filter((i) => i.type === "class" && (i.system.level ?? 0) > 0), system.startingClass);
  const species = items.find((i) => i.type === "species");
  const occupation = items.find((i) => i.type === "occupation");
  const armor = items.filter((i) => i.type === "armor" && i.system.equipped);
  // A creature built from parts: its type (with how many Hit Dice it has), and any templates.
  const creatureType = items.find((i) => i.type === "creatureType");
  const templates = items.filter((i) => i.type === "template");
  // Feats and talents, each with its rules (rules/feats.mjs).
  // Feats, talents and class features: each with its rules (a Soldier's Weapon Focus feature is the feat's).
  const feats = items.filter((i) => ["feat", "talent", "feature"].includes(i.type)).map((i) => ({ ...i, rules: rulesFor(identify(i)) }));
  const armorProficiencies = new Set(feats.map((f) => f.rules.armorProficiency).filter(Boolean));

  // Bonuses from active effects: those Foundry applied before this runs (conditions, effects made on the
  // sheet), and the system's own from what the character owns (feats', talents' and species' effects,
  // tools/build/mechanics.mjs), whose formulas need its class levels and base ability modifiers.
  const baseMods = Object.fromEntries(ABILITIES.map((a) => {
    const v = system.abilities?.[a]?.value;
    return [a, v === null || v === undefined ? 0 : abilityModifier(v + (species?.system.abilities?.[a] ?? 0))];
  }));
  const heroic = classes.reduce((n, c) => n + c.system.level, 0);
  // Each effect named for the item that carries it (Alertness), or (the character's own) its own name.
  // An item's effects that pass to the character; all of the character's own (a condition, one made on the sheet).
  const itemEffects = items.flatMap((i) => (i.effects ?? []).filter((e) => (i.type === "actor" || e.transfer !== false) && !e.disabled).map((e) => ({ ...e, rank: i.system?.rank || 1, source: i.type === "actor" ? e.name : i.name })));
  const bonusSources = {};
  const fx = withSystemBonuses(system.bonuses, itemEffects, mechanicsContext(classes, heroic + Math.floor(creatureType?.system.count ?? 0), baseMods), bonusSources);
  const fxv = (path, fallback = 0) => path.split(".").reduce((o, k) => o?.[k], fx) ?? fallback;
  // A bonus's parts, each named for where it came from (rules/effects.mjs partsOf).
  const bonusParts = (path) => partsOf(bonusSources, path, fxv(path));

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

  // The load: what it weighs against the Strength score (rules/load.mjs). Encumbered, the Dexterity bonus is
  // capped as armor caps it, speed is slowed, and attacks and some skills take a penalty.
  const load = carrying(scores.str, size, carriedWeight(items.filter((i) => i.system?.weight)));
  // Defense: 10 + class + Dex (up to the armor's limit, and the load's) + size + armor + natural armor.
  const maxDex = [...armor.map((a) => a.system.maxDex), load?.maxDex].filter((m) => m !== null && m !== undefined);
  // A character that loses its Dexterity bonus keeps a Dexterity penalty.
  const dexCapped = maxDex.length ? Math.min(mod("dex"), ...maxDex) : mod("dex");
  const dexToDefense = fxv("loseDexBonus") > 0 ? Math.min(dexCapped, 0) : dexCapped;
  // Armor worn without its proficiency feat gives only its nonproficient bonus, and its armor
  // penalty applies to attack rolls too (Armor Proficiency, "Normal").
  const proficientIn = (a) => a.system.weightClass === "shield" || !a.system.weightClass || armorProficiencies.has(a.system.weightClass);
  // Its quality (rules/quality.mjs): mastercraft adds to the equipment bonus; an enhancement bonus is its own,
  // and makes the armor penalty 1 less.
  const equipmentOf = (a) => ((proficientIn(a) ? a.system.equipmentBonus : a.system.nonproficientBonus) ?? 0) + armorQuality(a.system).equipment;
  const equipment = armor.reduce((n, a) => n + equipmentOf(a), 0);
  const enhancement = armor.reduce((n, a) => n + armorQuality(a.system).enhancement, 0);
  const penaltyOf = (a) => armorQuality(a.system).penalty;
  const armorAttackPenalty = armor.filter((a) => !proficientIn(a)).reduce((n, a) => n + penaltyOf(a), 0);
  const natural = (species?.system.naturalArmor ?? 0) + (system.naturalArmor ?? 0);
  const misc = (system.defense?.misc ?? 0) + fxv("defense");
  const defense = 10 + defenseClass + dexToDefense + sizeMods.defense + equipment + enhancement + natural + misc;
  const armorPenalty = armor.reduce((n, a) => n + penaltyOf(a), 0);

  // Speed: the species' (or a built creature's own, or 30 feet), plus talents and effects; armor slows it.
  const baseSpeed = (system.baseSpeed ?? species?.system.speed ?? 30) + fxv("speed");
  const worn = armor.filter((a) => a.system.weightClass !== "shield");
  const armoredValue = worn.reduce((v, a) => Math.min(v, armoredSpeed(baseSpeed, a)), baseSpeed);
  // A load slows it too, "if not already slowed to that speed for some other reason".
  const speedValue = load ? Math.min(armoredValue, load.speed(baseSpeed)) : armoredValue;
  const speed = { base: baseSpeed, value: speedValue, run: speedValue * (load?.run ?? 4), armored: armoredValue < baseSpeed, loaded: speedValue < armoredValue };

  // Class skills, and where each comes from: a class's list, a feat that grants them (Arcane Skills), the
  // skills chosen from the occupation, or a skill marked by hand. A specialty skill ("Knowledge (history)")
  // is a class skill when its source names it, or names the skill with no specialty.
  const named = (s) => `${skillKey(s.name)}${s.specialty ? `:${s.specialty}` : ""}`;
  const parse = (text) => { const m = text.match(/^(.+?)(?: [([](.+)[)\]])?$/); return { name: m[1], specialty: m[2] ?? "" }; };
  const sources = { class: new Set(), feat: new Set(), occupation: new Set() };
  for (const c of classes) for (const s of c.system.classSkills ?? []) sources.class.add(named(s));
  for (const f of feats) for (const s of f.rules.classSkills ?? []) sources.feat.add(named(parse(s)));
  for (const s of occupation?.system.chosenSkills ?? []) sources.occupation.add(named(parse(s)));
  const from = (set, key, specialty) => set.has(key) || (!!specialty && set.has(`${key}:${specialty}`));
  // Which classes list each skill: a rank bought at a level costs 1 point only in that level's class's skills.
  const perClass = classes.map((c) => ({ name: c.name, set: new Set((c.system.classSkills ?? []).map(named)) }));
  const classSource = (key, specialty, stored) =>
    from(sources.class, key, specialty) ? "class" : from(sources.feat, key, specialty) ? "feat"
      : from(sources.occupation, key, specialty) ? "occupation" : stored?.classSkill ? "chosen" : "";

  // A bonus that is a number, or a class's level (Savant: the Smart level).
  const amount = (v) => (typeof v === "number" ? v : classes.filter((c) => c.name === v?.classLevel).reduce((n, c) => n + c.system.level, 0));
  // A bonus to chosen skills: Skill Emphasis (a Dedicated hero talent) +3, Educated +2 to each of two; each by its feat's name.
  const choiceBonuses = (key, specialty) => feats.filter((f) => f.rules.skillBonus
    && chosenSkills(f.system.choice).some((c) => skillKey(c.name) === key && (!c.specialty || c.specialty === (specialty ?? ""))))
    .map((f) => ({ label: f.name, value: amount(f.rules.skillBonus) })).filter((p) => p.value);
  const skillRow = (key, specialty, stored) => {
    const def = SKILLS[key];
    const ranks = stored?.ranks ?? 0;
    const source = classSource(key, specialty, stored);
    const isClass = !!source;
    // An occupation skill that is already a class skill (from a class or a feat) gives +1 instead.
    const occupationBonus = from(sources.occupation, key, specialty) && (from(sources.class, key, specialty) || from(sources.feat, key, specialty)) ? 1 : 0;
    // A specialty's own bonus is keyed "craft:pharmaceutical" (Medical Expert).
    const specialtyKey = specialty ? `skills.${key}:${specialty.toLowerCase()}` : null;
    // What effects, feats and the occupation add, each named for where it came from.
    const effectParts = [
      ...bonusParts(`skills.${key}`), ...(specialtyKey ? partsOf(bonusSources, specialtyKey, fx.skills?.[`${key}:${specialty.toLowerCase()}`] ?? 0) : []),
      ...bonusParts("allSkills"), ...choiceBonuses(key, specialty),
      ...(occupationBonus ? [{ label: `${occupation.name} (occupation)`, value: occupationBonus }] : []),
    ];
    const effects = effectParts.reduce((n, p) => n + p.value, 0);
    // Cross-class ranks are bought in halves; only whole ranks add to a check.
    const total = Math.floor(ranks) + (def.ability ? mod(def.ability) : 0) + (stored?.misc ?? 0) + effects + (def.armorPenalty ? armorPenalty : 0)
      + (LOAD_SKILLS.includes(key) ? load?.penalty ?? 0 : 0);
    // The total's parts, for a tooltip and a roll's card.
    const parts = [
      { label: "Ranks", value: Math.floor(ranks) }, ...(def.ability ? [{ label: ABILITY_LABELS[def.ability], value: mod(def.ability) }] : []),
      { label: "Misc", value: stored?.misc ?? 0 }, ...effectParts, { label: "Armor penalty", value: def.armorPenalty ? armorPenalty : 0 },
      { label: `Load (${load?.level})`, value: LOAD_SKILLS.includes(key) ? load?.penalty ?? 0 : 0 },
    ].filter((p) => p.value);
    return {
      key, name: def.name, specialty: specialty ?? "", ability: def.ability, ranks, misc: stored?.misc ?? 0, effects, effectParts, parts,
      loadPenalty: LOAD_SKILLS.includes(key) ? load?.penalty ?? 0 : 0,
      classSkill: isClass, classSource: source, occupationBonus,
      // For buying ranks: the classes whose list has it, and whether it is a class skill whatever the class
      // (a feat's, the occupation's, or marked by hand).
      classFor: perClass.filter((c) => from(c.set, key, specialty)).map((c) => c.name),
      alwaysClass: from(sources.feat, key, specialty) || from(sources.occupation, key, specialty) || !!stored?.classSkill,
      points: stored?.points ?? null,
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
  // A hero's first level is the die's maximum; a level with no roll counts the average, rounded up.
  // A creature's Hit Dice come first, and then its first class level is rolled like any other, as an
  // ordinary's is.
  let hp = racial?.hitPoints ?? 0, estimated = racial?.estimated ?? false, first = !racial && !system.ordinary;
  for (const c of classes) {
    const die = c.system.hitDie ?? 0;
    for (let l = 0; l < Math.min(c.system.level, c.system.levels?.length ?? 0); l++) {
      let roll = c.system.hitPoints?.[l];
      if (roll === undefined || roll === null) { roll = first ? die : Math.ceil((die + 1) / 2); estimated ||= !first; }
      hp += Math.max(roll + mod("con"), 1);
      first = false;
    }
  }

  // Each total's parts, named for where each came from: for its tooltip on the sheet and its roll's card.
  const signedPart = (label, value) => ({ label, value });
  const keep = (parts) => parts.filter((p) => p.value);
  const save = (s, a) => keep([signedPart("Base", base[s]), signedPart(ABILITY_LABELS[a], mod(a)), ...bonusParts(`saves.${s}`)]);
  const parts = {
    saves: { fort: save("fort", "con"), ref: save("ref", "dex"), will: save("will", "wis") },
    defense: keep([
      signedPart("Base", 10), signedPart("Class", defenseClass), signedPart(fxv("loseDexBonus") > 0 ? "Dex (lost)" : "Dex", dexToDefense), signedPart("Size", sizeMods.defense),
      ...armor.map((a) => signedPart(`${a.name}${proficientIn(a) ? "" : " (not proficient)"}${armorQuality(a.system).equipment ? `, mastercraft +${armorQuality(a.system).equipment}` : ""}`, equipmentOf(a))),
      ...armor.filter((a) => armorQuality(a.system).enhancement).map((a) => signedPart(`${a.name} (enhancement)`, armorQuality(a.system).enhancement)),
      signedPart("Natural armor", natural), signedPart("Misc", system.defense?.misc ?? 0), ...bonusParts("defense"),
    ]),
    initiative: keep([signedPart("Dex", mod("dex")), ...bonusParts("initiative")]),
    grapple: keep([signedPart("Base attack", bab), signedPart("Str", mod("str")), signedPart("Size", sizeMods.grapple), ...bonusParts("grapple")]),
    attack: { melee: bonusParts("attack.melee"), ranged: bonusParts("attack.ranged") },
    damage: { melee: bonusParts("damage.melee"), ranged: bonusParts("damage.ranged") },
    hitPoints: bonusParts("hitPoints"),
    reputation: keep([...breakdown.map((c) => c.name).length ? [signedPart("Classes", reputation - (occupation?.system.reputationBonus ?? 0) - fxv("reputation"))] : [],
      signedPart(occupation ? `${occupation.name} (occupation)` : "Occupation", occupation?.system.reputationBonus ?? 0), ...bonusParts("reputation")]),
  };

  return {
    parts,
    // What the character carries, and what it does to it (rules/load.mjs).
    load: load ? { weight: load.weight, light: load.light, medium: load.medium, heavy: load.heavy, level: load.level, penalty: load.penalty } : null,
    level,
    // What the creature is: its type, or the type a template makes it (a zombie is undead).
    creatureType: templates.map((t) => t.system.type).filter(Boolean).at(-1) || creatureType?.name || "",
    racialHitDice: racial ? racial.hitDice : 0,
    replacedHitDice: replaced,
    hitPoints: { max: hp + bonus.hp, estimated },
    classes: breakdown,
    startingClass: classes[0]?.name ?? "",
    scores,
    modifiers,
    size,
    baseAttackBonus: bab,
    saves: { fort: base.fort + mod("con") + bonus.fort, ref: base.ref + mod("dex") + bonus.ref, will: base.will + mod("wis") + bonus.will },
    baseSaves: base,
    defense: { value: defense, touch: defense - equipment - enhancement - natural, flatFooted: defense - Math.max(dexToDefense, 0), class: defenseClass, armorPenalty, armorAttackPenalty },
    reputation,
    initiative: mod("dex") + bonus.initiative,
    attackBonus: { melee: fxv("attack.melee"), ranged: fxv("attack.ranged") },
    damageBonus: { melee: fxv("damage.melee"), ranged: fxv("damage.ranged") },
    grapple: bab + mod("str") + sizeMods.grapple + fxv("grapple"),
    speed,
    massiveDamage: scores.con === null ? null : scores.con + bonus.massiveDamage,
    // Damage reduction and resistances, from talents and effects (rules/resistance.mjs).
    defenses: characterDefenses(fx),
    bonusHitPoints: bonus.hp,
    skills,
    // Spellcasting and psionic classes: slots, spells known, caster levels, power points (rules/casting.mjs).
    casters: casters(classes, scores, level),
    // Points to spend and spent, and what the levels are owed (rules/advancement.mjs).
    advancement: advancement({
      level, heroicLevel: classes.reduce((n, c) => n + c.system.level, 0), classes, intMod: mod("int"), ordinary: !!system.ordinary,
      // d20 Future's classes give a nonhuman a point fewer; a character with no species is human.
      nonhuman: !!species && !/human$/i.test(species.name ?? ""), skills,
      // Feats and talents granted outside a level (by an event in play) are extra: not counted against the levels'.
      counts: { feats: items.filter((i) => i.type === "feat" && !i.granted).length, talents: items.filter((i) => i.type === "talent" && !i.granted).length },
      granted: system.actionPoints?.granted ?? 0, increases: system.abilityIncreases ?? [],
      grants: featGrants(items, system.startingClass),
    }),
  };
}
