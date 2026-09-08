import { MODERN20 } from "../config.mjs";
import { talentChoices, featChoices, grant, grantNamedFeature } from "./level-up.mjs";
import { skillRows, spendOf, pointsForLevel, rankUpdates } from "./skill-allocation.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { Roll } = foundry.dice;
const { ChatMessage } = foundry.documents;

/**
 * A single level-up screen: what the level grants, what has to be chosen, and
 * what the numbers become — reviewed together and applied on confirm.
 *
 * Replaces a chain of separate dialogs, which gave no sense of the whole and
 * no way back once a prompt had been answered. Nothing is written until
 * Confirm, so closing the window leaves the character untouched.
 */

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const FEAT_EVERY = 3;
const ABILITY_INCREASE_EVERY = 4;

/** The cumulative progression row at or below a level. */
function rowAt(progression, level) {
  const empty = { baseAttack: 0, fort: 0, ref: 0, will: 0, defense: 0, reputation: 0, features: [] };
  if (level < 1 || !progression.length) return empty;
  const rows = [...progression].sort((a, b) => a.level - b.level);
  return rows.reduce((best, r) => (r.level <= level ? r : best), empty);
}

export class Modern20LevelUpScreen extends HandlebarsApplicationMixin(ApplicationV2) {
  // ApplicationV2 owns `state`, `title`, `id` and nine other accessors, so the
  // screen's own data sits in a private field.
  #plan;

