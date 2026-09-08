import { MODERN20 } from "../config.mjs";
import { rollWealthCheck, commitWealthLoss } from "../dice/wealth.mjs";

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
  async applyDamage(amount, { ignoreMassive = false } = {}) {
    const hp = this.system.hp;
    if (!hp) return null;

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

  async #d20Roll(modifier, { flavor } = {}) {
    const roll = await new Roll("1d20 + @mod", { mod: modifier }).evaluate();
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor
    });
    return roll;
  }
}
