import { MODERN20 } from "../config.mjs";

/**
 * Activities: the things an item can do.
 *
 * An item stores its own activities, so a magic item or a piece of gear can
 * act without the attack code growing a branch for it. Compendium weapons have
 * theirs generated from their rate of fire, and a weapon with none falls back
 * to the same defaults, so a hand-made weapon still works.
 */

const AUTOFIRE = {
  areaDefense: 10, ammo: 10, area: 10,
  unskilledPenalty: -4, proficiency: "Advanced Firearms Proficiency"
};

const BURST = { ammo: 5, penalty: -4, extraDice: 2, feat: "Burst Fire" };

/** Does the actor have a feat of this name? */
export function hasFeat(actor, name) {
  if (!name) return true;
  return actor?.items?.some(
    (item) => item.type === "feat" && item.name.toLowerCase() === name.toLowerCase()
  ) ?? false;
}

/** True when a rate of fire includes automatic. */
export function isAutomatic(rateOfFire) {
  return /\bA\b/.test(String(rateOfFire ?? ""));
}

/**
 * The activities a weapon has by default, from its rate of fire.
 *
 * Generated rather than authored because the SRD decides them: "Only weapons
 * with the automatic rate of fire can be set on autofire."
 */
export function defaultWeaponActivities(system) {
  const activities = [{
    id: "shot", type: "attack", name: "MODERN20.Attack.Single",
    attack: { ability: "", bonus: 0, defenseOverride: null, usesRange: true },
    damage: { formula: "", type: "", extraDice: 0, addAbility: true },
    save: { ability: "", dc: 0, onSuccess: "half" },
    area: { shape: "", size: 0 },
    consume: { ammo: 1, actionPoints: 0, quantity: 0 },
    requiresFeat: "", requiresAmmo: 0, note: ""
  }];

  if (!isAutomatic(system.rateOfFire)) return activities;

  activities.push({
    id: "autofire", type: "attack", name: "MODERN20.Attack.Autofire",
    // "The character targets a 10-foot-by-10-foot area ... the targeted area
    // has an effective Defense of 10."
    attack: { ability: "", bonus: 0, defenseOverride: AUTOFIRE.areaDefense, usesRange: true },
    damage: { formula: "", type: "", extraDice: 0, addAbility: true },
    save: { ability: "", dc: 0, onSuccess: "half" },
    area: { shape: "square", size: AUTOFIRE.area },
    consume: { ammo: AUTOFIRE.ammo, actionPoints: 0, quantity: 0 },
    // Without the feat it is a penalty, not a prohibition.
    requiresFeat: "", requiresAmmo: AUTOFIRE.ammo,
    note: "MODERN20.Attack.AutofireArea"
  });

  activities.push({
    id: "burst", type: "attack", name: "MODERN20.Attack.Burst",
    attack: { ability: "", bonus: BURST.penalty, defenseOverride: null, usesRange: true },
    // "+2 dice of damage" - two more of the weapon's own die.
    damage: { formula: "", type: "", extraDice: BURST.extraDice, addAbility: true },
    save: { ability: "", dc: 0, onSuccess: "half" },
    area: { shape: "", size: 0 },
    consume: { ammo: BURST.ammo, actionPoints: 0, quantity: 0 },
    requiresFeat: BURST.feat, requiresAmmo: BURST.ammo,
    note: ""
  });

  return activities;
}

/**
 * An item's activities as a list, its own or the defaults its type implies.
 *
 * Stored activities are a map of id to activity, so the id is carried back
 * onto each entry for the sheet and the chat card to address it by.
 */
export function activitiesOf(item) {
  const stored = item.system.activities ?? {};
  const entries = Object.entries(stored);
  if (entries.length) {
    return entries.map(([id, activity]) => ({
      ...(activity.toObject?.() ?? activity),
      id,
      type: activity.type ?? "attack"
    }));
  }
  if (item.type === "weapon") return defaultWeaponActivities(item.system);
  return [];
}

/**
 * Activities with availability resolved for display: whether the owner can use
 * one, and why not when they cannot.
 */
export function availableActivities(item) {
  const actor = item.actor;
  const loaded = item.system.ammo?.value ?? 0;
  const tracksAmmo = Boolean(item.system.ammo?.max);

  return activitiesOf(item).map((activity) => {
    const missingFeat = !hasFeat(actor, activity.requiresFeat ?? "");
    const shortAmmo = tracksAmmo && (activity.requiresAmmo ?? 0) > 0
      && loaded < activity.requiresAmmo;

    let reason = "";
    if (missingFeat) reason = "MODERN20.Attack.NeedsFeat";
    else if (shortAmmo) reason = "MODERN20.Attack.NeedsAmmo";

    // Autofire without the proficiency is allowed, at a penalty.
    const unskilledAutofire = activity.id === "autofire"
      && !hasFeat(actor, AUTOFIRE.proficiency);

    // A type that does not roll to hit still needs a button.
    const rolls = activity.type === "attack";

    return {
      ...activity,
      rolls,
      label: activity.name || activity.id,
      available: !missingFeat && !shortAmmo,
      reason,
      penalty: (activity.attack?.bonus ?? 0) + (unskilledAutofire ? AUTOFIRE.unskilledPenalty : 0),
      unskilled: unskilledAutofire
    };
  });
}

/** One activity by id, with its availability resolved. */
export function activityById(item, id) {
  return availableActivities(item).find((activity) => activity.id === id) ?? null;
}

/**
 * The damage formula an activity produces: the weapon's own damage unless it
 * overrides it, with any extra dice folded into the weapon's die.
 */
export function activityDamageFormula(item, activity) {
  const damage = activity.damage ?? {};
  const base = damage.formula || item.system.damage;
  if (!damage.extraDice) return base;

  const match = String(base).match(/^(\d+)d(\d+)/);
  if (!match) return base;
  const [whole, count, faces] = match;
  return String(base).replace(whole, `${Number(count) + damage.extraDice}d${faces}`);
}
