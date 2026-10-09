/**
 * Taking a level, in one window (rules/levelling.mjs): the class, its hit points, the skill points it
 * gives spent at its costs, the feat, bonus feat, talent and ability increase it brings, and at 1st level
 * the feats the occupation, species and class give. What the level changes (base attack, saves,
 * Defense, hit points) is shown as it is chosen, worked out on a copy of the character. Finishing writes
 * it all and records the level in the character's history, so the last level can be undone exactly.
 */
import * as L from "./rules/levelling.mjs";
import { deriveCharacter } from "./rules/character.mjs";
import { classRequirements } from "./rules/requirements.mjs";
import { talentPrerequisites } from "./rules/talents.mjs";
import { featPrerequisites } from "./rules/prerequisites.mjs";
import { featGrants } from "./rules/advancement.mjs";
import { CHOICES } from "./rules/choices.mjs";
import { identify, slug } from "./rules/identify.mjs";
import { SKILLS } from "./data/skills.mjs";
import { ABILITIES } from "./data/models.mjs";
import { SYSTEM_ID } from "./config.mjs";
import { regainWealth } from "./wealth.mjs";
import { levelFor } from "./rules/casting.mjs";
import { newSpells, SPELLBOOK, TRIGGER_LEVELS, triggerAt } from "./rules/learning.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const ABILITY_NAMES = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
const ORDINALS = ["0-level", "1st-level", "2nd-level", "3rd-level", "4th-level", "5th-level", "6th-level", "7th-level", "8th-level", "9th-level"];

/** A character's items as the rules take them, with their effects (as data/foundry.mjs prepares them). */
function plainItems(actor) {
  const active = (effects) => [...(effects ?? [])].filter((e) => e.active ?? !e.disabled).map((e) => ({ name: e.name, changes: e.changes ?? [], disabled: false, transfer: e.transfer }));
  return [
    ...actor.items.map((i) => ({ id: i.id, sort: i.sort, type: i.type, name: i.name, system: i.system.toObject?.() ?? i.system, effects: active(i.effects).filter((e) => e.transfer), granted: !!i.flags?.[SYSTEM_ID]?.grantNote })),
    { type: "actor", name: actor.name, system: {}, effects: active(actor.effects) },
  ];
}

/**
 * The classes, feats and talents in the compendiums, for the window's lists, with the fields asked for. Foundry keeps
 * each pack's index, asking the server again only for fields it does not yet have.
 */
async function index(pack, fields = []) {
  return (await game.packs.get(`${SYSTEM_ID}.${pack}`)?.getIndex({ fields })) ?? [];
}

