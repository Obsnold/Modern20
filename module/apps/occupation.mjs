import { packDocuments } from "./level-up.mjs";

/**
 * Starting occupation benefits, applied without prompting.
 *
 * The choices themselves are made inline — in the character creator, or on the
 * occupation item's own sheet — so this only applies their consequences.
 */

const FEAT_PACK = "modern20.feats";

/**
 * The Wealth Bonus Increase, applied once.
 *
 * It is a one-time increase to starting Wealth rather than an ongoing
 * modifier: Wealth erodes as a character buys things, so deriving it every
 * preparation pass would silently refund purchases.
 */
export async function applyOccupationWealth(actor, occupation) {
  const bonus = occupation.system.wealthBonus ?? 0;
  if (!bonus || actor?.system?.wealth === undefined) return;

  await actor.update({ "system.wealth.bonus": actor.system.wealth.bonus + bonus });
  ui.notifications.info(game.i18n.format("MODERN20.Info.OccupationWealth", {
    name: occupation.name, bonus
  }));
}

/** Add the named feat from the compendium, unless the character already has it. */
export async function grantFeatByName(actor, name) {
  if (!name || !actor) return null;
  if (actor.items.some((i) => i.type === "feat" && i.name.toLowerCase() === name.toLowerCase())) {
    return null;
  }

  const feats = await packDocuments(FEAT_PACK);
  const match = feats.find((f) => f.name.toLowerCase() === name.toLowerCase());
  if (!match) {
    ui.notifications.warn(game.i18n.format("MODERN20.Occupation.FeatMissing", { name }));
    return null;
  }

  const [created] = await actor.createEmbeddedDocuments("Item", [match.toObject()]);
  ui.notifications.info(game.i18n.format("MODERN20.LevelUp.Granted", { names: created.name }));
  return created;
}
