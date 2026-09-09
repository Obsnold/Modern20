import { MODERN20 } from "../config.mjs";
import { activityById, activityDamageFormula } from "./activities.mjs";
import { accessoryAttackBonus, effectiveRangeIncrement, ammunitionAttackBonus, loadedSpecial } from "./accessories.mjs";
import { resolveModifiers } from "./attack-dialog.mjs";

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

// "A thrown weapon has a maximum range of five range increments. Ranged
// weapons that fire projectiles can shoot up to ten increments."
const MAX_INCREMENTS_THROWN = 5;
const MAX_INCREMENTS_PROJECTILE = 10;

/**
 * How many increments a weapon reaches.
 *
 * A rate of fire is what separates the two in the data: a firearm or a bow has
 * one, a thrown hatchet or grenade does not.
 */
export function maxIncrements(system) {
  // The SRD writes "no rate of fire" as a dash, which is not a rate of fire.
  const rate = String(system.rateOfFire ?? "").replace(/[-–—\s]/g, "");
  return rate ? MAX_INCREMENTS_PROJECTILE : MAX_INCREMENTS_THROWN;
}

/** A weapon's maximum range in feet, or 0 when it is not a ranged weapon. */
export function maxRange(system, increment = null) {
  const step = increment ?? system.rangeIncrement ?? 0;
  return step ? step * maxIncrements(system) : 0;
}

/**
 * How far a melee attack reaches: the weapon's own reach where it has one,
 * otherwise the wielder's, which is five feet for anything Medium-sized.
 */
