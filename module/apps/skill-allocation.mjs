import { MODERN20 } from "../config.mjs";

/**
 * Skill point spending, shared by the character creator and the level-up
 * screen so both cost ranks the same way.
 *
 * A rank in a class skill costs one point; a cross-class rank costs two.
 * Ranks are capped at character level + 3, or half that cross-class. Nothing
 * is enforced — over-spending and over-ranking are flagged, as everywhere else
 * in the system — but the numbers are shown so the player can see the rules.
 */

/** Rows for a skill table, given the ranks already held and those being added. */
export function skillRows(actor, { grantedSkills, pending = {}, characterLevel }) {
  const maxRanks = characterLevel + 3;
  const maxCrossClass = maxRanks / 2;

  return Object.entries(MODERN20.skills).map(([key, cfg]) => {
    const existing = actor.system.skills[key];
    const isClassSkill = existing.classSkill || grantedSkills.has(key);
    const added = pending[key] ?? 0;
    const total = existing.ranks + added;

    return {
      key,
      label: game.i18n.localize(cfg.label),
      ability: cfg.ability,
      trainedOnly: cfg.trainedOnly,
      classSkill: isClassSkill,
      existing: existing.ranks,
      added,
      total,
      cost: added * (isClassSkill ? 1 : 2),
      cap: isClassSkill ? maxRanks : maxCrossClass,
      overCap: total > (isClassSkill ? maxRanks : maxCrossClass)
    };
  });
}

/** What a set of pending ranks costs in points. */
export function spendOf(rows) {
  return rows.reduce((total, row) => total + row.cost, 0);
}

/**
 * Points a class level grants: its per-level points plus the Intelligence
 * modifier, floored at one. The character's very first class level is worth
 * four times that.
 */
export function pointsForLevel(perLevel, intMod, { firstLevelEver = false } = {}) {
  const each = Math.max(1, perLevel + intMod);
  return firstLevelEver ? each * 4 : each;
}

/** Fold pending ranks into the update payload for an actor. */
export function rankUpdates(actor, pending) {
  const updates = {};
  for (const [key, added] of Object.entries(pending)) {
    if (!added) continue;
    updates[`system.skills.${key}.ranks`] = actor.system.skills[key].ranks + added;
  }
  return updates;
}
