/**
 * What a character's levels give it to spend, and what it has spent: action
 * points, skill points, feats, talents and ability increases. The sheet shows
 * these as counts and warnings, not limits: a GM's house rules and the book's
 * odd cases (a class feature that grants a feat by name) are the table's call.
 *
 *   action points    5 + half the character level, rounded down, at 1st level and every
 *                    level after (Modern/BasicClasses; a creature's own Hit Dice do not count)
 *   skill points     each class level: its class's points + Int modifier; the character's
 *                    first level ×4 (Modern/BasicClasses). A d20 Future class gives one
 *                    fewer to a nonhuman. A rank costs 1 point in a class skill of the class
 *                    the level is taken in, 2 in any other (Modern/Skills/skillsoverview,
 *                    BasicClasses/MulticlassCharacters): tracked as ranks are bought
 *   maximum ranks    character level + 3 in a class skill, half that cross-class
 *   feats            two at 1st level, then one every three character levels, plus the
 *                    bonus feats of class levels, the first class's starting feats, and any
 *                    an occupation or species gives (Modern/BasicClasses/MulticlassCharacters)
 *   talents          one for each Talent in the class levels taken
 *   ability increase +1 to one score every four character levels
 *
 * An ordinary (Modern/ordinaries) has no action points, and none of the basic classes' class
 * features: no talents and no bonus feats. Its skill points, feats and ability increases are a
 * hero's. It can take only the basic classes.
 */

export const actionPointsFor = (level) => 5 + Math.floor(level / 2);

/**
 * A character's classes, the one its 1st level was in first: the one named (`system.startingClass`),
 * or else a basic class, as a 1st level must be (an advanced class has requirements), or else the
 * first. The 1st level's class gives the maximum hit points, ×4 skill points and its starting feats.
 */
export function inOrder(classes, starting = "") {
  const first = classes.find((c) => c.name === starting) ?? classes.find((c) => c.system.classType === "basic") ?? classes[0];
  return first ? [first, ...classes.filter((c) => c !== first)] : [];
}

/** The action points not yet given: one grant for each level above `granted`, up to `level`. */
export function actionPointsDue(level, granted = 0) {
  const levels = [];
  for (let l = Math.max(granted, 0) + 1; l <= level; l++) levels.push(l);
  return { levels, points: levels.reduce((n, l) => n + actionPointsFor(l), 0) };
}

export const maxRanks = (level, classSkill) => (classSkill ? level + 3 : (level + 3) / 2);
export const featsAllowed = (level) => (level >= 1 ? 2 + Math.floor(level / 3) : 0);
export const abilityIncreases = (level) => Math.floor(Math.max(level, 0) / 4);

/** A class's skill points a level for this character: its number + Int, one fewer for a nonhuman where the class says so. */
function perLevel(cls, intMod, nonhuman) {
  const sp = cls.system.skillPoints ?? {};
  const base = (sp.perLevel ?? 0) - (nonhuman && /nonhumans/i.test(sp.value ?? "") ? 1 : 0);
  // The SRD's skill pages give no minimum; at least 1 a level, as in the d20 System, so a low Intelligence never takes points away.
  return Math.max(1, base + intMod);
}

/**
 * What the classes (in the order taken; the first is the character's 1st level) give:
 * skill points, feats beyond the general ones, and talents.
 */
export function classGrants(classes, { intMod = 0, nonhuman = false } = {}) {
  let skillPoints = 0, bonusFeats = 0, talents = 0;
  const startingFeats = classes[0]?.system.startingFeats?.length ?? 0;
  classes.forEach((c, i) => {
    const level = c.system.level ?? 1;
    const n = perLevel(c, intMod, nonhuman);
    skillPoints += n * level + (i === 0 ? n * 3 : 0);   // ×4 at the character's first level
    for (const row of (c.system.levels ?? []).filter((l) => l.level <= level)) {
      for (const f of row.features ?? []) {
        if (/^bonus feat/i.test(f.name)) bonusFeats++;
        else if (/^talent$/i.test(f.name)) talents++;
      }
    }
  });
  return { skillPoints, bonusFeats, talents, startingFeats };
}

/**
 * Skill points spent on ranks: what each skill's ranks cost as they were bought (`points`), or, for
 * a skill not yet tracked, its ranks at today's cost: 1 a rank in a class skill, 2 cross-class.
 */
