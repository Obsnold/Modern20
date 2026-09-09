import { MODERN20 } from "../config.mjs";
import { Modern20LevelUpScreen } from "../apps/level-up-screen.mjs";
import { Modern20CharacterCreator } from "../apps/character-creator.mjs";
import { STANCES } from "../apps/actions.mjs";
import { setting } from "../settings.mjs";

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
      unpackItem: Modern20ActorSheetBase.#onUnpackItem,
      reloadWeapon: Modern20ActorSheetBase.#onReloadWeapon,
      detachItem: Modern20ActorSheetBase.#onDetachItem,
      useActivity: Modern20ActorSheetBase.#onUseActivity,
      restCasting: Modern20ActorSheetBase.#onRestCasting,
      takeStance: Modern20ActorSheetBase.#onTakeStance,
      endTurn: Modern20ActorSheetBase.#onEndTurn,
      fiveFootStep: Modern20ActorSheetBase.#onFiveFootStep,
      fullAttack: Modern20ActorSheetBase.#onFullAttack
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
    if (game.user.isGM || !setting("lockPlayerSheets")) return;

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
    context.locked = !game.user.isGM && setting("lockPlayerSheets");

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
      gear: this._section(grouped, ["weapon", "armor", "gear"]),
      casting: this._section(grouped, ["spell", "psiPower"])
    };
    // Every spell and power a caster has, with the DC each one imposes: the
    // number a player is asked for most often at the table.
    context.casting = this._prepareCasting(grouped);
    context.containers = this._containers(actor, grouped);
    // Accessories hang off the weapon they are fitted to.
    const sequence = actor.attackSequence ?? [0];
    for (const weapon of grouped.weapon ?? []) {
      weapon.fitted = weapon.accessories;
      weapon.ammoChoices = weapon.ammunitionChoices;
      // A full attack is only worth offering to someone who gets more than
      // one attack from it.
      weapon.canFullAttack = sequence.length > 1;
      weapon.attackSequence = sequence
        .map((bonus) => (bonus >= 0 ? `+${bonus}` : `${bonus}`)).join(" / ");
    }
    context.skills = this._prepareSkillRows(actor.system.skills);
    context.combat = this._prepareCombat(actor);

    // Newest first: what happened most recently is what a player checks.
    context.advancement = [...(actor.system.advancement ?? [])].reverse();

    return context;
  }

  /**
   * This turn's budget, the stance, and the attack sequence.
   *
   * The budget is shown so a player can see what is left, not to stop them
   * spending it: the SRD leaves several actions as "varies", and the table
   * routinely does things the rules do not name.
   */
  _prepareCombat(actor) {
    const turn = actor.system.turn ?? {};
    const sequence = actor.attackSequence ?? [0];
    return {
      pools: Object.keys(MODERN20.turnBudget).map((pool) => ({
        pool,
        label: game.i18n.localize(`MODERN20.Action.${pool}`),
        remaining: turn.remaining?.[pool] ?? 0,
        spent: turn[pool] ?? 0
      })),
      stance: turn.stance ?? "",
      stanceLabel: turn.stance ? game.i18n.localize(STANCES[turn.stance]?.label ?? "") : "",
      stances: Object.values(STANCES).map((stance) => ({
        id: stance.id,
        label: stance.label,
        action: game.i18n.localize(MODERN20.actionTypes[stance.action]),
        active: turn.stance === stance.id
      })),
      // "+11/+6/+1": shown whenever there is more than one, since that is when
      // a full attack is worth taking.
      sequence: sequence.map((bonus) => (bonus >= 0 ? `+${bonus}` : `${bonus}`)).join(" / "),
      multiattack: sequence.length > 1
    };
  }

  /**
   * Spells and powers, grouped by level with their save DCs resolved.
   *
   * The DC is "10 + the spell's level + the caster's key ability modifier", so
   * it is a property of this character casting this spell and cannot be
   * printed on the item.
   */
  _prepareCasting(grouped) {
    const rows = [];
    for (const type of ["spell", "psiPower"]) {
      for (const item of grouped[type] ?? []) {
        const activity = item.activities[0] ?? null;
        const save = activity?.save?.ability;
        rows.push({
          item,
          type,
          level: item.castingLevel,
          activities: item.activities,
          // Flattened rather than reached for in the template: a Handlebars
          // block parameter is lexically scoped, so `../` inside nested each
          // blocks resolves somewhere other than where it reads as pointing.
          school: item.system.school ?? "",
          damage: item.system.damage ?? "",
          powerPoints: type === "psiPower" ? item.system.powerPoints : 0,
          prepared: type === "spell" ? item.system.prepared : 0,
          traditionLabel: type === "spell"
            ? MODERN20.traditions[item.system.tradition] ?? "" : "",
          saveLabel: save
            ? game.i18n.localize(MODERN20.saves[save]?.label ?? "") : "",
          dc: save ? item.saveDC(activity) : null
        });
      }
    }
    rows.sort((a, b) => a.level - b.level || a.item.name.localeCompare(b.item.name));

    const levels = new Map();
    for (const row of rows) {
      if (!levels.has(row.level)) levels.set(row.level, []);
      levels.get(row.level).push(row);
    }
    // The daily pools, flattened for display: each list's slots by level, and
    // the power point pool where a psionic class grants one.
    const casting = this.document.system.casting ?? {};
    const pools = [];
    for (const [tradition, slots] of Object.entries(casting.slots ?? {})) {
      const used = (slots ?? []).filter((slot) => slot.max > 0);
      if (used.length) {
        pools.push({
          label: MODERN20.traditions[tradition] ?? tradition,
          slots: used
        });
      }
    }

    return {
      any: rows.length > 0,
      casterLevel: this.document.system.spellcasting?.casterLevel ?? 1,
      pools,
      powerPoints: casting.powerPoints?.max ? casting.powerPoints : null,
      casters: casting.casters ?? [],
      levels: [...levels.entries()].map(([level, entries]) => ({ level, entries }))
    };
  }

  _section(grouped, types) {
    return types.map((type) => ({
      type,
      label: game.i18n.localize(`MODERN20.ItemType.${type}`),
      items: grouped[type] ?? []
    }));
  }

  /** Group owned items so each tab can render its own list. */
  /**
   * Containers and what is packed in each.
   *
   * Contents still count towards encumbrance — the SRD has no container that
   * reduces weight — so this is about knowing where things are and whether a
   * bag is overfull, not about carrying more.
   */
  _containers(actor, grouped) {
    return (grouped.container ?? []).map((container) => {
      const contents = actor.items.filter(
        (item) => item.system?.container === container.id
      );
      const carried = contents.reduce(
        (total, item) => total + (item.system.weight ?? 0) * (item.system.quantity ?? 1), 0
      );
      const capacity = container.system.capacity ?? 0;

      return {
        item: container,
        contents,
        carried: Math.round(carried * 10) / 10,
        capacity,
        over: Boolean(capacity && carried > capacity)
      };
    });
  }

  /** The provenance stamp a granted item carries, if any. */
  _sourceOf(item) {
    return item.getFlag("modern20", "source")?.label ?? "";
  }

  _sortItemsByType(items) {
    const groups = {
      class: [], occupation: [], talent: [], feat: [],
      weapon: [], armor: [], gear: [], container: [],
      spell: [], psiPower: [], vehicleMod: []
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
  /** Refill a weapon's magazine. */
  static async #onReloadWeapon(event, target) {
    const item = this._itemFromEvent(target);
    // The row's own select says which rounds to load, when there is a choice.
    const chosen = target.closest("tr, .m20-itemrow")
      ?.querySelector("select[data-ammo-for]")?.value ?? "";
    await item?.reload(chosen);
  }

  /** Remove an accessory from the weapon it is fitted to. */
  static async #onDetachItem(event, target) {
    const item = this._itemFromEvent(target);
    if (item) await item.update({ "system.attachedTo": "" });
  }

  /** Take an item back out of the container it is packed in. */
  static async #onUnpackItem(event, target) {
    const item = this._itemFromEvent(target);
    if (!item) return;
    await item.update({ "system.container": "" });
  }

  /**
   * Regain the day's spells and power points.
   *
   * Deliberately not GM-only: resting is something a character does in play,
   * like equipping, and the pools it restores are the ones casting spent.
   */
  static async #onRestCasting() {
    await this.document.restoreCasting();
  }

  /**
   * The combat actions: stance, 5-foot step, end of turn.
   *
   * All of these are things a character does in play rather than part of
   * building one, so they stay with the player who owns the sheet.
   */
  static async #onTakeStance(event, target) {
    await this.document.takeStance(target.dataset.stance);
  }

  static async #onEndTurn() {
    await this.document.startTurn();
  }

  static async #onFiveFootStep() {
    await this.document.spendAction("fiveFootStep");
  }

  static async #onFullAttack(event, target) {
    const item = this._itemFromEvent(target);
    await item?.fullAttack({
      activityId: target.dataset.activity || "shot",
      shiftKey: event.shiftKey
    });
  }

  /**
   * Use one of an item's activities.
   *
   * Shift skips the circumstance dialog, or opens it, depending on the
   * "Attack modifiers" setting. Shift-to-skip is the convention players
   * already know from other systems, so it is the default.
   */
  static async #onUseActivity(event, target) {
    const item = this._itemFromEvent(target);
    if (!item) return;
    await item.use(target.dataset.activity, { shiftKey: event.shiftKey });
  }

  static async #onAdjustHealth(event, target) {
    const delta = Number(target.dataset.delta) || 0;
    if (!delta) return;

    const actor = this.document;
    // Healing clears nonlethal damage first, since it is the lighter wound.
    if (delta < 0 && actor.system.hp.nonlethal > 0) {
      const remaining = Math.max(0, actor.system.hp.nonlethal + delta);
      const absorbed = actor.system.hp.nonlethal - remaining;
      await actor.update({ "system.hp.nonlethal": remaining });
      if (absorbed >= -delta) return;
      return actor.update({
        "system.hp.value": Math.min(actor.system.hp.max, actor.system.hp.value - delta - absorbed)
      });
    }
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
    casting: { template: "systems/modern20/templates/actor/hero-casting.hbs", scrollable: [""] },
    biography: { template: "systems/modern20/templates/actor/hero-biography.hbs", scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "main", icon: "fa-solid fa-user" },
        { id: "skills", icon: "fa-solid fa-list-check" },
        { id: "talents", icon: "fa-solid fa-star" },
        { id: "gear", icon: "fa-solid fa-box-open" },
        { id: "casting", icon: "fa-solid fa-wand-sparkles" },
        { id: "biography", icon: "fa-solid fa-book" }
      ],
      initial: "main",
      labelPrefix: "MODERN20.Tab"
    }
  };
}
