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

/**
 * Natural healing: 1 hit point per character level for a night's rest, 2 for a day of
 * complete bed rest. A character below 0 does not heal naturally until a Fortitude save
 * (DC 20) starts the recovery (`recovering`): null until then.
 */
export function restHealing(level, hp, { bedRest = false, recovering = false } = {}) {
  if (hp < 0 && !recovering) return null;
  return Math.max(1, level) * (bedRest ? 2 : 1);
}

/** The Fortitude save a dying character makes each round to stabilise, and later to wake and to start healing. */
export const DYING_DC = 20;
/** Treat Injury to stabilise a dying character. */
export const STABILISE_DC = 15;

/**
 * The conditions hit points put a character in, as on/off for each:
 *
 *   1 or more        none of them
 *   0                disabled
 *   −1 to −9         dying and unconscious; or once stable, stable and unconscious, or (awake)
 *                    stable and disabled
 *   −10 or lower     dead (a construct or undead at 0)
 *
 * `stable` is whether it was stable (damage makes a stable character dying again: pass false),
 * `awake` whether a stable one has come round.
 */
export function hpConditions(value, { stable = false, awake = false, destroyedAtZero = false } = {}) {
  const off = { dead: false, dying: false, disabled: false, stable: false, unconscious: false };
  const state = hpState(value, { destroyedAtZero });
  if (state === "dead") return { ...off, dead: true };
  if (state === "disabled") return { ...off, disabled: true };
  if (state === "dying") {
    if (!stable) return { ...off, dying: true, unconscious: true };
    return awake ? { ...off, stable: true, disabled: true } : { ...off, stable: true, unconscious: true };
  }
  return off;
}

/**
 * The saves of a character below 0, each Fortitude DC 20 (Modern/deathdyinghealing):
 *
 *   dying      each round: stable on a success, 1 hit point lost on a failure
 *   waking     a stable character, each hour: awake (disabled) on a success
 *   recovery   an awake character below 0, each day: heals naturally from then on with a
 *              success, loses 1 hit point with a failure
 *
 * Returns what follows: `{ value, stable, awake, recovering, text }`.
 */
export function belowZeroSave(kind, value, passed) {
  if (kind === "dying") {
    return passed ? { value, stable: true, text: "Stabilises: no longer losing hit points, but still unconscious." }
      : { value: value - 1, stable: false, text: value - 1 <= -10 ? "Fails, and dies." : `Fails: loses 1 hit point (${value - 1}).` };
  }
  if (kind === "waking") {
    return passed ? { value, stable: true, awake: true, text: "Regains consciousness: disabled, with hit points still below 0." }
      : { value, stable: true, awake: false, text: "Stays unconscious; another save in an hour." };
  }
  return passed ? { value, stable: true, awake: true, recovering: true, text: "Starts to recover: heals naturally from now on." }
    : { value: value - 1, stable: true, awake: true, recovering: false, text: value - 1 <= -10 ? "Fails, and dies." : `Fails: loses 1 hit point (${value - 1}).` };
}

/**
 * Current hit points as the maximum changes (a level gained, Constitution, Toughness): a character
 * at full health stays at full, and a new one (never yet given its maximum) starts there; a hurt
 * or dying one is left as it is. Returns the new current hit points, or null to leave them.
 */
export function followMaximum(value, lastMax, max) {
  if (max === lastMax) return null;
  const atFull = value === lastMax || (lastMax === 0 && value === 0);
  return atFull ? max : null;
}
