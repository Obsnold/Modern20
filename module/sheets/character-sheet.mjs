/**
 * The character sheet: abilities, combat, skills, classes and everything a
 * character owns, editable.
 *
 * Only what a player decides is stored (scores, ranks, levels, hit point
 * rolls); every total on the sheet is the actor's derived data
 * (rules/character.mjs). Items are added by dragging them from a compendium
 * or the sidebar onto the sheet, which ActorSheetV2 handles.
 */
import { ABILITIES, ACTOR_MODELS, SIZES } from "../data/models.mjs";
import { initial, obj } from "../data/schema.mjs";
import { mergeIndexed, castNumbers } from "./edit-form.mjs";
import { SKILLS } from "../data/skills.mjs";
import { characterRolls, notesOf } from "../roll.mjs";
import { CHOICES, chooses } from "../rules/choices.mjs";
import { logContext } from "../log.mjs";
import { identify } from "../rules/identify.mjs";
import { restHealing } from "../rules/damage.mjs";
import { financialCondition } from "../rules/wealth.mjs";
import { applyToActor, rollSave, stabiliseWithHelp } from "../damage.mjs";
import { buy, sell, rollStartingWealth, regainWealth } from "../wealth.mjs";
import { speciesLanguages, rankedLanguages, SOURCES } from "../rules/languages.mjs";
import { castSpell, manifest, newDay, adjustSlot, incantationCheck } from "../casting.mjs";
import { ammoFor, reloadWeapon, specialLoad } from "../ammo.mjs";
import { magazineOf, fits, specialAmmo, caliberIn } from "../rules/ammo.mjs";
import { unarmedRules } from "../rules/unarmed.mjs";
import { featGrants, pointsAfter, rankCost } from "../rules/advancement.mjs";
import { bonusFeatSlots, talentPrerequisites } from "../rules/talents.mjs";
import { classRequirements } from "../rules/requirements.mjs";
import { featPrerequisites } from "../rules/prerequisites.mjs";
import { slug } from "../rules/identify.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { rulesFor } from "../rules/feats.mjs";
import { casterFor, castingOf } from "../rules/casting.mjs";
import { conditionStatus } from "./creature-sheet.mjs";
import { LevelUp, Grant, undoLastLevel } from "../levelup.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const { TextEditor } = foundry.applications.ux;

const ABILITY_NAMES = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
const SAVE_NAMES = { fort: "Fortitude", ref: "Reflex", will: "Will" };
const signed = (n) => (n === null || n === undefined ? "—" : n >= 0 ? `+${n}` : `${n}`);
/** A total's parts as its tooltip: "Ranks +4, Wis +2, Elf +2, Alertness +2" (rules/character.mjs `parts`). */
const partsTip = (parts) => (parts ?? []).map((p) => `${p.label} ${signed(p.value)}`).join(", ");

