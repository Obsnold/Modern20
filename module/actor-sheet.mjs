/**
 * A read-only sheet for every actor type, the counterpart of the item sheet:
 * the actor's stored fields as a table, its rules text, and its source page.
 */
import { describe } from "./item-sheet.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class Modern20ActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["modern20", "sheet", "actor"],
    position: { width: 640, height: 720 },
    window: { resizable: true },
  };

  static PARTS = {
    body: { template: "systems/modern20/templates/document-sheet.hbs", scrollable: [""] },
  };

  async _prepareContext(options) {
    return Object.assign(await super._prepareContext(options), await describe(this.document));
  }
}
