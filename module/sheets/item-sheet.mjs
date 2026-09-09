import { MODERN20 } from "../config.mjs";
import { maxRange, maxIncrements } from "../apps/attack.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

/**
 * One sheet class serves every item type. The details part switches on
 * `item.type` to render the fields that type actually has, which keeps ten
 * near-identical sheet classes from existing.
 */
export class Modern20ItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["modern20", "sheet", "item"],
    position: { width: 560, height: 520 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      addPrerequisite: Modern20ItemSheet.#onAddPrerequisite,
      removePrerequisite: Modern20ItemSheet.#onRemovePrerequisite,
      addActivity: Modern20ItemSheet.#onAddActivity,
      deleteActivity: Modern20ItemSheet.#onDeleteActivity
    }
  };

  static PARTS = {
    header: { template: "systems/modern20/templates/item/item-header.hbs" },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    details: { template: "systems/modern20/templates/item/item-details.hbs", scrollable: [""] },
    activities: { template: "systems/modern20/templates/item/item-activities.hbs", scrollable: [""] },
    description: { template: "systems/modern20/templates/item/item-description.hbs", scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "details", icon: "fa-solid fa-sliders" },
        { id: "activities", icon: "fa-solid fa-bolt" },
        { id: "description", icon: "fa-solid fa-align-left" }
      ],
      initial: "details",
      labelPrefix: "MODERN20.Tab"
    }
  };

  /**
   * Hand each templated part its own tab entry.
   *
   * ApplicationV2 populates `context.tabs` for the whole application, which is
   * what renders the tab bar, but the base _preparePartContext only sets
   * partId. Without this every section renders with no data-tab and no active
   * class, so the bar appears and all the panels stay hidden.
   */
  /**
   * An item on a character is part of that character's build, so it is locked
   * for players for the same reason the actor sheet is. An item in a
   * compendium or the sidebar is not owned, and stays editable.
   */
  _onRender(context, options) {
    super._onRender(context, options);
    if (game.user.isGM || !this.document.parent) return;

    for (const field of this.element.querySelectorAll("input, select, textarea, prose-mirror")) {
      field.disabled = true;
      field.readOnly = true;
    }
    for (const control of this.element.querySelectorAll("[data-action]")) {
      control.disabled = true;
    }
  }

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (context.tabs && partId in context.tabs) context.tab = context.tabs[partId];
    return context;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;

    context.system = item.system;
    context.config = MODERN20;
    context.editable = this.isEditable;
    // The details template branches on these rather than on a chain of type tests.
    context.fields = item.system.schema.fields;
    context.isPurchasable = item.system.purchaseDC !== undefined;
    context.hasPrerequisites = Array.isArray(item.system.prerequisites);
    context.maxRange = item.type === "weapon" ? maxRange(item.system) : 0;
    // Accessories are fitted from their own sheet, so they need the list.
    context.weapons = item.parent && item.type === "gear"
      ? item.parent.items.filter((other) => other.type === "weapon")
      : [];
    context.maxIncrements = item.type === "weapon" ? maxIncrements(item.system) : 0;

    // Stored activities, and the generated defaults shown when there are none
    // so it is clear what adding one would replace.
    const stored = item.system.activities ?? {};
    context.activities = Object.entries(stored).map(([id, activity]) => ({
      id,
      type: activity.type,
      data: activity,
      fields: item.system.schema.fields.activities.element.getField?.(activity.type)?.fields ?? null
    }));
    context.activityTypes = Object.keys(CONFIG.MODERN20?.activityTypes ?? {});

    context.enrichedDescription =
      await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        item.system.description,
        { secrets: item.isOwner, relativeTo: item }
      );

    return context;
  }

  /**
   * Add an activity of the chosen type.
   *
   * A TypedSchemaField will not let an entry change type after the fact, so
   * the editor creates and deletes rather than converting.
   */
  static async #onAddActivity(event, target) {
    const type = target.dataset.type
      ?? this.element.querySelector("select[name=newActivityType]")?.value
      ?? "attack";
    const id = foundry.utils.randomID();

    await this.document.update({
      [`system.activities.${id}`]: {
        type,
        name: game.i18n.format("MODERN20.Activity.NewName", {
          type: game.i18n.localize(`MODERN20.Activity.Type.${type}`)
        })
      }
    });
  }

  static async #onDeleteActivity(event, target) {
    const id = target.closest("[data-activity-id]")?.dataset.activityId;
    if (!id) return;
    // The -= prefix is how a key is removed from a stored object.
    await this.document.update({ [`system.activities.-=${id}`]: null });
  }

  static async #onAddPrerequisite() {
    const prerequisites = [...this.document.system.prerequisites, ""];
    await this.document.update({ "system.prerequisites": prerequisites });
  }

  static async #onRemovePrerequisite(event, target) {
    const index = Number(target.dataset.index);
    const prerequisites = this.document.system.prerequisites.filter((_, i) => i !== index);
    await this.document.update({ "system.prerequisites": prerequisites });
  }
}