/** The lists on the Feats and Gear tabs: which item types go in each, in order. */
const LISTS = {
  feats: [["feature", "Class Features"], ["talent", "Talents"], ["feat", "Feats"], ["occupation", "Occupation"], ["species", "Species"], ["template", "Templates"]],
  gear: [["weapon", "Weapons"], ["armor", "Armor"], ["equipment", "Equipment"], ["ammunition", "Ammunition"]],
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
      toggleStored: Modern20CharacterSheet.#onToggleStored,
      addSpecialty: Modern20CharacterSheet.#onAddSpecialty,
      removeSpecialty: Modern20CharacterSheet.#onRemoveSpecialty,
      rollAbility: Modern20CharacterSheet.#onRollAbility,
      rollSave: Modern20CharacterSheet.#onRollSave,
      rollSkill: Modern20CharacterSheet.#onRollSkill,
      rollAttack: Modern20CharacterSheet.#onRollAttack,
      rollDamage: Modern20CharacterSheet.#onRollDamage,
      createEffect: Modern20CharacterSheet.#onCreateEffect,
      editEffect: Modern20CharacterSheet.#onEditEffect,
      toggleEffect: Modern20CharacterSheet.#onToggleEffect,
      deleteEffect: Modern20CharacterSheet.#onDeleteEffect,
      filterLog: Modern20CharacterSheet.#onFilterLog,
      toggleCondition: Modern20CharacterSheet.#onToggleCondition,
      grantActionPoints: Modern20CharacterSheet.#onGrantActionPoints,
      actionPointsDone: Modern20CharacterSheet.#onActionPointsDone,
      wealthDone: Modern20CharacterSheet.#onWealthDone,
      rest: Modern20CharacterSheet.#onRest,
      buyItem: Modern20CharacterSheet.#onBuyItem,
      sellItem: Modern20CharacterSheet.#onSellItem,
      wealthCheck: Modern20CharacterSheet.#onWealthCheck,
      reload: Modern20CharacterSheet.#onReload,
      toggleGrant: Modern20CharacterSheet.#onToggleGrant,
      toggleBonusFeat: Modern20CharacterSheet.#onToggleBonusFeat,
      toggleTalent: Modern20CharacterSheet.#onToggleTalent,
      startingWealth: Modern20CharacterSheet.#onStartingWealth,
      regainWealth: Modern20CharacterSheet.#onRegainWealth,
      addLanguage: Modern20CharacterSheet.#onAddLanguage,
      addSpeciesLanguages: Modern20CharacterSheet.#onAddSpeciesLanguages,
      removeLanguage: Modern20CharacterSheet.#onRemoveLanguage,
      belowZeroSave: Modern20CharacterSheet.#onBelowZeroSave,
      stabilisedByHelp: Modern20CharacterSheet.#onStabilisedByHelp,
      rollUnarmed: Modern20CharacterSheet.#onRollUnarmed,
      rollGrab: Modern20CharacterSheet.#onRollGrab,
      rollGrapple: Modern20CharacterSheet.#onRollGrapple,
      castSpell: Modern20CharacterSheet.#onCastSpell,
      manifestPower: Modern20CharacterSheet.#onManifestPower,
      newDay: Modern20CharacterSheet.#onNewDay,
      adjustSlot: Modern20CharacterSheet.#onAdjustSlot,
      incantationCheck: Modern20CharacterSheet.#onIncantationCheck,
      resetIncantation: Modern20CharacterSheet.#onResetIncantation,
      levelUp: Modern20CharacterSheet.#onLevelUp,
      grant: Modern20CharacterSheet.#onGrant,
      undoLevel: Modern20CharacterSheet.#onUndoLevel,
      toggleFreeEdit: Modern20CharacterSheet.#onToggleFreeEdit,
    },
  };

  static PARTS = {
    header: { template: "systems/modern20/templates/character/header.hbs" },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: { template: "systems/modern20/templates/character/main.hbs", scrollable: [""] },
    build: { template: "systems/modern20/templates/character/build.hbs", scrollable: [""] },
    skills: { template: "systems/modern20/templates/character/skills.hbs", scrollable: [""] },
    feats: { template: "systems/modern20/templates/character/items.hbs", scrollable: [""] },
    gear: { template: "systems/modern20/templates/character/items.hbs", scrollable: [""] },
    magic: { template: "systems/modern20/templates/character/magic.hbs", scrollable: [""] },
    effects: { template: "systems/modern20/templates/character/effects.hbs", scrollable: [""] },
    details: { template: "systems/modern20/templates/character/details.hbs", scrollable: [""] },
    log: { template: "systems/modern20/templates/log.hbs", scrollable: [""] },
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "main", label: "Main", icon: "fa-solid fa-user" },
        { id: "build", label: "Build", icon: "fa-solid fa-angles-up" },
        { id: "skills", label: "Skills", icon: "fa-solid fa-list-check" },
        { id: "feats", label: "Feats & Talents", icon: "fa-solid fa-star" },
        { id: "gear", label: "Gear", icon: "fa-solid fa-box-open" },
        { id: "magic", label: "Magic & Psionics", icon: "fa-solid fa-wand-sparkles" },
        { id: "effects", label: "Effects", icon: "fa-solid fa-bolt" },
        { id: "details", label: "Details", icon: "fa-solid fa-book" },
        { id: "log", label: "Log", icon: "fa-solid fa-clock-rotate-left" },
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
    context.grants = partId === "feats" ? context.featGrants : [];
    context.classChoices = partId === "feats" ? context.classChoiceList : [];
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
    const templates = ofType("template");

    // The species' and templates' changes to each score; a template that takes a score away shows a dash.
    const abilities = ABILITIES.map((a) => {
      const change = (species?.system.abilities?.[a] ?? 0) + templates.reduce((n, t) => n + (t.system.abilities?.changes?.[a] ?? 0), 0);
      const lost = templates.some((t) => t.system.abilities?.lost?.includes(a));
      return {
        key: a, label: ABILITY_NAMES[a], value: system.abilities[a].value,
        adjustment: lost ? "—" : change ? signed(change) : "",
        score: d.scores?.[a] ?? "—", modifier: signed(d.modifiers?.[a]),
      };
    });

    // A creature's own Hit Dice: its type, how many, and a roll for each whole one.
    const creatureTypes = ofType("creatureType").map((t) => ({
      id: t.id, name: t.name, img: t.img, count: t.system.count, hitDie: t.system.hitDie,
      replaced: d.replacedHitDice,
      rolls: d.replacedHitDice ? [] : Array.from({ length: Math.max(1, Math.floor(t.system.count ?? 0)) }, (_, i) => ({ index: i, value: t.system.hitPoints[i] ?? "" })),
    }));

    // An advanced or prestige class's requirements, checked against the character as it is now.
    // A class feature that gives a feat (a Soldier's Weapon Focus: "the benefit of the feat") counts as it.
    const have = { d, feats: [...ofType("feat"), ...ofType("feature")], talents: ofType("talent"), occupation: ofType("occupation")[0] };
    const requirementsOf = (c) => {
      if (!c.system.requirements?.length || !d.skills) return null;
      const rows = classRequirements(c, have);
      const unmet = rows.filter((r) => r.met === false);
      const check = rows.filter((r) => r.met === null);
      return { met: !unmet.length, unmet: unmet.flatMap((r) => r.missing).join("; "), check: check.map((r) => r.label).join(", ") };
    };
    // An ordinary takes only the basic classes (Modern/ordinaries).
    const notBasic = new Set(d.advancement?.notBasic ?? []);
    const classes = ofType("class").map((c) => ({
      requirements: notBasic.has(c.name) ? { met: false, unmet: "an ordinary can take only the six basic classes", check: "" } : requirementsOf(c),
      id: c.id, name: c.name, img: c.img, level: c.system.level, hitDie: c.system.hitDie, max: c.system.maxLevel,
      rolls: Array.from({ length: c.system.level }, (_, i) => ({ index: i, value: c.system.hitPoints[i] ?? "" })),
    }));

    // Skills: the derived rows, grouped so a specialty skill sits under its skill's name.
    const skills = [];
    let last = "";
    // The class ranks are being bought as: the Class column ticks that class's skills (a rank costs 1).
    const buyingAs = levellingClass(actor);
    for (const row of d.skills ?? []) {
      const def = SKILLS[row.key];
      if (def.specialties && last !== row.key) skills.push({ header: true, key: row.key, name: def.name, languages: !!def.anySpecialty });
      skills.push({
        ...row, label: row.specialty ? `${row.name} (${row.specialty})` : row.name, noCheck: !!def.noCheck, tip: partsTip(row.parts), total: signed(row.total), path: row.specialty ? null : `system.skills.${row.key}`,
        // A class skill of the class ranks are bought as, or from a feat or the occupation (whatever the class),
        // shows a tick; any other can be marked by hand, its tooltip naming the classes it is a skill of.
        ...classColumn(row, buyingAs),
        // Points: as tracked, or (not yet) shown as the estimate at today's cost; and what a rank costs now.
        pointsEstimate: row.ranks * (row.classSkill ? 1 : 2),
        cost: rankCost(row, levellingClass(actor)),
      });
      last = row.key;
    }
    for (const [key, def] of Object.entries(SKILLS)) {
      if (def.specialties && !skills.some((s) => s.header && s.key === key)) skills.push({ header: true, key, name: def.name, languages: !!def.anySpecialty });
    }
    const specialtyIndex = new Map(system.specialtySkills.map((s, i) => [`${s.skill}:${s.specialty}`, i]));
    for (const s of skills) if (s.specialty) s.index = specialtyIndex.get(`${s.key}:${s.specialty}`);

    // What the levels allow beside what the character has (rules/advancement.mjs), for the Feats and Skills tabs.
    const adv = d.advancement ?? {};
    const tally = (t, parts) => (t && t.allowed !== null && t.allowed !== undefined ? { text: `${t.have} of ${t.allowed}`, over: t.over, under: t.under, parts } : null);
    const counts = {
      feat: tally(adv.feats, adv.featParts && `2 at 1st level and 1 every 3 levels (${adv.featParts.general}), class bonus feats (${adv.featParts.bonus}), starting feats (${adv.featParts.starting}), occupation (${adv.featParts.occupation}), species (${adv.featParts.species})`),
      talent: tally(adv.talents, "One for each Talent in your class levels"),
    };
    // Feats' prerequisites against the character as it is (rules/prerequisites.mjs): every feat's name, to tell a
    // feat in them from other wording, from the compendium's index (kept by Foundry once loaded).
    const featIndex = await game.packs.get(`${SYSTEM_ID}.feats`)?.getIndex() ?? [];
    const pre = { d, feats: [...ofType("feat"), ...ofType("feature")].map((f) => f.name), known: new Set(featIndex.map((e) => slug(e.name))) };
    const unmetOf = (i) => {
      if (i.type !== "feat" || !i.system.prerequisites || !d.skills) return "";
      const r = featPrerequisites(i.system.prerequisites, pre);
      return r.met === false ? `Prerequisites not met: ${r.missing.join(", ")}` : "";
    };
    const itemLists = Object.fromEntries(Object.entries(LISTS).map(([tab, groups]) => [tab, groups.map(([type, label]) => ({
      type, label,
      items: ofType(type).map((i) => ({
        id: i.id, name: i.name, img: i.img, equipped: i.system.equipped, stored: i.system.stored, physical: "equipped" in i.system, weapon: i.type === "weapon",
        detail: detail(i), choiceKind: CHOICES[identify(i)] ?? "", choice: i.system.choice ?? "",
        // Where it came from, on hover; and a feat given twice for the same choice, flagged.
        origin: originOf(actor, i), twice: givenTwice(actor, i), unmet: unmetOf(i),
        occupation: i.type === "occupation" ? occupationChoices(i) : null,
        dc: "purchaseDC" in i.system ? i.system.purchaseDC?.dc ?? null : null,
        ammo: i.type === "weapon" && !i.system.melee ? ammoContext(actor, i) : null,
        quantity: i.type === "ammunition" ? i.system.quantity : null,
        // A special load (Beanbag, Silver): the caliber it was bought in, so it fits that gun.
        special: i.type === "ammunition" && !!specialAmmo(identify(i)), caliber: i.system.caliber ?? "",
        counted: i.type === "ammunition",
      })),
      count: counts[type] ?? null,
    }))]));

    Object.assign(context, {
      actor, system, d,
      abilities,
      saves: Object.entries(SAVE_NAMES).map(([k, label]) => ({ key: k, label, total: signed(d.saves?.[k]), base: signed(d.baseSaves?.[k]), tip: partsTip(d.parts?.saves?.[k]) })),
      combat: {
        bab: signed(d.baseAttackBonus), initiative: signed(d.initiative), grapple: signed(d.grapple),
        tips: { defense: partsTip(d.parts?.defense), initiative: partsTip(d.parts?.initiative), grapple: partsTip(d.parts?.grapple), reputation: partsTip(d.parts?.reputation) },
        defense: d.defense ?? {}, reputation: signed(d.reputation), massiveDamage: d.massiveDamage ?? "—",
        hpMax: d.hitPoints?.max ?? 0, hpEstimated: d.hitPoints?.estimated,
        // Defense in a situation (Dodge, a dwarf against giants): shown, for the table to apply.
        // Damage reduction and resistances, if any: "DR 2/—; fire 3".
        resistances: [...(d.defenses?.dr ?? []).map((x) => `DR ${x.amount}/${x.overcome}`), ...Object.entries(d.defenses?.resist ?? {}).map(([k, v]) => `${k} ${v}`)].join("; "),
        defenseNotes: notesOf(actor).filter((n) => n.rolls.includes("defense")).map((n) => n.text).join("; "),
        speed: d.speed ? { ...d.speed, double: d.speed.value * 2, default: ofType("species")[0]?.system.speed || 30 } : {},
        unarmed: unarmedSummary(items),
        load: loadContext(d.load),
      },
      summary: (d.classes ?? []).map((c) => `${c.name} ${c.level}`).join(" / ") || "No class",
      size: d.size ? d.size[0].toUpperCase() + d.size.slice(1) : "Medium",
      classes,
      creatureTypes,
      creatureType: d.creatureType ? d.creatureType[0].toUpperCase() + d.creatureType.slice(1) : "",
      sizes: SIZES.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1), selected: v === system.size })),
      skills,
      specialtyChoices: Object.entries(SKILLS).filter(([, s]) => s.specialties).map(([key, s]) => ({ key, name: s.name, specialties: s.specialties })),
      itemLists,
      // The calibers of the character's guns, offered for a special load's caliber.
    calibers: [...new Set(ofType("weapon").map((w) => caliberIn(w)).filter(Boolean))],
    // Every effect acting on the character: its own, and those its items carry to it.
      effects: [...actor.allApplicableEffects()].map((e) => ({
        id: e.id, uuid: e.uuid, name: e.name, img: e.img, disabled: e.disabled,
        source: e.parent === actor ? "" : e.parent?.name ?? "", own: e.parent === actor,
        changes: e.changes.map((c) => `${c.key.replace(/^system\.bonuses\./, "")} ${Number(c.value) >= 0 ? "+" : ""}${c.value}`).join(", "),
      })),
      bonusKeys: bonusKeys(),
      status: conditionStatus(actor, system.hp.value, system.hp.max),
      totalDefense: actor.statuses.has("totalDefense"),
      advancement: {
        skillPoints: tally(adv.skillPoints, "Each class level: its skill points + Int modifier; your first level ×4. A cross-class rank costs 2."),
        actionPoints: adv.actionPoints?.points ? { points: adv.actionPoints.points, levels: adv.actionPoints.levels.join(", ") } : null,
        // A select for each +1 the levels give (every 4th), and any chosen beyond them.
        increases: Array.from({ length: Math.max(adv.abilityIncreases?.allowed ?? 0, system.abilityIncreases.length) }, (_, i) => ({
          index: i, level: (i + 1) * 4, extra: i >= (adv.abilityIncreases?.allowed ?? 0),
          options: ABILITIES.map((a) => ({ value: a, label: ABILITY_NAMES[a], selected: system.abilityIncreases[i] === a })),
        })),
      },
      wealthCondition: financialCondition(system.wealth.value ?? 0),
      // One Profession check to regain Wealth for each level gained since it was last made.
      wealthDue: (d.level ?? 0) > Math.max(1, system.wealth.regainedLevel || 1) ? (system.wealth.regainedLevel || 1) + 1 : null,
      languages: languagesContext(actor),
      // Which class the 1st level was in, when there is more than one to choose from.
      startingClass: ofType("class").length > 1 ? ofType("class").map((c) => ({ name: c.name, selected: c.name === d.startingClass })) : null,
      levelling: {
        current: levellingClass(actor),
        classes: ofType("class").map((c) => ({ name: c.name, selected: c.name === levellingClass(actor) })),
      },
      belowZero: belowZero(actor),
      // The Build tab: the levels taken, one at a time, and what the character started with. Elsewhere what
      // they decide is shown, not edited, unless editing is allowed (a correction, a GM's ruling).
      build: buildContext(actor, d),
      freeEdit: this.freeEdit,
      lock: this.freeEdit ? "" : "disabled",
      magic: magicContext(actor, ofType),
      featGrants: grantsContext(actor),
      classChoiceList: await classChoicesContext(actor),
      log: logContext(actor, this.logFilter),
      enrichedBiography: await TextEditor.implementation.enrichHTML(system.details.biography, { relativeTo: actor, secrets: actor.isOwner }),
      biographyField: system.schema.fields.details.fields.biography,
    });
    return context;
  }

  /**
   * The form's data, its numbers as their fields take them, and the specialty skills' rows merged
   * into the list rather than replacing it: their inputs carry only ranks, misc and class skill,
   * not which skill and specialty.
   */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    // An emptied box is 0 (or none, where the field allows it), and a whole number is rounded,
    // rather than the whole save being refused.
    if (data.system) data.system = castNumbers(obj(ACTOR_MODELS.character), data.system);
    if (data.system?.specialtySkills) data.system.specialtySkills = mergeIndexed(this.document.system.toObject().specialtySkills, data.system.specialtySkills);
    if (data.system) this.#trackSkillPoints(data.system);
    return data;
  }

  /**
   * Skill points as ranks are bought: a skill whose ranks changed (and whose points were not edited
   * by hand in the same change) has its points moved by the change at the cost of the class the
   * level is being spent as (rules/advancement.mjs).
   */
  #trackSkillPoints(sent) {
    const system = this.document.system;
    const className = sent.levellingAs ?? levellingClass(this.document);
    const rows = system.derived?.skills ?? [];
    const track = (stored, entry, row) => {
      if (!row || !entry || entry.ranks === undefined || entry.ranks === (stored?.ranks ?? 0)) return;
      if (entry.points !== undefined && entry.points !== (stored?.points ?? null)) return;
      entry.points = pointsAfter(row, stored?.ranks ?? 0, entry.ranks, className);
    };
    for (const [key, entry] of Object.entries(sent.skills ?? {})) track(system.skills[key], entry, rows.find((r) => r.key === key && !r.specialty));
    (sent.specialtySkills ?? []).forEach((entry, i) => {
      const stored = system.specialtySkills[i];
      if (stored) track(stored, entry, rows.find((r) => r.key === stored.skill && r.specialty === stored.specialty));
    });
  }

  /** Fields on an owned item (a class's level, a hit point roll) save to that item. */
  _onRender(context, options) {
    super._onRender(context, options);
    for (const input of this.element.querySelectorAll("[data-item-field]")) {
      input.addEventListener("change", (event) => this.#updateItemField(event));
    }
    for (const input of this.element.querySelectorAll("[data-language]")) {
      input.addEventListener("change", (event) => this.#updateLanguage(event));
    }
    for (const select of this.element.querySelectorAll("[data-increase]")) {
      select.addEventListener("change", (event) => this.#updateIncrease(event));
    }
  }

  async #updateItemField(event) {
    event.stopPropagation();
    const input = event.currentTarget;
    const item = this.document.items.get(input.closest("[data-item-id]").dataset.itemId);
    if (!item) return;
    const field = input.dataset.itemField;
    // Numbers are whole, except a creature type's Hit Dice ("1/2 d8" is half a die); a bad entry is no entry.
    let value = ["choice", "chosenSkill", "ammunition", "caliber"].includes(field) || input.value === "" ? null : Number(input.value);
    if (value !== null && (Number.isNaN(value) || field !== "count")) value = Number.isNaN(value) ? null : Math.round(value);
    if (field === "hitPoints") {
      // One roll per level, in order; a level not yet rolled is empty and counts the average.
      const index = Number(input.dataset.index);
      const rolls = Array.from({ length: Math.max(item.system.hitPoints.length, index + 1) }, (_, i) => item.system.hitPoints[i] ?? null);
      rolls[index] = value;
      await item.update({ "system.hitPoints": rolls });
    } else if (field === "chosenSkill") {
      // An occupation's skill choices: tick or untick one; the occupation's limit is shown, not enforced.
      const skill = input.dataset.value;
      const chosen = new Set(item.system.chosenSkills);
      if (input.checked) chosen.add(skill); else chosen.delete(skill);
      await item.update({ "system.chosenSkills": [...chosen] });
    } else if (field === "choice") {
      await item.update({ "system.choice": input.value.trim() });
    } else if (field === "caliber") {
      await item.update({ "system.caliber": input.value.trim() });
    } else if (field === "ammunition") {
      await item.update({ "system.ammunition": input.value });
    } else if (field === "loaded") {
      const mag = magazineOf(item.system.magazine);
      await item.update({ "system.loaded": Math.max(0, Math.min(value ?? 0, mag && mag.capacity !== Infinity ? mag.capacity : Infinity)) });
    } else if (field === "quantity") {
      await item.update({ "system.quantity": value === null ? null : Math.max(0, value) });
    } else if (field === "prepared") {
      await item.update({ "system.prepared": Math.max(0, value ?? 0), "system.cast": Math.min(item.system.cast, Math.max(0, value ?? 0)) });
    } else if (field === "count") {
      // Hit Dice of a creature type: a fraction ("1/2 d8") is allowed, down to an eighth.
      await item.update({ "system.count": Math.max(0.125, value ?? 1) });
    } else if (field === "level") {
      await item.update({ "system.level": Math.max(1, Math.min(value ?? 1, item.system.maxLevel || 10)) });
    }
  }

  /** A field of one language: its name, whether it is spoken or read and written, where it came from. */
  async #updateLanguage(event) {
    event.stopPropagation();
    const input = event.currentTarget;
    const list = this.document.system.toObject().languages;
    const lang = list[Number(input.dataset.language)];
    if (!lang) return;
    const field = input.dataset.field;
    lang[field] = input.type === "checkbox" ? input.checked : input.value.trim();
    await this.document.update({ "system.languages": list });
  }

  static async #onAddLanguage() {
    const list = this.document.system.toObject().languages;
    // A character's first language is its native one; another known without ranks is most often its species'.
    list.push({ name: "", speak: true, readWrite: true, source: list.length ? "species" : "native" });
    await this.document.update({ "system.languages": list });
  }

  /** Add the languages the species gives, merged with those already known. */
  static async #onAddSpeciesLanguages() {
    const species = this.document.items.find((i) => i.type === "species");
    if (!species) return;
    const list = this.document.system.toObject().languages;
    for (const l of speciesLanguages(species.system.languages.free)) {
      const known = l.name && list.find((x) => x.name.toLowerCase() === l.name.toLowerCase());
      if (known) { known.speak ||= l.speak; known.readWrite ||= l.readWrite; } else list.push(l);
    }
    await this.document.update({ "system.languages": list });
  }

  static async #onRemoveLanguage(event, target) {
    const list = this.document.system.toObject().languages.filter((_, i) => i !== Number(target.dataset.index));
    await this.document.update({ "system.languages": list });
  }

  static async #onStartingWealth() { await rollStartingWealth(this.document); }
  static async #onRegainWealth(event) { await regainWealth(this.document, event); }

  /** One of the ability increases: which ability it went to, or (none chosen) removed from the list's end. */
  async #updateIncrease(event) {
    event.stopPropagation();
    const index = Number(event.currentTarget.dataset.increase);
    const list = [...this.document.system.abilityIncreases];
    list[index] = event.currentTarget.value;
    while (list.length && !list.at(-1)) list.pop();
    await this.document.update({ "system.abilityIncreases": list.map((a) => a ?? "") });
  }

  static #onRollUnarmed(event) { return characterRolls(this.document).unarmed(event); }
  static #onRollGrab(event) { return characterRolls(this.document).grab(event); }
  static #onRollGrapple(event) { return characterRolls(this.document).grapple(event); }
  static async #onBelowZeroSave(event, target) { await rollSave(this.document, target.dataset.kind, event); }
  /** Stabilised by someone's Treat Injury check: stable and unconscious, and (tended) healing naturally from now on. */
  static async #onStabilisedByHelp() { await stabiliseWithHelp(this.document); }
  /** Take or give back a feat an occupation, species or first class offers. */
  static async #onToggleGrant(event, target) {
    const actor = this.document;
    const grant = featGrants(actor.items.contents, actor.system.startingClass).find((g) => g.source === target.dataset.source);
    const option = grant?.options[Number(target.dataset.index)];
    if (!option) return;
    const owned = ownedFeat(actor, option, grant.source);
    if (owned) return owned.delete();
    const feat = option.uuid ? await fromUuid(option.uuid) : null;
    if (!feat) return ui.notifications.warn(`${option.name} is not in the feats compendium.`);
    const data = feat.toObject();
    delete data._id;
    foundry.utils.mergeObject(data, { system: { choice: option.specialty ?? "" }, flags: { [SYSTEM_ID]: { grantedBy: grant.source } }, _stats: { compendiumSource: feat.uuid } });
    await actor.createEmbeddedDocuments("Item", [data]);
  }

  /**
   * Take a feat from a class's bonus feat list as one of its bonus feats, or give it back. A
   * feat the character already has is marked as the bonus feat rather than added again.
   */
  static async #onToggleBonusFeat(event, target) {
    const actor = this.document;
    const cls = actor.items.get(target.dataset.class);
    const option = cls?.system.bonusFeats[Number(target.dataset.index)];
    if (!option) return;
    const marked = bonusFeatItem(actor, cls.id, option);
    if (marked) return marked.getFlag(SYSTEM_ID, "bonusAdded") ? marked.delete() : marked.unsetFlag(SYSTEM_ID, "bonusFor");
    const existing = ownedFeat(actor, option, null);
    if (existing && !existing.getFlag(SYSTEM_ID, "bonusFor")) return existing.setFlag(SYSTEM_ID, "bonusFor", cls.id);
    await addFromCompendium(actor, option, { bonusFor: cls.id, bonusAdded: true });
  }

  /** Take a talent from a class's trees, or give it back. */
  static async #onToggleTalent(event, target) {
    const actor = this.document;
    const option = { name: target.dataset.name, uuid: target.dataset.uuid };
    const owned = actor.items.find((i) => i.type === "talent" && identify(i) === slug(option.name));
    if (owned) return owned.delete();
    if (target.dataset.unmet) ui.notifications.warn(`${option.name}: prerequisites not met (${target.dataset.unmet}).`);
    await addFromCompendium(actor, option, {});
  }

  static async #onReload(event, target) { const i = this.#item(target); if (i) await reloadWeapon(this.document, i); }
  static async #onCastSpell(event, target) { const i = this.#item(target); if (i) await castSpell(this.document, i); }
  static async #onManifestPower(event, target) { const i = this.#item(target); if (i) await manifest(this.document, i); }
  static async #onNewDay() { await newDay(this.document); }
  static async #onAdjustSlot(event, target) {
    await adjustSlot(this.document, target.dataset.class, Number(target.dataset.level), Number(target.dataset.delta));
  }
  static async #onIncantationCheck(event, target) {
    const i = this.#item(target);
    if (i) await incantationCheck(this.document, i, Number(target.dataset.index), event);
  }
  static async #onResetIncantation(event, target) {
    const i = this.#item(target);
    if (i) await i.update({ "system.progress.successes": [], "system.progress.failures": 0 });
  }

  static async #onToggleCondition(event, target) {
    await this.document.toggleStatusEffect(target.dataset.condition);
  }

  /** Give the action points due for the levels gained since they were last given. */
  static async #onGrantActionPoints() {
    const actor = this.document;
    const due = actor.system.derived?.advancement?.actionPoints;
    if (!due?.points) return;
    await actor.update({ "system.actionPoints.value": actor.system.actionPoints.value + due.points, "system.actionPoints.granted": due.levels.at(-1) });
  }

  /** Action points already given for the levels the character has (one made before they were tracked): none owed. */
  static async #onActionPointsDone() {
    const due = this.document.system.derived?.advancement?.actionPoints;
    if (due?.levels.length) await this.document.update({ "system.actionPoints.granted": due.levels.at(-1) });
  }

  /** Wealth already regained for the levels the character has: no Profession checks owed. */
  static async #onWealthDone() {
    await this.document.update({ "system.wealth.regainedLevel": this.document.system.derived?.level ?? 1 });
  }

  /** Natural healing: a night's rest, or a day of complete bed rest. */
  static async #onRest() {
    const actor = this.document;
    const level = actor.system.derived?.level ?? 1;
    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: `${actor.name}: rest` },
      content: `<p>A night's rest (8 hours) heals ${Math.max(1, level)} hit points; a day of complete bed rest heals ${Math.max(1, level) * 2}.</p>`,
      buttons: [{ action: "night", label: "Night's rest", default: true }, { action: "bed", label: "Bed rest" }],
      rejectClose: false,
    });
    if (!choice) return;
    const healed = restHealing(level, actor.system.hp.value, { bedRest: choice === "bed", recovering: actor.system.hp.recovering });
    if (healed === null) return ui.notifications.warn(`${actor.name} is below 0 hit points and does not heal naturally: a Fortitude save (DC 20) each day starts the recovery, and a failure loses 1 hit point.`);
    await applyToActor(actor, healed, { healing: true });
  }

  static async #onBuyItem(event, target) {
    const item = this.#item(target);
    if (item) await buy(this.document, item.system.purchaseDC.dc, item.name, event);
  }

  static async #onSellItem(event, target) {
    const item = this.#item(target);
    if (item) await sell(this.document, item);
  }

  /** A Wealth check for anything: asks for the purchase DC. */
  static async #onWealthCheck(event) {
    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Wealth check" },
      content: `<div class="form-group"><label>What</label><input type="text" name="what" placeholder="Something"></div><div class="form-group"><label>Purchase DC</label><input type="number" name="dc" value="10" autofocus></div>`,
      ok: { label: "Buy", callback: (ev, button) => ({ what: button.form.elements.what.value.trim() || "something", dc: button.form.elements.dc.valueAsNumber || 0 }) },
      rejectClose: false,
    });
    if (result) await buy(this.document, result.dc, result.what, event);
  }

  #effect(target) {
    return fromUuidSync(target.closest("[data-effect-uuid]")?.dataset.effectUuid);
  }

  static async #onCreateEffect() {
    const [effect] = await this.document.createEmbeddedDocuments("ActiveEffect", [{ name: "New effect", img: "icons/svg/aura.svg" }]);
    effect?.sheet.render(true);
  }
  /** Whether every tab's build choices (ranks, levels, picks) may be edited where they are shown, not only on the Build tab. */
  freeEdit = false;
  static #onToggleFreeEdit() {
    this.freeEdit = !this.freeEdit;
    this.render();
  }
  static #onLevelUp() { new LevelUp(this.document).render(true); }
  static #onGrant() { new Grant(this.document).render(true); }
  static async #onUndoLevel() { await undoLastLevel(this.document); }

  /** Which of the log's entries the Log tab shows: all, build or session. */
  logFilter = "all";
  static #onFilterLog(event, target) {
    this.logFilter = target.dataset.filter;
    this.render({ parts: ["log"] });
  }

  static #onEditEffect(event, target) { this.#effect(target)?.sheet.render(true); }
  static async #onToggleEffect(event, target) {
    const e = this.#effect(target);
    if (e) await e.update({ disabled: !e.disabled });
  }
  static async #onDeleteEffect(event, target) { await this.#effect(target)?.deleteDialog(); }

  #item(target) {
    return this.document.items.get(target.closest("[data-item-id]")?.dataset.itemId);
  }

  static #onRollAbility(event, target) { return characterRolls(this.document).ability(target.dataset.ability, event); }
  static #onRollSave(event, target) { return characterRolls(this.document).save(target.dataset.save, event); }
  static #onRollSkill(event, target) { return characterRolls(this.document).skill(target.dataset.skill, target.dataset.specialty, event); }
  static #onRollAttack(event, target) { return characterRolls(this.document).attack(this.#item(target), event); }
  static #onRollDamage(event, target) { return characterRolls(this.document).damage(this.#item(target)); }

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

  /** Kept elsewhere, or carried: what counts in the load. */
  static async #onToggleStored(event, target) {
    const item = this.#item(target);
    if (item) await item.update({ "system.stored": !item.system.stored });
  }

  static async #onAddSpecialty(event, target) {
    const row = target.closest("[data-skill]");
    const specialty = row.querySelector(".m20-new-specialty")?.value.trim();
    if (!specialty) return;
    // Rows left with no skill (saved before the sheet merged them) are dropped while adding.
    const list = this.document.system.toObject().specialtySkills.filter((s) => s.skill);
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

