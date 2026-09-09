import { MODERN20 } from "./config.mjs";

/**
 * The SRD's conditions, as Foundry status effects.
 *
 * Only what the data model can express is encoded. A condition's other clauses
 * — "can take no actions", a 50% miss chance, a Defense penalty that applies
 * to melee attacks only — are left in the description rather than
 * approximated, because a wrong number on a sheet is worse than a rule the GM
 * is reading anyway.
 *
 * Every entry cites the phrase it encodes so the mapping can be checked
 * against the source.
 */

// v14 replaced the numeric CONST.ACTIVE_EFFECT_MODES with string change
// types: "You are accessing CONST.ACTIVE_EFFECT_MODES. Changes now have string
// types (see CONST.ACTIVE_EFFECT_CHANGE_TYPES)." The full set is custom,
// multiply, add, subtract, downgrade, upgrade and override.
const ADD = "add";
const OVERRIDE = "override";
const MULTIPLY = "multiply";

/** Every skill keyed to one of the given abilities. */
function skillsUsing(...abilities) {
  return Object.entries(MODERN20.skills)
    .filter(([, cfg]) => abilities.includes(cfg.ability))
    .map(([key]) => key);
}

const add = (key, value) => ({ key, type: ADD, value: String(value) });
const override = (key, value) => ({ key, type: OVERRIDE, value: String(value) });

/** Changes per condition, keyed by the id the scraper produces. */
export const CONDITION_EFFECTS = {
  blinded: {
    cites: "effective Dexterity of 3, along with a -4 penalty on the use of Strength- and Dexterity-based skills",
    changes: () => [
      override("system.abilities.dex.value", 3),
      ...skillsUsing("str", "dex").map((key) => add(`system.skills.${key}.misc`, -4))
    ]
  },
  cowering: {
    cites: "loses his or her Dexterity bonus ... a -2 penalty to his or her Defense",
    changes: () => [override("system.defense.loseDex", 1), add("system.defense.misc", -2)]
  },
  deafened: {
    cites: "takes a -4 penalty on initiative checks",
    changes: () => [add("system.attributes.initiative.misc", -4)]
  },
  entangled: {
    cites: "a -2 penalty on attack rolls in addition to a -4 penalty to Dexterity",
    changes: () => [
      add("system.attributes.attackMisc", -2),
      add("system.abilities.dex.tempMod", -4)
    ]
  },
  exhausted: {
    cites: "move at half speed ... a -6 penalty to Strength and Dexterity",
    changes: () => [
      add("system.abilities.str.tempMod", -6),
      add("system.abilities.dex.tempMod", -6),
      { key: "system.attributes.speed", type: MULTIPLY, value: "0.5" }
    ]
  },
  fatigued: {
    cites: "a penalty of -2 to Strength and Dexterity",
    changes: () => [
      add("system.abilities.str.tempMod", -2),
      add("system.abilities.dex.tempMod", -2)
    ]
  },
  flatFooted: {
    cites: "loses his or her Dexterity bonus to Defense",
    changes: () => [override("system.defense.loseDex", 1)]
  },
  grappled: {
    cites: "loses his or her Dexterity bonus to Defense",
    changes: () => [override("system.defense.loseDex", 1)]
  },
  paralyzed: {
    cites: "an effective, but not actual, Dexterity and Strength of 0",
    changes: () => [
      override("system.abilities.dex.value", 0),
      override("system.abilities.str.value", 0)
    ]
  },
  pinned: {
    // The -4 is against melee attacks only, which a flat Defense change would
    // wrongly apply to everything, so only the Dexterity clause is encoded.
    cites: "loses his or her Dexterity bonus to Defense",
    changes: () => [override("system.defense.loseDex", 1)]
  },
  shaken: {
    cites: "a -2 penalty on attack rolls, saving throws, and skill checks",
    changes: () => [
      add("system.attributes.attackMisc", -2),
      ...["fort", "ref", "will"].map((save) => add(`system.saves.${save}.misc`, -2)),
      ...Object.keys(MODERN20.skills).map((key) => add(`system.skills.${key}.misc`, -2))
    ]
  },
  stunned: {
    cites: "loses his or her Dexterity bonus ... takes a -2 penalty to Defense",
    changes: () => [override("system.defense.loseDex", 1), add("system.defense.misc", -2)]
  }
};

/** Foundry icons that read closest to each condition. */
const ICONS = {
  blinded: "icons/svg/blind.svg", cowering: "icons/svg/terror.svg",
  dazed: "icons/svg/daze.svg", dead: "icons/svg/skull.svg",
  deafened: "icons/svg/deaf.svg", disabled: "icons/svg/downgrade.svg",
  dying: "icons/svg/blood.svg", entangled: "icons/svg/net.svg",
  exhausted: "icons/svg/unconscious.svg", fatigued: "icons/svg/degen.svg",
  flatFooted: "icons/svg/downgrade.svg", grappled: "icons/svg/net.svg",
  helpless: "icons/svg/unconscious.svg", nauseated: "icons/svg/poison.svg",
  panicked: "icons/svg/terror.svg", paralyzed: "icons/svg/paralysis.svg",
  pinned: "icons/svg/net.svg", prone: "icons/svg/falling.svg",
  shaken: "icons/svg/terror.svg", stable: "icons/svg/heal.svg",
  stunned: "icons/svg/daze.svg", unconscious: "icons/svg/unconscious.svg"
};

/**
 * Replace Foundry's default status effects with the SRD's conditions.
 *
 * Registered at init, after config is in place, since several conditions
 * enumerate the skill list to build their changes.
 */
export function registerConditions(conditions) {
  const effects = conditions.map((condition) => {
    const effect = CONDITION_EFFECTS[condition.id];
    return {
      id: condition.id.toLowerCase(),
      name: `MODERN20.Condition.${condition.id}.name`,
      img: ICONS[condition.id] ?? "icons/svg/aura.svg",
      description: `MODERN20.Condition.${condition.id}.description`,
      changes: effect?.changes() ?? []
    };
  });

  // Emptied and refilled rather than replaced. CONFIG.statusEffects is a Proxy
  // that mirrors every entry under its `id`, and that is the lookup
  // Actor#toggleStatusEffect uses — `CONFIG.statusEffects[statusId]`. Assigning
  // a plain array over the Proxy loses it, and every toggle then throws
  // "Invalid status ID".
  CONFIG.statusEffects.length = 0;
  for (const effect of effects) CONFIG.statusEffects.push(effect);

  // Foundry looks these up when a token is defeated or a combatant dies.
  CONFIG.specialStatusEffects.DEFEATED = "dead";
  CONFIG.specialStatusEffects.BLIND = "blinded";
}
