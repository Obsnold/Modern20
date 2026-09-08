import { MODERN20 } from "../config.mjs";

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
      removePrerequisite: Modern20ItemSheet.#onRemovePrerequisite
    }
  };

  static PARTS = {
    header: { template: "systems/modern20/templates/item/item-header.hbs" },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    details: { template: "systems/modern20/templates/item/item-details.hbs" },
    description: { template: "systems/modern20/templates/item/item-description.hbs" }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "details", icon: "fa-solid fa-sliders" },
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

    context.enrichedDescription =
      await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        item.system.description,
        { secrets: item.isOwner, relativeTo: item }
      );

    return context;
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
