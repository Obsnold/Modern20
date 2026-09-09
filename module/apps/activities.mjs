import { MODERN20 } from "../config.mjs";
import { ACTIVITY_DEFAULTS } from "../activity-defaults.mjs";
import { castingTimeAction } from "./actions.mjs";

/**
 * Activities: the things an item can do.
 *
 * An item stores its own activities, so a magic item or a piece of gear can
 * act without the attack code growing a branch for it. Compendium weapons have
 * theirs generated from their rate of fire, and a weapon with none falls back
 * to the same defaults, so a hand-made weapon still works.
 */

const AUTOFIRE_PROFICIENCY = "Advanced Firearms Proficiency";
const AUTOFIRE_UNSKILLED_PENALTY = -4;

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
 * The activities an item of this type starts with, keyed by id.
 *
 * Used when creating an item and when backfilling one made before activities
 * existed. The compendium build writes the same data from the same JSON, so a
 * weapon from a pack and one made by hand are identical.
 */
export function defaultActivities(type, system = {}) {
  if (type === "spell" || type === "psiPower") return castingActivity(type, system);

  const defaults = ACTIVITY_DEFAULTS[type];
  if (!defaults) return {};

  // An explosive is thrown and detonates; it has no shot to fire.
  const explosive = type === "weapon" && Boolean(system.reflexDC);
  const list = explosive
    ? [...(defaults.explosive ?? [])]
    : [...(defaults.always ?? [])];

  if (type === "weapon" && !explosive && isAutomatic(system.rateOfFire)) {
    list.push(...(defaults.automatic ?? []));
  }

  return Object.fromEntries(list.map(({ id, ...rest }) => {
    const activity = foundry.utils.deepClone(rest);
    // The DC and radius live on the weapon, so the activity reads them here
    // rather than being authored per explosive.
    if (explosive) {
      activity.save = { ...activity.save, dc: system.reflexDC ?? 0 };
      activity.area = { shape: "radius", size: parseFeet(system.burstRadius) };
    }
    return [id, activity];
  }));
}

/**
 * The single activity a spell or psionic power starts with.
 *
 * The SRD gives each one a saving throw line and, where it deals damage, a
 * sentence stating it; between them they decide what the activity is. A save
 * that only lets an unwilling ally refuse a beneficial spell — the SRD's
 * "(harmless)" — is not something to roll against, so those cast as utilities.
 *
 * The DC is not stored: "10 + the spell's level + the caster's key ability
 * modifier" depends on who casts it, so it is resolved at use.
 */
function castingActivity(type, system) {
  const id = type === "spell" ? "cast" : "manifest";
  const name = type === "spell" ? "MODERN20.Cast.Cast" : "MODERN20.Cast.Manifest";
  const rolled = system.saveAbility && system.saveEffect !== "harmless";
  const area = system.areaShape?.size
    ? { area: { shape: system.areaShape.shape, size: system.areaShape.size } }
    : {};
  // "Casting Time: Attack action" is what the spell list itself says.
  const actionType = castingTimeAction(system.castingTime);

  const damage = system.damage
    ? {
      damage: {
        formula: system.damage,
        type: system.damageType ?? "",
        scaling: { per: system.scaling?.per ?? 0, max: system.scaling?.max ?? 0 },
        // A spell's damage is its own; nothing adds Strength to a fireball.
        addAbility: false
      }
    }
    : {};

  if (rolled) {
    return {
      [id]: {
        type: "save",
        name,
        actionType,
        ...area,
        ...damage,
        save: {
          ability: system.saveAbility,
          calculation: "caster",
          // "Partial" and "none" both mean the target still takes something;
          // the spell's text says what, so the card shows it rather than
          // halving a number the SRD never halves.
          onSuccess: system.saveEffect === "half" ? "half"
            : system.saveEffect === "negate" ? "negate" : "none"
        }
      }
    };
  }

  // No save to roll: damage lands, or the spell simply happens.
  return {
    [id]: system.damage
      ? { type: "damage", name, actionType, ...area, ...damage }
      : { type: "utility", name, actionType, ...area }
  };
}

/** "20 ft." becomes 20; "See text" becomes 0. */
export function parseFeet(text) {
  const match = String(text ?? "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

/**
 * An item's activities as a list.
 *
 * Every item stores its own: the compendium build writes them, creating an
 * item seeds them, and migrateData backfills anything older. No runtime
 * fallback, so what the sheet shows is what is stored.
 */
export function activitiesOf(item) {
  return Object.entries(item.system.activities ?? {}).map(([id, activity]) => ({
    ...(activity.toObject?.() ?? activity),
    id,
    type: activity.type ?? "attack"
  }));
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
      && !hasFeat(actor, AUTOFIRE_PROFICIENCY);

    // A type that does not roll to hit still needs a button.
    const rolls = activity.type === "attack";

    return {
      ...activity,
      rolls,
      label: activity.name || activity.id,
      available: !missingFeat && !shortAmmo,
      reason,
      penalty: (activity.attack?.bonus ?? 0)
        + (unskilledAutofire ? AUTOFIRE_UNSKILLED_PENALTY : 0),
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
  const extra = (damage.extraDice ?? 0) + scalingDice(item, damage);
  if (!extra) return base;

  const match = String(base).match(/^(\d+)d(\d+)/);
  if (!match) return base;
  const [whole, count, faces] = match;
  return String(base).replace(whole, `${Number(count) + extra}d${faces}`);
}

/**
 * Extra dice from caster level.
 *
 * "1d6 points of fire damage per caster level (maximum 10d6)" is one die per
 * level up to ten, and the printed expression is already the first — so a 5th
 * level caster adds four. Resolved here rather than written into the formula
 * so the cap never has to survive a round trip through a roll expression.
 */
export function scalingDice(item, damage) {
  const per = damage?.scaling?.per ?? 0;
  if (!per) return 0;

  const casterLevel = item.actor?.system?.spellcasting?.casterLevel ?? 1;
  const cap = damage.scaling.max || Infinity;
  const dice = Math.min(Math.max(1, Math.floor(casterLevel / per)), cap);
  return dice - 1;
}
