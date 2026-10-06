/**
 * A creature's own Hit Dice: what its type gives at a number of Hit Dice, by
 * Table: Creature Saves and Base Attack Bonuses (Modern/Creatures/Types).
 *
 *   good save          +2 + half its Hit Dice
 *   poor save          a third of its Hit Dice
 *   base attack        (A) three-quarters, (B) all, (C) half of its Hit Dice:
 *                      the creature type's rate (0.75, 1, 0.5)
 *
 * all rounded down, with a creature of 1 Hit Die or less counted as having 1
 * ("1 or less": good +2, base attack (B) +1).
 */

/** "4d10+16" -> 4; "1/2 d8" -> 0.5; null when the text has no Hit Dice. */
export function hitDiceCount(text) {
  const m = (text ?? "").match(/^(\d+)(?:\/(\d+))?\s*d\d/);
  return m ? (m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1])) : null;
}

const atLeastOne = (hd) => Math.max(1, Math.floor(hd));

export const goodSave = (hd) => 2 + Math.floor(atLeastOne(hd) / 2);
export const poorSave = (hd) => Math.floor(atLeastOne(hd) / 3);
export const baseAttack = (hd, rate) => Math.floor(atLeastOne(hd) * rate);

/**
 * What a creature's Hit Dice contribute: base attack, base saves, and hit
 * points (the rolls given, or the average the book prints, plus Con per Hit
 * Die). `type` is the creature type item's system data.
 */
export function racialHitDice(type, hd, conMod, rolls = [], size = "medium") {
  if (!type || !hd) return null;
  const saves = Object.fromEntries(["fort", "ref", "will"].map((s) => [s, type.goodSaves?.saves?.includes(s) ? goodSave(hd) : poorSave(hd)]));
  const die = type.hitDie ?? 8;
  const whole = atLeastOne(hd);
  const rolled = rolls.filter((r) => r !== null && r !== undefined);
  // A creature's entry gives its average hit points: the average of its dice, rounded down.
  const dice = rolled.length >= whole ? rolled.slice(0, whole).reduce((a, b) => a + b, 0) : Math.floor(hd * (die + 1) / 2);
  // Constructs and oozes have extra hit points by size (the "Extra Hit Points" column of their tables).
  const extra = Number(type.sizes?.find((s) => s.size === size)?.extraHitPoints) || 0;
  return {
    hitDice: hd,
    level: whole,
    baseAttack: baseAttack(hd, type.baseAttack?.rate ?? 0.75),
    saves,
    hitPoints: Math.max(1, dice + conMod * whole) + extra,
    extraHitPoints: extra,
    estimated: rolled.length < whole,
  };
}

/**
 * The class levels a worked example's name gives ("Tooth Fairy Fast Hero 3/Smart Hero 1"):
 * `{ "Fast Hero": 3, "Smart Hero": 1 }`, matched against `classNames`, longest first, with
 * " Hero" optional.
 */
export function classLevels(name, classNames) {
  const sorted = [...classNames].sort((a, b) => b.length - a.length);
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Object.fromEntries((name ?? "").split("/").flatMap((part) => {
    for (const c of sorted) {
      const m = part.match(new RegExp(`\\b${escape(c)}\\s+(\\d+)\\b`)) ?? part.match(new RegExp(`\\b${escape(c.replace(/ Hero$/, ""))}\\s+(\\d+)\\b`));
      if (m) return [[c, Number(m[1])]];
    }
    return [];
  }));
}

/**
 * What a character built from a printed creature starts with: its scores, size and natural
 * armor, its type at its Hit Dice, its feats and talents (with what each was taken for), and,
 * for a worked example, the class levels its name gives on top of its base creature's Hit Dice.
 *
 * The scores are the printed ones, which already hold any template's changes, so templates
 * are not added again. Skill ranks are not worked back from the printed totals.
 */
export function creatureParts(creature, { base = null, classNames = [] } = {}) {
  const s = creature.system;
  const own = s.example?.classed && base ? base.system : s;
  const natural = Number((s.defense?.breakdown ?? "").match(/([+-]\d+) natural/)?.[1] ?? 0);
  const classes = s.example?.classed ? classLevels(creature.name, classNames) : {};
  const heroic = Object.values(classes).reduce((n, l) => n + l, 0);
  // Its character level: its own Hit Dice (which class levels replace at 1 or less) and its class levels.
  const hd = hitDiceCount(own.hitDice) ?? 0;
  const level = heroic + (heroic && hd <= 1 ? 0 : atLeastOne(hd));
  return {
    name: creature.name,
    img: creature.img,
    system: {
      size: s.size ?? "",
      naturalArmor: natural,
      baseSpeed: s.speed?.ft ?? null,
      abilities: Object.fromEntries(Object.entries(s.abilities ?? {}).map(([a, v]) => [a, { value: v }])),
      hp: { value: s.hp?.max ?? 0 },
      // The printed creature is already at its level: its action points are as printed, not owed for its
      // class levels, and its Wealth owes no check for a level it has. Levels gained later are.
      actionPoints: { value: s.actionPoints ?? 0, granted: heroic },
      wealth: { value: 0, regainedLevel: level },
    },
    type: own.type?.uuid ? { uuid: own.type.uuid, count: hitDiceCount(own.hitDice) ?? 1 } : null,
    classes,
    items: [...(s.feats ?? []), ...(s.talents ?? [])].filter((f) => f.uuid).map((f) => ({ uuid: f.uuid, choice: f.specialty ?? "" })),
  };
}
