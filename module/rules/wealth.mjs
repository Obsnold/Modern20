/**
 * Buying and selling with Wealth (Modern/wealth).
 *
 *   Wealth check       1d20 + Wealth bonus against the purchase DC; a bonus at or over the
 *                      DC succeeds without a roll. At +0, nothing of DC 10 or more.
 *   losing Wealth      on a purchase over the bonus: 1 point (1–10 over), 1d6 (11–15 over),
 *                      2d6 (16 or more over); and 1 more for any DC of 15 or higher
 *   selling            sale value = purchase DC − 3 (−3 more on the black market); Wealth goes
 *                      up by what buying at the sale value would cost
 *   regaining Wealth   at each new level, a Profession check (Wisdom without ranks) against
 *                      the bonus: +1, and +1 more for every 5 over
 *
 * The bonus never falls below +0.
 */

/** What a purchase of `dc` takes from `wealth`: a formula ("1", "1d6 + 1"), or "" for nothing. */
export function wealthLoss(dc, wealth) {
  const over = dc - wealth;
  const parts = [];
  if (over > 15) parts.push("2d6");
  else if (over > 10) parts.push("1d6");
  else if (over > 0) parts.push("1");
  if (dc >= 15) parts.push("1");
  if (parts.length === 2 && parts[0] === "1") return "2";
  return parts.join(" + ");
}

/** Whether `wealth` can buy at `dc`: `{ automatic, impossible }`; otherwise it takes a roll. */
export const purchase = (wealth, dc) => ({ automatic: wealth >= dc, impossible: wealth <= 0 && dc >= 10 });

/** A sale of an item of purchase DC `dc`: its sale value and the Wealth it brings (a formula, or ""). */
export function sale(dc, wealth, { blackMarket = false } = {}) {
  const value = dc - 3 - (blackMarket ? 3 : 0);
  return { value, gain: wealthLoss(value, wealth) };
}

/** Wealth regained on a new level, from the Profession (or Wisdom) check's total. */
export const regained = (total, wealth) => (total >= wealth ? 1 + Math.floor((total - wealth) / 5) : 0);

/** The table's description of a Wealth bonus. */
export function financialCondition(wealth) {
  if (wealth <= 0) return "Impoverished or in debt";
  if (wealth <= 4) return "Struggling";
  if (wealth <= 10) return "Middle class";
  if (wealth <= 15) return "Affluent";
  if (wealth <= 20) return "Wealthy";
  if (wealth <= 30) return "Rich";
  return "Very rich";
}

/**
 * A 1st-level character's starting Wealth bonus: 2d4, plus the occupation's Wealth bonus,
 * Windfall's +3, and +1 for 1 to 4 ranks in Profession. Returns the formula and its parts.
 */
export function startingWealth({ occupation = 0, windfall = false, professionRanks = 0 } = {}) {
  const parts = [
    ["2d4", "2d4"],
    occupation ? ["Occupation", occupation] : null,
    windfall ? ["Windfall", 3] : null,
    professionRanks >= 1 && professionRanks <= 4 ? ["Profession ranks", 1] : null,
  ].filter(Boolean);
  return { formula: parts.map(([, v]) => v).join(" + "), parts };
}
