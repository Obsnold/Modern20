/**
 * A level, one at a time (module/levelup.mjs): what the level a character is taking gives it, what
 * its skill points buy, and what to undo when the last level is taken back.
 *
 *   class level      one more in the class chosen (a 1st level in a class new to the character)
 *   hit points       a roll of the class's Hit Die; a hero's 1st character level its maximum
 *   skill points     the class's points + Int (at least 1); the 1st character level ×4. A point buys a
 *                    rank in one of this class's skills (or one that is a class skill whatever the class),
 *                    half a rank in any other, up to the maximum at the new level
 *   feats            one more at 3rd, 6th, 9th ... character level (two at 1st)
 *   class features   a Bonus Feat or a Talent in the class's row for this level (an ordinary takes neither)
 *   ability increase +1 to a score at 4th, 8th, 12th ... character level
 *   action points    5 + half the new character level (an ordinary none)
 *
 * Each level taken is recorded (`system.history`), so the last can be taken back exactly.
 */
import { SKILLS, skillKey } from "../data/skills.mjs";
import { perLevel, featsAllowed, actionPointsFor, maxRanks } from "./advancement.mjs";

/**
 * What taking a level in `cls` (a class item `{ name, system }`, the character's own or one new to it)
 * gives a character `d` (its derived data) with `classes` (its class items) and `system`.
 */
export function levelPlan({ d, classes, system, cls, nonhuman = false }) {
  const heroic = classes.reduce((n, c) => n + (c.system.level ?? 0), 0);
  const level = (d.level ?? 0) + 1;
  const own = classes.find((c) => c.name === cls.name);
  const classLevel = (own?.system.level ?? 0) + 1;
  const row = (cls.system.levels ?? [])[classLevel - 1] ?? null;
  const features = (row?.features ?? []).map((f) => f.name);
  const ordinary = !!system.ordinary;
  // The character's 1st level: no class levels, and no creature Hit Dice before it (a creature's first class
  // level is not ×4, nor its maximum hit points).
  const first = heroic === 0 && !(d.racialHitDice > 0);
  const points = perLevel(cls, d.modifiers?.int ?? 0, nonhuman) * (first ? 4 : 1);
  return {
    // `firstClass`: the first class level of any kind, for the starting feats it brings (a creature's included).
    className: cls.name, isNew: !own, classLevel, level, first, firstClass: heroic === 0,
    beyondMax: classLevel > (cls.system.maxLevel || 10),
    hitDie: cls.system.hitDie ?? 0,
    // A hero's first character level is the die's maximum (none of a creature's Hit Dice before it); an ordinary rolls.
    maxHitPoints: first && !ordinary,
    skillPoints: points,
    feats: featsAllowed(level) - featsAllowed(level - 1),
    bonusFeat: !ordinary && features.some((f) => /^bonus feat/i.test(f)),
    talent: !ordinary && features.some((f) => /^talent$/i.test(f)),
    features: features.filter((f) => !/^(bonus feat|talent)$/i.test(f)),
    increase: level % 4 === 0,
    actionPoints: ordinary ? 0 : actionPointsFor(level),
  };
}

/** Whether a skill (a derived row) is a class skill of `cls`, or one whatever the class (a feat's, the occupation's, marked by hand). */
export function classSkillOf(row, cls) {
  if (row.alwaysClass) return true;
  return (cls.system.classSkills ?? []).some((s) => skillKey(s.name) === row.key && (!s.specialty || !row.specialty || s.specialty === row.specialty || /\b(any|select|one)\b/i.test(s.specialty)));
}

/**
 * A skill as the level can buy it: what a point costs bought as `cls` (1, or 2 cross-class: half a
 * rank), its ranks now and the most it can have at the new level `level`.
 */
export function skillOffer(row, cls, level) {
  const cost = classSkillOf(row, cls) ? 1 : 2;
  // The maximum is a class skill's if it is one of any of the character's classes, or of this one.
  const max = maxRanks(level, row.classSkill || cost === 1);
  return { key: row.key, specialty: row.specialty ?? "", name: row.specialty ? `${row.name} (${row.specialty})` : row.name, ranks: row.ranks ?? 0, cost, step: 1 / cost, max };
}

