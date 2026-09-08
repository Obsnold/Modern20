import { MODERN20 } from "../config.mjs";
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
    biography: { template: "systems/modern20/templates/actor/hero-biography.hbs", scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "main", icon: "fa-solid fa-user" },
        { id: "skills", icon: "fa-solid fa-list-check" },
        { id: "gear", icon: "fa-solid fa-box-open" },
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
    skills: { template: "systems/modern20/templates/actor/hero-skills.hbs", scrollable: [""] },
    gear: { template: "systems/modern20/templates/actor/hero-gear.hbs", scrollable: [""] },
    biography: { template: "systems/modern20/templates/actor/creature-biography.hbs", scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "main", icon: "fa-solid fa-paw" },
        { id: "skills", icon: "fa-solid fa-list-check" },
        { id: "gear", icon: "fa-solid fa-box-open" },
        { id: "biography", icon: "fa-solid fa-book" }
      ],
      initial: "main",
      labelPrefix: "MODERN20.Tab"
    }
  };
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
