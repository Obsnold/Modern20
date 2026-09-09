import { MODERN20 } from "../config.mjs";
import { Modern20LevelUpScreen } from "../apps/level-up-screen.mjs";
import { Modern20CharacterCreator } from "../apps/character-creator.mjs";

const { Item } = foundry.documents;

// Actions that change the character outside the creator and level-up screen.
// Rolling, buying and levelling stay available to the player who owns it.
const GM_ONLY_ACTIONS = new Set(["createItem", "deleteItem"]);
const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Everything the four actor sheets share: rolling, item management and the
 * skill table. ActorSheetV2 already handles drag/drop, permissions and item
 * sorting, so this only adds what d20 Modern needs.
 *
 * ApplicationV2 merges DEFAULT_OPTIONS up the prototype chain, so a subclass
 * inherits these actions and only declares its own PARTS and TABS. Arrays are
 * replaced rather than merged, so each subclass restates `classes`.
 */
export class Modern20ActorSheetBase extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["modern20", "sheet", "actor"],
    position: { width: 820, height: 760 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      rollAbility: Modern20ActorSheetBase.#onRollAbility,
      rollSave: Modern20ActorSheetBase.#onRollSave,
      rollSkill: Modern20ActorSheetBase.#onRollSkill,
      rollItem: Modern20ActorSheetBase.#onRollItem,
      purchaseItem: Modern20ActorSheetBase.#onPurchaseItem,
      spendActionPoint: Modern20ActorSheetBase.#onSpendActionPoint,
      createItem: Modern20ActorSheetBase.#onCreateItem,
      editItem: Modern20ActorSheetBase.#onEditItem,
      deleteItem: Modern20ActorSheetBase.#onDeleteItem,
      adjustClassLevel: Modern20ActorSheetBase.#onAdjustClassLevel,
      openCreator: Modern20ActorSheetBase.#onOpenCreator,
      toggleEquipped: Modern20ActorSheetBase.#onToggleEquipped,
      adjustHealth: Modern20ActorSheetBase.#onAdjustHealth,
      useActivity: Modern20ActorSheetBase.#onUseActivity
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
   * Lock the sheet for players.
   *
   * Character building happens in the creator and the level-up screen, which
   * apply the rules; editing the same values directly on the sheet bypasses
   * them. Players keep every control that only reads or rolls, and anything
   * marked data-player-allowed. The GM edits freely.
   */
  _onRender(context, options) {
    super._onRender(context, options);
    if (game.user.isGM) return;

    const form = this.element;
    for (const field of form.querySelectorAll("input, select, textarea, prose-mirror")) {
      if (field.closest("[data-player-allowed]")) continue;
      field.disabled = true;
      field.readOnly = true;
    }
    // Buttons that create, edit or delete embedded items are building too.
    for (const control of form.querySelectorAll("[data-action]")) {
      const action = control.dataset.action;
      if (GM_ONLY_ACTIONS.has(action)) control.disabled = true;
    }
  }

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (context.tabs && partId in context.tabs) context.tab = context.tabs[partId];
    return context;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;

    context.system = actor.system;
    context.config = MODERN20;
    context.editable = this.isEditable;
    // Drives the lock indicator; the actual locking happens in _onRender.
    context.isGM = game.user.isGM;

    context.enrichedBiography =
      await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        actor.system.biography,
        { secrets: actor.isOwner, relativeTo: actor }
      );

    // Schema fields drive the {{formField}} helper for rich-text editing.
    context.fields = actor.system.schema.fields;

    const grouped = this._sortItemsByType(actor.items);
    context.items = grouped;
    // Named sections keep the item-type ordering in code rather than in the
    // templates, which have no way to express an ordered list of types.
    context.sections = {
      character: this._section(grouped, ["class", "occupation", "talent", "feat"]),
      gear: this._section(grouped, ["weapon", "armor", "gear"])
    };
    context.skills = this._prepareSkillRows(actor.system.skills);

    // Newest first: what happened most recently is what a player checks.
    context.advancement = [...(actor.system.advancement ?? [])].reverse();

    return context;
  }

  _section(grouped, types) {
    return types.map((type) => ({
      type,
      label: game.i18n.localize(`MODERN20.ItemType.${type}`),
      items: grouped[type] ?? []
    }));
  }

  /** Group owned items so each tab can render its own list. */
  /** The provenance stamp a granted item carries, if any. */
  _sourceOf(item) {
    return item.getFlag("modern20", "source")?.label ?? "";
  }

  _sortItemsByType(items) {
    const groups = {
      class: [], occupation: [], talent: [], feat: [],
      weapon: [], armor: [], gear: [], spell: [], psiPower: [], vehicleMod: []
    };
    for (const item of items) {
      if (!groups[item.type]) continue;
      // Attached rather than stored, so the sheet can show where it came from.
      item.grantSource = this._sourceOf(item);
      groups[item.type].push(item);
    }
    for (const list of Object.values(groups)) list.sort((a, b) => a.sort - b.sort);
    return groups;
  }

  /**
   * Flatten skills and their specialties into one display list, so
   * Knowledge (streetwise) renders as its own row under Knowledge.
   */
  _prepareSkillRows(skills) {
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
  _itemFromEvent(target) {
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
    await this._itemFromEvent(target)?.roll();
  }

  static async #onPurchaseItem(event, target) {
    // Shift-click buys on the black market, at the restriction surcharge.
    await this._itemFromEvent(target)?.purchase({ blackMarket: event.shiftKey });
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
    this._itemFromEvent(target)?.sheet.render(true);
  }

  /**
   * Take damage or heal by a step.
   *
   * Health changes through an action rather than by typing into the sheet, so
   * this stays with the player: damage routes through applyDamage and so
   * carries damage reduction and the massive damage save with it. Buttons
   * rather than a text field, because an unnamed input cannot survive the
   * re-render that submitOnChange triggers when it loses focus.
   */
  /** Use one of an item's activities. */
  static async #onUseActivity(event, target) {
    const item = this._itemFromEvent(target);
    if (!item) return;
    await item.rollAttack({ activityId: target.dataset.activity });
  }

  static async #onAdjustHealth(event, target) {
    const delta = Number(target.dataset.delta) || 0;
    if (!delta) return;

    const actor = this.document;
    if (delta > 0) {
      await actor.applyDamage(delta);
      return;
    }

    const hp = actor.system.hp;
    await actor.update({ "system.hp.value": Math.min(hp.max, hp.value - delta) });
  }

  /**
   * Equip or stow an item.
   *
   * Deliberately not GM-only: equipping is something a character does in play,
   * not part of building one, so it stays with the player who owns the sheet.
   */
  static async #onToggleEquipped(event, target) {
    const item = this._itemFromEvent(target);
    if (item?.system?.equipped === undefined) return;
    await item.update({ "system.equipped": !item.system.equipped });
  }

  static async #onOpenCreator() {
    // render() returns a promise: leaving it unawaited turned any failure into
    // an unhandled rejection, so the button appeared to do nothing at all.
    try {
      await new Modern20CharacterCreator(this.document).render(true);
    } catch (error) {
      ui.notifications.error(error, { console: true });
    }
  }

  /**
   * Raise or lower a class by one level from the sheet. Levelling is the most
   * common thing a player does, and it was only reachable by opening the class
   * item and editing a number.
   */
  static async #onAdjustClassLevel(event, target) {
    const item = this._itemFromEvent(target);
    if (item?.type !== "class") return;

    const delta = Number(target.dataset.delta) || 0;

    // Gaining a level opens the level-up screen, which previews the whole
    // change and applies it on confirm. Losing one is a correction, not a
    // decision, so it just decrements.
    if (delta > 0) {
      try {
        await new Modern20LevelUpScreen(this.document, item).render(true);
      } catch (error) {
        ui.notifications.error(error, { console: true });
      }
      return;
    }

    await item.update({ "system.levels": Math.max(0, item.system.levels + delta) });
  }

  static async #onDeleteItem(event, target) {
    await this._itemFromEvent(target)?.deleteDialog();
  }
}


/** The player character sheet: talents, action points, Wealth and Reputation. */
export class Modern20HeroSheet extends Modern20ActorSheetBase {
  static DEFAULT_OPTIONS = {
    classes: ["modern20", "sheet", "actor", "hero"]
  };

  static PARTS = {
    header: { template: "systems/modern20/templates/actor/hero-header.hbs" },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: "systems/modern20/templates/actor/hero-main.hbs", scrollable: [""] },
    skills: { template: "systems/modern20/templates/actor/hero-skills.hbs", scrollable: [""] },
    talents: { template: "systems/modern20/templates/actor/hero-talents.hbs", scrollable: [""] },
    gear: { template: "systems/modern20/templates/actor/hero-gear.hbs", scrollable: [""] },
    biography: { template: "systems/modern20/templates/actor/hero-biography.hbs", scrollable: [""] }
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
}