export const skillPointsSpent = (rows) => rows.reduce((n, r) => n + (r.points ?? (r.ranks ?? 0) * (r.classSkill ? 1 : 2)), 0);

/**
 * What a rank costs bought as `className`: 1 in one of that class's skills, or a skill that is a
 * class skill whatever the class (a feat's, the occupation's, marked by hand); 2 in any other. A
 * character with no class pays by whether the skill is a class skill at all.
 */
export function rankCost(row, className) {
  if (row.alwaysClass) return 1;
  if (!className) return row.classSkill ? 1 : 2;
  return (row.classFor ?? []).includes(className) ? 1 : 2;
}

/**
 * A skill's points after its ranks change from `before` to `after`, bought (or sold back) as
 * `className`: what they cost before (tracked, or at today's cost), plus the change at this cost.
 */
export function pointsAfter(row, before, after, className) {
  const was = row.points ?? before * (row.classSkill ? 1 : 2);
  return Math.max(0, was + (after - before) * rankCost(row, className));
}

/**
 * The whole picture, for the sheet: `{ have, allowed, over }` for each of skill points,
 * feats and talents, the action points due, and the ability increases owed and chosen; for an
 * ordinary, `notBasic` names any class it has that is not a basic class.
 * `level` is the character level (a creature's Hit Dice included), `heroicLevel` its class
 * levels alone; `skills` the derived skill rows; `counts` the feats and talents it has.
 */
export function advancement({ level, heroicLevel, classes, intMod, nonhuman, skills, counts, granted, increases, grants = [], ordinary = false }) {
  const g = classGrants(classes, { intMod, nonhuman });
  if (ordinary) Object.assign(g, { bonusFeats: 0, talents: 0 });
  // Feats an occupation or species gives, on top of the levels' (the starting feats are counted with the class).
  const given = (kind) => grants.filter((x) => x.kind === kind).reduce((n, x) => n + x.choose, 0);
  // A creature with no class levels counts its feats and skills by its type's own rules (printed on the type): not checked.
  const pick = (have, allowed) => ({ have, allowed, over: allowed !== null && have > allowed, under: allowed !== null && have < allowed });
  const ranks = skills.filter((r) => r.ranks > maxRanks(level, r.classSkill)).map((r) => ({ key: r.key, specialty: r.specialty, max: maxRanks(level, r.classSkill) }));
  return {
    skillPoints: pick(skillPointsSpent(skills), heroicLevel ? g.skillPoints : null),
    overRanks: ranks,
    feats: pick(counts.feats, heroicLevel ? featsAllowed(level) + g.bonusFeats + g.startingFeats + given("occupation") + given("species") : null),
    featParts: { general: featsAllowed(level), bonus: g.bonusFeats, starting: g.startingFeats, occupation: given("occupation"), species: given("species") },
    talents: pick(counts.talents, g.talents),
    actionPoints: ordinary ? { levels: [], points: 0 } : actionPointsDue(heroicLevel, granted),
    abilityIncreases: { allowed: abilityIncreases(level), chosen: increases.length },
    notBasic: ordinary ? classes.filter((c) => c.system.classType !== "basic").map((c) => c.name) : [],
  };
}

/**
 * The feats a character's occupation, species and first class give it to choose from or
 * take: `[{ source, kind, label, choose, options: [{ name, specialty, uuid }] }]`. `source`
 * is the giving item's id. A starting feat is given outright (all must be taken); an
 * occupation or species may offer a choice of one (Criminal: Brawl or Personal Firearms
 * Proficiency), or give its only option.
 */
export function featGrants(items, startingClass = "") {
  const occupation = items.find((i) => i.type === "occupation");
  const species = items.find((i) => i.type === "species");
  const firstClass = inOrder(items.filter((i) => i.type === "class" && (i.system.level ?? 0) > 0), startingClass)[0];
  const out = [];
  const add = (item, kind, label, choice) => {
    const options = (choice?.options ?? []).filter((o) => o.name);
    if (item && options.length) out.push({ source: item.id ?? item._id ?? item.name, name: item.name, kind, label, choose: Math.min(choice.choose ?? options.length, options.length), options });
  };
  add(occupation, "occupation", "occupation", occupation?.system.feats);
  add(species, "species", "species", species?.system.bonusFeats);
  add(firstClass, "starting", "starting feats", firstClass && { choose: firstClass.system.startingFeats?.length ?? 0, options: firstClass.system.startingFeats ?? [] });
  return out;
}
