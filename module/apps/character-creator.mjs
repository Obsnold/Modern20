import { MODERN20 } from "../config.mjs";
import { talentChoices, featChoices, grant, grantNamedFeature, sourceStamp } from "./level-up.mjs";
import { applyOccupationWealth, grantFeatByName } from "./occupation.mjs";
import { skillRows, spendOf, pointsForLevel, rankUpdates } from "./skill-allocation.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { Roll } = foundry.dice;
const { ChatMessage } = foundry.documents;

/**
 * Guided first-level character creation.
 *
 * Follows the shape the mature Foundry systems settled on — a stepped flow
 * where each pick narrows the next — but keeps every step optional and does
 * nothing until Create is pressed, so it never fights a player who would
 * rather build by hand.
 *
 * Class and occupation choices reuse the same code paths as levelling and as
 * dropping an occupation on a sheet, rather than duplicating them here.
 */

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];

// The SRD does not state an ability generation method; these are the
// conventional d20 options, offered rather than assumed.
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const STARTING_FEATS = 2;

export class Modern20CharacterCreator extends HandlebarsApplicationMixin(ApplicationV2) {
  // ApplicationV2 defines a read-only `state` getter for its render state, so
  // the wizard's own state lives in a private field behind its own accessor.
  #choices;

  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this.#choices = {
      method: "array",
      pool: [...STANDARD_ARRAY],
      abilities: Object.fromEntries(ABILITIES.map((a) => [a, 10])),
      occupationId: "",
      occupationSkills: [],
      occupationFeat: "",
      classId: "",
      talentUuid: "",
      ranks: {},
      specialties: {}
    };
  }

  get choices() {
    return this.#choices;
  }

  static DEFAULT_OPTIONS = {
    id: "modern20-character-creator",
    // Without tag "form" this.form is null, so ApplicationV2 never binds the
    // change listener and nothing the player picks would reach the state.
    tag: "form",
    classes: ["modern20", "sheet", "m20-creator"],
    position: { width: 720, height: 720 },
    window: { title: "MODERN20.Creator.Title", resizable: true },
    form: {
      handler: Modern20CharacterCreator.#onChange,
      submitOnChange: true,
      closeOnSubmit: false
    },
    actions: {
      addSubject: Modern20CharacterCreator.#onAddSubject,
      rollAbilities: Modern20CharacterCreator.#onRollAbilities,
      resetAbilities: Modern20CharacterCreator.#onResetAbilities,
      create: Modern20CharacterCreator.#onCreate
    }
  };

  static PARTS = {
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    abilities: { template: "systems/modern20/templates/creator/abilities.hbs", scrollable: [""] },
    occupation: { template: "systems/modern20/templates/creator/occupation.hbs", scrollable: [""] },
    heroclass: { template: "systems/modern20/templates/creator/class.hbs", scrollable: [""] },
    skills: { template: "systems/modern20/templates/creator/skills.hbs", scrollable: [""] },
    review: { template: "systems/modern20/templates/creator/review.hbs", scrollable: [""] }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "abilities", icon: "fa-solid fa-dice-d6" },
        { id: "occupation", icon: "fa-solid fa-briefcase" },
        { id: "heroclass", icon: "fa-solid fa-user-shield" },
        { id: "skills", icon: "fa-solid fa-list-check" },
        { id: "review", icon: "fa-solid fa-clipboard-check" }
      ],
      initial: "abilities",
      labelPrefix: "MODERN20.Creator.Tab"
    }
  };

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (context.tabs && partId in context.tabs) context.tab = context.tabs[partId];
    return context;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const state = this.#choices;

    context.actor = this.actor;
    context.config = MODERN20;
    context.choices = state;

    context.abilityRows = ABILITIES.map((key) => ({
      key,
      label: game.i18n.localize(MODERN20.abilities[key]),
      value: state.abilities[key],
      mod: Math.floor((state.abilities[key] - 10) / 2)
    }));

    context.methods = [
      { id: "array", label: game.i18n.localize("MODERN20.Creator.MethodArray") },
      { id: "roll", label: game.i18n.localize("MODERN20.Creator.MethodRoll") },
      { id: "manual", label: game.i18n.localize("MODERN20.Creator.MethodManual") }
    ];
    context.showPool = state.method !== "manual";
    context.pool = state.pool;

    context.occupations = await this.#compendiumChoices("modern20.occupations");
    context.classes = (await this.#compendiumChoices("modern20.classes"))
      .filter((c) => c.tier === "basic");

    context.chosenOccupation = context.occupations.find((o) => o.id === state.occupationId) ?? null;
    context.chosenClass = context.classes.find((c) => c.id === state.classId) ?? null;

    // The occupation's own choices, shown on the same step rather than in a
    // dialog after the fact.
    if (context.chosenOccupation) {
      const pack = game.packs.get("modern20.occupations");
      const document = await pack?.getDocument(state.occupationId);
      // An option naming several subjects is several choices: "Knowledge
      // (arcane lore, art, ...)" lets the player pick one of those, not all.
      context.occupationSkillOptions = (document?.system.skillOptions ?? []).flatMap((option) => {
        const subjects = option.specialties ?? [];
        if (!subjects.length) return [{ ...option, value: option.skill, label: option.label }];
        const skillLabel = game.i18n.localize(MODERN20.skills[option.skill]?.label ?? option.skill);
        return subjects.map((subject) => ({
          ...option,
          value: `${option.skill}:${subject}`,
          label: `${skillLabel} (${subject})`
        }));
      });
      context.occupationSkillCount = document?.system.skillChoiceCount ?? 0;
      context.occupationFeatOptions = document?.system.bonusFeatOptions ?? [];
      context.occupationSkillsPicked = state.occupationSkills.length;
    }

    // A basic class grants a talent at level 1, so offer it here too.
    if (context.chosenClass) {
      const pack = game.packs.get("modern20.classes");
      const document = await pack?.getDocument(state.classId);
      context.classTalents = document ? await talentChoices(this.actor, document) : [];
      context.classFeatures = document?.system.progression?.find((r) => r.level === 1)?.features ?? [];
    }
    const granted = new Set(state.occupationSkills);
    // A ticked subject needs a row in the skills table to receive ranks.
    for (const entry of state.occupationSkills) {
      const [skill, subject] = entry.split(":");
      if (!subject) continue;
      state.specialties[skill] ??= {};
      state.specialties[skill][subject] ??= 0;
    }
    if (context.chosenClass) {
      const pack = game.packs.get("modern20.classes");
      const document = await pack?.getDocument(state.classId);
      for (const g of document?.system.classSkills ?? []) {
        granted.add(g.specialty ? `${g.skill}:${g.specialty}` : g.skill);
        // Class-granted subjects need a row to receive ranks.
        if (g.specialty) {
          state.specialties[g.skill] ??= {};
          state.specialties[g.skill][g.specialty] ??= 0;
        }
      }
      context.skillBudget = pointsForLevel(
        document?.system.skillPointsPerLevel ?? 0,
        Math.floor((state.abilities.int - 10) / 2),
        { firstLevelEver: true }
      );
    } else {
      context.skillBudget = 0;
    }

    context.skillRows = skillRows(this.actor, {
      grantedSkills: granted,
      pending: state.ranks,
      pendingSpecialties: state.specialties,
      characterLevel: 1
    });
    context.spent = spendOf(context.skillRows);
    context.budget = context.skillBudget;
    context.overBudget = context.spent > context.budget;

    context.startingFeats = STARTING_FEATS;
    context.ready = Boolean(state.classId);

    return context;
  }

  /** Entries from a compendium, or an empty list if it is not installed. */
  async #compendiumChoices(packId) {
    const pack = game.packs.get(packId);
    if (!pack) return [];
    const documents = await pack.getDocuments();
    return documents
      .map((d) => ({
        id: d.id,
        uuid: d.uuid,
        name: d.name,
        tier: d.system.tier,
        keyAbility: d.system.keyAbility,
        hitDie: d.system.hitDie,
        skillPoints: d.system.skillPointsPerLevel,
        wealthBonus: d.system.wealthBonus,
        summary: d.system.description || ""
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Add a subject to a skill taken per subject — Knowledge (Streetwise), or a
   * language. The subject appears as its own row with its own ranks, because
   * the SRD treats each as a separate skill.
   */
  static #onAddSubject(event, target) {
    const key = target.dataset.skill;
    const input = target.closest("tr")?.querySelector(".m20-subject");
    const name = (input?.value ?? "").trim();
    if (!name) {
      ui.notifications.warn(game.i18n.localize("MODERN20.Skills.NeedSubject"));
      return;
    }

    const pending = this.#choices.specialties;
    pending[key] ??= {};
    if (pending[key][name] === undefined) pending[key][name] = 0;
    this.render();
  }

  static async #onChange(event, form, formData) {
    const data = formData.object;
    const state = this.#choices;

    if (data.method && data.method !== state.method) {
      state.method = data.method;
      if (state.method === "array") state.pool = [...STANDARD_ARRAY];
      if (state.method === "manual") state.pool = [];
    }
    for (const key of ABILITIES) {
      if (data[`abilities.${key}`] !== undefined) {
        state.abilities[key] = Number(data[`abilities.${key}`]) || 0;
      }
    }
    if (data.occupationId !== undefined && data.occupationId !== state.occupationId) {
      state.occupationId = data.occupationId;
      // A different occupation offers different skills, so old picks are void.
      state.occupationSkills = [];
      state.occupationFeat = "";
    }
    if (data.classId !== undefined && data.classId !== state.classId) {
      state.classId = data.classId;
      state.talentUuid = "";
    }
    if (data.occupationFeat !== undefined) state.occupationFeat = data.occupationFeat;
    if (data.talentUuid !== undefined) state.talentUuid = data.talentUuid;
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith("specialty.")) {
        const [, skill, ...rest] = key.split(".");
        const name = rest.join(".");
        const ranks = Math.max(0, Number(value) || 0);
        state.specialties[skill] ??= {};
        state.specialties[skill][name] = ranks;
        continue;
      }
      if (key.startsWith("rank.")) {
        const skill = key.slice("rank.".length);
        const ranks = Math.max(0, Number(value) || 0);
        if (ranks) state.ranks[skill] = ranks;
        else delete state.ranks[skill];
      }
    }
    if (data.occupationSkill !== undefined) {
      const picked = Array.isArray(data.occupationSkill) ? data.occupationSkill : [data.occupationSkill];
      state.occupationSkills = picked.filter(Boolean);
    }

    this.render();
  }

  /** 4d6 keep highest three, six times — the conventional d20 method. */
  static async #onRollAbilities() {
    const results = [];
    for (let i = 0; i < ABILITIES.length; i++) {
      const roll = await new Roll("4d6dl1").evaluate();
      results.push(roll.total);
    }
    results.sort((a, b) => b - a);
    this.#choices.method = "roll";
    this.#choices.pool = results;
    // Seed the scores in rolled order; the player reassigns from the selects.
    ABILITIES.forEach((key, index) => { this.#choices.abilities[key] = results[index]; });
    this.render();
  }

  static #onResetAbilities() {
    this.#choices.method = "array";
    this.#choices.pool = [...STANDARD_ARRAY];
    ABILITIES.forEach((key, index) => { this.#choices.abilities[key] = STANDARD_ARRAY[index]; });
    this.render();
  }

  /**
   * Apply the choices. Abilities first, so the class level's hit points and
   * skill budget see the final Constitution and Intelligence.
   */
  static async #onCreate() {
    const actor = this.actor;
    const state = this.#choices;
    if (!state.classId) {
      ui.notifications.warn(game.i18n.localize("MODERN20.Creator.NeedClass"));
      return;
    }

    const abilities = Object.fromEntries(
      ABILITIES.map((key) => [`system.abilities.${key}.value`, state.abilities[key]])
    );
    await actor.update(abilities);

    if (state.occupationId) {
      const pack = game.packs.get("modern20.occupations");
      const occupation = await pack?.getDocument(state.occupationId);
      if (occupation) {
        const source = occupation.toObject();
        // Picks made on the Occupation step travel with the item.
        source.system.skillsChosen = state.occupationSkills;
        source.system.bonusFeatChosen = state.occupationFeat;
        const [created] = await actor.createEmbeddedDocuments("Item", [source]);
        await applyOccupationWealth(actor, created);
        if (state.occupationFeat) await grantFeatByName(actor, state.occupationFeat);
      }
    }

    const classPack = game.packs.get("modern20.classes");
    const heroClass = await classPack?.getDocument(state.classId);
    if (!heroClass) return;

    const source = heroClass.toObject();
    source.system.levels = 1;
    const [created] = await actor.createEmbeddedDocuments("Item", [source]);

    // A character's very first level takes the maximum hit die rather than
    // rolling; the SRD reserves rolling for picking up a new class later.
    const faces = Number(String(created.system.hitDie).match(/d(\d+)/i)?.[1]) || 8;
    const conMod = Math.floor((state.abilities.con - 10) / 2);
    const gained = Math.max(1, faces + conMod);
    await actor.update({ "system.hp.max": gained, "system.hp.value": gained });

    const granted = [];
    const talent = await grant(actor, state.talentUuid, sourceStamp({
      origin: "creation",
      label: game.i18n.format("MODERN20.Source.ClassLevel", { name: created.name, level: 1 }),
      characterLevel: 1
    }));
    if (talent) granted.push(talent.name);

    const features = created.system.progression?.find((r) => r.level === 1)?.features ?? [];
    for (const feature of features) {
      if (/^talents?$/i.test(feature) || /bonus feat/i.test(feature)) continue;
      const item = await grantNamedFeature(actor, created, feature, 1);
      if (item) granted.push(item.name);
    }

    const ranks = rankUpdates(actor, state.ranks, state.specialties);
    if (Object.keys(ranks).length) await actor.update(ranks);

    const spentRanks = Object.entries(state.ranks)
      .filter(([, added]) => added)
      .map(([key, added]) => `${game.i18n.localize(MODERN20.skills[key].label)} +${added}`);
    for (const [key, subjects] of Object.entries(state.specialties)) {
      for (const [name, added] of Object.entries(subjects)) {
        if (added) spentRanks.push(`${game.i18n.localize(MODERN20.skills[key].label)} (${name}) +${added}`);
      }
    }

    await actor.update({
      "system.advancement": [{
        characterLevel: 1,
        className: created.name,
        classLevel: 1,
        hitPoints: gained,
        gained: [...granted, ...spentRanks],
        note: game.i18n.localize("MODERN20.Source.Created"),
        at: new Date().toISOString()
      }]
    });

    if (actor.system.actionPoints) {
      await actor.update({ "system.actionPoints.value": actor.system.actionPoints.max });
    }

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: game.i18n.format("MODERN20.Creator.Flavor", { name: created.name }),
      content: `<p>${game.i18n.format("MODERN20.LevelUp.HitPointsGained", {
        gained, rolled: game.i18n.localize("MODERN20.LevelUp.Maximum"),
        con: conMod >= 0 ? `+${conMod}` : conMod
      })}</p>${granted.length ? `<p>${game.i18n.format("MODERN20.LevelUp.Granted", {
        names: granted.join(", ")
      })}</p>` : ""}`
    });

    ui.notifications.info(game.i18n.format("MODERN20.Creator.Done", {
      name: actor.name, feats: STARTING_FEATS
    }));
    this.close();
    actor.sheet.render(true);
  }
}
