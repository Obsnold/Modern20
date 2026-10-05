/**
 * Spells and psionic powers: what a character's casting classes give it, from
 * the tables each class page prints (a class item's `system.casting`).
 *
 *   spells a day      the class's table at its level, plus bonus spells by its bonus
 *                     ability's score (none for a 0-level spell, or for a class that
 *                     prints no bonus table); an Archmage's or Ecclesiarch's Increased
 *                     Spells/Day makes the table's number half again (2nd level) or
 *                     double (4th), before the bonus
 *   spells known      a spontaneous caster's (Mystic) table
 *   caster level      the class level; with Total Spellcasting, every arcane caster
 *                     level and the Archmage's own (arcane), or every character level
 *                     (Ecclesiarch, divine)
 *   saving throw DC   10 + the spell's level + the class's ability modifier; a power's,
 *                     10 + its level + its key ability's modifier
 *   casting at all    an ability score of at least 10 + the spell's or power's level
 *   power points      the class's Pts/Day at its level, plus any bonus by score; a
 *                     0-level power is free 3 + psionic level times a day, then 1 point
 *   power point cost  0/1, 1, 3, 5, 7, 9 by level (Modern/FX/PsionicPowers)
 */

export const POWER_COST = [0, 1, 3, 5, 7, 9];

/** A table's numbers for `n` (a class level or an ability score): the row it falls in, the last row past the end, null before the first. */
export function tableRow(table, n) {
  const rows = table?.rows ?? [];
  if (!rows.length || n === null || n === undefined || n < rows[0].from) return null;
  return (rows.find((r) => n >= r.from && n <= r.to) ?? rows.at(-1)).values;
}

/** A table's numbers as `{ spellLevel: n }`, absent levels left out. */
function byLevel(table, n) {
  const values = tableRow(table, n);
  if (!values) return {};
  return Object.fromEntries(table.columns.map((l, i) => [l, values[i]]).filter(([, v]) => v !== null && v !== undefined));
}

/** The Increased Spells/Day factor a boosting class's level gives. */
const boostFactor = (level) => (level >= 4 ? 2 : level >= 2 ? 1.5 : 1);

const abilityModifier = (score) => (score === null || score === undefined ? null : Math.floor((score - 10) / 2));

/**
 * The casting classes of a character: `classes` its class items `{ name, system }`
 * (with `system.level`), `scores` its ability scores, `level` its character level.
 */
export function casters(classes, scores, level) {
  const casting = classes.filter((c) => c.system.casting?.kind);
  const boost = (kind) => casting.filter((c) => c.system.casting.boosts && c.system.casting.kind === kind);
  const arcaneLevels = casting.filter((c) => c.system.casting.kind === "arcane").reduce((n, c) => n + c.system.level, 0);
  const psionicLevel = casting.filter((c) => c.system.casting.kind === "psionic" && !c.system.casting.boosts).reduce((n, c) => n + c.system.level, 0);
  return casting.filter((c) => !c.system.casting.boosts).map((c) => {
    const k = c.system.casting;
    const classLevel = c.system.level;
    const boosters = boost(k.kind);
    // Total Spellcasting: an Archmage counts every arcane caster level, an Ecclesiarch every character level.
    const casterLevel = !boosters.length ? classLevel : k.kind === "arcane" ? arcaneLevels : level;
    const factor = boosters.reduce((f, b) => Math.max(f, boostFactor(b.system.level)), 1);
    const base = byLevel(k.perDay, classLevel);
    const bonus = k.bonusAbility ? byLevel(k.bonusSpells, scores[k.bonusAbility]) : {};
    const perDay = Object.fromEntries(Object.entries(base).map(([l, n]) => [l, Math.floor(n * factor) + (Number(l) > 0 ? bonus[l] ?? 0 : 0)]));
    const bonusPoints = k.bonusAbility ? (k.bonusPoints ?? []).find((b) => scores[k.bonusAbility] >= b.from && scores[k.bonusAbility] <= b.to)
      ?? ((k.bonusPoints ?? []).length && scores[k.bonusAbility] > k.bonusPoints.at(-1).to ? k.bonusPoints.at(-1) : null) : null;
    return {
      name: c.name, kind: k.kind, classLevel, casterLevel,
      ability: k.ability, abilityModifier: k.ability ? abilityModifier(scores[k.ability]) ?? 0 : null,
      spontaneous: k.spontaneous, prepared: k.kind !== "psionic" && !k.spontaneous,
      lists: k.lists, excluded: k.excluded,
      perDay,
      known: byLevel(k.known, classLevel),
      powerPoints: k.kind === "psionic" ? (k.powerPoints[Math.min(classLevel, k.powerPoints.length) - 1] ?? 0) + (bonusPoints?.points ?? 0) : 0,
      freeManifestations: k.kind === "psionic" ? 3 + psionicLevel : 0,
    };
  });
}

/** A spell's or power's level for a caster: the level its `levels` give on one of the caster's lists, or null. */
export function levelFor(item, caster) {
  if (caster.excluded && new RegExp(caster.excluded, "i").test(item.name)) return null;
  const entry = (item.system.levels ?? []).find((l) => caster.lists.includes(l.class));
  return entry ? entry.level : null;
}

/** The first caster that can cast this spell or power, with its level for that caster; null if none can. */
export function casterFor(item, list) {
  for (const c of list) {
    if ((item.type === "power") !== (c.kind === "psionic")) continue;
    const level = levelFor(item, c);
    if (level !== null) return { caster: c, level };
  }
  return null;
}

/**
 * Casting a spell or power: its saving throw DC, the ability score it needs, whether the
 * character has it, and a power's point cost. `scores` are the character's ability scores.
 */
export function castingOf(item, caster, level, scores) {
  const ability = item.type === "power" ? item.system.keyAbility || caster.ability : caster.ability;
  const score = scores[ability];
  const mod = abilityModifier(score) ?? 0;
  const save = item.system.savingThrow ?? "";
  return {
    level, ability, dc: 10 + level + mod,
    hasSave: !!save && !/^none/i.test(save),
    needs: 10 + level, meets: score !== null && score !== undefined && score >= 10 + level,
    cost: item.type === "power" ? item.system.powerPointCost?.value ?? POWER_COST[level] ?? 0 : 0,
  };
}

/**
 * Whether a caster can cast a spell of `level` now. A prepared caster casts a spell it
 * prepared and has not yet cast; a spontaneous one spends a slot of that level or higher.
 * `used` is the slots spent today by level; returns the slot level spent, or null.
 */
export function slotFor(caster, level, used = {}) {
  for (const l of Object.keys(caster.perDay).map(Number).filter((l) => l >= level).sort((a, b) => a - b)) {
    if ((used[l] ?? 0) < caster.perDay[l]) return l;
  }
  return null;
}

/**
 * Manifesting a power of `cost` points: whether it can be paid, and how. A 0-level power
 * uses a free manifestation while any are left, then costs 1 point.
 */
export function payFor(cost, level, { points, freeUsed, freeManifestations }) {
  if (level === 0 && freeUsed < freeManifestations) return { points: 0, free: true };
  const pay = level === 0 ? 1 : cost;
  return pay <= points ? { points: pay, free: false } : null;
}
