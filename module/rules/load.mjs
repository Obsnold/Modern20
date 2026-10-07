/**
 * Carrying capacity (Modern/Equipment/equipmentbasics, Carrying Capacity): what a character can carry by its
 * Strength, and what carrying more does.
 *
 *   loads           light, medium and heavy by Strength (Table: Carrying Capacity); past 29, the score of
 *                   the same ones digit in the 20s, ×4 for each ten above; ×2 Large ... ×1/8 Fine
 *   medium load     encumbered: speed 30 → 20 (by the table), Dexterity bonus at most +3, −3 on attacks and
 *                   on Balance, Climb, Escape Artist, Hide, Jump, Move Silently and Tumble
 *   heavy load      speed 30 → 15, Dexterity bonus at most +1, −6, and a run of ×3 speed rather than ×4
 *   over the heavy  no moving at all
 *
 * The weight is everything the character has, but what is kept elsewhere (a gear item's `stored`).
 */

/** Table: Carrying Capacity's heavy load (its upper end, the maximum load) for Strength 1 to 29. */
const HEAVY = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 115, 130, 150, 175, 200, 230, 260, 300, 350, 400, 460, 520, 600, 700, 800, 920, 1040, 1200, 1400];

/** A bipedal creature's capacity by size (Bigger and Smaller Creatures). */
const SIZE = { fine: 1 / 8, diminutive: 1 / 4, tiny: 1 / 2, small: 3 / 4, medium: 1, large: 2, huge: 4, gargantuan: 8, colossal: 16 };

/** The skills an encumbrance penalty applies to. */
export const LOAD_SKILLS = ["balance", "climb", "escapeArtist", "hide", "jump", "moveSilently", "tumble"];

/** Speed when encumbered, and heavily, by the speed before (the tables); others in proportion, to the 5 feet. */
const SLOWER = { medium: { 20: 15, 30: 20, 40: 30, 50: 40, 60: 50 }, heavy: { 20: 10, 30: 15, 40: 20, 50: 25, 60: 30 } };
const slowed = (speed, level) => SLOWER[level][speed] ?? Math.floor((speed * (level === "medium" ? 2 / 3 : 1 / 2)) / 5) * 5;

/** The heavy load (maximum load) for a Strength score: the table, and past it ×4 for each ten above the 20s. */
export function maximumLoad(str) {
  if (!(str > 0)) return 0;
  if (str <= 29) return HEAVY[str - 1];
  const tens = Math.floor(str / 10) - 2;
  return HEAVY[20 + (str % 10) - 1] * 4 ** tens;
}

/**
 * What `weight` pounds are to a character of Strength `str` and `size`: `{ weight, light, medium, heavy,
 * level, penalty, maxDex, speed(base), run }`, `level` "light", "medium", "heavy" or "over"; null without a
 * Strength score.
 */
export function carrying(str, size, weight) {
  if (str === null || str === undefined) return null;
  const heavy = Math.floor(maximumLoad(str) * (SIZE[size] ?? 1));
  const light = Math.floor(heavy / 3), medium = Math.floor((heavy * 2) / 3);
  const level = weight <= light ? "light" : weight <= medium ? "medium" : weight <= heavy ? "heavy" : "over";
  return {
    weight, light, medium, heavy, level,
    penalty: { light: 0, medium: -3, heavy: -6, over: -6 }[level],
    maxDex: { light: null, medium: 3, heavy: 1, over: 1 }[level],
    speed: (base) => (level === "light" ? base : level === "over" ? 0 : Math.min(base, slowed(base, level))),
    run: level === "heavy" || level === "over" ? 3 : 4,
  };
}

/** The weight of what a character carries: every item's, but what is kept elsewhere. */
export const carriedWeight = (items) => Math.round(items.reduce((n, i) => n + (i.system?.stored ? 0 : Number(i.system?.weight?.lb) || 0), 0) * 10) / 10;
