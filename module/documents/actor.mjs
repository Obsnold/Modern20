import { MODERN20 } from "../config.mjs";
import { rollWealthCheck, commitWealthLoss } from "../dice/wealth.mjs";
import { ACTION_COST, STANCES, canAfford, attackSequence } from "../apps/actions.mjs";

// Foundry v14 removed the bare Actor/Item/Roll/ChatMessage globals; only
// CONFIG, Hooks, game and ui survive. Everything else comes off the namespace.
const { Actor, ChatMessage } = foundry.documents;
const { Roll } = foundry.dice;

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
      ui.notifications.warn(
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
      ui.notifications.warn(game.i18n.localize("MODERN20.Warning.NoWealth"));
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
      ui.notifications.warn(game.i18n.localize("MODERN20.Warning.NoActionPoints"));
      return null;
    }
    if (ap.value < 1) {
      ui.notifications.warn(game.i18n.localize("MODERN20.Warning.NoActionPointsLeft"));
      return null;
    }

    const roll = await new Roll(MODERN20.actionPoints.die).evaluate();
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
  async applyDamage(amount, { ignoreMassive = false, nonlethal = false } = {}) {
    const hp = this.system.hp;
    if (!hp) return null;

    // "They are not subject to critical hits, nonlethal damage, ability
    // damage..." — constructs and their kind simply ignore it.
    if (nonlethal && this.isImmuneToNonlethal) {
      ui.notifications.info(game.i18n.format("MODERN20.Damage.ImmuneNonlethal", {
        name: this.name
      }));
      return { value: hp.value, immune: true };
    }

    // Damage reduction was stored on every actor but never subtracted.
    const reduction = this.system.attributes?.damageReduction ?? 0;
    amount = Math.max(0, amount - reduction);

    if (nonlethal) {
      const total = hp.nonlethal + amount;
      await this.update({ "system.hp.nonlethal": total });
      // The SRD never states the threshold, so this reports rather than
      // applying a condition the GM may not want.
      if (total >= hp.value) {
        ui.notifications.warn(game.i18n.format("MODERN20.Damage.NonlethalExceeds", {
          name: this.name, total, hp: hp.value
        }));
      }
      return { value: hp.value, nonlethal: total };
    }

    const afterTemp = Math.max(0, amount - hp.temp);
    const temp = Math.max(0, hp.temp - amount);
    const value = hp.value - afterTemp;

    await this.update({ "system.hp.value": value, "system.hp.temp": temp });

    const threshold = this.system.attributes?.massiveDamage;
    if (ignoreMassive || !threshold || amount < threshold) return { value, massive: false };

    const save = await this.rollSave("fort", {
      flavor: game.i18n.format("MODERN20.Chat.MassiveDamage", {
        dc: MODERN20.massiveDamage.defaultSaveDC
      })
    });

    const failed = save.total < MODERN20.massiveDamage.defaultSaveDC;
    if (failed) {
      await this.update({ "system.hp.value": MODERN20.massiveDamage.reducedHitPoints });
    }
    return { value: failed ? MODERN20.massiveDamage.reducedHitPoints : value, massive: true, failed };
  }

  /** Creature types the SRD says are "not subject to ... nonlethal damage". */
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

    const affordable = canAfford(this.system.turn, actionType);
    const update = {};
    for (const [pool, amount] of Object.entries(cost)) {
      update[`system.turn.${pool}`] = (this.system.turn[pool] ?? 0) + amount;
    }
    await this.update(update);

    if (!affordable) {
      ui.notifications.warn(game.i18n.format("MODERN20.Action.Overspent", {
        name: this.name,
        action: game.i18n.localize(MODERN20.actionTypes[actionType] ?? actionType)
      }));
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
      ui.notifications.info(game.i18n.format("MODERN20.Stance.Ends", {
        name: this.name, stance: game.i18n.localize(stance.label)
      }));
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
    ui.notifications.info(game.i18n.format("MODERN20.Stance.Takes", {
      name: this.name, stance: game.i18n.localize(stance.label)
    }));
    return stance;
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
      ui.notifications.warn(game.i18n.format("MODERN20.Cast.NoSlots", {
        name: this.name, level
      }));
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
      ui.notifications.warn(game.i18n.format("MODERN20.Cast.NoPoints", {
        name: this.name, cost
      }));
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
    ui.notifications.info(game.i18n.format("MODERN20.Cast.Rested", { name: this.name }));
    return this;
  }

  get isImmuneToNonlethal() {
    const type = (this.system.details?.creatureType ?? "").toLowerCase();
    return ["construct", "undead", "ooze"].some((immune) => type.includes(immune));
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