/**
 * The ranks bought (`bought`: `{ "<key>|<specialty>": points }`) as changes to the character's stored
 * skills: `{ skills: { key: { ranks, points } }, specialtySkills, record }`, `record` the level's
 * purchases for its history. `rows` are the derived skill rows, `offers` the skillOffers by the same key.
 */
export function buyRanks(system, rows, offers, bought) {
  const skills = {};
  const specialtySkills = structuredClone(system.specialtySkills ?? []);
  const record = [];
  for (const [id, spent] of Object.entries(bought)) {
    if (!spent) continue;
    const offer = offers[id];
    const row = rows.find((r) => `${r.key}|${r.specialty ?? ""}` === id);
    if (!offer || !row) continue;
    const ranks = spent / offer.cost;
    // Points as bought: what the ranks cost before (tracked, or at today's cost), plus these.
    const pointsBefore = row.points ?? (row.ranks ?? 0) * (row.classSkill ? 1 : 2);
    if (SKILLS[row.key]?.specialties) {
      const s = specialtySkills.find((x) => x.skill === row.key && x.specialty === row.specialty);
      if (s) { s.ranks = (s.ranks ?? 0) + ranks; s.points = pointsBefore + spent; }
    } else {
      skills[row.key] = { ranks: (row.ranks ?? 0) + ranks, points: pointsBefore + spent };
    }
    record.push({ skill: row.key, specialty: row.specialty ?? "", ranks, points: spent });
  }
  return { skills, specialtySkills, record };
}

/** Points spent of `bought`, and left of `total`. */
export const pointsLeft = (bought, total) => total - Object.values(bought).reduce((n, v) => n + v, 0);

/**
 * Taking back a level's skill purchases (`record`, from its history): the stored skills with those ranks
 * and points taken off.
 */
export function unbuyRanks(system, record) {
  const skills = {};
  const specialtySkills = structuredClone(system.specialtySkills ?? []);
  for (const r of record ?? []) {
    if (SKILLS[r.skill]?.specialties) {
      const s = specialtySkills.find((x) => x.skill === r.skill && x.specialty === r.specialty);
      if (s) { s.ranks = Math.max(0, (s.ranks ?? 0) - r.ranks); s.points = s.points === null ? null : Math.max(0, s.points - r.points); }
    } else {
      const s = skills[r.skill] ?? { ...system.skills?.[r.skill] };
      skills[r.skill] = { ranks: Math.max(0, (s.ranks ?? 0) - r.ranks), points: s.points === null || s.points === undefined ? null : Math.max(0, s.points - r.points) };
    }
  }
  return { skills, specialtySkills };
}

/**
 * The character's own data as it will be once the level is taken: the ranks bought (`bought`, against `rows` and
 * `offers`, as buyRanks takes them), the specialties added for them, and the ability increase chosen. Read through
 * to `system` for everything else (its bonuses, as effects have left them), for deriveCharacter to work out the
 * character after the level: what a feat's prerequisites are judged against.
 */
export function afterLevel(system, source, { bought = {}, rows = [], offers = {}, specialties = [], increase = "" } = {}) {
  const own = structuredClone({ specialtySkills: source.specialtySkills ?? [], skills: source.skills ?? {} });
  for (const sp of specialties) {
    if (!own.specialtySkills.some((x) => x.skill === sp.skill && x.specialty === sp.specialty)) own.specialtySkills.push({ skill: sp.skill, specialty: sp.specialty, ranks: 0, misc: 0, classSkill: false, points: null });
  }
  const b = buyRanks(own, rows, offers, bought);
  const skills = { ...own.skills };
  for (const [k, v] of Object.entries(b.skills)) skills[k] = { ...skills[k], ...v };
  return Object.assign(Object.create(system), {
    skills, specialtySkills: b.specialtySkills,
    abilityIncreases: increase ? [...(system.abilityIncreases ?? []), increase] : [...(system.abilityIncreases ?? [])],
  });
}
