import {
  ATTACK_MODIFIERS, DEFENSE_MODIFIERS, COVER, CONCEALMENT
} from "../combat-data.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The circumstances that change an attack, offered rather than detected.
 *
 * "Generally speaking, any situational modifier created by the attacker's
 * position or tactics applies to the attack roll, while any situational
 * modifier created by the defender's position, state, or tactics applies to
 * the defender's Defense. The GM judges what bonuses and penalties apply,
 * using Table: Defense Modifiers and Table: Attack Roll Modifiers as guides."
 *
 * The SRD says the GM judges, so nothing here works flanking or cover out from
 * token positions: that means guessing at what the table can see, and getting
 * it wrong is worse than asking. Every system in the ecosystem lands the same
 * way — dnd5e's roll configuration and PF2e's modifier list are both toggles.
 *
 * Holding shift when attacking skips this and rolls with nothing applied.
 */

/** The choices, resolved for the attack about to be made. */
export function modifierChoices(ranged) {
  const side = (rows) => rows.map((row) => ({
    id: row.id,
    label: row.circumstance,
    value: ranged ? row.ranged : row.melee,
    losesDex: row.losesDex,
    // A row that does nothing on this side of the attack is still shown, since
    // several strip the defender's Dexterity bonus instead of giving a number.
    inert: (ranged ? row.ranged : row.melee) === 0 && !row.losesDex
  }));

  return {
    attack: side(ATTACK_MODIFIERS).filter((row) => !row.inert),
    defense: side(DEFENSE_MODIFIERS),
    cover: COVER,
    concealment: CONCEALMENT
  };
}

/**
 * What a set of chosen circumstances comes to.
 *
 * Kept a pure function so the arithmetic can be checked without a browser.
 * Cover is a Defense bonus like the rest; concealment is not a modifier at all
 * but a miss chance rolled after a hit, so it is carried rather than summed.
 */
export function resolveModifiers(choices = {}, ranged = false) {
  const pick = (rows, ids) => rows.filter((row) => ids?.includes(row.id));
  const amount = (row) => (ranged ? row.ranged : row.melee);

  const attackRows = pick(ATTACK_MODIFIERS, choices.attack);
  const defenseRows = pick(DEFENSE_MODIFIERS, choices.defense);
  const coverRow = COVER.find((row) => row.id === choices.cover) ?? null;
  const concealmentRow = CONCEALMENT.find((row) => row.id === choices.concealment) ?? null;

  return {
    attack: attackRows.reduce((total, row) => total + amount(row), 0),
    // Cover is "Cover Bonus to Defense", so it lands on the same side as the
    // defender's own circumstances.
    defense: defenseRows.reduce((total, row) => total + amount(row), 0)
      + (coverRow?.defense ?? 0),
    // "When multiple concealment conditions apply to a defender, use the one
    // that would produce the highest miss chance. Do not add the miss chances
    // together." Only one is ever chosen, so this is just its value.
    missChance: concealmentRow?.missChance ?? 0,
    // Several circumstances strip the defender's Dexterity bonus instead of
    // giving a number; reported so the card can say so.
    losesDex: defenseRows.some((row) => row.losesDex),
    labels: [
      ...attackRows.map((row) => ({ label: row.circumstance, value: amount(row), side: "attack" })),
      ...defenseRows.map((row) => ({ label: row.circumstance, value: amount(row), side: "defense" })),
      ...(coverRow ? [{ label: coverRow.degree, value: coverRow.defense, side: "defense" }] : []),
      ...(concealmentRow
        ? [{ label: concealmentRow.degree, value: concealmentRow.missChance, side: "conceal" }]
        : [])
    ].filter((entry) => entry.value !== 0)
  };
}

/**
 * Ask which circumstances apply, and return them.
 *
 * Resolves to null if the window is closed without rolling, which cancels the
 * attack rather than rolling with whatever happened to be ticked.
 */
/**
 * What the player ticked: the circumstances, not the arithmetic.
 *
 * @typedef {object} Choices
 * @property {string[]} attack       Ids of the attack circumstances ticked.
 * @property {string[]} defense      Ids of the defender's circumstances.
 * @property {string}   cover        One cover step, or "" for none.
 * @property {string}   concealment  One concealment step, or "" for none.
 * @property {number}   situational  A modifier the GM called for by hand.
 */