export function meleeReach(item, actor) {
  return item.system.reach || actor?.system?.attributes?.reach || 5;
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

/**
 * The actor being attacked.
 *
 * Only the user's target counts. Deliberately no fall back to the selected
 * token: the selected token is normally the attacker, so falling back would
 * quietly resolve the attack against themselves. Applying damage does fall
 * back to selection, because by then the victim is what is selected.
 */
function currentTarget() {
  const targeted = [...(game.user.targets ?? [])][0];
  if (targeted) return { token: targeted, actor: targeted.actor };
  return { token: null, actor: null };
}

/** How this user targets, read from their own keybinding rather than assumed. */
function targetingHint() {
  const binding = game.keybindings?.get("core", "target")?.[0];
  const key = binding?.key?.replace(/^Key/, "") ?? "T";
  return game.i18n.format("MODERN20.Attack.HowToTarget", { key });
}

/**
 * Roll an attack, resolving it against the target's Defense where there is a
 * target, and confirming a threat where one is rolled.
 */
export async function resolveAttack(
  item, { situational = 0, activityId = "shot", modifiers = null } = {}
) {
  const actor = item.actor;
  if (!actor) throw new Error("Cannot attack with an unowned weapon");

  const activity = activityById(item, activityId);
  if (!activity) throw new Error(`Unknown activity "${activityId}" on ${item.name}`);

  const ranged = item.system.ranged;
  // An activity may name its ability; otherwise the SRD's own rule applies —
  // Strength in melee, Dexterity at range.
  const abilityKey = activity.attack?.ability || (ranged ? "dex" : "str");
  const abilityMod = actor.system.abilities[abilityKey]?.mod ?? 0;
  const size = MODERN20.sizes[actor.system.attributes.size]?.mod ?? 0;

  const { token: targetToken, actor: target } = currentTarget();
  const attackerToken = actor.getActiveTokens?.()[0] ?? null;
  const measures = ranged && (activity.attack?.usesRange ?? true);
  const distance = measures ? tokenDistance(attackerToken, targetToken) : null;
  const increment = effectiveRangeIncrement(item);
  const range = measures ? rangePenalty(distance, increment) : 0;

  // Melee is measured too, against reach rather than range increments.
  const melee = !ranged;
  const meleeDistance = melee ? tokenDistance(attackerToken, targetToken) : null;
  const reachFeet = melee ? meleeReach(item, actor) : 0;

  // Beyond its maximum the weapon simply does not reach. Reported rather than
  // refused, so the GM can rule otherwise.
  const reach = maxRange(item.system, increment);
  const outOfRange = Boolean(measures && reach && distance !== null && distance > reach)
    || Boolean(melee && meleeDistance !== null && meleeDistance > reachFeet);

  // "A character can strike opponents 10 feet away with it, but can't use it
  // against an adjacent foe." The chain is the stated exception.
  const tooClose = Boolean(
    melee && item.system.reachOnly && meleeDistance !== null
    && meleeDistance <= (actor.system.attributes.reach || 5)
  );

  // "Any situational modifier created by the attacker's position or tactics
  // applies to the attack roll, while any situational modifier created by the
  // defender's position, state, or tactics applies to the defender's Defense."
  const circumstance = resolveModifiers(modifiers ?? {}, ranged);
  const chosenSituational = situational + Number(modifiers?.situational ?? 0);

  const data = {
    bab: actor.system.attributes.baseAttack,
    ability: abilityMod,
    size,
    weapon: item.system.attackBonus,
    condition: actor.system.attributes.attackMisc ?? 0,
    // A laser sight, where the target is close enough for it to apply.
    accessory: accessoryAttackBonus(item, distance),
    // Armour-piercing against an armoured target, tracer on autofire.
    ammunition: ammunitionAttackBonus(item, { target, activityId: activity.id }),
    range,
    activity: activity.penalty,
    circumstance: circumstance.attack,
    situational: chosenSituational
  };
  const formula =
    "1d20 + @bab + @ability + @size + @weapon + @condition + @accessory + @ammunition "
    + "+ @range + @activity + @circumstance + @situational";

  const roll = await new Roll(formula, data).evaluate();
  const natural = roll.dice[0]?.results?.[0]?.result ?? 0;

  // An activity may set its own Defense: autofire rolls against the area, and
  // the defender's circumstances and cover move the number to beat.
  const baseDefense = activity.attack?.defenseOverride ?? target?.system?.defense?.value ?? null;
  const defense = baseDefense === null ? null : baseDefense + circumstance.defense;
  let hit = null;
  if (outOfRange || tooClose) hit = false;
  else if (natural === 1) hit = false;
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

  // "If the attacker hits, the defender must make a miss chance percentile
  // roll to avoid being struck." Rolled here so the card can report it, and
  // only when there is a hit for it to undo.
  let concealment = null;
  if (hit && circumstance.missChance) {
    const roll100 = await new Roll("1d100").evaluate();
    concealment = {
      chance: circumstance.missChance,
      rolled: roll100.total,
      missed: roll100.total <= circumstance.missChance,
      roll: roll100
    };
    if (concealment.missed) hit = false;
  }

  return {
    roll, confirmation, natural, hit, threatened, confirmed,
    defense, baseDefense, target,
    circumstance,
    concealment,
    targetName: target?.name ?? null,
    targetTokenId: targetToken?.id ?? null,
    targetSceneId: targetToken?.scene?.id ?? null,
    distance: melee ? meleeDistance : distance,
    range, ranged, outOfRange, tooClose,
    maxRange: melee ? reachFeet : reach,
    activity,
    activityId: activity.id,
    ammunition: loadedSpecial(item)?.name ?? null,
    area: activity.area?.size || null,
    ammoSpent: activity.consume?.ammo ?? 0
  };
}

/**
 * The damage an item's activity deals.
 *
 * A critical is two full damage rolls: "roll damage twice, as if hitting the
 * target two times". That is deliberately not a x2 multiplier, which would
 * treat a flat bonus and the dice differently from the way the SRD describes.
 *
 * Not weapon-specific: a spell, a psionic power or a piece of gear rolls the
 * damage its own activity declares. Strength is added only where the SRD adds
 * it — a melee weapon — so nothing is added to a fireball.
 */
export async function rollItemDamage(item, { critical = false, activityId = "" } = {}) {
  const actor = item.actor;
  const activity = activityById(item, activityId) ?? item.activities[0] ?? null;
  const addAbility = activity?.damage?.addAbility ?? true;

  const melee = item.type === "weapon" && !item.system.ranged;
  const strMod = (addAbility && melee && actor) ? actor.system.abilities.str.mod : 0;
  const data = { str: strMod, bonus: item.system.damageBonus ?? 0 };
  const damage = activity ? activityDamageFormula(item, activity) : item.system.damage;
  if (!damage) throw new Error(`${item.name} has no damage to roll`);
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
      targetingHint: targetingHint(),
      confirmationTotal: result.confirmation?.total ?? null,
      showOutcome: result.hit !== null,
      // Flattened for the card: what applied, and which side it landed on.
      circumstanceLabels: (result.circumstance?.labels ?? []).map((entry) => ({
        label: entry.label,
        text: entry.side === "conceal"
          ? `${entry.value}%`
          : `${entry.value >= 0 ? "+" : ""}${entry.value} `
            + game.i18n.localize(entry.side === "attack"
              ? "MODERN20.Attack.ToHit" : "MODERN20.Def")
      }))
    }
  );

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: game.i18n.format(
      result.targetName ? "MODERN20.Chat.AttackAt" : "MODERN20.Chat.Attack",
      { weapon: item.name, target: result.targetName }
    ),
    content,
    rolls: [result.roll, result.confirmation, result.concealment?.roll].filter(Boolean),
    flags: {
      modern20: {
        attack: {
          itemId: item.id,
          critical: result.confirmed,
          activityId: result.activityId,
          // Carried so the damage rolled from this card can say who it is for.
          targetName: result.targetName ?? "",
          targetTokenId: result.targetTokenId,
          targetSceneId: result.targetSceneId
        }
      }
    }
  });
}

