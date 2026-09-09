import { MODERN20 } from "../config.mjs";

const { Roll } = foundry.dice;
const { ChatMessage } = foundry.documents;

/**
 * Attack resolution.
 *
 * The SRD's rules, quoted where they decide something:
 *  - "If the result equals or beats the target's Defense, it's a hit."
 *  - "A natural 1 is always a miss. A natural 20 is always a hit. A natural 20
 *    is also always a threat - a possible critical hit."
 *  - "If the threat is confirmed, a weapon deals double damage on a critical
 *    hit (roll damage twice, as if hitting the target two times)."
 *  - "Each full range increment causes a cumulative -2 penalty on the attack roll."
 *  - Melee attack bonus is base attack + Strength + size; ranged is base attack
 *    + Dexterity + range penalty + size.
 */

const RANGE_PENALTY_PER_INCREMENT = -2;

/**
 * The ways a weapon can be fired.
 *
 * A weapon is not one attack: an automatic firearm can be fired single, set on
 * autofire, or burst with the feat, and each resolves differently. This is the
 * same problem dnd5e solved with per-item activities, kept lighter here
 * because d20 Modern's modes are decided by the weapon's rate of fire rather
 * than authored per item.
 */

const AUTOFIRE = {
  // "The character targets a 10-foot-by-10-foot area ... the targeted area has
  // an effective Defense of 10." Ten bullets are spent regardless.
  areaDefense: 10,
  ammo: 10,
  area: 10,
  unskilledPenalty: -4,
  proficiency: "Advanced Firearms Proficiency"
};

const BURST = {
  // "When using an automatic firearm with at least five bullets loaded ... a
  // -4 penalty on the attack roll, but deal +2 dice of damage."
  ammo: 5,
  penalty: -4,
  extraDice: 2,
  feat: "Burst Fire"
};

/** Does the actor have a feat of this name? */
function hasFeat(actor, name) {
  return actor?.items?.some(
    (item) => item.type === "feat" && item.name.toLowerCase() === name.toLowerCase()
  ) ?? false;
}

/** True when the weapon's rate of fire includes automatic. */
export function isAutomatic(weapon) {
  return /\bA\b/.test(String(weapon.system.rateOfFire ?? ""));
}

/**
 * Modes this weapon offers its owner, most conventional first.
 * Unavailable modes are returned with a reason rather than hidden, so the
 * sheet can say why burst fire is not on offer.
 */
export function attackModes(item) {
  const actor = item.actor;
  const modes = [{ id: "single", label: "MODERN20.Attack.Single", available: true }];

  if (isAutomatic(item)) {
    modes.push({
      id: "autofire",
      label: "MODERN20.Attack.Autofire",
      available: true,
      note: hasFeat(actor, AUTOFIRE.proficiency) ? "" : "MODERN20.Attack.AutofireUnskilled"
    });

    const loaded = item.system.ammo?.value ?? 0;
    const canBurst = hasFeat(actor, BURST.feat);
    modes.push({
      id: "burst",
      label: "MODERN20.Attack.Burst",
      available: canBurst && loaded >= BURST.ammo,
      note: !canBurst ? "MODERN20.Attack.BurstNeedsFeat" : "MODERN20.Attack.BurstNeedsAmmo"
    });
  }

  return modes;
}

/** The attack modifier and ammunition a mode costs. */
export function modeAdjustments(item, mode) {
  const actor = item.actor;
  if (mode === "autofire") {
    return {
      penalty: hasFeat(actor, AUTOFIRE.proficiency) ? 0 : AUTOFIRE.unskilledPenalty,
      ammo: AUTOFIRE.ammo,
      // Autofire is resolved against the area, not a creature.
      fixedDefense: AUTOFIRE.areaDefense
    };
  }
  if (mode === "burst") {
    return { penalty: BURST.penalty, ammo: BURST.ammo, fixedDefense: null };
  }
  return { penalty: 0, ammo: 1, fixedDefense: null };
}

/**
 * Burst fire deals "+2 dice of damage": two more of the weapon's own damage
 * die, so 2d6 becomes 4d6.
 */
export function burstDamageFormula(damage) {
  const match = String(damage).match(/^(\d+)d(\d+)/);
  if (!match) return damage;
  const [whole, count, faces] = match;
  return String(damage).replace(whole, `${Number(count) + BURST.extraDice}d${faces}`);
}


/** The lowest d20 result that threatens: "19-20" gives 19, "20" gives 20. */
export function threatRange(critical) {
  const numbers = String(critical ?? "20").match(/\d+/g)?.map(Number) ?? [20];
  return Math.min(...numbers);
}