export class Modern20AttackDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  // ApplicationV2 owns `state` and eleven other accessors, so the dialog's own
  // data sits in private fields.
  /** @type {Choices} */
  #choices;
  /** @type {((chosen: Choices|null) => void)|null} */
  #resolve;

  /**
   * @param {any} item                     The weapon or activity being rolled.
   * @param {object} [options]
   * @param {string} [options.activityId]  Which of the item's activities.
   * @param {Partial<Choices>} [options.remembered]  Last round's ticks, so a
   *   second shot from cover does not have to be described again.
   */
  constructor(item, { activityId = "shot", remembered = {} } = {}) {
    super({});
    this.item = item;
    this.activityId = activityId;
    this.#choices = {
      attack: [...(remembered.attack ?? [])],
      defense: [...(remembered.defense ?? [])],
      cover: remembered.cover ?? "",
      concealment: remembered.concealment ?? "",
      situational: remembered.situational ?? 0
    };
  }

  static DEFAULT_OPTIONS = {
    id: "modern20-attack-dialog",
    tag: "form",
    classes: ["modern20", "sheet", "m20-attack-dialog"],
    position: { width: 460 },
    window: { title: "MODERN20.Attack.Circumstances", resizable: true },
    form: {
      handler: Modern20AttackDialog.#onChange,
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      roll: Modern20AttackDialog.#onRoll,
      clear: Modern20AttackDialog.#onClear
    }
  };

  static PARTS = {
    body: { template: "systems/modern20/templates/apps/attack-dialog.hbs", scrollable: [""] }
  };

  /** Show the dialog and wait for the roll, or for it to be dismissed. */
  async prompt() {
    await this.render(true);
    return new Promise((resolve) => { this.#resolve = resolve; });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const ranged = Boolean(this.item.system.ranged);
    const choices = modifierChoices(ranged);
    const totals = resolveModifiers(this.#choices, ranged);

    context.item = this.item;
    context.ranged = ranged;
    context.choices = this.#choices;
    context.situational = this.#choices.situational;

    // Ticked state is resolved here rather than with a helper in the template:
    // a Handlebars block parameter is lexically scoped, so reaching back out
    // of nested blocks to the selection resolves somewhere unexpected.
    const mark = (rows, chosen) => rows.map((row) => ({
      ...row, checked: chosen.includes(row.id)
    }));
    context.attackModifiers = mark(choices.attack, this.#choices.attack);
    context.defenseModifiers = mark(choices.defense, this.#choices.defense);
    context.cover = choices.cover.map((row) => ({
      ...row, selected: row.id === this.#choices.cover
    }));
    context.concealment = choices.concealment.map((row) => ({
      ...row, selected: row.id === this.#choices.concealment
    }));

    context.totals = totals;
    context.attackTotal = totals.attack + Number(this.#choices.situational || 0);
    context.defenseTotal = totals.defense;
    context.missChance = totals.missChance;
    context.any = Boolean(totals.labels.length || this.#choices.situational);
    return context;
  }

  /** @this {Modern20AttackDialog} */
  static async #onChange(event, form, formData) {
    const data = formData.object;
    // Checkbox groups arrive as a single value when only one is ticked.
    const list = (value) => (Array.isArray(value) ? value : value ? [value] : []);
    this.#choices = {
      attack: list(data.attack).filter(Boolean),
      defense: list(data.defense).filter(Boolean),
      cover: data.cover ?? "",
      concealment: data.concealment ?? "",
      situational: Number(data.situational) || 0
    };
    this.render();
  }

  /** @this {Modern20AttackDialog} */
  static async #onClear() {
    this.#choices = { attack: [], defense: [], cover: "", concealment: "", situational: 0 };
    this.render();
  }

  /** @this {Modern20AttackDialog} */
  static async #onRoll() {
    const chosen = this.#choices;
    this.#resolve?.({ ...chosen });
    this.#resolve = null;
    await this.close();
  }

  async close(options) {
    // Dismissed without rolling: cancel rather than roll a set of ticks the
    // player was still looking at.
    this.#resolve?.(null);
    this.#resolve = null;
    return super.close(options);
  }
}
