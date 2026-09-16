import { MODERN20 } from "./config.mjs";

/**
 * What an item's Active Effects do, in the sheet's own words.
 *
 * A feat that grants "+2 bonus on all Listen checks and Spot checks" carries an
 * effect that applies it, which is better than the player remembering — but an
 * effect nobody can see is worse than one nobody has. This is what the item
 * sheet shows: the same bonus, named the way the skills tab names it.
 */

/** The fields an imported effect targets, by the path it changes. */
/** @type {[RegExp, (key: string) => string|undefined][]} */
const TARGETS = [
  [/^system\.skills\.(\w+)\.misc$/, (key) => MODERN20.skills[key]?.label],
  [/^system\.saves\.(\w+)\.misc$/, (key) => MODERN20.saves[key]?.label],
  [/^system\.attributes\.initiative\.misc$/, () => "MODERN20.Initiative"]
];

/** One change as "Listen +2", or null where nothing names that field. */
function describeChange(change) {
  for (const [pattern, label] of TARGETS) {
    const match = pattern.exec(change.key);
    if (!match) continue;
    const name = label(match[1]);
    if (!name) return null;

    const value = Number(change.value) || 0;
    const signed = value >= 0 ? `+${value}` : `${value}`;
    return `${game.i18n.localize(name)} ${signed}`;
  }
  return null;
}

/**
 * Every bonus this item applies while it is on a character.
 *
 * Effects that do not transfer, and effects somebody has disabled, are left
 * out: both are cases of the sheet not applying the bonus, and saying it does
 * would be the lie the display exists to prevent.
 */
export function describeEffects(item) {
  const described = [];
  for (const effect of item?.effects ?? []) {
    if (effect.disabled || effect.transfer === false) continue;
    for (const change of effect.changes ?? []) {
      const text = describeChange(change);
      if (text) described.push(text);
    }
  }
  return described;
}
