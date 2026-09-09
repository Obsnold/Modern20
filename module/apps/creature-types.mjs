import { CREATURE_TYPES, CREATURE_PROGRESSION } from "../creature-types.mjs";

/**
 * Building a creature from its type.
 *
 * "An aberration has a bizarre anatomy..." — each of the fifteen types sets a
 * hit die, one of three base attack columns, and which saves are good. Given a
 * type and a number of Hit Dice, everything derived follows; the ability
 * scores do not, since the SRD gives a range for each size and picking within
 * it is the GM's job.
 */

/** Every type, for a picker. */
export function creatureTypeChoices() {
  return Object.fromEntries(
    Object.values(CREATURE_TYPES).map((type) => [type.id, type.name])
  );
}

/** One type by id, tolerating the free text older creatures carry. */
export function creatureType(id) {
  if (!id) return null;
  const key = String(id).trim().toLowerCase().replace(/[^a-z]/g, "");
  if (!key) return null;

  const named = (type) => type.name.toLowerCase().replace(/[^a-z]/g, "");
  const exact = Object.values(CREATURE_TYPES).find(
    (type) => type.id.toLowerCase() === key || named(type) === key
  );
  if (exact) return exact;

  // A stat block writes "elemental (air)", and a sheet edited before the types
  // were a list can hold anything. Longest name first, so "monstrous humanoid"
  // is not read as a humanoid.
  return [...Object.values(CREATURE_TYPES)]
    .sort((a, b) => named(b).length - named(a).length)
    .find((type) => key.startsWith(named(type))) ?? null;
}

/** "5d8" is five Hit Dice; "1/2 d8" and a bare "d8" are one. */
export function hitDiceCount(hitDice) {
  const match = String(hitDice ?? "").match(/^\s*(\d+)\s*d/i);
  return match ? Number(match[1]) : 1;
}

/**
 * The progression row for a number of Hit Dice.
 *
 * "1 or less" is the first row and the table stops at 20; past it the last row
 * holds rather than extrapolating attacks the SRD never grants.
 */
export function progressionAt(hitDice) {
  const count = Math.max(1, hitDice);
  return CREATURE_PROGRESSION.find((row) => row.hitDice === count)
    ?? CREATURE_PROGRESSION[CREATURE_PROGRESSION.length - 1]
    ?? null;
}

/** "+11/+6/+1" is three attacks; the first is the base attack bonus. */
export function firstAttack(text) {
  const match = String(text ?? "").match(/[+-]?\d+/);
  return match ? Number(match[0]) : 0;
}

/**
 * What a type and a number of Hit Dice come to.
 *
 * Returns nothing for an unrecognised type rather than guessing, so a creature
 * carrying free text from the import is left alone until someone picks one.
 */
export function derivedFromType(typeId, hitDice) {
  const type = creatureType(typeId);
  if (!type) return null;

  const count = hitDiceCount(hitDice);
  const row = progressionAt(count);
  if (!row) return null;

  const column = { A: row.attackA, B: row.attackB, C: row.attackC }[type.baseAttack];

  return {
    type,
    hitDiceCount: count,
    // The SRD writes the whole attack sequence; the sheet stores the first,
    // and the rest follow from it the same way a character's do.
    baseAttack: firstAttack(column),
    attackSequence: String(column ?? "").trim(),
    saves: Object.fromEntries(
      ["fort", "ref", "will"].map((save) =>
        [save, type.goodSaves.includes(save) ? row.goodSave : row.poorSave])
    ),
    // "5d8" from five Hit Dice and a d8 type.
    hitDice: `${count}${type.hitDie}`,
    size: null
  };
}

/**
 * The row of a type's own table for a size: what its abilities should fall
 * between, and what its natural attacks deal.
 *
 * Offered rather than applied — the SRD gives a range and choosing within it
 * is the point of building a creature rather than copying one.
 */
export function sizeGuidance(typeId, size) {
  const type = creatureType(typeId);
  if (!type) return null;

  // The sheet stores a size key; the SRD prints the name, and calls one of
  // them "Medium-size" rather than "Medium".
  const wanted = String(size ?? "").toLowerCase();
  return type.sizes.find((row) => sizeKey(row.size) === wanted) ?? null;
}

/** "Medium-size" is the medium size; the rest are their own names. */
export function sizeKey(name) {
  const key = String(name ?? "").toLowerCase().replace(/[^a-z]/g, "");
  return key === "mediumsize" ? "medium" : key;
}
