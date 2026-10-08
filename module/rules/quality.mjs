/**
 * A weapon's or armor's quality: mastercraft (Modern/Equipment/equipmentbasics, Mastercraft Objects;
 * Future/Feats/Mastercrafter) and an enhancement bonus (Modern/FX/Items/Weapons and Armor).
 *
 *   mastercraft weapon   +1 to +3 on attack rolls; one made with Mastercrafter may have it on damage instead
 *   mastercraft armor    +1 to +3 to its equipment bonus to Defense
 *   weapon enhancement   +1 to +5 on attack and damage rolls; "a weapon's mastercraft bonus does not stack
 *                        with its enhancement bonus": the higher of the two counts
 *   armor enhancement    +1 to +5 to Defense, stacking with the equipment bonus; its armor penalty 1 less
 *   purchase DC          custom mastercraft +3, +6, +9 (none for a weapon the book makes mastercraft
 *                        already: the Glock 17's +1 is in its price); a weapon's enhancement +10, +15, +20,
 *                        armor's +8, +13, +18. The book prices neither past +3.
 */

/** The mastercraft bonus a weapon's own entry gives it ("This mastercraft weapon grants a +1 bonus on attack rolls"), 0 for none. */
export function printedMastercraft(system) {
  const text = [...(system?.notes ?? []), String(system?.description ?? "").replace(/<[^>]+>/g, " ")].join(" ").replace(/\s+/g, " ");
  // "The MP5K is not a mastercraft weapon" says no; "always considered a mastercraft weapon. As such, it grants a +1 bonus" yes.
  const m = text.match(/(?:This|always considered a) mastercraft weapon(?:\. As such, it)? grants a \+(\d) bonus on attack rolls/i);
  return m ? Number(m[1]) : 0;
}

const n = (v) => Math.max(0, Math.round(Number(v) || 0));

/**
 * What a weapon's quality adds to its attack and its damage: `{ attack: [{ label, value }], damage: [...] }`,
 * each the mastercraft bonus or the enhancement bonus, whichever is higher (they do not stack).
 */
export function weaponQuality(system) {
  const enhancement = n(system?.enhancement), mastercraft = n(system?.mastercraft);
  const onDamage = system?.mastercraftOn === "damage";
  const best = (mc) => (enhancement >= mc ? (enhancement ? [{ label: "Enhancement", value: enhancement }] : []) : [{ label: "Mastercraft", value: mc }]);
  return { attack: best(onDamage ? 0 : mastercraft), damage: best(onDamage ? mastercraft : 0) };
}

/**
 * What armor's quality does: `{ equipment, enhancement, penalty }`, the mastercraft bonus added to its equipment
 * bonus, its enhancement bonus to Defense, and its armor penalty (negative, as printed) with magic's 1 less.
 */
export function armorQuality(system) {
  const enhancement = n(system?.enhancement);
  const penalty = system?.armorPenalty ?? 0;
  return { equipment: n(system?.mastercraft), enhancement, penalty: enhancement > 0 ? Math.min(0, penalty + 1) : penalty };
}

const MASTERCRAFT_DC = 3;
const ENHANCEMENT_DC = { weapon: [0, 10, 15, 20], armor: [0, 8, 13, 18] };

/**
 * A weapon's or armor's purchase DC with its quality: `{ dc, unpriced }`, `unpriced` when the bonus is past what
 * the book prices (+3), and the DC then the one it can price. Other items: their purchase DC as printed. A weapon
 * with an enhancement bonus is mastercraft already ("All magic weapons ... are considered mastercraft"): its
 * mastercraft adds nothing more.
 */
export function purchaseDC(item) {
  const s = item.system ?? {};
  const base = s.purchaseDC?.dc;
  if (base === null || base === undefined || !["weapon", "armor"].includes(item.type)) return { dc: base ?? null, unpriced: false };
  const enhancement = n(s.enhancement);
  const custom = Math.max(0, n(s.mastercraft) - (item.type === "weapon" ? printedMastercraft(s) : 0));
  const table = ENHANCEMENT_DC[item.type];
  const unpriced = enhancement > 3 || custom > 3;
  const fromMastercraft = item.type === "weapon" && enhancement > 0 ? 0 : MASTERCRAFT_DC * Math.min(custom, 3);
  return { dc: base + fromMastercraft + table[Math.min(enhancement, 3)], unpriced };
}

/** A weapon's or armor's quality in a few words, for its row: "+2", "mastercraft +1 (damage)". */
export function qualityText(item) {
  const s = item.system ?? {};
  const enhancement = n(s.enhancement), mastercraft = n(s.mastercraft);
  return [enhancement && `+${enhancement}`, mastercraft && `mastercraft +${mastercraft}${item.type === "weapon" && s.mastercraftOn === "damage" ? " (damage)" : ""}`].filter(Boolean).join(", ");
}
