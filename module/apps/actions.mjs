import { MODERN20 } from "../config.mjs";
import { COMBAT_ACTIONS, EXTRA_ATTACKS } from "../combat-data.mjs";

/**
 * The action economy.
 *
 * "A round is an opportunity for each character involved in a combat to take
 * an action... Each round represents about 6 seconds in the game world." A
 * turn buys one attack action and one move action, or one full-round action
 * in place of both, plus any number of free actions and one 5-foot step.
 *
 * The budget is tracked and shown, never enforced. Every system that tracks
 * this — dnd5e shows an activation cost per item, PF2e shows action glyphs —
 * displays the cost and leaves spending it to the player, because the table
 * routinely does things the rules do not name. Blocking a click on a sheet is
 * how you end up arguing with the GM rather than playing.
 */

/**
 * How a cost draws on the budget.
 *
 * A full-round action costs both: "Because of this, the only move a character
 * can make during a full attack is a 5-foot step". A free action and the
 * things the SRD calls no action cost nothing.
 */
export const ACTION_COST = {
  attack: { attack: 1 },
  move: { move: 1 },
  fullRound: { attack: 1, move: 1 },
  free: {},
  varies: {},
  none: {}
};

/** The actions that are still affordable given what has been spent. */
export function canAfford(spent, actionType) {
  const cost = ACTION_COST[actionType] ?? {};
  return Object.entries(cost).every(
    ([pool, amount]) => (MODERN20.turnBudget[pool] ?? 0) - (spent[pool] ?? 0) >= amount
  );
}

/**
 * The SRD's action for an id, or null.
 *
 * Exposed on CONFIG.MODERN20.combatActions at init so a module can add one.
 */
export function combatAction(id) {
  return CONFIG.MODERN20?.combatActions?.[id] ?? COMBAT_ACTIONS[id] ?? null;
}

/**
 * A character's attack sequence: the bonus for each attack in a full attack.
 *
 * "A resulting value of +6 or higher provides the hero with multiple attacks",
 * and the table lists the extra ones — a +11 base attack reads "+6/+1", which
 * together with the first attack makes +11/+6/+1.
 */
export function attackSequence(baseAttack) {
  const row = [...EXTRA_ATTACKS]
    .filter((entry) => entry.baseAttack <= baseAttack)
    .sort((a, b) => b.baseAttack - a.baseAttack)[0];

  // Past the printed table the pattern is unbroken, but the SRD stops at +20
  // and so does this: an attack bonus beyond it holds at the last row rather
  // than inventing attacks the source never grants.
  return [baseAttack, ...(row?.extra ?? [])];
}

/**
 * The stances a character can take, with the numbers the SRD gives them.
 *
 * Each is an ActiveEffect the actor carries until the stance ends, so the
 * Defense on the sheet is the Defense the attack rolls against. Charge and
 * withdraw change only movement, which nothing here measures, so they are
 * listed for the action they cost rather than for a bonus they do not have —
 * d20 Modern, unlike D&D 3.5, gives a charge no attack bonus at all.
 */
export const STANCES = {
  totalDefense: {
    id: "totalDefense",
    action: "attack",
    label: "MODERN20.Stance.TotalDefense",
    detail: "MODERN20.Stance.TotalDefenseEffect",
    // "The character doesn't get to attack or perform any other activity, but
    // does get a +4 dodge bonus to his or her Defense for 1 round."
    cites: "a +4 dodge bonus to his or her Defense for 1 round",
    icon: "icons/svg/shield.svg",
    changes: [{ key: "system.defense.misc", type: "add", value: "4" }]
  },
  fightDefensively: {
    id: "fightDefensively",
    action: "attack",
    label: "MODERN20.Stance.FightDefensively",
    detail: "MODERN20.Stance.FightDefensivelyEffect",
    // "takes a -4 penalty on his or her attack in a round to gain a +2 dodge
    // bonus to Defense in the same round"
    cites: "a -4 penalty on his or her attack in a round to gain a +2 dodge bonus",
    icon: "icons/svg/upgrade.svg",
    changes: [
      { key: "system.defense.misc", type: "add", value: "2" },
      { key: "system.attributes.attackMisc", type: "add", value: "-4" }
    ]
  },
  run: {
    id: "run",
    action: "fullRound",
    label: "MODERN20.Stance.Run",
    detail: "MODERN20.Stance.RunEffect",
    // "The character loses any Dexterity bonus to Defense since he or she
    // can't avoid attacks. However, the character gets a +2 bonus to Defense
    // against ranged attacks while running."
    cites: "loses any Dexterity bonus to Defense... gets a +2 bonus to Defense against ranged attacks",
    icon: "icons/svg/wingfoot.svg",
    changes: [{ key: "system.defense.loseDex", type: "override", value: "true" }]
  },
  charge: {
    id: "charge",
    action: "fullRound",
    label: "MODERN20.Stance.Charge",
    detail: "MODERN20.Stance.ChargeEffect",
    // "Charging is a special full-round action that allows a character to move
    // more than his or her speed and attack during the action." No bonus and
    // no penalty: the restrictions are all on the movement.
    cites: "a special full-round action that allows a character to move more than his or her speed and attack",
    icon: "icons/svg/sword.svg",
    changes: []
  },
  withdraw: {
    id: "withdraw",
    action: "fullRound",
    label: "MODERN20.Stance.Withdraw",
    detail: "MODERN20.Stance.WithdrawEffect",
    // "The square the character starts from is not considered threatened for
    // purposes of withdrawing."
    cites: "the square the character starts from is not considered threatened",
    icon: "icons/svg/mountain.svg",
    changes: []
  }
};

/**
 * The action an item's activity costs.
 *
 * Stored on the activity, so a magic item that casts as a free action says so
 * rather than being inferred from its type.
 */
export function activityAction(activity) {
  return activity?.actionType || "attack";
}

/**
 * Turn a casting time into an action type.
 *
 * "Attack action" and "Full-round action" are what the spell list actually
 * says; anything longer than a round is not a combat action at all, and is
 * recorded as such rather than rounded down to something it is not.
 */
export function castingTimeAction(castingTime) {
  const text = String(castingTime ?? "").toLowerCase().replace(/[^a-z ]/g, "");
  if (text.includes("full")) return "fullRound";
  if (text.includes("free")) return "free";
  if (text.includes("attack action") || text.includes("standard")) return "attack";
  if (text.includes("move action")) return "move";
  return "none";
}

/** Every action the SRD names, grouped by what it costs, for a picker. */
export function actionsByCost() {
  const groups = Object.keys(MODERN20.actionTypes).map((type) => ({
    type,
    label: MODERN20.actionTypes[type],
    actions: Object.values(COMBAT_ACTIONS).filter((action) => action.action === type)
  }));
  return groups.filter((group) => group.actions.length);
}
