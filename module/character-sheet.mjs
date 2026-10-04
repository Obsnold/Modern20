/**
 * The character sheet: abilities, combat, skills, classes and everything a
 * character owns, editable.
 *
 * Only what a player decides is stored (scores, ranks, levels, hit point
 * rolls); every total on the sheet is the actor's derived data
 * (rules/character.mjs). Items are added by dragging them from a compendium
 * or the sidebar onto the sheet, which ActorSheetV2 handles.
 */
import { ABILITIES } from "./data/models.mjs";
import { SKILLS } from "./data/skills.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const { TextEditor } = foundry.applications.ux;

const ABILITY_NAMES = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
const SAVE_NAMES = { fort: "Fortitude", ref: "Reflex", will: "Will" };
const signed = (n) => (n === null || n === undefined ? "—" : n >= 0 ? `+${n}` : `${n}`);

/** The lists on the Feats and Gear tabs: which item types go in each, in order. */
const LISTS = {
  feats: [["talent", "Talents"], ["feat", "Feats"], ["occupation", "Occupation"], ["species", "Species"]],
  gear: [["weapon", "Weapons"], ["armor", "Armor"], ["equipment", "Equipment"], ["ammunition", "Ammunition"]],
  magic: [["spell", "Spells"], ["power", "Psionic Powers"], ["incantation", "Incantations"]],
};

