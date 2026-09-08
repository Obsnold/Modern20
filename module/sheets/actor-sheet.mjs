import { MODERN20 } from "../config.mjs";

const { Item } = foundry.documents;
const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Hero sheet. ActorSheetV2 already handles drag/drop of items and effects,
 * permission checks and item sorting, so this only adds Modern-specific rolls.
 */
export class Modern20HeroSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["modern20", "sheet", "actor", "hero"],
    position: { width: 820, height: 760 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      rollAbility: Modern20HeroSheet.#onRollAbility,
      rollSave: Modern20HeroSheet.#onRollSave,
      rollSkill: Modern20HeroSheet.#onRollSkill,
      rollItem: Modern20HeroSheet.#onRollItem,
      purchaseItem: Modern20HeroSheet.#onPurchaseItem,
      spendActionPoint: Modern20HeroSheet.#onSpendActionPoint,
      createItem: Modern20HeroSheet.#onCreateItem,
      editItem: Modern20HeroSheet.#onEditItem,
      deleteItem: Modern20HeroSheet.#onDeleteItem
    }
  };

  static PARTS = {
    header: { template: "systems/modern20/templates/actor/hero-header.hbs" },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: "systems/modern20/templates/actor/hero-main.hbs" },
    skills: { template: "systems/modern20/templates/actor/hero-skills.hbs" },
    talents: { template: "systems/modern20/templates/actor/hero-talents.hbs" },
    gear: { template: "systems/modern20/templates/actor/hero-gear.hbs" },
    biography: { template: "systems/modern20/templates/actor/hero-biography.hbs" }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "main", icon: "fa-solid fa-user" },
        { id: "skills", icon: "fa-solid fa-list-check" },
        { id: "talents", icon: "fa-solid fa-star" },
        { id: "gear", icon: "fa-solid fa-box-open" },
        { id: "biography", icon: "fa-solid fa-book" }
      ],
      initial: "main",
      labelPrefix: "MODERN20.Tab"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;

    context.system = actor.system;
    context.config = MODERN20;
    context.editable = this.isEditable;

    context.enrichedBiography =
      await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        actor.system.biography,
        { secrets: actor.isOwner, relativeTo: actor }
      );

    // Schema fields drive the {{formField}} helper for rich-text editing.
    context.fields = actor.system.schema.fields;

    const grouped = this.#sortItemsByType(actor.items);
    context.items = grouped;
    // Named sections keep the item-type ordering in code rather than in the
    // templates, which have no way to express an ordered list of types.
    context.sections = {
      character: this.#section(grouped, ["class", "occupation", "talent", "feat"]),
      gear: this.#section(grouped, ["weapon", "armor", "gear"])
    };
    context.skills = this.#prepareSkillRows(actor.system.skills);

    return context;
  }

  #section(grouped, types) {
    return types.map((type) => ({
      type,
      label: game.i18n.localize(`MODERN20.ItemType.${type}`),
      items: grouped[type] ?? []
    }));
  }

  /** Group owned items so each tab can render its own list. */
  #sortItemsByType(items) {
    const groups = {
      class: [], occupation: [], talent: [], feat: [],
      weapon: [], armor: [], gear: [], spell: [], psiPower: [], vehicleMod: []
    };
    for (const item of items) groups[item.type]?.push(item);
    for (const list of Object.values(groups)) list.sort((a, b) => a.sort - b.sort);
    return groups;
  }

  /**
   * Flatten skills and their specialties into one display list, so
   * Knowledge (streetwise) renders as its own row under Knowledge.
   */
  #prepareSkillRows(skills) {
    const rows = [];
    for (const [key, cfg] of Object.entries(MODERN20.skills)) {
      const skill = skills[key];
      const label = game.i18n.localize(cfg.label);

      if (cfg.specialties) {
        rows.push({ key, label, header: true, config: cfg, ...skill });
        skill.specialties.forEach((specialty, index) => {
          rows.push({
            key,
            index,
            specialty: specialty.name,
            label: `${label} (${specialty.name})`,
            config: cfg,
            ...specialty
          });
        });
      } else {
        rows.push({ key, label, config: cfg, ...skill });
      }
    }
    return rows;
  }

  /** Walk up from the clicked control to the item row that owns it. */
  #itemFromEvent(target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    return id ? this.document.items.get(id) : null;
  }

  static async #onRollAbility(event, target) {
    await this.document.rollAbility(target.dataset.ability);
  }

  static async #onRollSave(event, target) {
    await this.document.rollSave(target.dataset.save);
  }

  static async #onRollSkill(event, target) {
    const { skill, specialty } = target.dataset;
    await this.document.rollSkill(skill, { specialty: specialty || null });
  }

  static async #onRollItem(event, target) {
    await this.#itemFromEvent(target)?.roll();
  }

  static async #onPurchaseItem(event, target) {
    // Shift-click buys on the black market, at the restriction surcharge.
    await this.#itemFromEvent(target)?.purchase({ blackMarket: event.shiftKey });
  }

  static async #onSpendActionPoint() {
    await this.document.spendActionPoint();
  }

  static async #onCreateItem(event, target) {
    const type = target.dataset.type;
    await this.document.createEmbeddedDocuments("Item", [{
      name: Item.implementation.defaultName({ type, parent: this.document }),
      type
    }]);
  }

  static async #onEditItem(event, target) {
    this.#itemFromEvent(target)?.sheet.render(true);
  }

  static async #onDeleteItem(event, target) {
    await this.#itemFromEvent(target)?.deleteDialog();
  }
}
