import { MODERN20 } from "../config.mjs";

const { Roll } = foundry.dice;

/**
 * The Wealth economy, per the SRD Wealth rules.
 *
 * A Wealth check is 1d20 + the current Wealth bonus against the object's
 * purchase DC, and succeeds automatically when the bonus already meets the DC.
 * A failed check costs nothing. A successful purchase erodes the bonus when
 * the DC is above the current bonus, by an amount that scales with the gap,
 * plus one extra point for anything with a purchase DC of 15 or higher.
 */

/** Which loss bracket a gap falls into. Gap is (purchaseDC - wealthBonus). */
export function lossFormulaForGap(gap) {
  if (gap <= 0) return null;
  const bracket = MODERN20.wealth.lossBrackets.find((b) => gap <= b.maxGap);
  return bracket?.formula ?? null;
}

/**
 * Resolve a purchase. Returns the roll, whether it succeeded, and how much
 * Wealth was lost; the caller decides whether to commit the loss to the actor.
 */
export async function rollWealthCheck(actor, purchaseDC, { restriction = "none", blackMarket = false } = {}) {
  const wealthBonus = actor.system.wealth?.bonus ?? 0;

  const surcharge = blackMarket
    ? (MODERN20.restrictions[restriction]?.blackMarketDC ?? 0)
    : 0;
  const dc = purchaseDC + surcharge;

  const automatic = wealthBonus >= dc;
  let roll = null;

  if (!automatic) {
    roll = await new Roll("1d20 + @wealth", { wealth: wealthBonus }).evaluate();
  }

  const success = automatic || roll.total >= dc;

  let lost = 0;
  const lossRolls = [];
  if (success) {
    const gap = dc - wealthBonus;
    const formula = lossFormulaForGap(gap);
    if (formula) {
      const lossRoll = await new Roll(formula).evaluate();
      lossRolls.push(lossRoll);
      lost += lossRoll.total;
    }
    if (dc >= MODERN20.wealth.extraLossThreshold) {
      const extra = await new Roll(MODERN20.wealth.extraLossFormula).evaluate();
      lossRolls.push(extra);
      lost += extra.total;
    }
  }

  return { dc, purchaseDC, surcharge, wealthBonus, automatic, roll, success, lost, lossRolls };
}

/** Apply a resolved purchase's Wealth loss. The bonus is not allowed below zero. */
export async function commitWealthLoss(actor, result) {
  if (!result.success || result.lost <= 0) return actor.system.wealth.bonus;
  const next = Math.max(0, actor.system.wealth.bonus - result.lost);
  await actor.update({ "system.wealth.bonus": next });
  return next;
}
