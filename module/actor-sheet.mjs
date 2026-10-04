/**
 * A read-only sheet for every actor type, the counterpart of the item sheet:
 * the actor's stored fields as a table, its rules text, and its source page.
 */
import { describe } from "./item-sheet.mjs";
import { creatureRolls } from "./roll.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class Modern20ActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["modern20", "sheet", "actor"],
    position: { width: 640, height: 720 },
    window: { resizable: true },
    actions: {
      rollAbility: Modern20ActorSheet.#onRollAbility,
      rollSave: Modern20ActorSheet.#onRollSave,
      rollSkill: Modern20ActorSheet.#onRollSkill,
    },
  };

  static PARTS = {
    body: { template: "systems/modern20/templates/document-sheet.hbs", scrollable: [""] },
  };

  async _prepareContext(options) {
    const context = Object.assign(await super._prepareContext(options), await describe(this.document));
    const s = this.document.system;
    const signed = (n) => (n === null || n === undefined ? "—" : n >= 0 ? `+${n}` : `${n}`);
    // Rolls from the printed bonuses: saves, abilities and skills.
    context.rolls = {
      saves: [["fort", "Fort"], ["ref", "Ref"], ["will", "Will"]].filter(([k]) => s.saves?.[k] !== null && s.saves?.[k] !== undefined).map(([key, label]) => ({ key, label, bonus: signed(s.saves[key]) })),
      abilities: ["str", "dex", "con", "int", "wis", "cha"].filter((k) => s.abilities?.[k] !== null && s.abilities?.[k] !== undefined).map((key) => ({ key, label: key[0].toUpperCase() + key.slice(1), score: s.abilities[key] })),
      skills: (s.skills ?? []).map((k, index) => ({ index, label: `${k.name}${k.specialty ? ` (${k.specialty})` : ""}`, bonus: signed(k.bonus) })),
    };
    return context;
  }

  static #onRollAbility(event, target) { return creatureRolls(this.document).ability(target.dataset.ability); }
  static #onRollSave(event, target) { return creatureRolls(this.document).save(target.dataset.save); }
  static #onRollSkill(event, target) { return creatureRolls(this.document).skill(Number(target.dataset.index)); }
}
