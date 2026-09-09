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
export async function resolveAttack(item, { situational = 0 } = {}) {
  const actor = item.actor;
  if (!actor) throw new Error("Cannot attack with an unowned weapon");

  const ranged = item.system.ranged;
  const abilityMod = ranged ? actor.system.abilities.dex.mod : actor.system.abilities.str.mod;
  const size = MODERN20.sizes[actor.system.attributes.size]?.mod ?? 0;

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
    situational
  };
  const formula = "1d20 + @bab + @ability + @size + @weapon + @condition + @range + @situational";

  const roll = await new Roll(formula, data).evaluate();
  const natural = roll.dice[0]?.results?.[0]?.result ?? 0;

  const defense = target?.system?.defense?.value ?? null;
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
    distance, range, ranged
  };
}

/**
 * Weapon damage.
 *
 * A critical is two full damage rolls: "roll damage twice, as if hitting the
 * target two times". That is deliberately not a x2 multiplier, which would
 * treat a flat bonus and the dice differently from the way the SRD describes.
 */
export async function rollWeaponDamage(item, { critical = false } = {}) {
  const actor = item.actor;
  const strMod = !item.system.ranged && actor ? actor.system.abilities.str.mod : 0;
  const data = { str: strMod, bonus: item.system.damageBonus };
  const single = `${item.system.damage} + @str + @bonus`;

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
    flags: { modern20: { attack: { itemId: item.id, critical: result.confirmed } } }
  });
}
