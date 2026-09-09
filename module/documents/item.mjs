import { MODERN20 } from "../config.mjs";
import { resolveAttack, postAttackCard, rollWeaponDamage } from "../apps/attack.mjs";
import { availableActivities } from "../apps/activities.mjs";

const { Item, ChatMessage } = foundry.documents;
const { Roll } = foundry.dice;

export class Modern20Item extends Item {
  getRollData() {
    const data = { ...(this.actor?.getRollData() ?? {}) };
    data.item = { ...this.system };
    return data;
  }

  /** Post the item to chat, or roll an attack if it is a weapon. */
  async roll() {
    if (this.type === "weapon") return this.rollAttack();
    return this.toChat();
  }

  /**
   * Roll an attack, resolved against the target's Defense where one is
   * targeted, with threats confirmed. The detail lives in apps/attack.mjs.
   */
  async rollAttack({ situational = 0, activityId = "shot" } = {}) {
    if (this.type !== "weapon") throw new Error("Only weapons can roll attacks");

    if (!this.system.equipped) {
      ui.notifications.warn(game.i18n.format("MODERN20.Equip.NotEquipped", { name: this.name }));
    }

    const result = await resolveAttack(this, { situational, activityId });
    await postAttackCard(this, result);

    // Each mode spends its own amount: one round, five for a burst, ten on
    // autofire.
    if (this.system.ammo?.max) {
      const remaining = this.system.ammo.value - result.ammoSpent;
      if (remaining < 0) {
        ui.notifications.warn(game.i18n.format("MODERN20.Attack.NoAmmo", { name: this.name }));
      } else {
        await this.update({ "system.ammo.value": remaining });
      }
    }

    return result;
  }

  /** Weapon damage, doubled by rolling twice when a critical is confirmed. */
  async rollDamage({ critical = false, activityId = "shot" } = {}) {
    if (this.type !== "weapon") throw new Error("Only weapons can roll damage");

    const roll = await rollWeaponDamage(this, { critical, activityId });
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: game.i18n.format(
        critical ? "MODERN20.Chat.CriticalDamage" : "MODERN20.Chat.Damage",
        { weapon: this.name }
      ),
      flags: { modern20: { damage: roll.total } }
    });
    return roll;
  }

  /**
   * What this item can do, with availability resolved for its owner. Stored
   * activities win; a weapon without any falls back to the defaults its rate
   * of fire implies.
   */
  get activities() {
    return availableActivities(this);
  }

  /** Buy this item through the owning actor's Wealth bonus. */
  async purchase({ blackMarket = false } = {}) {
    if (!this.actor) throw new Error("Cannot purchase an unowned item");
    if (this.system.purchaseDC === undefined) {
      ui.notifications.warn(game.i18n.localize("MODERN20.Warning.NotPurchasable"));
      return null;
    }
    return this.actor.purchase(this.system.purchaseDC, {
      restriction: this.system.restriction,
      blackMarket,
      label: this.name
    });
  }

  async toChat() {
    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/modern20/templates/chat/item-card.hbs",
      { item: this, system: this.system }
    );
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content
    });
  }
}