/** Distance in grid units between two tokens, or null if either is unplaced. */
export function tokenDistance(attackerToken, targetToken) {
  if (!attackerToken || !targetToken || !canvas?.grid) return null;
  try {
    return canvas.grid.measurePath([
      { x: attackerToken.center.x, y: attackerToken.center.y },
      { x: targetToken.center.x, y: targetToken.center.y }
    ]).distance;
  } catch {
    return null;
  }
}

/**
 * The range penalty for a shot, or 0 when it cannot be measured.
 * "Any attack from a distance of less than one range increment is not
 * penalized for range."
 */
export function rangePenalty(distance, increment) {
  if (!increment || distance === null) return 0;
  return Math.floor(distance / increment) * RANGE_PENALTY_PER_INCREMENT;
}

/** The actor being attacked: the user's target, else a single selected token. */
function currentTarget() {
  const targeted = [...(game.user.targets ?? [])][0];
  if (targeted) return { token: targeted, actor: targeted.actor };
  return { token: null, actor: null };
}

/**
 * Roll an attack, resolving it against the target's Defense where there is a
 * target, and confirming a threat where one is rolled.
 */
export async function resolveAttack(item, { situational = 0, mode = "single" } = {}) {
  const actor = item.actor;
  if (!actor) throw new Error("Cannot attack with an unowned weapon");

  const ranged = item.system.ranged;
  const abilityMod = ranged ? actor.system.abilities.dex.mod : actor.system.abilities.str.mod;
  const size = MODERN20.sizes[actor.system.attributes.size]?.mod ?? 0;

  const adjust = modeAdjustments(item, mode);
  const { token: targetToken, actor: target } = currentTarget();
  const attackerToken = actor.getActiveTokens?.()[0] ?? null;
  const distance = ranged ? tokenDistance(attackerToken, targetToken) : null;
  const range = ranged ? rangePenalty(distance, item.system.rangeIncrement) : 0;

  const data = {
    bab: actor.system.attributes.baseAttack,
    ability: abilityMod,
    size,
    weapon: item.system.attackBonus,
    condition: actor.system.attributes.attackMisc ?? 0,
    range,
    mode: adjust.penalty,
    situational
  };
  const formula =
    "1d20 + @bab + @ability + @size + @weapon + @condition + @range + @mode + @situational";

  const roll = await new Roll(formula, data).evaluate();
  const natural = roll.dice[0]?.results?.[0]?.result ?? 0;

  // Autofire is rolled against the area's Defense rather than a creature's.
  const defense = adjust.fixedDefense ?? target?.system?.defense?.value ?? null;
  let hit = null;
  if (natural === 1) hit = false;
  else if (natural === 20) hit = true;
  else if (defense !== null) hit = roll.total >= defense;

  // A natural 20 always threatens; otherwise the weapon's threat range decides.
  const threatened = natural !== 1 && natural >= threatRange(item.system.critical);

  let confirmation = null;
  let confirmed = false;
  if (threatened && hit !== false) {
    confirmation = await new Roll(formula, data).evaluate();
    confirmed = defense === null ? true : confirmation.total >= defense;
  }

  return {
    roll, confirmation, natural, hit, threatened, confirmed,
    defense, target, targetName: target?.name ?? null,
    distance, range, ranged, mode,
    area: mode === "autofire" ? AUTOFIRE.area : null,
    ammoSpent: adjust.ammo
  };
}

/**
 * Weapon damage.
 *
 * A critical is two full damage rolls: "roll damage twice, as if hitting the
 * target two times". That is deliberately not a x2 multiplier, which would
 * treat a flat bonus and the dice differently from the way the SRD describes.
 */
export async function rollWeaponDamage(item, { critical = false, mode = "single" } = {}) {
  const actor = item.actor;
  const strMod = !item.system.ranged && actor ? actor.system.abilities.str.mod : 0;
  const data = { str: strMod, bonus: item.system.damageBonus };
  const damage = mode === "burst" ? burstDamageFormula(item.system.damage) : item.system.damage;
  const single = `${damage} + @str + @bonus`;

  const formula = critical ? `${single} + ${single}` : single;
  return new Roll(formula, data).evaluate();
}

/** Post the attack, with buttons to roll its damage. */
export async function postAttackCard(item, result) {
  const actor = item.actor;
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/modern20/templates/chat/attack-card.hbs",
    {
      item,
      ...result,
      total: result.roll.total,
      confirmationTotal: result.confirmation?.total ?? null,
      showOutcome: result.hit !== null
    }
  );

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: game.i18n.format("MODERN20.Chat.Attack", { weapon: item.name }),
    content,
    rolls: [result.roll, result.confirmation].filter(Boolean),
    flags: {
      modern20: { attack: { itemId: item.id, critical: result.confirmed, mode: result.mode } }
    }
  });
}