/**
 * The Build tab: each level in the history (rules/levelling.mjs) as a line, the levels from before it was
 * kept, the occupation's skill choices and the feats the occupation, species and first class give.
 */
function buildContext(actor, d) {
  const history = actor.system.history ?? [];
  const ABBR3 = { str: "Str", dex: "Dex", con: "Con", int: "Int", wis: "Wis", cha: "Cha" };
  const levels = history.map((h) => ({
    grant: h.kind === "grant",
    level: h.level, className: h.kind === "grant" ? h.note : h.className,
    hp: h.kind === "grant" ? "" : h.hitPoints ? `${h.hitPoints} hp` : h.level === 1 ? "max hp" : "",
    ranks: h.ranks.map((r) => `${SKILLS[r.skill]?.name ?? r.skill}${r.specialty ? ` (${r.specialty})` : ""} +${r.ranks}`).join(", "),
    items: h.items.map((id) => actor.items.get(id)?.name).filter(Boolean).join(", "),
    extra: [h.increase && `+1 ${ABBR3[h.increase]}`, h.actionPoints && `+${h.actionPoints} AP`, ...(h.effects ?? []).map((id) => actor.effects.get(id)?.changes.map((c) => `${ABBR3[c.key.split(".").at(-1)] ?? c.key} ${Number(c.value) >= 0 ? "+" : ""}${c.value}`).join(", ")).filter(Boolean)].filter(Boolean).join(", "),
  }));
  const last = history.at(-1);
  // Class levels the history does not account for: taken before it was kept, or set by hand.
  const counted = {};
  for (const h of history.filter((x) => x.kind !== "grant")) counted[h.className] = (counted[h.className] ?? 0) + 1;
  const before = actor.items.filter((i) => i.type === "class").map((c) => [c.name, c.system.level - (counted[c.name] ?? 0)]).filter(([, n]) => n > 0).map(([n, l]) => `${n} ${l}`).join(", ");
  const occupation = actor.items.find((i) => i.type === "occupation");
  return {
    levels, before, last: last ?? null,
    undo: last?.kind === "grant" ? `“${last.note.length > 30 ? `${last.note.slice(0, 30)}…` : last.note}”` : `level ${last?.level}`,
    occupation: occupation ? { id: occupation.id, name: occupation.name, choices: occupationChoices(occupation) } : null,
    grants: grantsContext(actor),
  };
}

