/**
 * The creature sheet: the read-only view of the stat block (document-sheet.mjs),
 * with its current hit points and conditions, rolls from its printed bonuses and
 * its log; and, for a creature in the world, an edit view of the whole stat block.
 */
import { describe, Editable } from "./document-sheet.mjs";
import { creatureRolls } from "../roll.mjs";
import { logContext } from "../log.mjs";
import { creatureParts } from "../rules/creature.mjs";
import { readAttacks, attackRows } from "../rules/attacks.mjs";
import { SYSTEM_ID } from "../config.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class Modern20CreatureSheet extends Editable(HandlebarsApplicationMixin(ActorSheetV2)) {
  static DEFAULT_OPTIONS = {
    classes: ["modern20", "sheet", "actor"],
    position: { width: 640, height: 720 },
    window: { resizable: true },
    actions: {
      rollAbility: Modern20CreatureSheet.#onRollAbility,
      rollSave: Modern20CreatureSheet.#onRollSave,
      rollSkill: Modern20CreatureSheet.#onRollSkill,
      rollCreatureAttack: Modern20CreatureSheet.#onRollAttack,
      rollCreatureDamage: Modern20CreatureSheet.#onRollDamage,
      filterLog: Modern20CreatureSheet.#onFilterLog,
      toggleCondition: Modern20CreatureSheet.#onToggleCondition,
      buildCharacter: Modern20CreatureSheet.#onBuildCharacter,
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
      // The printed Attack and Full Attack lines, each attack with a button per attack bonus and one for damage.
      attacks: [["attack", "Attack"], ["fullAttack", "Full attack"]]
        .map(([line, label]) => ({ label, choices: attackRows(line, readAttacks(s[line])) }))
        .filter((a) => a.choices.length),
    };
    context.log = logContext(this.document, this.logFilter);
    // Current hit points (a fresh creature is at its maximum) and the conditions it is in, as the token HUD sets them.
    if (!this.document.pack) context.status = conditionStatus(this.document, s.hp.value ?? s.hp.max, s.hp.max);
    context.canBuild = !!(s.type?.uuid || s.example?.base?.uuid) && Actor.implementation.canUserCreate(game.user);
    return context;
  }

  /** Which of the log's entries are shown: all, build or session. */
  logFilter = "all";
  static #onFilterLog(event, target) {
    this.logFilter = target.dataset.filter;
    this.render();
  }

  static #onRollAbility(event, target) { return creatureRolls(this.document).ability(target.dataset.ability, event); }
  static #onRollSave(event, target) { return creatureRolls(this.document).save(target.dataset.save, event); }
  static async #onToggleCondition(event, target) {
    if (this.isEditable) await this.document.toggleStatusEffect(target.dataset.condition);
  }

  static #onRollAttack(event, target) {
    const row = target.closest("[data-line]").dataset;
    return creatureRolls(this.document).attack(row.line, Number(row.choice), Number(row.index), Number(target.dataset.bonus), event);
  }
  static #onRollDamage(event, target) {
    const row = target.closest("[data-line]").dataset;
    return creatureRolls(this.document).damage(row.line, Number(row.choice), Number(row.index));
  }
  static #onRollSkill(event, target) { return creatureRolls(this.document).skill(Number(target.dataset.index), event); }

  /**
   * A character with this creature's parts (rules/creature.mjs): its type at its Hit Dice, its
   * scores, feats and talents, and a worked example's class levels, made in the world and opened.
   */
  static async #onBuildCharacter() {
    const creature = this.document;
    const base = creature.system.example?.classed ? await fromUuid(creature.system.example.base.uuid) : null;
    const classPack = game.packs.get(`${SYSTEM_ID}.classes`);
    const classIndex = await classPack.getIndex();
    const parts = creatureParts(creature, { base, classNames: classIndex.map((c) => c.name) });

    const items = [];
    const missing = [];
    const add = async (uuid, system = {}) => {
      const item = await fromUuid(uuid);
      if (!item) return missing.push(uuid);
      const data = item.toObject();
      delete data._id;
      foundry.utils.mergeObject(data, { system, "_stats.compendiumSource": item.uuid });
      items.push(data);
    };
    if (parts.type) await add(parts.type.uuid, { count: parts.type.count });
    for (const [name, level] of Object.entries(parts.classes)) {
      const entry = classIndex.find((c) => c.name === name);
      if (entry) await add(entry.uuid, { level }); else missing.push(name);
    }
    // A feat taken more than once (Weapon Finesse for bite, claw and gore) is one item per choice.
    for (const { uuid, choice } of parts.items) await add(uuid, choice ? { choice } : {});

    const actor = await Actor.implementation.create({
      name: parts.name, img: parts.img, type: "character", system: parts.system, items,
      // The creature's token: its art, size and scale, and whose side it is on.
      prototypeToken: (({ texture, width, height, disposition }) => ({ texture, width, height, disposition }))(creature.prototypeToken.toObject()),
    });
    if (missing.length) ui.notifications.warn(`${actor.name}: could not find ${missing.join(", ")}.`);
    actor?.sheet.render(true);
  }
}

/** Hit points and every condition, marked when the actor is in it: the strip at the top of a sheet. */
export function conditionStatus(actor, hp, max) {
  return {
    hp, max,
    conditions: CONFIG.statusEffects.map((e) => ({ id: e.id, name: game.i18n.localize(e.name), img: e.img, active: actor.statuses.has(e.id) })),
  };
}
