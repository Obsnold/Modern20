import { MODERN20 } from "../config.mjs";

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

  /** Ranged weapons add Dex to the attack; everything else adds Str. */
  async rollAttack({ situational = 0 } = {}) {
    if (this.type !== "weapon") throw new Error("Only weapons can roll attacks");
    const actor = this.actor;
    if (!actor) throw new Error("Cannot roll an attack for an unowned weapon");

    // A weapon that is not to hand is a mistake worth surfacing, not blocking:
    // the same "warn, never enforce" rule the rest of the system follows.
    if (!this.system.equipped) {
      ui.notifications.warn(game.i18n.format("MODERN20.Equip.NotEquipped", { name: this.name }));
    }

    const abilityMod = this.system.ranged
      ? actor.system.abilities.dex.mod
      : actor.system.abilities.str.mod;
    const size = MODERN20.sizes[actor.system.attributes.size]?.mod ?? 0;

    const roll = await new Roll("1d20 + @bab + @ability + @size + @weapon + @condition + @situational", {
      bab: actor.system.attributes.baseAttack,
      ability: abilityMod,
      size,
      weapon: this.system.attackBonus,
      // Conditions such as shaken and entangled penalise attacks.
      condition: actor.system.attributes.attackMisc ?? 0,
      situational
    }).evaluate();

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: game.i18n.format("MODERN20.Chat.Attack", { weapon: this.name })
    });
    return roll;
  }

  /** Melee damage adds Str; ranged damage does not, absent a special property. */
  async rollDamage({ critical = false } = {}) {
    if (this.type !== "weapon") throw new Error("Only weapons can roll damage");
    const actor = this.actor;

    const strMod = !this.system.ranged && actor ? actor.system.abilities.str.mod : 0;
    let formula = `${this.system.damage} + @str + @bonus`;
    if (critical) formula = `(${this.system.damage}) * 2 + @str + @bonus`;

    const roll = await new Roll(formula, {
      str: strMod,
      bonus: this.system.damageBonus
    }).evaluate();

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: game.i18n.format(
        critical ? "MODERN20.Chat.CriticalDamage" : "MODERN20.Chat.Damage",
        { weapon: this.name }
      ),
      // Read back by the chat card to offer apply controls.
      flags: { modern20: { damage: roll.total } }
    });
    return roll;
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