/** The load, as the sheet shows it: the weight, the load it is, and the thresholds (rules/load.mjs). */
function loadContext(load) {
  if (!load) return null;
  const name = { light: "light", medium: "medium (encumbered)", heavy: "heavy (heavily encumbered)", over: "more than you can carry" }[load.level];
  const effects = { light: "", medium: ": speed slowed, Dex bonus at most +3, −3 on attacks and some skills", heavy: ": speed slowed, Dex bonus at most +1, −6 on attacks and some skills, run ×3", over: ": you cannot move" }[load.level];
  return {
    short: `${load.weight} lb., ${load.level}`,
    text: `Carrying ${load.weight} lb.: ${name}${effects}.`,
    tip: `Light up to ${load.light} lb., medium up to ${load.medium} lb., heavy up to ${load.heavy} lb. What is kept elsewhere is not counted.`,
    warn: load.level !== "light",
  };
}

/** The class skill points are being spent as: the one chosen, or the last class on the sheet. */
function levellingClass(actor) {
  const classes = actor.items.filter((i) => i.type === "class").sort((a, b) => a.sort - b.sort);
  const chosen = actor.system.levellingAs;
  return classes.find((c) => c.name === chosen)?.name ?? classes.at(-1)?.name ?? "";
}

/** The Details tab's languages: each one's fields, and those bought against the language skills' ranks. */
function languagesContext(actor) {
  const s = actor.system;
  const ranked = rankedLanguages(s.specialtySkills);
  const species = actor.items.find((i) => i.type === "species");
  const occupation = actor.items.find((i) => i.type === "occupation");
  return {
    list: s.languages.map((l, index) => ({ ...l, index, sources: SOURCES.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1), selected: v === l.source })) })),
    // Those bought with ranks, on the Skills tab.
    ranked: { speak: ranked.speak.join(", "), readWrite: ranked.readWrite.join(", "), any: ranked.speak.length + ranked.readWrite.length > 0 },
    species: species ? { name: species.name, free: species.system.languages.free.join(", "), other: species.system.languages.other.join(", ") } : null,
    occupation: occupation?.system.skills.languages ? `${occupation.name}: ${occupation.system.skills.languages}` : "",
  };
}