  constructor(actor, classItem, options = {}) {
    super(options);
    this.actor = actor;
    this.classItem = classItem;

    const from = classItem.system.levels;
    const to = from + 1;
    this.#plan = {
      from,
      to,
      characterLevel: actor.system.details.level + 1,
      talentUuid: "",
      classFeatUuid: "",
      generalFeatUuid: "",
      ability: "str",
      hitPoints: null,
      ranks: {}
    };
  }

  get plan() {
    return this.#plan;
  }

  static DEFAULT_OPTIONS = {
    id: "modern20-level-up",
    tag: "form",
    classes: ["modern20", "sheet", "m20-creator"],
    position: { width: 640, height: 700 },
    window: { title: "MODERN20.LevelScreen.Title", resizable: true },
    form: {
      handler: Modern20LevelUpScreen.#onChange,
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      rollHitPoints: Modern20LevelUpScreen.#onRollHitPoints,
      confirm: Modern20LevelUpScreen.#onConfirm
    }
  };

  static PARTS = {
    body: { template: "systems/modern20/templates/creator/level-up.hbs", scrollable: [""] }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const { actor, classItem } = this;
    const plan = this.#plan;

    const before = rowAt(classItem.system.progression, plan.from);
    const after = rowAt(classItem.system.progression, plan.to);
    const delta = (field) => after[field] - before[field];

    context.config = MODERN20;
    context.actor = actor;
    context.classItem = classItem;
    context.plan = plan;
    context.features = after.features ?? [];

    // What the level grants that has to be chosen.
    context.needsTalent = context.features.some((f) => /^talents?$/i.test(f));
    context.needsClassFeat = context.features.some((f) => /bonus feat/i.test(f));
    context.namedFeatures = context.features.filter(
      (f) => !/^talents?$/i.test(f) && !/bonus feat/i.test(f)
    );
    context.needsGeneralFeat = plan.characterLevel % FEAT_EVERY === 0;
    context.needsAbility = plan.characterLevel % ABILITY_INCREASE_EVERY === 0;

    context.talents = context.needsTalent ? await talentChoices(actor, classItem) : [];
    context.feats = (context.needsClassFeat || context.needsGeneralFeat)
      ? await featChoices(actor)
      : [];

    context.abilityRows = ABILITIES.map((key) => ({
      key,
      label: game.i18n.localize(MODERN20.abilities[key]),
      value: actor.system.abilities[key].value
    }));

    const faces = Number(String(classItem.system.hitDie).match(/d(\d+)/i)?.[1]) || 8;
    const conMod = actor.system.abilities.con.mod;
    context.hitDie = classItem.system.hitDie;
    context.conMod = conMod;
    context.rolledHitPoints = plan.hitPoints;
    context.hitPointRange = `1-${faces} ${conMod >= 0 ? "+" : "-"} ${Math.abs(conMod)}`;

    // Before and after, so the change is legible rather than implied.
    context.preview = [
      { label: "MODERN20.BaseAttack", before: actor.system.attributes.baseAttack, delta: delta("baseAttack") },
      { label: "MODERN20.Defense", before: actor.system.defense.value, delta: delta("defense") },
      { label: "MODERN20.Save.Fort", before: actor.system.saves.fort.value, delta: delta("fort") },
      { label: "MODERN20.Save.Ref", before: actor.system.saves.ref.value, delta: delta("ref") },
      { label: "MODERN20.Save.Will", before: actor.system.saves.will.value, delta: delta("will") },
      { label: "MODERN20.Reputation", before: actor.system.reputation.value, delta: delta("reputation") }
    ].map((row) => ({ ...row, after: row.before + row.delta }));

    // Skill points for this level, spendable here rather than on the sheet.
    const granted = new Set();
    for (const item of actor.items) {
      if (item.type === "class") for (const key of item.system.classSkills ?? []) granted.add(key);
      if (item.type === "occupation") for (const key of item.system.skillsChosen ?? []) granted.add(key);
    }
    context.skillRows = skillRows(actor, {
      grantedSkills: granted,
      pending: plan.ranks,
      characterLevel: plan.characterLevel
    });
    context.spent = spendOf(context.skillRows);
    context.budget = pointsForLevel(
      classItem.system.skillPointsPerLevel,
      actor.system.abilities.int.mod
    );
    context.overBudget = context.spent > context.budget;

    context.pastTable = plan.to > classItem.system.maxProgressionLevel
      && classItem.system.maxProgressionLevel > 0;

    return context;
  }

  static async #onChange(event, form, formData) {
    const data = formData.object;
    const plan = this.#plan;
    for (const key of ["talentUuid", "classFeatUuid", "generalFeatUuid", "ability"]) {
      if (data[key] !== undefined) plan[key] = data[key];
    }
    for (const [key, value] of Object.entries(data)) {
      if (!key.startsWith("rank.")) continue;
      const skill = key.slice("rank.".length);
      const ranks = Math.max(0, Number(value) || 0);
      if (ranks) plan.ranks[skill] = ranks;
      else delete plan.ranks[skill];
    }
    this.render();
  }

  /** Roll now so the result is visible before committing to the level. */
  static async #onRollHitPoints() {
    const faces = Number(String(this.classItem.system.hitDie).match(/d(\d+)/i)?.[1]) || 8;
    const roll = await new Roll(`1d${faces}`).evaluate();
    const conMod = this.actor.system.abilities.con.mod;
    this.#plan.hitPoints = { rolled: roll.total, gained: Math.max(1, roll.total + conMod), roll };
    this.render();
  }

  /** Apply everything at once. Closing without confirming changes nothing. */
  static async #onConfirm() {
    const { actor, classItem } = this;
    const plan = this.#plan;

    if (!plan.hitPoints) await Modern20LevelUpScreen.#onRollHitPoints.call(this);
    const { rolled, gained, roll } = plan.hitPoints;

    await classItem.update({ "system.levels": plan.to });

    const hp = actor.system.hp;
    await actor.update({
      "system.hp.max": hp.max + gained,
      "system.hp.value": hp.value + gained
    });

    const granted = [];
    for (const uuid of [plan.talentUuid, plan.classFeatUuid, plan.generalFeatUuid]) {
      const item = await grant(actor, uuid);
      if (item) granted.push(item.name);
    }

    const after = rowAt(classItem.system.progression, plan.to);
    for (const feature of (after.features ?? [])) {
      if (/^talents?$/i.test(feature) || /bonus feat/i.test(feature)) continue;
      const item = await grantNamedFeature(actor, classItem, feature, plan.to);
      if (item) granted.push(item.name);
    }

    if (plan.characterLevel % ABILITY_INCREASE_EVERY === 0 && plan.ability) {
      const current = actor.system.abilities[plan.ability].value;
      await actor.update({ [`system.abilities.${plan.ability}.value`]: current + 1 });
    }

    const ranks = rankUpdates(actor, plan.ranks);
    if (Object.keys(ranks).length) await actor.update(ranks);

    // Action points are granted afresh at each level rather than accumulated.
    if (actor.system.actionPoints) {
      await actor.update({ "system.actionPoints.value": actor.system.actionPoints.max });
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: game.i18n.format("MODERN20.LevelScreen.Flavor", {
        name: classItem.name, level: plan.to
      }),
      content: `<p>${game.i18n.format("MODERN20.LevelUp.HitPointsGained", {
        gained, rolled, con: this.actor.system.abilities.con.mod >= 0
          ? `+${this.actor.system.abilities.con.mod}` : this.actor.system.abilities.con.mod
      })}</p>${granted.length ? `<p>${game.i18n.format("MODERN20.LevelUp.Granted", {
        names: granted.join(", ")
      })}</p>` : ""}`,
      rolls: roll ? [roll] : []
    });

    this.close();
    actor.sheet.render(true);
  }
}
