import { hasFeat } from "./activities.mjs";

/**
 * Weapon accessories, and reloading.
 *
 * Only two of the SRD's fourteen accessories carry numbers, and both are
 * conditional: a laser sight's "+1 equipment bonus on all attack rolls made
 * against targets no farther than 30 feet away", and a standard scope's
 * "increases the range increment for a ranged weapon by one-half". The rest
 * affect Listen checks, free hands or action economy, which this system does
 * not model, so they attach and stay descriptive rather than being given
 * invented numbers.
 */

const LASER_SIGHT = { match: /laser sight/i, bonus: 1, within: 30 };
const SCOPES = [
  { match: /scope \(standard\)/i, rangeMultiplier: 1.5 },
  { match: /scope \(electro-optical\)/i, rangeMultiplier: 2 }
];
const SPEED_LOADER = /speed loader/i;

/** Accessories fitted to a weapon. */
export function accessoriesOf(item) {
  const actor = item.actor;
  if (!actor) return [];
  return actor.items.filter((other) => other.system?.attachedTo === item.id);
}

/** The attack bonus fitted accessories give at this distance. */
export function accessoryAttackBonus(item, distance) {
  let bonus = 0;
  for (const accessory of accessoriesOf(item)) {
    if (!LASER_SIGHT.match.test(accessory.name)) continue;
    // "targets no farther than 30 feet away" — with no measured distance the
    // condition cannot be checked, so the bonus is not applied.
    if (distance !== null && distance <= LASER_SIGHT.within) bonus += LASER_SIGHT.bonus;
  }
  return bonus;
}

/** The range increment a weapon has once its scope is taken into account. */
export function effectiveRangeIncrement(item) {
  const base = item.system.rangeIncrement ?? 0;
  if (!base) return 0;

  let multiplier = 1;
  for (const accessory of accessoriesOf(item)) {
    const scope = SCOPES.find((entry) => entry.match.test(accessory.name));
    if (scope) multiplier = Math.max(multiplier, scope.rangeMultiplier);
  }
  return Math.floor(base * multiplier);
}

/**
 * What reloading this weapon costs.
 *
 * "Reloading a firearm with an already filled box magazine or speed loader is
 * a move action. Refilling a box magazine or a speed loader, or reloading a
 * revolver without a speed loader or any weapon with an internal magazine, is
 * a full-round action." The Quick Reload feat improves each by one step.
 */
export function reloadAction(item) {
  const magazine = String(item.system.magazine ?? "").toLowerCase();
  const quick = hasFeat(item.actor, "Quick Reload");

  const isBox = magazine.includes("box");
  const isCylinder = magazine.includes("cyl");
  const hasSpeedLoader = accessoriesOf(item).some((a) => SPEED_LOADER.test(a.name));

  // A box magazine, or a revolver with a speed loader, is the quick case.
  const quickCase = isBox || (isCylinder && hasSpeedLoader);

  if (quickCase) return quick ? "free" : "move";
  return quick ? "move" : "fullRound";
}

/** Rounds a magazine holds, from "15 box" or "6 cyl.". */
export function magazineSize(item) {
  const match = String(item.system.magazine ?? "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

/**
 * Ammunition the actor is carrying that this weapon can use.
 *
 * Matched on calibre, which most weapons state in their own name and the rest
 * carry from data/overrides/weapons.json. A weapon with no calibre - a
 * flamethrower, a rocket launcher - matches nothing, which is correct: the SRD
 * lists no ammunition entry for them.
 */
export function ammunitionFor(item) {
  const caliber = item.system.caliber;
  if (!caliber || !item.actor) return null;

  return item.actor.items.find((other) =>
    other.type === "gear"
    && other.system?.caliber === caliber
    && (other.system.quantity ?? 0) > 0
  ) ?? null;
}
