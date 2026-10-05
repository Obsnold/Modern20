/**
 * Damage and healing applied to hit points, by Modern/Death, Dying, and Healing.
 *
 *   temporary hit points    lost first
 *   0                       disabled
 *   -1 to -9                dying
 *   -10 or lower            dead; a construct or undead is destroyed at 0
 *   massive damage          a single hit over the massive damage threshold that leaves the
 *                           target above 0: Fortitude DC 15, or drop to -1
 *   nonlethal damage        does not touch hit points: at or over the threshold, Fortitude
 *                           DC 15, dazed for a round on a success, unconscious 1d4+1 rounds
 *                           on a failure
 *
 * Creatures immune to critical hits (constructs, elementals, oozes, plants, undead) are immune
 * to massive damage, as is anything without a threshold (no Constitution score).
 */

export const MASSIVE_DC = 15;

/** The creature types immune to critical hits, and so to massive damage. */
export const CRITICAL_IMMUNE = new Set(["construct", "elemental", "ooze", "plant", "undead"]);

/** The condition hit points put a creature in: "disabled", "dying", "dead" or null. */
export function hpState(value, { destroyedAtZero = false } = {}) {
  if (destroyedAtZero && value <= 0) return "dead";
  if (value <= -10) return "dead";
  if (value < 0) return "dying";
  if (value === 0) return "disabled";
  return null;
}

/**
 * What a hit does to `target` `{ hp: { value, temp, max }, threshold, type }`: `amount` of
 * damage, or with `healing` hit points regained, or with `nonlethal` a nonlethal hit.
 *
 * Returns `{ hp: { value, temp }, state, save, text }`: the hit points after it, the condition
 * they leave the target in, and `save` the Fortitude save it calls for (`{ dc, kind }`, kind
 * "massive" or "nonlethal"), or null.
 */
export function applyHit(target, amount, { healing = false, nonlethal = false } = {}) {
  const value = target.hp.value ?? 0, temp = target.hp.temp ?? 0, max = target.hp.max ?? value;
  const n = Math.max(0, Math.floor(amount));
  const type = (target.type ?? "").toLowerCase();
  const destroyedAtZero = type === "construct" || type === "undead";
  const immune = CRITICAL_IMMUNE.has(type) || target.threshold === null || target.threshold === undefined;

  if (healing) {
    // Healing never raises hit points past their full normal total, and does not restore temporary ones.
    const healed = Math.max(value, Math.min(max, value + n));
    return { hp: { value: healed, temp }, state: hpState(healed, { destroyedAtZero }), save: null, text: `Healed ${healed - value}` };
  }
  if (nonlethal) {
    const save = !immune && n >= target.threshold ? { dc: MASSIVE_DC, kind: "nonlethal" } : null;
    return { hp: { value, temp }, state: hpState(value, { destroyedAtZero }), save, text: `${n} nonlethal${save ? "" : ": below the massive damage threshold, no effect"}` };
  }
  const fromTemp = Math.min(temp, n);
  const after = value - (n - fromTemp);
  const save = !immune && n > target.threshold && after > 0 ? { dc: MASSIVE_DC, kind: "massive" } : null;
  return {
    hp: { value: after, temp: temp - fromTemp },
    state: hpState(after, { destroyedAtZero }),
    save,
    text: `${n} damage${fromTemp ? ` (${fromTemp} from temporary hit points)` : ""}`,
  };
}

/** Hit points after a failed massive damage save: -1, unless already lower. */
export const failedMassive = (value) => Math.min(value, -1);
