import { MODERN20 } from "../config.mjs";
import { rollWealthCheck, commitWealthLoss } from "../dice/wealth.mjs";
import { ACTION_COST, STANCES, canAfford, attackSequence } from "../apps/actions.mjs";
import { announce, problem } from "../apps/announce.mjs";
import { setting } from "../settings.mjs";
import { OBJECT_DAMAGE_SHARE } from "../object-data.mjs";

// Foundry v14 removed the bare Actor/Item/Roll/ChatMessage globals; only
// CONFIG, Hooks, game and ui survive. Everything else comes off the namespace.
const { Actor, ChatMessage } = foundry.documents;
const { Roll } = foundry.dice;

/**
 * Whether an actor is one of the named creature types.
 *
 * A plain function rather than a private method: private members are
 * brand-checked, which makes the rules that depend on them unreachable from a
 * test that has not built a full document.
 */
function hasCreatureType(system, ...types) {
  const type = (system?.details?.creatureType ?? "").toLowerCase();
  return types.some((match) => type.includes(match));
}

export class Modern20Actor extends Actor {
  /** Data exposed to roll formulas via @-references, e.g. "@str.mod". */
  getRollData() {
    const data = { ...super.getRollData() };
    const sys = this.system;

    if (sys.abilities) {
      for (const [key, ability] of Object.entries(sys.abilities)) {
        data[key] = { ...ability };
      }
    }
    if (sys.attributes) data.bab = sys.attributes.baseAttack;
    if (sys.details?.level !== undefined) data.level = sys.details.level;
    if (sys.wealth) data.wealth = sys.wealth.bonus;

    return data;
  }