/**
 * A compendium talent's name and prerequisites, by uuid, from its pack's index: one request for a whole
 * pack, made once, where loading each talent would take a request each (seconds, for a class's trees).
 */
const TALENT_INDEX = new Map();
async function talentDoc(uuid) {
  // "Compendium.modern20.talents.Item.<id>": the pack is the second and third parts.
  const pack = game.packs.get(uuid.split(".").slice(1, 3).join("."));
  if (!pack) return null;
  if (!TALENT_INDEX.has(pack.collection)) {
    TALENT_INDEX.set(pack.collection, pack.getIndex({ fields: ["system.prerequisites"] }).then((index) => new Map(index.map((e) => [e.uuid, e]))));
  }
  return (await TALENT_INDEX.get(pack.collection)).get(uuid) ?? null;
}

/** Add a feat or talent from its compendium link, with flags. */
async function addFromCompendium(actor, option, flags) {
  const doc = option.uuid ? await fromUuid(option.uuid) : null;
  if (!doc) return ui.notifications.warn(`${option.name} is not in a compendium.`);
  const data = doc.toObject();
  delete data._id;
  foundry.utils.mergeObject(data, { system: option.specialty ? { choice: option.specialty } : {}, flags: { [SYSTEM_ID]: flags }, _stats: { compendiumSource: doc.uuid } });
  await actor.createEmbeddedDocuments("Item", [data]);
}

