/**
 * Buying with Wealth, from a character's sheet: the Wealth check (or none, when the
 * bonus covers the DC), and the Wealth a purchase costs, posted to chat and written
 * to the character. The rules are rules/wealth.mjs.
 */
import * as W from "./rules/wealth.mjs";
import { wealthCheck } from "./roll.mjs";
const escape = (s) => foundry.utils.escapeHTML(String(s));

async function rollFormula(formula) {
  if (!formula) return 0;
  const Roll = foundry.dice?.Roll ?? globalThis.Roll;
  return (await new Roll(formula).evaluate()).total;
}

/** Buy something of purchase DC `dc` (`name` for the card). Returns whether it was bought. */
export async function buy(actor, dc, name, event) {
  const wealth = actor.system.wealth.value ?? 0;
  const p = W.purchase(wealth, dc);
  if (p.impossible) {
    ui.notifications.warn(`${actor.name} has a Wealth bonus of +0 and cannot buy anything of purchase DC 10 or higher.`);
    return false;
  }
  if (!p.automatic) {
    const roll = await wealthCheck(actor, dc, `Buying ${name}`, event);
    if (!roll) return false;
    if (roll.total < dc) {
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="m20-roll"><p>${escape(actor.name)} can't afford ${escape(name)} right now (needed ${dc}). Wealth is unchanged; trying again takes another ${dc} hours of shopping.</p></div>` });
      return false;
    }
  }
  const formula = W.wealthLoss(dc, wealth);
  const loss = await rollFormula(formula);
  const after = Math.max(0, wealth - loss);
  await actor.update({ "system.wealth.value": after });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="m20-roll"><h3>Bought ${escape(name)}${p.automatic ? " (within means, no roll)" : ""}</h3><p>Wealth +${wealth} → +${after}${formula ? ` (lost ${formula}${/d/.test(formula) ? `: ${loss}` : ""})` : ""}. ${escape(W.financialCondition(after))}.</p></div>`,
  });
  return true;
}

/** Sell an owned item: its sale value (purchase DC − 3), and the Wealth it brings. The item is removed. */
export async function sell(actor, item) {
  const dc = item.system.purchaseDC?.dc;
  if (dc === null || dc === undefined) return ui.notifications.warn(`${item.name} has no purchase DC to sell it by.`);
  const wealth = actor.system.wealth.value ?? 0;
  const blackMarket = await foundry.applications.api.DialogV2.wait({
    window: { title: `Sell ${item.name}` },
    content: `<p>Sale value: ${dc - 3} (purchase DC ${dc} − 3). A restricted item without a licence, or a stolen one, sells on the black market for 3 less.</p>`,
    buttons: [{ action: "legal", label: "Sell", default: true }, { action: "black", label: "Black market" }],
    rejectClose: false,
  });
  if (!blackMarket) return;
  const s = W.sale(dc, wealth, { blackMarket: blackMarket === "black" });
  const gain = await rollFormula(s.gain);
  const after = wealth + gain;
  await actor.update({ "system.wealth.value": after });
  await item.delete();
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="m20-roll"><h3>Sold ${escape(item.name)} (sale value ${s.value})</h3><p>Wealth +${wealth} → +${after}${gain ? "" : ": too cheap to make a difference"}.</p></div>`,
  });
}