  async rollAbility(abilityKey, { flavor } = {}) {
    const ability = this.system.abilities?.[abilityKey];
    if (!ability) throw new Error(`Unknown ability "${abilityKey}"`);
    return this.#d20Roll(ability.mod, {
      flavor: flavor ?? game.i18n.localize(MODERN20.abilities[abilityKey])
    });
  }

  async rollSave(saveKey, { flavor } = {}) {
    const save = this.system.saves?.[saveKey];
    if (!save) throw new Error(`Unknown save "${saveKey}"`);
    return this.#d20Roll(save.value, {
      flavor: flavor ?? game.i18n.localize(MODERN20.saves[saveKey].label)
    });
  }

  /**
   * Roll a skill, or one specialty of a skill such as Knowledge (streetwise).
   * Trained-only skills with no ranks are refused rather than rolled at a penalty.
   */
  async rollSkill(skillKey, { specialty = null, flavor } = {}) {
    const skill = this.system.skills?.[skillKey];
    if (!skill) throw new Error(`Unknown skill "${skillKey}"`);

    const entry = specialty
      ? skill.specialties.find((s) => s.name === specialty)
      : skill;
    if (!entry) throw new Error(`Unknown specialty "${specialty}" on ${skillKey}`);

    if (!entry.usable) {
      problem(
        game.i18n.format("MODERN20.Warning.TrainedOnly", {
          skill: game.i18n.localize(MODERN20.skills[skillKey].label)
        })
      );
      return null;
    }

    const label = game.i18n.localize(MODERN20.skills[skillKey].label);
    return this.#d20Roll(entry.total, {
      flavor: flavor ?? (specialty ? `${label} (${specialty})` : label)
    });
  }

  /** Buy something. Resolves the check and commits the Wealth loss on success. */
  async purchase(purchaseDC, { restriction = "none", blackMarket = false, label = "" } = {}) {
    if (this.system.wealth === undefined) {
      problem(game.i18n.localize("MODERN20.Warning.NoWealth"));
      return null;
    }

    const result = await rollWealthCheck(this, purchaseDC, { restriction, blackMarket });
    const remaining = await commitWealthLoss(this, result);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: game.i18n.format("MODERN20.Chat.WealthCheck", { item: label, dc: result.dc }),
      content: await foundry.applications.handlebars.renderTemplate(
        "systems/modern20/templates/chat/wealth-check.hbs",
        { ...result, remaining, label }
      ),
      rolls: [result.roll, ...result.lossRolls].filter(Boolean)
    });

    return { ...result, remaining };
  }

  /** Spend an action point, adding its die to a roll already made. */
  async spendActionPoint({ flavor } = {}) {
    const ap = this.system.actionPoints;
    if (!ap) {
      problem(game.i18n.localize("MODERN20.Warning.NoActionPoints"));
      return null;
    }
    if (ap.value < 1) {
      problem(game.i18n.localize("MODERN20.Warning.NoActionPointsLeft"));
      return null;
    }

    const roll = await new Roll(setting("actionPointDie")).evaluate();
    await this.update({ "system.actionPoints.value": ap.value - 1 });
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: flavor ?? game.i18n.localize("MODERN20.Chat.ActionPoint")
    });
    return roll;
  }

  /**
   * Apply damage, then check massive damage: a single hit at or above the
   * threshold forces a Fortitude save or the character drops to -1 hit points.
   */
  async applyDamage(amount, {
    ignoreMassive = false, nonlethal = false, damageType = "", bypasses = []
  } = {}) {
    const hp = this.system.hp;
    if (!hp) return null;

    // "They are not subject to critical hits, nonlethal damage, ability
    // damage..." — constructs and their kind simply ignore it.
    if (nonlethal && this.isImmuneToNonlethal) {
      await announce(this, {
        title: game.i18n.format("MODERN20.Damage.ImmuneNonlethal", { name: this.name })
      });
      return { value: hp.value, immune: true };
    }

    // Immunity, vulnerability, energy resistance and damage reduction, in the
    // order the SRD applies them. What each step did is reported: a number
    // that arrives smaller than the roll with no explanation is the thing
    // people distrust about automated damage.
    const ignored = this.ignoredDamage(amount, { damageType, bypasses });
    amount = ignored.amount;
    if (ignored.lines.length) {
      await announce(this, {
        title: game.i18n.format("MODERN20.Damage.Reduced", { name: this.name }),
        lines: ignored.lines
      });
    }
    if (ignored.immune) return { value: hp.value, immune: true };

    if (nonlethal) {
      const total = hp.nonlethal + amount;
      await this.update({ "system.hp.nonlethal": total });
      // The SRD never states the threshold, so this reports rather than
      // applying a condition the GM may not want.
      if (total >= hp.value) {
        await announce(this, {
          title: game.i18n.format("MODERN20.Damage.NonlethalExceeds", {
            name: this.name, total, hp: hp.value
          }),
          warning: true
        });
      }
      return { value: hp.value, nonlethal: total };
    }

    const afterTemp = Math.max(0, amount - hp.temp);
    const temp = Math.max(0, hp.temp - amount);
    const value = hp.value - afterTemp;

    await this.update({ "system.hp.value": value, "system.hp.temp": temp });

    const threshold = this.system.attributes?.massiveDamage;
    const reduced = MODERN20.massiveDamage.reducedHitPoints;
    if (ignoreMassive || !threshold || amount < threshold) return { value, massive: false };
    if (!setting("massiveDamage")) return { value, massive: false };

    // "If the damage would reduce the creature to -1 hit points or fewer
    // anyway, the massive damage threshold does not apply, and the creature
    // does not need to make a Fortitude save."
    if (value <= reduced) return { value, massive: false };

    // "Constructs, elementals, oozes, plants, and undead ignore the effects of
    // massive damage and do not have massive damage thresholds."
    if (this.isImmuneToMassiveDamage) return { value, massive: false };

    const dc = setting("massiveDamageDC");
    const save = await this.rollSave("fort", {
      flavor: game.i18n.format("MODERN20.Chat.MassiveDamage", { dc })
    });

    const failed = save.total < dc;
    if (failed) await this.update({ "system.hp.value": reduced });
    return { value: failed ? reduced : value, massive: true, failed };
  }

  /**
   * What this actor ignores of an incoming hit, and how it was decided.
   *
   * The order is the SRD's: immunity removes the damage entirely, a
   * vulnerability adds half again, energy resistance is subtracted, and
   * damage reduction is subtracted from anything that gets past it.
   *
   * @param {number} amount            The damage rolled.
   * @param {string} [damageType]      What the damage is. Blank is unknown,
   *                                   which reduces nothing but the reduction.
   * @param {string[]} [bypasses]      What the damage counts as for the
   *                                   purpose of damage reduction: "silver".
   * @returns {{amount: number, immune: boolean, lines: string[]}}
   */
  ignoredDamage(amount, { damageType = "", bypasses = [] } = {}) {
    const attributes = this.system.attributes ?? {};
    const type = Modern20Actor.damageType(damageType);
    const lines = [];
    const named = (key, data) => lines.push(game.i18n.format(key, data));

    // An object - and a vehicle is one - has hardness where a creature has
    // resistances, and takes only part of some energy attacks.
    if (this.isObject) return this.#objectDamage(amount, type, lines, named);

    if (type && (attributes.immunities ?? []).some((i) => Modern20Actor.damageType(i) === type)) {
      named("MODERN20.Damage.Immune", { type });
      return { amount: 0, immune: true, lines };
    }

    if (type && (attributes.vulnerabilities ?? []).some((v) => Modern20Actor.damageType(v) === type)) {
      // "It takes 50% more damage from fire attacks."
      const increased = Math.floor(amount * 1.5);
      named("MODERN20.Damage.Vulnerable", { type, from: amount, to: increased });
      amount = increased;
    }

    const resistance = (attributes.resistances ?? [])
      .find((entry) => type && Modern20Actor.damageType(entry.type) === type);
    if (resistance?.value) {
      named("MODERN20.Damage.Resisted", { type, value: resistance.value });
      amount = Math.max(0, amount - resistance.value);
    }

    const reduction = attributes.damageReduction ?? {};
    if (reduction.value) {
      const bypassed = Modern20Actor.bypassesReduction(reduction.bypass, bypasses, type);
      // "The creature takes normal damage from energy attacks (even
      // nonmagical ones), spells, spell-like abilities, and supernatural
      // abilities." An unknown type is still reduced: that is the behaviour
      // the sheet's own damage steps have always had.
      const energy = MODERN20.energyDamageTypes.includes(type);
      if (bypassed) {
        named("MODERN20.Damage.Bypassed", { bypass: reduction.bypass, value: reduction.value });
      } else if (energy) {
        named("MODERN20.Damage.NotReducedEnergy", { type, value: reduction.value });
      } else {
        named("MODERN20.Damage.Reduction", { value: reduction.value });
        amount = Math.max(0, amount - reduction.value);
      }
    }

    return { amount, immune: false, lines };
  }

  /**
   * What an object keeps out of a hit.
   *
   * "Acid and sonic/concussive attacks deal normal damage to most objects.
   * Electricity and fire attacks deal half damage to most objects; divide the
   * damage by 2 before applying the hardness. Cold attacks deal one-quarter
   * damage to most objects." Then: "whenever an object takes damage, subtract
   * its hardness from the damage".
   */
  #objectDamage(amount, type, lines, named) {
    const share = OBJECT_DAMAGE_SHARE[type];
    if (share) {
      const reduced = Math.floor(amount * share);
      named("MODERN20.Damage.ObjectShare",
        { share: share === 0.25 ? "a quarter" : "half", type, from: amount, to: reduced });
      amount = reduced;
    }

    const hardness = this.system.hardness ?? 0;
    if (hardness) {
      named("MODERN20.Damage.Hardness", { value: hardness });
      amount = Math.max(0, amount - hardness);
    }
    return { amount, immune: false, lines };
  }

  /** Objects have hardness and hit points; a vehicle is one of them. */
  get isObject() {
    return this.type === "object" || this.type === "vehicle";
  }

  /** A damage type as the one word the system matches on. */
  static damageType(text) {
    const type = String(text ?? "").trim().toLowerCase();
    return MODERN20.damageTypeAliases[type] ?? type;
  }

  /**
   * Whether damage gets past a printed reduction.
   *
   * "damage reduction 15/silver" is bypassed by a silver bullet, and
   * "10/ballistic" by anything that deals ballistic damage. "15/+1" wants a
   * magic weapon, which this system does not model at all, so it is never
   * bypassed and the card says the reduction applied — a wrong number is
   * worse than an unautomated one.
   */
  static bypassesReduction(bypass, bypasses = [], damageType = "") {
    const wanted = Modern20Actor.damageType(bypass);
    if (!wanted) return false;
    if (wanted === damageType) return true;
    return bypasses.some((entry) => Modern20Actor.damageType(entry) === wanted);
  }

  /** Creature types the SRD says are "not subject to ... nonlethal damage". */
  /**
   * The state hit points put a character in.
   *
   * "Disabled: the character has 0 hit points." "Dying: the character is near
   * death and unconscious, with -1 to -9 wound points." "Dead: a character
   * dies when his or her hit points drop to -10 or lower, or when his or her
   * Constitution drops to 0."
   *
   * Exact thresholds, no judgement required — which is why this is automated
   * where cover and flanking are not.
   */
  get deathState() {
    const hp = this.system.hp;
    if (!hp) return "";

    // "A creature with no Constitution has no body or no metabolism" — the
    // same set that ignores massive damage. Draining a score it does not have
    // to zero must not kill it.
    const constitution = this.system.abilities?.con?.total;
    if (constitution !== undefined && constitution <= 0 && !this.isImmuneToMassiveDamage) {
      return "dead";
    }

    if (hp.value <= MODERN20.death.dead) return "dead";
    if (hp.value < 0) return "dying";
    if (hp.value === 0) return "disabled";
    return "";
  }

  /**
   * Put the actor in the state its hit points call for.
   *
   * "A stable character is no longer dying, but is still unconscious", so a
   * character someone has stabilised keeps that state rather than being
   * dropped back into dying every time anything touches the sheet.
   */
  async applyDeathStates() {
    if (!setting("deathStates") || !this.system.hp) return null;

    const state = this.deathState;
    const stable = this.statuses.has("stable");

    // A stabilised character is at dying hit points but "is no longer dying",
    // so the state is theirs to keep until something moves the number.
    const wanted = (state === "dying" && stable) ? "" : state;

    for (const status of MODERN20.death.states) {
      const active = this.statuses.has(status);
      if (active === (status === wanted)) continue;
      await this.toggleStatusEffect(status, { active: status === wanted });
    }

    // Back above zero is not stable, it is well.
    if (!state && stable) await this.toggleStatusEffect("stable", { active: false });

    return state;
  }

  /**
   * "Each round a dying character loses 1 hit point until he or she dies or
   * becomes stable."
   *
   * Not damage: it goes past damage reduction and never triggers a massive
   * damage save, because it is the wound already taken finishing its work.
   */
  async bleed() {
    if (!setting("deathStates")) return null;
    if (this.deathState !== "dying" || this.statuses.has("stable")) return null;

    const value = this.system.hp.value - 1;
    await this.update({ "system.hp.value": value });
    await announce(this, {
      title: game.i18n.format("MODERN20.Death.Bleeds", { name: this.name, hp: value }),
      warning: true
    });
    return value;
  }

  /**
   * Reconcile the death states whenever hit points move.
   *
   * On the update rather than inside applyDamage: healing, a GM typing into
   * the sheet and the damage buttons all change hit points by different
   * routes, and all of them should leave the character in the right state.
   * Only the user who made the change reconciles, so one client writes.
   */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (userId !== game.user.id) return;
    if (changed.system?.hp === undefined && changed.system?.abilities?.con === undefined) return;
    this.applyDeathStates();
  }

  /**
   * Spend an action from this turn's budget.
   *
   * Reported, not enforced: a character who has already acted can still act
   * again, and the sheet says the budget is gone rather than refusing. The SRD
   * itself leaves several actions as "varies", and a table does things the
   * table decides.
   *
   * @param {string} actionType  attack, move, fullRound, free, varies or none.
   * @returns {Promise<boolean>} Whether it fitted in what was left.
   */
  async spendAction(actionType) {
    const cost = ACTION_COST[actionType];
    if (!cost || foundry.utils.isEmpty(cost)) return true;

    const mode = setting("actionBudget");
    if (mode === "off") return true;

    const affordable = canAfford(this.system.turn, actionType);
    // Blocking refuses without spending: nothing happened, so nothing is used.
    if (!affordable && mode === "block") {
      await announce(this, {
        title: game.i18n.format("MODERN20.Action.Blocked", {
          name: this.name,
          action: game.i18n.localize(MODERN20.actionTypes[actionType] ?? actionType)
        }),
        lines: [this.#actionsLeft()],
        warning: true
      });
      return false;
    }

    const update = {};
    for (const [pool, amount] of Object.entries(cost)) {
      update[`system.turn.${pool}`] = (this.system.turn[pool] ?? 0) + amount;
    }
    await this.update(update);

    if (!affordable) {
      await announce(this, {
        title: game.i18n.format("MODERN20.Action.Overspent", {
          name: this.name,
          action: game.i18n.localize(MODERN20.actionTypes[actionType] ?? actionType)
        }),
        lines: [this.#actionsLeft()],
        warning: true
      });
    }
    return affordable;
  }

  /**
   * Start a new turn: the budget refills and any stance from last turn ends.
   *
   * "A character can choose to fight defensively while making a melee attack...
   * to gain a +2 dodge bonus to Defense in the same round" — the same round,
   * so it is gone by the next one.
   */
  async startTurn() {
    const had = this.system.turn.stance;
    await this.update({
      "system.turn.attack": 0,
      "system.turn.move": 0,
      "system.turn.fiveFootStep": 0,
      "system.turn.stance": ""
    });
    if (had) await this.#clearStanceEffects();
    return this;
  }

  /**
   * Take one of the SRD's combat stances, or drop the current one.
   *
   * The bonus is an ActiveEffect rather than a note, so the Defense an attack
   * rolls against is the Defense the stance gives. Passing the stance already
   * held drops it, which is how a mistaken click is undone.
   */
  async takeStance(stanceId) {
    const stance = STANCES[stanceId];
    if (!stance) return null;

    await this.#clearStanceEffects();

    if (this.system.turn.stance === stanceId) {
      await this.update({ "system.turn.stance": "" });
      await announce(this, {
        title: game.i18n.format("MODERN20.Stance.Ends", {
          name: this.name, stance: game.i18n.localize(stance.label)
        }),
        img: stance.icon
      });
      return null;
    }

    if (stance.changes.length) {
      await this.createEmbeddedDocuments("ActiveEffect", [{
        name: game.i18n.localize(stance.label),
        img: stance.icon,
        changes: stance.changes,
        // Foundry ends this on its own at the start of the actor's next turn;
        // startTurn clears it too, for a turn taken outside a combat.
        duration: { rounds: 1 },
        flags: { modern20: { stance: stanceId } }
      }]);
    }

    await this.update({ "system.turn.stance": stanceId });
    await this.spendAction(stance.action);
    await announce(this, {
      title: game.i18n.format("MODERN20.Stance.Takes", {
        name: this.name, stance: game.i18n.localize(stance.label)
      }),
      lines: [game.i18n.localize(stance.detail), this.#actionsLeft()],
      img: stance.icon
    });
    return stance;
  }

  /**
   * What is left of the turn, in words, for a record card.
   *
   * The number on the sheet is only visible to whoever has the sheet open;
   * the card is what everyone else sees.
   */
  #actionsLeft() {
    const remaining = this.system.turn?.remaining ?? {};
    const left = Object.entries(remaining)
      .filter(([, amount]) => amount > 0)
      .map(([pool]) => game.i18n.localize(`MODERN20.Action.${pool}`));
    return left.length
      ? game.i18n.format("MODERN20.Action.Remaining", { actions: left.join(", ") })
      : game.i18n.localize("MODERN20.Action.NothingLeft");
  }

  /** Remove whatever effect a stance put on this actor. */
  async #clearStanceEffects() {
    const ids = this.effects
      .filter((effect) => effect.getFlag("modern20", "stance"))
      .map((effect) => effect.id);
    if (ids.length) await this.deleteEmbeddedDocuments("ActiveEffect", ids);
  }

  /**
   * The attack bonuses a full attack rolls at.
   *
   * "If a character gets more than one attack per action because his or her
   * base attack bonus is high enough... the character must use the full attack
   * action to get his or her additional attacks."
   */
  get attackSequence() {
    return attackSequence(this.system.attributes?.baseAttack ?? 0);
  }

  /**
   * Spend a spell slot of this level from this list.
   *
   * Reports whether one was there rather than refusing to cast: the SRD has
   * spontaneous casting, scrolls, items and a GM, and a sheet that blocks a
   * cast is worse than one that says the slot is gone. Actors with no slot
   * table at all - a creature with spell-like abilities, an NPC - spend
   * nothing and are not warned.
   */
  async spendSpellSlot(tradition, level) {
    const pool = this.system.casting?.slots?.[tradition];
    if (!pool?.length) return true;

    const slot = pool[level];
    if (!slot?.max) return true;

    const used = [...(this.system.casting.slotsUsed[tradition] ?? [])];
    while (used.length <= level) used.push(0);
    used[level] += 1;
    await this.update({ [`system.casting.slotsUsed.${tradition}`]: used });

    if (slot.available < 1) {
      await announce(this, {
        title: game.i18n.format("MODERN20.Cast.NoSlots", { name: this.name, level }),
        warning: true
      });
      return false;
    }
    return true;
  }

  /** Spend power points, reporting whether the pool covered them. */
  async spendPowerPoints(cost) {
    const pool = this.system.casting?.powerPoints;
    if (!pool?.max || cost < 1) return true;

    await this.update({
      "system.casting.powerPointsUsed": this.system.casting.powerPointsUsed + cost
    });

    if (pool.value < cost) {
      await announce(this, {
        title: game.i18n.format("MODERN20.Cast.NoPoints", { name: this.name, cost }),
        warning: true
      });
      return false;
    }
    return true;
  }

  /**
   * A night's rest: spells are prepared again and the power point pool
   * refills. Prepared counts on individual spells are left alone — what a
   * caster prepares is a choice, not something to restore automatically.
   */
  async restoreCasting() {
    if (!this.system.casting) return null;
    await this.update({
      "system.casting.slotsUsed.arcane": [],
      "system.casting.slotsUsed.divine": [],
      "system.casting.powerPointsUsed": 0
    });
    await announce(this, {
      title: game.i18n.format("MODERN20.Cast.Rested", { name: this.name })
    });
    return this;
  }

  get isImmuneToNonlethal() {
    // "Objects are immune to nonlethal damage and to critical hits."
    if (this.isObject) return true;
    return hasCreatureType(this.system, "construct", "undead", "ooze");
  }

  /**
   * "Constructs, elementals, oozes, plants, and undead ignore the effects of
   * massive damage and do not have massive damage thresholds."
   *
   * A different list from the nonlethal one, which is why it is its own.
   */
  get isImmuneToMassiveDamage() {
    return hasCreatureType(this.system, "construct", "elemental", "ooze", "plant", "undead");
  }

  async #d20Roll(modifier, { flavor } = {}) {
    const roll = await new Roll("1d20 + @mod", { mod: modifier }).evaluate();
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor
    });
    return roll;
  }
}