/** The feat marked as one of a class's bonus feats for this option, if there is one. */
function bonusFeatItem(actor, classId, option) {
  const id = slug(option.name);
  return actor.items.find((i) => i.type === "feat" && i.getFlag(SYSTEM_ID, "bonusFor") === classId && identify(i) === id
    && (!option.specialty || (i.system.choice ?? "").toLowerCase() === option.specialty.toLowerCase())) ?? null;
}

/**
 * The Feats tab's class choices: each class's bonus feat list (with how many its levels give
 * and which are taken as bonus feats), and its talent trees (with each talent's prerequisites).
 */
async function classChoicesContext(actor) {
  // An ordinary has no talents or bonus feats: none of the basic classes' class features.
  if (actor.system.ordinary) return [];
  const classes = actor.items.filter((i) => i.type === "class" && (i.system.level ?? 0) > 0).sort((a, b) => a.sort - b.sort);
  const talents = actor.items.filter((i) => i.type === "talent");
  const owned = talents.map((t) => ({ name: t.name, tree: t.system.tree }));
  const out = [];
  for (const c of classes) {
    const slots = bonusFeatSlots(c);
    const bonus = c.system.bonusFeats.map((o, index) => ({
      index, label: o.specialty ? `${o.name} (${o.specialty})` : o.name, checked: !!bonusFeatItem(actor, c.id, o),
      have: !!ownedFeat(actor, o, null),
    }));
    const taken = bonus.filter((b) => b.checked).length;
    // Each talent's own item, for its prerequisites: from the compendium the tree links to.
    const trees = [];
    for (const tree of c.system.talentTrees) {
      const rows = [];
      for (const t of tree.talents) {
        const doc = t.uuid ? await talentDoc(t.uuid) : null;
        const pre = doc ? talentPrerequisites(doc, owned) : { met: true, missing: [] };
        const checked = talents.some((x) => identify(x) === slug(t.name));
        rows.push({ name: t.name, uuid: t.uuid, checked, met: pre.met, unmet: pre.met === false && !checked ? pre.missing.join(", ") : "", check: pre.met === null ? pre.missing.join(" ") : "" });
      }
      trees.push({ name: tree.name, talents: rows });
    }
    const talentSlots = (c.system.levels ?? []).filter((l) => l.level <= c.system.level).reduce((n, l) => n + l.features.filter((f) => /^talent$/i.test(f.name)).length, 0);
    const talentsTaken = talents.filter((t) => t.system.className === c.name).length;
    if (!bonus.length && !trees.length) continue;
    out.push({
      id: c.id, name: c.name,
      bonus: bonus.length ? { options: bonus, taken, slots, over: taken > slots } : null,
      talents: trees.length ? { trees, taken: talentsTaken, slots: talentSlots, over: talentsTaken > talentSlots } : null,
    });
  }
  return out;
}

