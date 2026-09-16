import { MODERN20 } from "../config.mjs";
import { SUBSTANCES } from "../object-data.mjs";
import { Modern20ActorSheetBase } from "./actor-sheet.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * An ordinary: an NPC built on ordinary levels. Has Wealth and Reputation but
 * no action points and no talents, so it drops the hero's Character tab.
 */
export class Modern20OrdinarySheet extends Modern20ActorSheetBase {
  static DEFAULT_OPTIONS = {
    classes: ["modern20", "sheet", "actor", "ordinary"],
    position: { width: 760, height: 700 }
  };

  static PARTS = {
    header: { template: "systems/modern20/templates/actor/ordinary-header.hbs" },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: "systems/modern20/templates/actor/hero-main.hbs", scrollable: [""] },
    skills: { template: "systems/modern20/templates/actor/hero-skills.hbs", scrollable: [""] },
    gear: { template: "systems/modern20/templates/actor/hero-gear.hbs", scrollable: [""] },
    casting: { template: "systems/modern20/templates/actor/hero-casting.hbs", scrollable: [""] },
    biography: { template: "systems/modern20/templates/actor/hero-biography.hbs", scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "main", icon: "fa-solid fa-user" },
        { id: "skills", icon: "fa-solid fa-list-check" },
        { id: "gear", icon: "fa-solid fa-box-open" },
        { id: "casting", icon: "fa-solid fa-wand-sparkles" },
        { id: "biography", icon: "fa-solid fa-book" }
      ],
      initial: "main",
      labelPrefix: "MODERN20.Tab"
    }
  };
}

/**
 * A creature stat block. No Wealth, no action points and no Reputation — the
 * hero header rendered inputs for all three, which wrote fields the creature
 * schema does not define.
 */
export class Modern20CreatureSheet extends Modern20ActorSheetBase {
  static DEFAULT_OPTIONS = {
    classes: ["modern20", "sheet", "actor", "creature"],
    position: { width: 760, height: 700 }
  };

  static PARTS = {
    header: { template: "systems/modern20/templates/actor/creature-header.hbs" },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: "systems/modern20/templates/actor/hero-main.hbs", scrollable: [""] },
    abilities: { template: "systems/modern20/templates/actor/creature-abilities.hbs", scrollable: [""] },
    skills: { template: "systems/modern20/templates/actor/hero-skills.hbs", scrollable: [""] },
    gear: { template: "systems/modern20/templates/actor/hero-gear.hbs", scrollable: [""] },
    casting: { template: "systems/modern20/templates/actor/hero-casting.hbs", scrollable: [""] },
    biography: { template: "systems/modern20/templates/actor/creature-biography.hbs", scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "main", icon: "fa-solid fa-paw" },
        { id: "abilities", icon: "fa-solid fa-bolt" },
        { id: "skills", icon: "fa-solid fa-list-check" },
        { id: "gear", icon: "fa-solid fa-box-open" },
        { id: "casting", icon: "fa-solid fa-wand-sparkles" },
        { id: "biography", icon: "fa-solid fa-book" }
      ],
      initial: "main",
      labelPrefix: "MODERN20.Tab"
    }
  };
}

/**
 * An object: a door, a chain, a cinderblock wall.
 *
 * One panel, because that is the whole of what the SRD gives an object — a
 * Defense from its size, a hardness, hit points and a break DC. The hit point
 * steps are the same ones every other sheet has, so shooting a door goes
 * through Actor#applyDamage and its hardness comes off the damage.
 */
export class Modern20ObjectSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["modern20", "sheet", "actor", "object"],
    position: { width: 560, height: 520 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      adjustHealth: Modern20ObjectSheet.#onAdjustHealth,
      rollBreak: Modern20ObjectSheet.#onRollBreak
    }
  };

  static PARTS = {
    body: { template: "systems/modern20/templates/actor/object-body.hbs", scrollable: [""] }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;

    context.system = actor.system;
    context.fields = actor.system.schema.fields;
    context.config = MODERN20;
    context.editable = this.isEditable;
    context.substances = SUBSTANCES;
    context.enrichedDescription =
      await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        actor.system.description,
        { secrets: actor.isOwner, relativeTo: actor }
      );

    return context;
  }

  /** The same -5 / -1 / +1 / +5 steps the other sheets carry. */
  /** @this {Modern20ObjectSheet} */
  static async #onAdjustHealth(event, target) {
    const delta = Number(target.dataset.delta) || 0;
    await this.document.applyDamage(delta);
  }

  /**
   * "When a character tries to break something with sudden force rather than
   * by dealing damage, use a Strength check." Rolled by whoever is pulling on
   * it, which is not the object.
   * @this {Modern20ObjectSheet}
   */
  static async #onRollBreak() {
    const breaker = game.user.character ?? canvas.tokens?.controlled?.[0]?.actor;
    if (!breaker?.system?.abilities?.str) {
      ui.notifications.warn(game.i18n.localize("MODERN20.Warning.NoBreaker"));
      return;
    }
    const dc = this.document.system.currentBreakDC;
    await breaker.rollAbility("str", {
      flavor: game.i18n.format("MODERN20.Object.BreakCheck", {
        name: this.document.name, dc
      })
    });
  }
}

/**
 * A vehicle. Vehicles have no abilities, saves or skills, so this extends the
 * sheet base directly rather than the actor base — none of that machinery
 * applies.
 */
export class Modern20VehicleSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["modern20", "sheet", "actor", "vehicle"],
    position: { width: 620, height: 560 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      purchaseVehicle: Modern20VehicleSheet.#onPurchase
    }
  };

  static PARTS = {
    header: { template: "systems/modern20/templates/actor/vehicle-header.hbs" },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    stats: { template: "systems/modern20/templates/actor/vehicle-stats.hbs", scrollable: [""] },
    description: { template: "systems/modern20/templates/actor/vehicle-description.hbs", scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "stats", icon: "fa-solid fa-car" },
        { id: "description", icon: "fa-solid fa-align-left" }
      ],
      initial: "stats",
      labelPrefix: "MODERN20.Tab"
    }
  };

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (context.tabs && partId in context.tabs) context.tab = context.tabs[partId];
    return context;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;

    context.system = actor.system;
    context.fields = actor.system.schema.fields;
    context.config = MODERN20;
    context.editable = this.isEditable;
    context.enrichedDescription =
      await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        actor.system.description,
        { secrets: actor.isOwner, relativeTo: actor }
      );

    return context;
  }

  /** Buying a vehicle is a Wealth check made by whoever is paying, not by the
   *  vehicle, so this asks the selected character to make it. */
  /** @this {Modern20VehicleSheet} */
  static async #onPurchase(event) {
    const buyer = game.user.character ?? canvas.tokens?.controlled?.[0]?.actor;
    if (!buyer?.system?.wealth) {
      ui.notifications.warn(game.i18n.localize("MODERN20.Warning.NoBuyer"));
      return;
    }
    await buyer.purchase(this.document.system.purchaseDC, {
      restriction: this.document.system.restriction,
      blackMarket: event.shiftKey,
      label: this.document.name
    });
  }
}