/**
 * Resolve a save activity: an explosive going off.
 *
 * "An explosive ... affects all creatures and objects within its burst radius."
 * There is no attack roll — everyone in the radius takes the damage, halved by
 * a successful Reflex save. The card offers the damage and, for whoever is
 * targeted, the saves.
 */
export async function postSaveCard(item, activity) {
  const actor = item.actor;
  const targets = [...(game.user.targets ?? [])].map((token) => token.actor).filter(Boolean);
  const dc = item.saveDC(activity);

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/modern20/templates/chat/save-card.hbs",
    {
      item,
      activity,
      dc,
      saveLabel: game.i18n.localize(MODERN20.saves[activity.save.ability]?.label ?? ""),
      damage: item.system.damage || activity.damage?.formula
        ? activityDamageFormula(item, activity) : "",
      description: await enrichDescription(item),
      targets: targets.map((target) => target.name)
    }
  );

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: game.i18n.format(saveFlavor(item), { name: item.name }),
    content,
    flags: {
      modern20: {
        attack: { itemId: item.id, critical: false, activityId: activity.id },
        save: { ability: activity.save.ability, dc }
      }
    }
  });
}

/** A grenade detonates; a spell is cast; a creature uses what it has. */
function saveFlavor(item) {
  if (item.type === "spell") return "MODERN20.Cast.Casts";
  if (item.type === "psiPower") return "MODERN20.Cast.Manifests";
  if (item.type === "specialAbility") return "MODERN20.Attack.UsesAbility";
  return "MODERN20.Attack.Detonates";
}

/** An item's description, ready to drop into a chat card. */
export function enrichDescription(item) {
  return foundry.applications.ux.TextEditor.implementation.enrichHTML(
    item.system.description ?? "",
    { secrets: false, relativeTo: item }
  );
}

/**
 * Post a spell or power that does not roll against anything: the card carries
 * its description, and its damage where it deals any.
 *
 * "Utility" covers most of the spell list — the SRD describes the effect in
 * prose and leaves applying it to the table — so the card's job is to put that
 * prose in front of everyone rather than to compute a result.
 */
export async function postCastCard(item, activity) {
  const damage = activity.damage?.formula || item.system.damage
    ? activityDamageFormula(item, activity) : "";

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/modern20/templates/chat/cast-card.hbs",
    {
      item,
      activity,
      damage,
      damageType: activity.damage?.type ?? "",
      casterLevel: item.actor?.system?.spellcasting?.casterLevel ?? null,
      description: await enrichDescription(item)
    }
  );

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: item.actor }),
    flavor: game.i18n.format(saveFlavor(item), { name: item.name }),
    content,
    flags: { modern20: { attack: { itemId: item.id, critical: false, activityId: activity.id } } }
  });
}