/**
 * The feat a grant's option names, if the character has it: one the grant added, or else any
 * feat of that identifier (and choice) the character already has, dragged on by hand.
 */
function ownedFeat(actor, option, source) {
  const id = slug(option.name);
  const matches = actor.items.filter((i) => i.type === "feat" && identify(i) === id && (!option.specialty || (i.system.choice ?? "").toLowerCase() === option.specialty.toLowerCase()));
  return matches.find((i) => i.getFlag(SYSTEM_ID, "grantedBy") === source) ?? matches[0] ?? null;
}

/** The Feats tab's picker: each occupation, species or starting-feats grant, its options ticked where taken. */
function grantsContext(actor) {
  return featGrants(actor.items.contents, actor.system.startingClass).map((g) => {
    const options = g.options.map((o, index) => ({ index, label: o.specialty ? `${o.name} (${o.specialty})` : o.name, checked: !!ownedFeat(actor, o, g.source) }));
    const taken = options.filter((o) => o.checked).length;
    const all = g.choose >= g.options.length;
    return {
      source: g.source, options, taken, choose: g.choose, over: taken > g.choose, under: taken < g.choose,
      text: `${g.name} (${g.label}): ${all ? (g.choose === 1 ? "gives" : "gives all of") : `choose ${g.choose} of`} these`,
    };
  });
}

/** An unarmed strike's damage, as the tooltip gives it: "1d3 nonlethal", "1d4 lethal or nonlethal, 19–20". */
function unarmedSummary(items) {
  const u = unarmedRules(items.filter((i) => ["feat", "talent", "feature"].includes(i.type)).map((i) => rulesFor(identify(i))));
  const crit = [u.threat < 20 && `${u.threat}–20`, u.multiplier > 2 && `×${u.multiplier}`].filter(Boolean).join("/");
  return `${u.nonlethalDie} + Str nonlethal${u.lethalAllowed ? `, or ${u.lethalDie} lethal` : ", lethal at −4"}${u.attack ? `; +${u.attack} to attack` : ""}${crit ? `; critical ${crit}` : ""}`;
}

/**
 * The save a character below 0 has to make next, for the button by its hit points: dying (each
 * round), waking (stable, each hour), recovery (awake below 0, each day); null if none.
 */
function belowZero(actor) {
  const hp = actor.system.hp.value, st = actor.statuses;
  if (hp >= 0 || st.has("dead")) return null;
  if (st.has("dying")) return { kind: "dying", label: "Dying: Fortitude DC 20", tip: "Each round: stable on a success, 1 hit point lost on a failure", tendable: true };
  if (st.has("stable") && st.has("unconscious")) return { kind: "waking", label: "Unconscious: Fortitude DC 20", tip: "Each hour (once tended, or unaided): regain consciousness, disabled" };
  if (!actor.system.hp.recovering) return { kind: "recovery", label: "Below 0: Fortitude DC 20", tip: "Each day: start healing naturally, or lose 1 hit point" };
  return null;
}

/** A ranged weapon's rounds: what it holds and can hold, and the ammunition it can use (fitting ones first). */
function ammoContext(actor, weapon) {
  const mag = magazineOf(weapon.system.magazine);
  const current = ammoFor(actor, weapon);
  const all = actor.items.filter((i) => i.type === "ammunition");
  const options = [...all.filter((a) => fits(weapon, a)), ...all.filter((a) => !fits(weapon, a))]
    .map((a) => ({ id: a.id, label: `${a.name}${a.system.quantity !== null ? ` (${a.system.quantity})` : ""}${fits(weapon, a) ? "" : " — not its caliber"}`, selected: a.id === current?.id }));
  // The special load in its magazine (rules/ammo.mjs), named on the row: switching it is a reload.
  const loadedWith = mag && mag.capacity !== Infinity && weapon.system.loadedWith && (weapon.system.loaded ?? 0) > 0 ? specialLoad(actor, weapon)?.name ?? "" : "";
  return {
    loadedWith,
    magazine: !!mag && mag.capacity !== Infinity, capacity: mag?.capacity, loaded: weapon.system.loaded ?? 0,
    linked: mag?.capacity === Infinity, options, none: !options.length,
  };
}

const ORDINALS = ["0-level", "1st-level", "2nd-level", "3rd-level", "4th-level", "5th-level", "6th-level", "7th-level", "8th-level", "9th-level"];
const ABBR = { str: "Str", dex: "Dex", con: "Con", int: "Int", wis: "Wis", cha: "Cha" };

/**
 * The Magic tab: each casting class's slots or power points and DC, the spells and powers
 * grouped by level for the class that casts them, and incantations with their checks.
 */
