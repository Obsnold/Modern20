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

/**
 * Rows for a skill table.
 *
 * A skill taken per subject — Knowledge, Craft, a language — contributes one
 * row per subject rather than a single row, because each subject is a separate
 * skill with its own ranks. `pendingSpecialties` holds subjects being added in
 * this sitting, keyed by skill then subject name.
 */
export function skillRows(actor, {
  grantedSkills, pending = {}, pendingSpecialties = {}, characterLevel
}) {
  const maxRanks = characterLevel + 3;
  const maxCrossClass = maxRanks / 2;
  const rows = [];

  for (const [key, cfg] of Object.entries(MODERN20.skills)) {
    const stored = actor.system.skills[key];
    const isClassSkill = stored.classSkill || grantedSkills.has(key);
    const cap = isClassSkill ? maxRanks : maxCrossClass;
    const specialty = MODERN20.skillSpecialties[key];

    const base = {
      key,
      label: game.i18n.localize(cfg.label),
      ability: cfg.ability,
      trainedOnly: cfg.trainedOnly,
      classSkill: isClassSkill,
      cap,
      // A language rank buys one language, so its cap is not a rank ceiling.
      perRank: Boolean(specialty?.perRank)
    };

    if (!specialty) {
      const added = pending[key] ?? 0;
      const total = stored.ranks + added;
      rows.push({
        ...base, field: `rank.${key}`, existing: stored.ranks, added, total,
        cost: added * (isClassSkill ? 1 : 2), overCap: total > cap
      });
      continue;
    }

    // A heading row, so the subjects beneath it read as one skill.
    rows.push({ ...base, header: true, specialtyKey: key,
                options: specialty.options, open: specialty.open });

    const subjects = new Map();
    for (const entry of stored.specialties) subjects.set(entry.name, entry.ranks);
    for (const [name, ranks] of Object.entries(pendingSpecialties[key] ?? {})) {
      if (!subjects.has(name)) subjects.set(name, 0);
    }

    for (const [name, existingRanks] of subjects) {
      const added = pendingSpecialties[key]?.[name] ?? 0;
      const total = existingRanks + added;
      // A subject can be a class skill in its own right even when the parent
      // skill is not: Strong Hero grants Knowledge (Tactics) alone.
      const subjectIsClass = isClassSkill || grantedSkills.has(`${key}:${name}`);
      rows.push({
        ...base,
        classSkill: subjectIsClass,
        cost: added * (subjectIsClass ? 1 : 2),
        label: `${base.label} (${name})`,
        specialty: name,
        field: `specialty.${key}.${name}`,
        existing: existingRanks,
        added,
        total,
        overCap: !base.perRank && total > cap
      });
    }
  }

  return rows;
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

/** Fold pending ranks and subjects into the update payload for an actor. */
export function rankUpdates(actor, pending, pendingSpecialties = {}) {
  const updates = {};

  for (const [key, added] of Object.entries(pending)) {
    if (!added) continue;
    updates[`system.skills.${key}.ranks`] = actor.system.skills[key].ranks + added;
  }

  for (const [key, subjects] of Object.entries(pendingSpecialties)) {
    const stored = actor.system.skills[key];
    if (!stored) continue;
    // Rebuild the whole array: an ArrayField is replaced, not merged.
    const merged = stored.specialties.map((entry) => ({ ...entry }));
    for (const [name, added] of Object.entries(subjects)) {
      const existing = merged.find((entry) => entry.name === name);
      if (existing) existing.ranks += added;
      else merged.push({ name, ranks: added, misc: 0, classSkill: false });
    }
    updates[`system.skills.${key}.specialties`] = merged
      .filter((entry) => entry.name && entry.ranks > 0)
      .map(({ name, ranks, misc, classSkill }) => ({ name, ranks, misc, classSkill }));
  }

  return updates;
}