/** The start of an entry's text, for a line under its choice: what it does, in a sentence or two. */
function textStart(html, length = 240) {
  const text = String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length).replace(/\s+\S*$/, "")}…` : text;
}

/** A skill's specialties as the book lists them (Craft's, Knowledge's, the languages), but those in `rows` already. */
function specialtiesToAdd(skill, rows) {
  const had = new Set(rows.filter((r) => r.key === skill).map((r) => String(r.specialty ?? "").toLowerCase()));
  return (SKILLS[skill]?.specialties ?? []).filter((x) => !had.has(x.toLowerCase()));
}

/** Open a compendium (the Feats, the Classes) to browse and read before choosing. */
function browse(event, target) {
  game.packs.get(`${SYSTEM_ID}.${target.dataset.pack}`)?.render(true);
}

/** Open an entry's sheet (a feat, talent, class or class feature) to read it before choosing. */
async function view(event, target) {
  const doc = target.dataset.uuid ? await fromUuid(target.dataset.uuid) : null;
  if (doc) doc.sheet.render(true);
  else ui.notifications.warn("That entry is not in its compendium.");
}

export class LevelUp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["modern20", "m20-levelup"],
    tag: "form",
    position: { width: 640, height: 760 },
    window: { resizable: true, icon: "fa-solid fa-angles-up" },
    form: { submitOnChange: true, closeOnSubmit: false, handler: LevelUp.#onChange },
    actions: { buy: LevelUp.#onBuy, rollHitPoints: LevelUp.#onRollHitPoints, addSpecialty: LevelUp.#onAddSpecialty, finish: LevelUp.#onFinish, view, browse },
  };

  static PARTS = { body: { template: "systems/modern20/templates/level-up.hbs", scrollable: [""] } };

  /** @param {Actor} actor  the character taking the level */
  constructor(actor, options = {}) {
    super({ ...options, window: { ...options.window, title: `${actor.name}: a new level` } });
    this.actor = actor;
    // What has been chosen: the class (an item's name, or a compendium class's uuid), the hit point roll,
    // points spent by skill, the feats, and the rest.
    const last = actor.system.history?.at(-1)?.className;
    const own = actor.items.filter((i) => i.type === "class");
    this.choices = {
      cls: (own.find((c) => c.name === last) ?? own.at(-1))?.name ?? "",
      hitPoints: null, bought: {}, specialties: [], feats: [], featChoices: [], bonusFeat: "", bonusChoice: "", talent: "", increase: "", grants: [], wealth: true, spells: [], trigger: "",
    };
  }

  /** The class chosen, as `{ name, system, uuid, own }`: the character's own item, or a compendium class (loaded once). */
  async #chosenClass() {
    const own = this.actor.items.find((i) => i.type === "class" && i.name === this.choices.cls);
    if (own) return { name: own.name, system: own.system, own };
    if (!this.choices.cls) return null;
    this.loaded ??= {};
    this.loaded[this.choices.cls] ??= await fromUuid(this.choices.cls);
    const doc = this.loaded[this.choices.cls];
    return doc ? { name: doc.name, system: doc.system, uuid: doc.uuid, own: null } : null;
  }

  /**
   * The spells or powers the level brings (rules/learning.mjs): those added whole (a Mage's 0-level spells at
   * 1st), a choice for each new one from the compendium on the class's lists but those had, and a Telepath's
   * trigger power. Kept in `this.learn` for taking the level. `after` is the character at the new level.
   */
  async #learning(cls, plan, after) {
    this.learn = { all: [], chosen: [], trigger: "" };
    const k = cls.system.casting;
    if (!k?.kind || k.boosts) return null;
    const caster = { lists: k.lists ?? [], excluded: k.excluded ?? "" };
    const type = k.kind === "psionic" ? "power" : "spell";
    const what = type === "power" ? "power" : "spell";
    const owned = this.actor.items.filter((i) => i.type === type);
    const had = new Set(owned.map((i) => identify(i)));
    const have = {};
    for (const i of owned) { const l = levelFor(i, caster); if (l !== null) have[l] = (have[l] ?? 0) + 1; }
    const book = SPELLBOOK[cls.name];
    const n = newSpells(cls, plan.classLevel, { modifier: book ? after.modifiers?.[book.ability] ?? 0 : 0, have });
    const pack = type === "power" ? "powers" : "spells";
    const entries = (await index(pack, ["system.levels", "system.identifier", "system.description"]))
      .map((e) => ({ name: e.name, uuid: e.uuid, level: levelFor({ name: e.name, system: e.system ?? {} }, caster), id: e.system?.identifier || slug(e.name), summary: textStart(e.system?.description) }))
      .filter((e) => e.level !== null && !had.has(e.id))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    const byUuid = new Map(entries.map((e) => [e.uuid, e]));
    const all = entries.filter((e) => n.all.includes(e.level));
    // A choice for each new spell, of the levels it may be; one chosen in another is not offered again.
    const choices = this.choices.spells;
    let at = 0;
    const slots = n.picks.flatMap((p) => Array.from({ length: p.count }, () => {
      const index = at++;
      const value = byUuid.has(choices[index]) && p.levels.includes(byUuid.get(choices[index]).level) ? choices[index] : "";
      const taken = new Set(choices.filter((c, i) => i !== index && c));
      const groups = p.levels.map((l) => ({ label: ORDINALS[l] ?? `${l}th-level`, options: entries.filter((e) => e.level === l).map((e) => ({ value: e.uuid, label: e.name, selected: e.uuid === value, disabled: taken.has(e.uuid) })) })).filter((g) => g.options.length);
      return { index, value, levels: p.levels.map((l) => ORDINALS[l] ?? l).join(" or "), groups, summary: byUuid.get(value)?.summary ?? "" };
    }));
    this.learn.all = all.map((e) => e.uuid);
    this.learn.chosen = slots.map((sl) => sl.value).filter(Boolean);
    // Trigger Power: one of the powers it has, or chooses now, of 0 to 3rd level, not already a trigger.
    let trigger = null;
    if (type === "power" && triggerAt(plan.features)) {
      const options = [
        ...owned.filter((i) => TRIGGER_LEVELS.includes(levelFor(i, caster)) && !i.flags?.[SYSTEM_ID]?.trigger).map((i) => ({ value: `item:${i.id}`, label: i.name })),
        ...this.learn.chosen.map((u) => byUuid.get(u)).filter((e) => TRIGGER_LEVELS.includes(e.level)).map((e) => ({ value: `new:${e.uuid}`, label: `${e.name} (chosen now)` })),
      ];
      const value = options.some((o) => o.value === this.choices.trigger) ? this.choices.trigger : "";
      this.learn.trigger = value;
      trigger = { options: options.map((o) => ({ ...o, selected: o.value === value })), value };
    }
    const unchosen = slots.filter((sl) => !sl.value).length;
    const plural = (x, word) => `${x} ${word}${x === 1 ? "" : "s"}`;
    return {
      title: type === "power" ? "Psionic powers" : "Spells", pack,
      intro: n.kind === "spellbook"
        ? (plan.classLevel === 1 ? `Your spellbook: every 0-level spell (${all.length} added), and ${plural(n.picks[0]?.count ?? 0, "1st-level spell")} of your choice (3 and your Intelligence bonus).` : `Two new spells for your spellbook, of levels you can cast at ${cls.name} ${plan.classLevel}.`)
        : n.kind === "known" ? (slots.length ? `${plural(slots.length, `new ${what}`)} known at ${cls.name} ${plan.classLevel}, by its table.` : `No new ${what}s known at ${cls.name} ${plan.classLevel}.`)
        : n.note,
      all: all.map((e) => ({ name: e.name, uuid: e.uuid })), slots, trigger,
      warnings: [unchosen && `${plural(unchosen, what)} not chosen.`, trigger && !trigger.value && "The trigger power is not chosen."].filter(Boolean),
    };
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const d = actor.system.derived;
    const classes = actor.items.filter((i) => i.type === "class");
    const species = actor.items.find((i) => i.type === "species");
    const nonhuman = !!species && !/human$/i.test(species.name ?? "");
    const have = { d, feats: actor.items.filter((i) => ["feat", "feature"].includes(i.type)), talents: actor.items.filter((i) => i.type === "talent"), occupation: actor.items.find((i) => i.type === "occupation") };

    // The classes: the character's own, then the rest of the compendium's, each with whether it may be taken.
    const all = await index("classes", ["system.classType", "system.requirements"]);
    const ownNames = new Set(classes.map((c) => c.name));
    const classOptions = [
      ...classes.map((c) => ({ value: c.name, label: `${c.name} ${c.system.level} → ${c.system.level + 1}` })),
      ...all.filter((e) => !ownNames.has(e.name)).sort((a, b) => (a.system?.classType === "basic" ? 0 : 1) - (b.system?.classType === "basic" ? 0 : 1) || a.name.localeCompare(b.name))
        .map((e) => {
          const reqs = e.system?.requirements?.length ? classRequirements({ system: { requirements: e.system.requirements } }, have) : [];
          const unmet = reqs.filter((r) => r.met === false);
          const notBasic = actor.system.ordinary && e.system?.classType !== "basic";
          return { value: e.uuid, label: `${e.name} (new${notBasic ? "; not for an ordinary" : unmet.length ? "; requirements not met" : ""})`, unmet: unmet.length > 0 || notBasic };
        }),
    ].map((o) => ({ ...o, selected: o.value === this.choices.cls }));
    const cls = await this.#chosenClass();
    context.classOptions = classOptions;
    if (!cls) return Object.assign(context, { cls: null });

    const plan = L.levelPlan({ d, classes, system: actor.system, cls, nonhuman });
    // Skills: each with its cost bought as this class, its ranks, and what has been bought now.
    const rows = [...d.skills, ...this.choices.specialties.filter((s) => !d.skills.some((r) => r.key === s.skill && r.specialty === s.specialty))
      .map((s) => ({ key: s.skill, name: SKILLS[s.skill].name, specialty: s.specialty, ranks: 0, points: null, classSkill: classes.some((c) => L.classSkillOf({ key: s.skill, specialty: s.specialty }, c)), alwaysClass: false }))];
    const offers = Object.fromEntries(rows.map((r) => [`${r.key}|${r.specialty ?? ""}`, L.skillOffer(r, cls, plan.level)]));
    const left = L.pointsLeft(this.choices.bought, plan.skillPoints);
    const skills = rows.map((r) => {
      const id = `${r.key}|${r.specialty ?? ""}`, o = offers[id], spent = this.choices.bought[id] ?? 0;
      const ranks = o.ranks + spent / o.cost;
      return { id, name: o.name, cost: o.cost, ranks: o.ranks, after: ranks, spent, max: o.max, canBuy: left >= 1 && ranks + o.step <= o.max, canSell: spent > 0, classSkill: o.cost === 1 };
    });
    this.rows = rows;
    this.offers = offers;
    this.plan = plan;

    // What the level changes, worked out on a copy: the class one level higher, its hit point roll in.
    const items = plainItems(actor).filter((i) => !(i.type === "class" && i.name === cls.name));
    const level = plan.classLevel;
    const rolls = [...(cls.own?.system.hitPoints ?? [])];
    rolls[level - 1] = plan.maxHitPoints ? null : this.choices.hitPoints;
    items.push({ type: "class", name: cls.name, system: { ...(cls.system.toObject?.() ?? cls.system), level, hitPoints: rolls } });
    // With the ranks bought and the ability increase chosen, so a feat's prerequisites are judged as at the new level.
    const systemAfter = L.afterLevel(actor.system, actor.system.toObject(), {
      bought: this.choices.bought, rows, offers, specialties: this.choices.specialties, increase: plan.increase ? this.choices.increase : "",
    });
    const after = deriveCharacter(systemAfter, items);
    const change = (label, a, b, fmt = signed) => ({ label, before: fmt(a), after: fmt(b), changed: a !== b });
    const summary = [
      change("Level", d.level, after.level, String), change("Base attack", d.baseAttackBonus, after.baseAttackBonus),
      ...["fort", "ref", "will"].map((s) => change({ fort: "Fortitude", ref: "Reflex", will: "Will" }[s], d.saves[s], after.saves[s])),
      change("Defense", d.defense.value, after.defense.value, String), change("Reputation", d.reputation, after.reputation),
      change("Hit points", d.hitPoints.max, after.hitPoints.max, String),
    ];

    // At 1st level: the feats the occupation, species and class give (rules/advancement.mjs featGrants), those
    // taken from a choice ticked.
    const grantItems = plainItems(actor).filter((i) => i.type !== "actor");
    if (plan.isNew) grantItems.push({ id: cls.uuid, type: "class", name: cls.name, system: { ...(cls.system.toObject?.() ?? cls.system), level: 1 } });
    const grantList = plan.firstClass ? featGrants(grantItems, actor.system.startingClass) : [];
    const granted = (g, i) => g.choose >= g.options.length || this.choices.grants.includes(`${g.source}|${i}`);
    const bonusPick = plan.bonusFeat && this.choices.bonusFeat !== "" ? (cls.system.bonusFeats ?? [])[Number(this.choices.bonusFeat)] : null;

    // Feats: the compendium's, by name, with any choice they need and whether the character meets their
    // prerequisites (rules/prerequisites.mjs) as it will be at the new level: its base attack bonus and saves,
    // the ranks and increase chosen here, and the other feats this level brings (two at 1st level, a bonus feat,
    // those given).
    // Each with its text's start and its entry, to read before choosing.
    const feats = (await index("feats", ["system.prerequisites", "system.benefit"])).map((e) => ({ name: e.name, prerequisites: e.system?.prerequisites ?? "", uuid: e.uuid, summary: textStart(e.system?.benefit) }));
    const featNamed = (name) => feats.find((f) => f.name === name);
    const chosen = [...this.choices.feats.filter(Boolean), bonusPick?.name, ...grantList.flatMap((g) => g.options.filter((o, i) => granted(g, i)).map((o) => o.name))].filter(Boolean);
    const pre = { d: after, feats: [...have.feats.map((f) => f.name), ...chosen], known: new Set(feats.map((f) => slug(f.name))) };
    const status = (name) => {
      const text = feats.find((f) => f.name === name)?.prerequisites ?? "";
      if (!text) return { text: "", met: true };
      const r = featPrerequisites(text, pre);
      return { text, met: r.met, missing: r.missing.join(", "), check: r.check.join(", ") };
    };
    const featSlots = Array.from({ length: plan.feats }, (_, i) => {
      const name = this.choices.feats[i] ?? "";
      return { index: i, name, choice: this.choices.featChoices[i] ?? "", choiceKind: CHOICES[slug(name)] ?? "", prerequisites: status(name), uuid: featNamed(name)?.uuid ?? "", summary: featNamed(name)?.summary ?? "" };
    });
    // The class's bonus feat list and talent trees, each talent with its prerequisites.
    const bonusOptions = plan.bonusFeat ? (cls.system.bonusFeats ?? []).map((o, i) => {
      const unmet = status(o.name).met === false;
      return { value: String(i), label: `${o.specialty ? `${o.name} (${o.specialty})` : o.name}${unmet ? " (prerequisites not met)" : ""}`, selected: this.choices.bonusFeat === String(i) };
    }) : [];
        const ownedTalents = have.talents.map((t) => ({ name: t.name, tree: t.system.tree }));
    const talentIndex = plan.talent ? new Map((await index("talents", ["system.prerequisites", "system.tree", "system.description"])).map((e) => [e.uuid, e])) : new Map();
    const talentOptions = plan.talent ? (cls.system.talentTrees ?? []).flatMap((tree) => tree.talents.map((t) => {
      const doc = talentIndex.get(t.uuid);
      const taken = have.talents.some((x) => identify(x) === slug(t.name));
      const pre = doc ? talentPrerequisites(doc, ownedTalents) : { met: true, missing: [] };
      return { value: t.uuid, label: `${tree.name}: ${t.name}${taken ? " (taken)" : pre.met === false ? ` (needs ${pre.missing.join(", ")})` : ""}`, disabled: taken, selected: this.choices.talent === t.uuid };
    })) : [];
    // The feats given, each option a numbered box (its id holds a uuid's dots, which a form's names cannot).
    this.grantIds = [];
    const grants = grantList.map((g) => ({
      text: `${g.name} (${g.label}): ${g.choose >= g.options.length ? "gives" : `choose ${g.choose} of`}`,
      options: g.options.map((o, i) => {
        const n = this.grantIds.push(`${g.source}|${i}`) - 1;
        const all = g.choose >= g.options.length;
        return { name: `grant~${n}`, label: o.specialty ? `${o.name} (${o.specialty})` : o.name, checked: granted(g, i), fixed: all, uuid: o.uuid ?? "" };
      }),
    }));

    const learning = await this.#learning(cls, plan, after);

    // What is left undone (a warning: the level can still be taken), and a feat that is not one (it would be lost).
    const unknown = featSlots.filter((f) => f.name && !feats.some((x) => x.name === f.name)).map((f) => f.name);
    const warnings = [
      ...featSlots.filter((f) => !f.name).map(() => "A feat is not chosen."),
      ...featSlots.filter((f) => f.name && f.prerequisites.met === false).map((f) => `${f.name}: prerequisites not met (${f.prerequisites.missing}).`),
      plan.bonusFeat && bonusPick && status(bonusPick.name).met === false && `${bonusPick.name}: prerequisites not met (${status(bonusPick.name).missing}).`,
      plan.bonusFeat && !this.choices.bonusFeat && "The bonus feat is not chosen.",
      plan.talent && !this.choices.talent && "The talent is not chosen.",
      plan.increase && !this.choices.increase && "The ability increase is not chosen.",
      left > 0 && `${left} skill point${left === 1 ? "" : "s"} not spent.`,
      ...(learning?.warnings ?? []),
    ].filter(Boolean);
    const errors = [
      ...unknown.map((n) => `“${n}” is not a feat in the compendium.`),
      plan.beyondMax && `${cls.name} has no level ${plan.classLevel}.`,
      !plan.maxHitPoints && !this.choices.hitPoints && "Roll or enter the hit points.",
      left < 0 && "More skill points spent than the level gives.",
    ].filter(Boolean);

    return Object.assign(context, {
      warnings, errors,
      cls: { name: cls.name, hitDie: plan.hitDie }, plan, summary,
      hitPoints: this.choices.hitPoints, maxHitPoints: plan.maxHitPoints,
      skills, specialtySkills: Object.entries(SKILLS).filter(([, s]) => s.specialties).map(([key, s]) => ({ key, name: s.name, selected: key === this.choices.newSpecialtySkill })),
      newSpecialty: this.choices.newSpecialty ?? "",
      // The book's specialties of the skill chosen (Craft's, Knowledge's, the languages), to pick from as one types: not those had or added.
      specialtyList: specialtiesToAdd(this.choices.newSpecialtySkill ?? Object.keys(SKILLS).find((k) => SKILLS[k].specialties), [...d.skills, ...this.choices.specialties.map((x) => ({ key: x.skill, specialty: x.specialty }))]),
      points: { total: plan.skillPoints, left, over: left < 0 },
      featList: feats, featSlots,
      bonus: plan.bonusFeat ? {
        options: bonusOptions, choiceKind: bonusPick && !bonusPick.specialty ? CHOICES[slug(bonusPick.name)] ?? "" : "", choice: this.choices.bonusChoice,
        uuid: bonusPick ? bonusPick.uuid || featNamed(bonusPick.name)?.uuid || "" : "", summary: bonusPick ? featNamed(bonusPick.name)?.summary ?? "" : "",
      } : null,
      talents: plan.talent ? talentOptions : null,
      talent: plan.talent && this.choices.talent ? { uuid: this.choices.talent, summary: textStart(talentIndex.get(this.choices.talent)?.system?.description) } : null,
      // The class's own entry, and its features at this level, to read.
      classUuid: cls.own?.uuid ?? cls.uuid ?? "",
      features: plan.features.map((name) => ({ name, uuid: (cls.system.features ?? []).find((f) => f.name === name)?.uuid ?? "" })),
      increase: plan.increase ? ABILITIES.map((a) => ({ value: a, label: ABILITY_NAMES[a], selected: this.choices.increase === a })) : null,
      grants, learning,
      wealth: !plan.firstClass ? { checked: this.choices.wealth } : null,
      ready: !errors.length,
    });
  }

  /** A field changed: the state follows, and the window shows what it now makes of the level. */
  static async #onChange(event, form, formData) {
    const f = foundry.utils.expandObject(formData.object);
    const s = this.choices;
    if (f.cls !== undefined && f.cls !== s.cls) Object.assign(s, { cls: f.cls, bought: {}, bonusFeat: "", talent: "", spells: [], trigger: "" });
    if (f.spells) for (const [i, v] of Object.entries(f.spells)) s.spells[i] = v ?? "";
    if (f.trigger !== undefined) s.trigger = f.trigger;
    if (f.hitPoints !== undefined) s.hitPoints = f.hitPoints === "" || f.hitPoints === null ? null : Math.max(1, Math.min(this.plan?.hitDie || 99, Math.round(Number(f.hitPoints)) || 1));
    if (f.feats) for (const [i, v] of Object.entries(f.feats)) { s.feats[i] = v.name ?? ""; s.featChoices[i] = v.choice ?? ""; }
    if (f.bonusFeat !== undefined) s.bonusFeat = f.bonusFeat;
    if (f.bonusChoice !== undefined) s.bonusChoice = f.bonusChoice;
    if (f.talent !== undefined) s.talent = f.talent;
    if (f.increase !== undefined) s.increase = f.increase;
    const grantBoxes = Object.entries(formData.object).filter(([k]) => k.startsWith("grant~"));
    if (grantBoxes.length) s.grants = grantBoxes.filter(([, v]) => v).map(([k]) => this.grantIds[Number(k.slice(6))]).filter(Boolean);
    if (f.wealth !== undefined) s.wealth = !!f.wealth;
    // A specialty being typed: kept, as the window draws again.
    if (f.newSpecialty !== undefined) s.newSpecialty = f.newSpecialty;
    if (f.newSpecialtySkill !== undefined) s.newSpecialtySkill = f.newSpecialtySkill;
    this.render();
  }

  /** A point spent on a skill, or taken back. */
  static #onBuy(event, target) {
    const id = target.dataset.skill;
    const spent = (this.choices.bought[id] ?? 0) + Number(target.dataset.delta);
    if (spent > 0) this.choices.bought[id] = spent; else delete this.choices.bought[id];
    this.render();
  }

  /** Roll the class's Hit Die for the level. */
  static async #onRollHitPoints() {
    const roll = await new Roll(`1d${this.plan.hitDie}`).evaluate();
    this.choices.hitPoints = roll.total;
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `<div class="m20-roll"><h3>Hit points for level ${this.plan.level} (${this.plan.className})</h3></div>` });
    this.render();
  }

  /** A specialty to buy ranks in this level (Craft (writing), Speak Language (French)). */
  static #onAddSpecialty() {
    const skill = this.element.querySelector("[name=newSpecialtySkill]")?.value || this.choices.newSpecialtySkill;
    const specialty = (this.element.querySelector("[name=newSpecialty]")?.value || this.choices.newSpecialty || "").trim();
    if (!skill || !specialty || this.choices.specialties.some((s) => s.skill === skill && s.specialty === specialty)) return;
    this.choices.specialties.push({ skill, specialty });
    this.choices.newSpecialty = "";
    this.render();
  }

  /** Take the level: write it all, record it, and close. Once: a second click while the first is writing would take another level. */
  static async #onFinish() {
    if (this.finishing) return;
    this.finishing = true;
    await finishing(this, `${this.actor.name}'s level`, () => this.#take());
  }

  async #take() {
    const actor = this.actor;
    const plan = this.plan;
    const cls = await this.#chosenClass();
    if (!cls || !plan) { this.finishing = false; return; }
    const s = this.choices;
    const created = [];
    const history = { id: foundry.utils.randomID(), kind: "level", note: "", effects: [], level: plan.level, className: cls.name, classId: "", isNew: plan.isNew, hitPoints: plan.maxHitPoints ? null : s.hitPoints, ranks: [], items: [], increase: "", actionPoints: 0, wealth: null, time: Date.now() };
    // The class: a level more, or a new class at 1st, with its hit point roll.
    let classItem = cls.own;
    if (classItem) {
      const rolls = [...classItem.system.hitPoints];
      rolls[plan.classLevel - 1] = history.hitPoints;
      await classItem.update({ "system.level": plan.classLevel, "system.hitPoints": rolls.map((r) => r ?? null) });
    } else {
      const data = (await fromUuid(cls.uuid)).toObject();
      delete data._id;
      foundry.utils.mergeObject(data, { system: { level: 1, hitPoints: [history.hitPoints] }, _stats: { compendiumSource: cls.uuid } });
      [classItem] = await actor.createEmbeddedDocuments("Item", [data]);
    }
    history.classId = classItem.id;
    // The skill points: new specialties first, then the ranks.
    const system = actor.system.toObject();
    for (const sp of s.specialties) if (!system.specialtySkills.some((x) => x.skill === sp.skill && x.specialty === sp.specialty)) system.specialtySkills.push({ skill: sp.skill, specialty: sp.specialty, ranks: 0, misc: 0, classSkill: false, points: null });
    const rows = this.rows.map((r) => ({ ...r, points: r.points ?? null }));
    const bought = L.buyRanks(system, rows, this.offers, s.bought);
    history.ranks = bought.record;
    const update = { "system.specialtySkills": bought.specialtySkills };
    for (const [k, v] of Object.entries(bought.skills)) Object.assign(update, { [`system.skills.${k}.ranks`]: v.ranks, [`system.skills.${k}.points`]: v.points });
    // The ability increase and the action points.
    if (plan.increase && s.increase) { update["system.abilityIncreases"] = [...actor.system.abilityIncreases, s.increase]; history.increase = s.increase; }
    if (plan.actionPoints) {
      update["system.actionPoints.value"] = (actor.system.actionPoints.value ?? 0) + plan.actionPoints;
      update["system.actionPoints.granted"] = actor.items.filter((i) => i.type === "class").reduce((n, c) => n + c.system.level, 0);
      history.actionPoints = plan.actionPoints;
    }
    await actor.update(update);
    // The feats and talent the level brings, each from its compendium entry.
    const add = async (uuid, system = {}, flags = {}) => {
      const doc = uuid ? await fromUuid(uuid) : null;
      if (!doc) return;
      const data = doc.toObject();
      delete data._id;
      foundry.utils.mergeObject(data, { system, flags: { [SYSTEM_ID]: flags }, _stats: { compendiumSource: doc.uuid } });
      created.push(data);
    };
    const featIndex = await index("feats");
    for (const [i, name] of s.feats.entries()) {
      const entry = featIndex.find((e) => e.name === name);
      if (entry) await add(entry.uuid, s.featChoices[i] ? { choice: s.featChoices[i] } : {});
    }
    const bonus = plan.bonusFeat && s.bonusFeat !== "" ? (cls.system.bonusFeats ?? [])[Number(s.bonusFeat)] : null;
    if (bonus) await add(bonus.uuid, { choice: bonus.specialty || s.bonusChoice || "" }, { bonusFor: classItem.id, bonusAdded: true });
    if (plan.talent && s.talent) await add(s.talent);
    // The spells or powers: those added whole, those chosen, the trigger power marked with this level.
    const learn = this.learn ?? { all: [], chosen: [], trigger: "" };
    // Fetched at once: a Mage's 0-level spells are a score of them.
    const wanted = [...learn.all, ...learn.chosen];
    if (wanted.length) {
      const pack = game.packs.get(foundry.utils.parseUuid(wanted[0]).collection?.collection ?? "");
      const docs = pack ? await pack.getDocuments({ _id__in: wanted.map((u) => foundry.utils.parseUuid(u).id) }) : [];
      for (const doc of docs) {
        const o = doc.toObject();
        delete o._id;
        foundry.utils.mergeObject(o, { flags: { [SYSTEM_ID]: learn.trigger === `new:${doc.uuid}` ? { trigger: history.id } : {} }, _stats: { compendiumSource: doc.uuid } });
        created.push(o);
      }
    }
    if (learn.trigger.startsWith("item:")) await actor.items.get(learn.trigger.slice(5))?.setFlag(SYSTEM_ID, "trigger", history.id);
    if (plan.firstClass) {
      const grantItems = plainItems(actor).filter((i) => i.type !== "actor");
      for (const g of featGrants(grantItems, actor.system.startingClass)) {
        g.options.forEach((o, i) => {
          if (g.choose >= g.options.length || s.grants.includes(`${g.source}|${i}`)) created.push({ uuid: o.uuid, choice: o.specialty ?? "", grantedBy: g.source });
        });
      }
    }
    // Grants are added as feats from their links.
    const data = [];
    for (const c of created) {
      if (!c.uuid) { data.push(c); continue; }
      const doc = await fromUuid(c.uuid);
      if (!doc || actor.items.some((i) => i.type === "feat" && identify(i) === identify(doc) && (!c.choice || i.system.choice === c.choice))) continue;
      const o = doc.toObject();
      delete o._id;
      foundry.utils.mergeObject(o, { system: { choice: c.choice }, flags: { [SYSTEM_ID]: { grantedBy: c.grantedBy } }, _stats: { compendiumSource: doc.uuid } });
      data.push(o);
    }
    if (data.length) history.items = (await actor.createEmbeddedDocuments("Item", data)).map((i) => i.id);
    await actor.update({ "system.history": [...actor.system.toObject().history, history] });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="m20-roll"><h3>${foundry.utils.escapeHTML(actor.name)} reaches level ${plan.level}</h3><p>${foundry.utils.escapeHTML(cls.name)} ${plan.classLevel}${history.hitPoints ? `, ${history.hitPoints} on the Hit Die` : ""}.</p></div>` });
    this.close();
    // A new level's Wealth: the Profession check (rules/wealth.mjs), what it gained recorded with the level for undoing.
    if (!plan.firstClass && s.wealth) {
      const gain = await regainWealth(actor);
      if (gain !== null && gain !== undefined) {
        await actor.update({ "system.history": actor.system.toObject().history.map((h) => (h.id === history.id ? { ...h, wealth: gain } : h)) });
      }
    }
  }
}

/** The compendiums a grant can take from, by pack name. */
const GRANT_PACKS = [["feats", "Feat"], ["talents", "Talent"], ["features", "Class feature"], ["spells", "Spell"], ["powers", "Psionic power"], ["incantations", "Incantation"], ["equipment", "Equipment"]];

/**
 * Something gained outside a level, by an event in play ("touched by the artifact"), with a note of what:
 * items from the compendiums or a new feat of the table's own, free ranks (costing no skill points), and an
 * ability bonus (an effect named for the note). Recorded in the history like a level, and undone the same way.
 */
export class Grant extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["modern20", "m20-levelup"],
    tag: "form",
    position: { width: 600, height: 640 },
    window: { resizable: true, icon: "fa-solid fa-gift" },
    form: { submitOnChange: true, closeOnSubmit: false, handler: Grant.#onChange },
    actions: { addRow: Grant.#onAddRow, removeRow: Grant.#onRemoveRow, finish: Grant.#onFinish, view, browse },
  };

  static PARTS = { body: { template: "systems/modern20/templates/grant.hbs", scrollable: [""] } };

  constructor(actor, options = {}) {
    super({ ...options, window: { ...options.window, title: `${actor.name}: gained outside a level` } });
    this.actor = actor;
    this.choices = { note: "", items: [{ pack: "feats", name: "", choice: "" }], newFeat: { name: "", description: "" }, ranks: [], ability: "", bonus: 1 };
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const c = this.choices;
    const lists = {};
    for (const { pack } of c.items) lists[pack] ??= (await index(pack)).map((e) => e.name).sort();
    const skills = this.actor.system.derived.skills.map((r) => ({ value: `${r.key}|${r.specialty ?? ""}`, label: r.specialty ? `${r.name} (${r.specialty})` : r.name }));
    const unknown = [];
    for (const it of c.items) if (it.name && !(await index(it.pack)).some((e) => e.name === it.name)) unknown.push(`“${it.name}” is not in the ${GRANT_PACKS.find(([p]) => p === it.pack)?.[1] ?? it.pack} compendium.`);
    return Object.assign(context, {
      errors: [...unknown, ...(c.note.trim() ? [] : ["Say what happened first."])],
      note: c.note,
      items: await Promise.all(c.items.map(async (it, i) => ({
        ...it, index: i, packs: GRANT_PACKS.map(([v, l]) => ({ value: v, label: l, selected: v === it.pack })), list: `m20-grant-${it.pack}`,
        choiceKind: it.pack === "feats" || it.pack === "talents" ? CHOICES[slug(it.name)] ?? "" : "",
        // Its entry, to read before adding it.
        uuid: it.name ? (await index(it.pack)).find((e) => e.name === it.name)?.uuid ?? "" : "",
      }))),
      lists: Object.entries(lists).map(([pack, names]) => ({ id: `m20-grant-${pack}`, names })),
      newFeat: c.newFeat,
      ranks: c.ranks.map((r, i) => ({ ...r, index: i, skills: skills.map((s) => ({ ...s, selected: s.value === r.skill })) })),
      abilities: ABILITIES.map((a) => ({ value: a, label: ABILITY_NAMES[a], selected: a === c.ability })), bonus: c.bonus,
      ready: !!c.note.trim() && !unknown.length,
    });
  }

  static #onChange(event, form, formData) {
    const f = foundry.utils.expandObject(formData.object);
    const c = this.choices;
    if (f.note !== undefined) c.note = f.note;
    if (f.items) for (const [i, v] of Object.entries(f.items)) Object.assign(c.items[i] ?? {}, { pack: v.pack ?? c.items[i]?.pack, name: v.name ?? "", choice: v.choice ?? "" });
    if (f.newFeat) c.newFeat = { name: f.newFeat.name ?? "", description: f.newFeat.description ?? "" };
    if (f.ranks) for (const [i, v] of Object.entries(f.ranks)) Object.assign(c.ranks[i] ?? {}, { skill: v.skill, ranks: Math.max(0, Number(v.ranks) || 0) });
    if (f.ability !== undefined) c.ability = f.ability;
    if (f.bonus !== undefined) c.bonus = Math.round(Number(f.bonus) || 0);
    this.render();
  }

  static #onAddRow(event, target) {
    if (target.dataset.list === "items") this.choices.items.push({ pack: "feats", name: "", choice: "" });
    else this.choices.ranks.push({ skill: "", ranks: 1 });
    this.render();
  }

  static #onRemoveRow(event, target) {
    this.choices[target.dataset.list].splice(Number(target.dataset.index), 1);
    this.render();
  }

  static async #onFinish() {
    if (this.finishing || !this.choices.note.trim()) return;
    this.finishing = true;
    await finishing(this, `What ${this.actor.name} gained`, () => this.#take());
  }

  async #take() {
    const actor = this.actor;
    const c = this.choices;
    const note = c.note.trim();
    const flags = { [SYSTEM_ID]: { grantNote: note } };
    // The items: from the compendiums, and a new feat of the table's own.
    const data = [];
    for (const it of c.items) {
      const entry = it.name && (await index(it.pack)).find((e) => e.name === it.name);
      const doc = entry ? await fromUuid(entry.uuid) : null;
      if (!doc) continue;
      const o = doc.toObject();
      delete o._id;
      foundry.utils.mergeObject(o, { system: it.choice ? { choice: it.choice } : {}, flags, _stats: { compendiumSource: doc.uuid } });
      data.push(o);
    }
    if (c.newFeat.name.trim()) {
      data.push({ name: c.newFeat.name.trim(), type: "feat", img: "icons/svg/aura.svg", flags, system: { description: `<p>${foundry.utils.escapeHTML(c.newFeat.description || note)}</p>` } });
    }
    const items = data.length ? (await actor.createEmbeddedDocuments("Item", data)).map((i) => i.id) : [];
    // The free ranks: ranks that cost no skill points.
    const rows = actor.system.derived.skills;
    const record = [];
    const update = { "system.specialtySkills": structuredClone(actor.system.toObject().specialtySkills) };
    for (const r of c.ranks.filter((x) => x.skill && x.ranks > 0)) {
      const [key, specialty] = r.skill.split("|");
      const row = rows.find((x) => x.key === key && (x.specialty ?? "") === specialty);
      if (!row) continue;
      // The points the ranks already cost stay as they were: these cost none.
      const points = row.points ?? (row.ranks ?? 0) * (row.classSkill ? 1 : 2);
      if (SKILLS[key]?.specialties) {
        const s = update["system.specialtySkills"].find((x) => x.skill === key && x.specialty === specialty);
        if (s) Object.assign(s, { ranks: (s.ranks ?? 0) + r.ranks, points });
      } else Object.assign(update, { [`system.skills.${key}.ranks`]: (row.ranks ?? 0) + r.ranks, [`system.skills.${key}.points`]: points });
      record.push({ skill: key, specialty, ranks: r.ranks, points: 0 });
    }
    // The ability bonus: a permanent effect named for what gave it.
    const effects = [];
    if (c.ability && c.bonus) {
      const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: note, img: "icons/svg/upgrade.svg", flags,
        system: { changes: [{ key: `system.bonuses.abilities.${c.ability}`, type: "add", value: String(c.bonus), phase: "initial" }] },
      }]);
      effects.push(effect.id);
    }
    const entry = { id: foundry.utils.randomID(), kind: "grant", note, level: actor.system.derived.level ?? 0, className: "", classId: "", isNew: false, hitPoints: null, ranks: record, items, effects, increase: "", actionPoints: 0, time: Date.now() };
    await actor.update({ ...update, "system.history": [...actor.system.toObject().history, entry] });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="m20-roll"><h3>${foundry.utils.escapeHTML(actor.name)} gains, outside a level</h3><p>${foundry.utils.escapeHTML(note)}</p></div>` });
    this.close();
  }
}