function magicContext(actor, ofType) {
  const d = actor.system.derived ?? {};
  const list = d.casters ?? [];
  const scores = d.scores ?? {};
  const spells = ofType("spell"), powers = ofType("power");
  const row = (i) => {
    const found = casterFor(i, list);
    const c = found ? castingOf(i, found.caster, found.level, scores) : null;
    return {
      id: i.id, name: i.name, img: i.img, found: !!found, level: found?.level ?? null, className: found?.caster.name ?? "",
      prepared: i.system.prepared ?? 0, cast: i.system.cast ?? 0, left: (i.system.prepared ?? 0) - (i.system.cast ?? 0),
      preparedCaster: found?.caster.prepared, dc: c?.hasSave ? c.dc : null, cost: c?.cost ?? 0, meets: c?.meets ?? true,
      needs: c ? `${ABBR[c.ability] ?? c.ability} ${c.needs}` : "", detail: [i.system.range, i.system.duration].filter(Boolean).join("; "),
    };
  };
  const group = (items) => {
    const rows = items.map(row);
    const levels = [...new Set(rows.filter((r) => r.found).map((r) => r.level))].sort((a, b) => a - b);
    const out = levels.map((l) => ({ label: `${ORDINALS[l] ?? `${l}th-level`}`, items: rows.filter((r) => r.found && r.level === l) }));
    const off = rows.filter((r) => !r.found);
    if (off.length) out.push({ label: "Not on your lists", off: true, items: off });
    return out;
  };
  const used = (name) => Object.fromEntries(actor.system.slotsUsed.filter((s) => s.class === name).map((s) => [s.level, s.used]));
  const casters = list.map((c) => {
    const u = used(c.name);
    const mine = [...spells, ...powers].filter((i) => casterFor(i, [c]));
    const atLevel = (l) => mine.filter((i) => casterFor(i, [c]).level === l);
    const levels = [...new Set([...Object.keys(c.perDay), ...Object.keys(c.known)].map(Number))].sort((a, b) => a - b);
    return {
      name: c.name, kind: c.kind, psionic: c.kind === "psionic", casterLevel: c.casterLevel, spontaneous: c.spontaneous, prepared: c.prepared,
      dc: c.ability ? `10 + level + ${ABBR[c.ability]} (${c.abilityModifier >= 0 ? "+" : ""}${c.abilityModifier})` : "10 + level + the power's key ability",
      levels: levels.map((l) => {
        const max = c.perDay[l] ?? null;
        const prepared = atLevel(l).reduce((n, i) => n + (i.system.prepared ?? 0), 0);
        const known = c.known[l] ?? null;
        return {
          level: l, max, used: u[l] ?? 0, prepared, over: c.prepared && max !== null && prepared > max,
          known, have: atLevel(l).length, knownOver: known !== null && atLevel(l).length > known,
        };
      }),
    };
  });
  const powerMax = list.reduce((n, c) => n + c.powerPoints, 0);
  const free = list.reduce((n, c) => Math.max(n, c.freeManifestations), 0);
  return {
    casters, any: list.length > 0,
    powerPoints: powerMax || powers.length ? { value: actor.system.powerPoints.value, max: powerMax, freeUsed: actor.system.powerPoints.freeUsed, free } : null,
    spells: group(spells), powers: group(powers),
    incantations: ofType("incantation").map((i) => {
      const checks = i.system.skillCheck.checks;
      return {
        id: i.id, name: i.name, img: i.img, failures: i.system.progress.failures, failure: i.system.failure.value,
        checks: checks.map((c, index) => ({
          index, skill: c.skill, need: c.successes, have: i.system.progress.successes[index] ?? 0,
          dc: c.dc ?? checks.slice(0, index).reverse().find((x) => x.dc !== null)?.dc ?? "—",
        })),
      };
    }),
  };
}

/** An occupation's skill options as tick boxes, and how many of them it lets a character choose. */
function occupationChoices(item) {
  const s = item.system;
  const chosen = new Set(s.chosenSkills);
  const options = s.skills.options.map((o) => {
    const label = o.specialty ? `${o.name} (${o.specialty})` : o.name;
    return { label, checked: chosen.has(label) };
  });
  return { choose: s.skills.choose, count: chosen.size, over: chosen.size > s.skills.choose, options, languages: s.skills.languages };
}

/**
 * The Class column for a skill: a tick (`fromItems`, with `sourceLabel`) when a rank costs 1 point bought
 * as `buyingAs` (one of that class's skills, a feat's, the occupation's); otherwise the box to mark it by
 * hand, its tooltip (`otherClasses`) naming any other class it is a skill of. With no class, any class's.
 */
function classColumn(row, buyingAs) {
  const always = row.classSource === "feat" || row.classSource === "occupation";
  const ofClass = buyingAs ? (row.classFor ?? []).includes(buyingAs) : row.classSource === "class";
  const others = (row.classFor ?? []).filter((c) => c !== buyingAs);
  return {
    fromItems: always || ofClass,
    sourceLabel: always ? CLASS_SOURCES[row.classSource] : buyingAs ? `A class skill of ${buyingAs}` : CLASS_SOURCES.class,
    otherClasses: !always && !ofClass && others.length ? `A class skill of ${others.join(", ")}, not of ${buyingAs}: a rank bought as ${buyingAs} costs 2. ` : "",
  };
}

const ORDINAL = (n) => `${n}${["th", "st", "nd", "rd"][(n % 100 - 20) % 10] ?? ["th", "st", "nd", "rd"][n % 100] ?? "th"}`;

/**
 * Where a feat, talent or class feature came from, for its tooltip: the class that gave a feature and at
 * what levels, the occupation, species or first class a feat was given by, a class's bonus feat, a
 * talent's class and tree; and the character level it was taken at, where that is known.
 */
function originOf(actor, item) {
  const flags = item.flags?.[SYSTEM_ID] ?? {};
  const from = (id) => actor.items.get(id) ?? actor.items.find((i) => i.name === id);
  const taken = flags.takenAt ? `, taken at level ${flags.takenAt}` : "";
  if (flags.grantNote) return `Granted outside a level: ${flags.grantNote}`;
  if (item.type === "feature") {
    const cls = from(flags.grantedBy);
    const levels = (item.system.levels ?? []).slice(0, Math.max(1, item.system.rank || 1)).map(ORDINAL).join(", ");
    return `Class feature of ${cls?.name ?? item.system.className}${levels ? ` (${levels} level)` : ""}${flags.grantedBy ? "" : ", added by hand"}`;
  }
  if (item.type === "talent") return `A ${item.system.className || "class"} talent${item.system.tree ? ` (${item.system.tree})` : ""}${taken}`;
  if (item.type !== "feat") return "";
  if (flags.bonusFor) return `A bonus feat of ${from(flags.bonusFor)?.name ?? "a class"}${taken}`;
  if (flags.grantedBy) {
    const source = from(flags.grantedBy);
    const name = source?.name ?? flags.grantedBy;
    if (source?.type === "class") return `A starting feat of ${name}${taken}`;
    return `From the ${name}${source?.type === "occupation" || source?.type === "species" ? ` ${source.type}` : ""}${taken}`;
  }
  return taken ? `Taken at level ${flags.takenAt}` : "Added by hand";
}

/**
 * A feat the character has twice for the same choice (the feat, and a class feature giving its benefit,
 * for the same weapon): its benefit counts once, so the warning says to choose another.
 */
function givenTwice(actor, item) {
  if (!["feat", "feature"].includes(item.type) || !CHOICES[identify(item)] || !item.system.choice) return "";
  const other = actor.items.find((i) => i !== item && ["feat", "feature"].includes(i.type) && identify(i) === identify(item)
    && i.system.choice && (chooses(i.system.choice, item.system.choice) || chooses(item.system.choice, i.system.choice)));
  return other ? `${other.name} for ${item.system.choice} is also ${other.type === "feature" ? `a class feature of ${other.system.className}` : "a feat you have"}: its benefit counts once. Choose another ${CHOICES[identify(item)]}.` : "";
}

/** Where a class skill comes from, for its tooltip. */
const CLASS_SOURCES = { class: "A class skill of one of your classes", feat: "A class skill from a feat (Arcane Skills, Psionic Skills)", occupation: "A class skill from your occupation" };

/** The bonus fields an effect can add to, for the Effects tab's reference list. */
function bonusKeys() {
  const out = [];
  const walk = (o, path) => {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === "object") walk(v, `${path}.${k}`);
      else out.push(`${path}.${k}`);
    }
  };
  walk(initial(obj(ACTOR_MODELS.character)).bonuses, "system.bonuses");
  return out;
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
    case "feature": return `${s.className}${s.levels?.length ? `, level ${s.levels.join(", ")}` : ""}${s.rank > 1 ? ` (×${s.rank})` : ""}`;
    case "template": return [s.kind, s.type && `becomes ${s.type}`].filter(Boolean).join(", ");
    default: return s.weight?.value ? `${s.weight.value}` : "";
  }
}