export class Modern20CharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["modern20", "sheet", "actor", "character"],
    position: { width: 760, height: 780 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      editItem: Modern20CharacterSheet.#onEditItem,
      deleteItem: Modern20CharacterSheet.#onDeleteItem,
      toggleEquipped: Modern20CharacterSheet.#onToggleEquipped,
      addSpecialty: Modern20CharacterSheet.#onAddSpecialty,
      removeSpecialty: Modern20CharacterSheet.#onRemoveSpecialty,
    },
  };

  static PARTS = {
    header: { template: "systems/modern20/templates/character/header.hbs" },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: "systems/modern20/templates/character/main.hbs", scrollable: [""] },
    skills: { template: "systems/modern20/templates/character/skills.hbs", scrollable: [""] },
    feats: { template: "systems/modern20/templates/character/items.hbs", scrollable: [""] },
    gear: { template: "systems/modern20/templates/character/items.hbs", scrollable: [""] },
    magic: { template: "systems/modern20/templates/character/items.hbs", scrollable: [""] },
    details: { template: "systems/modern20/templates/character/details.hbs", scrollable: [""] },
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "main", label: "Main", icon: "fa-solid fa-user" },
        { id: "skills", label: "Skills", icon: "fa-solid fa-list-check" },
        { id: "feats", label: "Feats & Talents", icon: "fa-solid fa-star" },
        { id: "gear", label: "Gear", icon: "fa-solid fa-box-open" },
        { id: "magic", label: "Magic & Psionics", icon: "fa-solid fa-wand-sparkles" },
        { id: "details", label: "Details", icon: "fa-solid fa-book" },
      ],
      initial: "main",
    },
  };

  /**
   * Each part gets its own tab context: ApplicationV2 fills `context.tabs`
   * for the tab bar, but without this the panels render with no data-tab and
   * stay hidden (found on main).
   */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (context.tabs && partId in context.tabs) context.tab = context.tabs[partId];
    if (partId in LISTS) context.lists = context.itemLists[partId];
    return context;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system;
    const d = system.derived ?? {};
    const items = actor.items.contents;
    const ofType = (t) => items.filter((i) => i.type === t).sort((a, b) => a.sort - b.sort);
    const species = ofType("species")[0];

    const abilities = ABILITIES.map((a) => ({
      key: a, label: ABILITY_NAMES[a], value: system.abilities[a].value,
      adjustment: species?.system.abilities?.[a] ? signed(species.system.abilities[a]) : "",
      score: d.scores?.[a] ?? "—", modifier: signed(d.modifiers?.[a]),
    }));

    const classes = ofType("class").map((c) => ({
      id: c.id, name: c.name, img: c.img, level: c.system.level, hitDie: c.system.hitDie, max: c.system.maxLevel,
      rolls: Array.from({ length: c.system.level }, (_, i) => ({ index: i, value: c.system.hitPoints[i] ?? "" })),
    }));

    // Skills: the derived rows, grouped so a specialty skill sits under its skill's name.
    const skills = [];
    let last = "";
    for (const row of d.skills ?? []) {
      const def = SKILLS[row.key];
      if (def.specialties && last !== row.key) skills.push({ header: true, key: row.key, name: def.name });
      skills.push({ ...row, label: row.specialty ? `${row.name} (${row.specialty})` : row.name, total: signed(row.total), path: row.specialty ? null : `system.skills.${row.key}` });
      last = row.key;
    }
    for (const [key, def] of Object.entries(SKILLS)) {
      if (def.specialties && !skills.some((s) => s.header && s.key === key)) skills.push({ header: true, key, name: def.name });
    }
    const specialtyIndex = new Map(system.specialtySkills.map((s, i) => [`${s.skill}:${s.specialty}`, i]));
    for (const s of skills) if (s.specialty) s.index = specialtyIndex.get(`${s.key}:${s.specialty}`);

    const itemLists = Object.fromEntries(Object.entries(LISTS).map(([tab, groups]) => [tab, groups.map(([type, label]) => ({
      type, label,
      items: ofType(type).map((i) => ({ id: i.id, name: i.name, img: i.img, equipped: i.system.equipped, physical: "equipped" in i.system, detail: detail(i) })),
    }))]));

    Object.assign(context, {
      actor, system, d,
      abilities,
      saves: Object.entries(SAVE_NAMES).map(([k, label]) => ({ key: k, label, total: signed(d.saves?.[k]), base: signed(d.baseSaves?.[k]) })),
      combat: {
        bab: signed(d.baseAttackBonus), initiative: signed(d.initiative), grapple: signed(d.grapple),
        defense: d.defense ?? {}, reputation: signed(d.reputation), massiveDamage: d.massiveDamage ?? "—",
        hpMax: d.hitPoints?.max ?? 0, hpEstimated: d.hitPoints?.estimated,
      },
      summary: (d.classes ?? []).map((c) => `${c.name} ${c.level}`).join(" / ") || "No class",
      size: d.size ? d.size[0].toUpperCase() + d.size.slice(1) : "Medium",
      classes,
      skills,
      specialtyChoices: Object.entries(SKILLS).filter(([, s]) => s.specialties).map(([key, s]) => ({ key, name: s.name, specialties: s.specialties })),
      itemLists,
      enrichedBiography: await TextEditor.implementation.enrichHTML(system.details.biography, { relativeTo: actor, secrets: actor.isOwner }),
      biographyField: system.schema.fields.details.fields.biography,
    });
    return context;
  }

  /** Fields on an owned item (a class's level, a hit point roll) save to that item. */
  _onRender(context, options) {
    super._onRender(context, options);
    for (const input of this.element.querySelectorAll("[data-item-field]")) {
      input.addEventListener("change", (event) => this.#updateItemField(event));
    }
  }

  async #updateItemField(event) {
    event.stopPropagation();
    const input = event.currentTarget;
    const item = this.document.items.get(input.closest("[data-item-id]").dataset.itemId);
    if (!item) return;
    const field = input.dataset.itemField;
    const value = input.value === "" ? null : Number(input.value);
    if (field === "hitPoints") {
      // One roll per level, in order; a level not yet rolled is empty and counts the average.
      const index = Number(input.dataset.index);
      const rolls = Array.from({ length: Math.max(item.system.hitPoints.length, index + 1) }, (_, i) => item.system.hitPoints[i] ?? null);
      rolls[index] = value;
      await item.update({ "system.hitPoints": rolls });
    } else if (field === "level") {
      await item.update({ "system.level": Math.max(1, Math.min(value ?? 1, item.system.maxLevel || 10)) });
    }
  }

  #item(target) {
    return this.document.items.get(target.closest("[data-item-id]")?.dataset.itemId);
  }

  static #onEditItem(event, target) {
    this.#item(target)?.sheet.render(true);
  }

  static async #onDeleteItem(event, target) {
    await this.#item(target)?.deleteDialog();
  }

  static async #onToggleEquipped(event, target) {
    const item = this.#item(target);
    if (item) await item.update({ "system.equipped": !item.system.equipped });
  }

  static async #onAddSpecialty(event, target) {
    const row = target.closest("[data-skill]");
    const specialty = row.querySelector(".m20-new-specialty")?.value.trim();
    if (!specialty) return;
    const list = [...this.document.system.toObject().specialtySkills];
    if (list.some((s) => s.skill === row.dataset.skill && s.specialty === specialty)) return;
    list.push({ skill: row.dataset.skill, specialty, ranks: 0, misc: 0 });
    await this.document.update({ "system.specialtySkills": list });
  }

  static async #onRemoveSpecialty(event, target) {
    const index = Number(target.dataset.index);
    const list = this.document.system.toObject().specialtySkills.filter((_, i) => i !== index);
    await this.document.update({ "system.specialtySkills": list });
  }
}

/** A line of detail for an item in a list: what a player would want to see without opening it. */
function detail(item) {
  const s = item.system;
  switch (item.type) {
    case "weapon": return [s.damage?.value, s.critical && `crit ${s.critical}`, s.damageType, s.rangeIncrement?.value !== "—" && s.rangeIncrement?.value].filter(Boolean).join(", ");
    case "armor": return [s.equipmentBonus && `+${s.equipmentBonus} Defense`, s.maxDex !== null && `max Dex +${s.maxDex}`, s.armorPenalty && `penalty ${s.armorPenalty}`].filter(Boolean).join(", ");
    case "talent": return [s.className, s.tree].filter(Boolean).join(": ");
    case "feat": return s.prerequisites;
    case "spell": case "power": return (s.levels ?? []).map((l) => `${l.class} ${l.level}`).join(", ");
    case "species": return `${s.size}, speed ${s.speed} ft.`;
    default: return s.weight?.value ? `${s.weight.value}` : "";
  }
}