/**
 * Run a window's finish, `take`: an error part way (a write refused) is said, with what was already written
 * left on the sheet to check, and the window's button works again.
 */
async function finishing(app, what, take) {
  try {
    await take();
  } catch (err) {
    console.error(`${SYSTEM_ID} | ${what} was not finished:`, err);
    ui.notifications.error(`${what} was not finished: ${err.message}. Anything written before this is on the sheet; check it before trying again.`);
    app.finishing = false;
    if (app.rendered) app.render();
  }
}

/**
 * Take back the last level in the character's history: its class level (or the class, if it was new),
 * hit point roll, ranks and points, feats and talent, ability increase and action points.
 */
export async function undoLastLevel(actor) {
  const history = actor.system.toObject().history;
  const last = history.at(-1);
  if (!last) return;
  const grant = last.kind === "grant";
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: grant ? `${actor.name}: undo what was granted` : `${actor.name}: undo level ${last.level}` },
    content: grant ? `<p>Take back what was granted (${foundry.utils.escapeHTML(last.note)}): its items, ranks and ability bonus?</p>`
      : `<p>Take back level ${last.level} (${foundry.utils.escapeHTML(last.className)}): its hit points, skill ranks, feats and talents, spells and powers, ability increase and action points?</p>`,
  });
  if (!ok) return;
  const items = last.items.filter((id) => actor.items.has(id));
  if (items.length) await actor.deleteEmbeddedDocuments("Item", items);
  // A trigger power chosen with it, among those kept.
  for (const i of actor.items.filter((x) => x.flags?.[SYSTEM_ID]?.trigger === last.id)) await i.unsetFlag(SYSTEM_ID, "trigger");
  const effects = (last.effects ?? []).filter((id) => actor.effects.has(id));
  if (effects.length) await actor.deleteEmbeddedDocuments("ActiveEffect", effects);
  const { skills, specialtySkills } = L.unbuyRanks(actor.system.toObject(), last.ranks);
  const update = { "system.specialtySkills": specialtySkills, "system.history": history.slice(0, -1) };
  for (const [k, v] of Object.entries(skills)) Object.assign(update, { [`system.skills.${k}.ranks`]: v.ranks, [`system.skills.${k}.points`]: v.points });
  if (last.increase) {
    const increases = [...actor.system.abilityIncreases];
    const at = increases.lastIndexOf(last.increase);
    if (at >= 0) increases.splice(at, 1);
    update["system.abilityIncreases"] = increases;
  }
  // The level's Wealth check: what it gained, and the level it was made for.
  if (last.wealth !== null && last.wealth !== undefined) {
    update["system.wealth.value"] = Math.max(0, (actor.system.wealth.value ?? 0) - last.wealth);
    update["system.wealth.regainedLevel"] = Math.max(1, (actor.system.wealth.regainedLevel || 1) - 1);
  }
  if (last.actionPoints) {
    update["system.actionPoints.value"] = Math.max(0, (actor.system.actionPoints.value ?? 0) - last.actionPoints);
    update["system.actionPoints.granted"] = Math.max(0, (actor.system.actionPoints.granted ?? 0) - 1);
  }
  await actor.update(update);
  const cls = grant ? null : actor.items.get(last.classId);
  if (cls && last.isNew) await cls.delete();
  else if (cls) await cls.update({ "system.level": Math.max(1, cls.system.level - 1), "system.hitPoints": cls.system.hitPoints.slice(0, Math.max(1, cls.system.level - 1)) });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="m20-roll"><p>${foundry.utils.escapeHTML(actor.name)}: ${grant ? `what was granted (${foundry.utils.escapeHTML(last.note)})` : `level ${last.level} (${foundry.utils.escapeHTML(last.className)})`} taken back.</p></div>` });
}
