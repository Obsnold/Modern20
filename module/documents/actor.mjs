import { MODERN20 } from "../config.mjs";
import { rollWealthCheck, commitWealthLoss } from "../dice/wealth.mjs";
import { ACTION_COST, STANCES, canAfford, attackSequence } from "../apps/actions.mjs";
import { announce, problem } from "../apps/announce.mjs";
import { setting } from "../settings.mjs";

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
  async applyDamage(amount, { ignoreMassive = false, nonlethal = false } = {}) {
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

    // Damage reduction was stored on every actor but never subtracted.
    const reduction = this.system.attributes?.damageReduction ?? 0;
    amount = Math.max(0, amount - reduction);

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
