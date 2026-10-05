/**
 * Unarmed strikes and grappling (Modern/Combat/ActionsInCombat, Grapple).
 *
 *   unarmed strike     a light melee weapon: 1d3 + Str nonlethal (a Medium character);
 *                      lethal at −4 on the attack
 *   Brawl              +1 to attack, 1d6 nonlethal; Improved Brawl +2, 1d8
 *   Combat Martial     1d4, lethal or nonlethal by choice (no −4); Improved: threat
 *     Arts             19–20; Advanced: ×3 on a critical
 *   Streetfighting     +1d4 damage once a round with an unarmed strike or light weapon
 *   grapple check      base attack + Str + the size's grapple modifier, opposed
 *   starting one       a melee touch attack to grab, then an opposed grapple check to hold,
 *                      which deals unarmed strike damage
 *
 * The book gives a Medium character's unarmed damage only; a character of another size uses
 * it too.
 */

/** The best of the unarmed feats' rules (rules/feats.mjs `unarmed`), given the feats' rules. */
export function unarmedRules(rules) {
  const u = rules.map((r) => r.unarmed).filter(Boolean);
  const best = (key) => u.map((x) => x[key]).filter((v) => v !== undefined);
  const dice = { "1d3": 1, "1d4": 2, "1d6": 3, "1d8": 4 };
  const nonlethalDie = ["1d3", ...best("die")].sort((a, b) => dice[b] - dice[a])[0];
  return {
    attack: Math.max(0, ...best("attack")),
    lethalAllowed: best("lethal").some(Boolean),
    // Combat Martial Arts' 1d4 is the die it may deal lethally with; Brawl's are nonlethal.
    nonlethalDie,
    lethalDie: best("lethal").some(Boolean) ? "1d4" : "1d3",
    threat: Math.min(20, ...best("threat")),
    multiplier: Math.max(2, ...best("multiplier")),
    streetfighting: rules.find((r) => r.streetfighting)?.streetfighting ?? null,
  };
}

/**
 * The unarmed strike as a weapon the attack and damage rolls (rules/rolls.mjs) take: with
 * `lethal`, the die it deals lethal damage with.
 */
export function unarmedWeapon(u, { lethal = false } = {}) {
  const die = lethal ? u.lethalDie : u.nonlethalDie;
  return {
    id: "unarmed", name: "Unarmed strike", type: "weapon",
    system: {
      melee: true, damage: { value: die, formula: die }, damageType: lethal ? "" : "nonlethal",
      critical: `${u.threat < 20 ? `${u.threat}–20` : "20"}${u.multiplier > 2 ? `/x${u.multiplier}` : ""}`,
      proficiency: { value: "", uuid: "" }, magazine: "", rateOfFire: "",
    },
  };
}

/** The terms an unarmed attack adds to a melee attack: Brawl's bonus, and −4 for lethal damage without Combat Martial Arts. */
export function unarmedTerms(u, { lethal = false } = {}) {
  return [
    { label: "Brawl", value: u.attack },
    { label: "Lethal damage (no Combat Martial Arts)", value: lethal && !u.lethalAllowed ? -4 : 0 },
  ];
}

/** Grapple modifiers by size (Table: Grapple Modifiers). */
export const GRAPPLE_SIZE = { fine: -16, diminutive: -12, tiny: -8, small: -4, medium: 0, large: 4, huge: 8, gargantuan: 12, colossal: 16 };

const SIZE_ORDER = ["fine", "diminutive", "tiny", "small", "medium", "large", "huge", "gargantuan", "colossal"];

/** Whether a character can get a hold on a target of `targetSize`: not one more than two sizes larger. */
export const canHold = (size, targetSize) => SIZE_ORDER.indexOf(targetSize) - SIZE_ORDER.indexOf(size) < 2;
