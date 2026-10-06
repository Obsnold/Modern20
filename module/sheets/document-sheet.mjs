/**
 * The read-only view of a document: its stored fields as a table, its rules
 * text, and a link to the SRD page it came from. `describe` builds it for any
 * document; the item sheet is this view, and so is the creature sheet
 * (creature-sheet.mjs), with rolls added.
 *
 * Both can be switched to an edit view (`Editable`), a form built from the
 * type's field descriptions (edit-form.mjs), for a document that can be changed:
 * one in the world, not a compendium's.
 */
import { ITEM_MODELS, ACTOR_MODELS } from "../data/models.mjs";
import { obj, initial } from "../data/schema.mjs";
import { editForm, fromForm, specAt } from "./edit-form.mjs";
import { SKILLS } from "../data/skills.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
const { TextEditor } = foundry.applications.ux;

/** Fields shown as rules text rather than in the table, in this order. */
const PROSE = ["benefit", "normal", "special", "description"];
/** Fields not in the table: the source is the header link; a class's levels, features and talent trees get sections of their own. */
const HIDDEN = new Set(["source", ...PROSE, "features", "talentTrees", "requirements", "rollNotes"]);

const escape = (s) => foundry.utils.escapeHTML(String(s));

/** "spellResistance" -> "Spell Resistance" */
/** Field names a reader knows by another: "CR", not "Cr". */
const NAMES = { cr: "CR", hp: "Hit Points", dc: "DC" };
const label = (key) => NAMES[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

/** A link to another document, or a named entry in a list ("Craft (writing) (int)", "Survival +1 (+5 when tracking)"), as HTML. */
function entry(value) {
  const bonus = typeof value.bonus === "number" ? (value.bonus >= 0 ? `+${value.bonus}` : `${value.bonus}`) : "";
  const text = [value.name ?? value.value, value.specialty && `(${value.specialty})`, value.ability && `(${value.ability})`, bonus, value.note && `(${value.note})`, value.detail && value.detail !== value.name && `[${value.detail}]`].filter(Boolean).join(" ");
  if (value.uuid) return `@UUID[${value.uuid}]{${escape(text)}}`;
  if ("class" in value && "level" in value) return `${escape(value.class)} ${value.level}`;
  return escape(text);
}

const isEntry = (v) => v && typeof v === "object" && !Array.isArray(v) && ("uuid" in v || "name" in v || ("class" in v && "level" in v));

/**
 * Rows for the field table: every stored value, nested objects flattened as
 * "Parent: Child". Empty strings, nulls and false flags are left out, and so are
 * zeros inside nested objects (an ability modifier of 0).
 */
export function rows(system, prefix = "") {
  const out = [];
  for (const [key, value] of Object.entries(system ?? {})) {
    if (!prefix && HIDDEN.has(key)) continue;
    // A class's levels are its level table, shown on its own (a spell's levels are class and level pairs).
    if (!prefix && key === "levels" && value?.[0]?.baseAttackBonus) continue;
    // A group's own value is named by the group: "Defense 16", then "Defense: Touch 13".
    const name = prefix ? (key === "value" ? prefix : `${prefix}: ${label(key)}`) : label(key);
    if (value === null || value === undefined || value === "" || value === false) continue;
    if (prefix && value === 0) continue;
    if (value && typeof value === "object" && !Array.isArray(value) && !isEntry(value)) {
      // Current and maximum together: "58 / 58".
      const keys = Object.keys(value);
      if (keys.length === 2 && typeof value.value === "number" && typeof value.max === "number") {
        out.push({ label: name, html: `${value.value} / ${value.max}` });
        continue;
      }
      // A value as printed ("20 ft.", "+4", "3 lb."): shown once, without the number worked from it
      // (Speed: Ft 20); any other text beside it (a class's first-level skill points) still shows.
      if (typeof value.value === "string" && value.value) {
        out.push({ label: name, html: escape(value.value) });
        out.push(...rows(Object.fromEntries(Object.entries(value).filter(([k, v]) => k !== "value" && typeof v !== "number")), name));
        continue;
      }
    }
    if (Array.isArray(value)) {
      // Named entries with text of their own (a species' special qualities, a type's or template's
      // traits) are shown as prose; a creature's special qualities are only names.
      if (!value.length || (!prefix && value[0]?.description)) continue;
      out.push({ label: name, html: value.map((v) => (isEntry(v) ? entry(v) : typeof v === "object" ? "" : escape(v))).filter(Boolean).join(", ") });
    } else if (isEntry(value)) out.push({ label: name, html: entry(value) });
    else if (typeof value === "object") out.push(...rows(value, name));
    else out.push({ label: name, html: value === true ? "Yes" : escape(value) });
  }
  return out.filter((r) => r.html);
}

const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

/** A class's level table, as the book prints it. */
export function levelTable(levels) {
  const head = ["Level", "BAB", "Fort", "Ref", "Will", "Features", "Defense", "Reputation"];
  const body = levels.map((l) => `<tr><td>${l.level}</td><td>${escape(l.baseAttackBonus.value)}</td><td>${signed(l.saves.fort)}</td><td>${signed(l.saves.ref)}</td><td>${signed(l.saves.will)}</td>`
    + `<td>${l.features.map((f) => escape(f.name)).join(", ")}</td><td>${signed(l.defense)}</td><td>${signed(l.reputation)}</td></tr>`).join("");
  return `<table class="modern20-levels"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
}

/** A class's requirements: each as printed, with links to the feats and talents it names. */
export function requirementsList(requirements) {
  return `<dl class="modern20-requirements">${requirements.map((r) => {
    const links = [...(r.feats ?? []), ...(r.talents ?? [])].filter((x) => x.uuid).map(entry);
    return `<dt>${escape(r.label)}</dt><dd>${escape(r.value)}${links.length ? `<br>${links.join(", ")}` : ""}</dd>`;
  }).join("")}</dl>`;
}

/** A creature type's table of ability scores, minimum Hit Dice and natural weapon damage by size. */
export function sizeTable(sizes) {
  const cols = ["size", "str", "dex", "con", "minimumHitDice", "extraHitPoints", "slam", "bite", "claw", "gore"].filter((c) => sizes.some((s) => s[c]));
  const head = cols.map((c) => `<th>${escape(label(c))}</th>`).join("");
  const body = sizes.map((s) => `<tr>${cols.map((c) => `<td>${escape(c === "size" ? label(s[c]) : s[c])}</td>`).join("")}</tr>`).join("");
  return `<table class="modern20-levels"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

const ABILITY_NAMES = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
const SAVE_NAMES = { fort: "Fortitude", ref: "Reflex", will: "Will" };

/** A note's roll as words: "skill.bluff" → "Bluff checks", "save.fort" → "Fortitude saves". */
function rollName(roll) {
  const [kind, what] = roll.split(".");
  if (kind === "skill") return what ? (ABILITY_NAMES[what] ? `${ABILITY_NAMES[what]}-based skill checks` : `${SKILLS[what]?.name ?? what} checks`) : "skill checks";
  if (kind === "save") return what ? `${SAVE_NAMES[what] ?? what} saves` : "saves";
  if (kind === "ability") return what ? `${ABILITY_NAMES[what] ?? what} checks` : "ability checks";
  if (kind === "attack") return what ? `${what} attacks` : "attacks";
  return { check: "all checks", grapple: "grapple checks", casterLevel: "caster level checks", defense: "Defense" }[kind] ?? roll;
}

const ordinal = (n) => `${n}${["th", "st", "nd", "rd"][(n % 100 - 20) % 10] ?? ["th", "st", "nd", "rd"][n % 100] ?? "th"}`;

/** What the read-only template shows for any document: header, field table and rules text. */
export async function describe(doc) {
  // The stored fields, as plain data; a creature's ability modifiers are worked out, not stored.
  const system = doc.system?.toObject?.() ?? doc.system ?? {};
  if (doc.system?.modifiers) system.modifiers = doc.system.modifiers;
  // A character's level, BAB, saves, Defense and skill totals, worked out from its items.
  if (doc.system?.derived) system.derived = doc.system.derived;
  const enrich = (html) => TextEditor.implementation.enrichHTML(html, { relativeTo: doc, secrets: doc.isOwner });
  const source = system.source?.page ? `@UUID[${system.source.page}]{${escape(system.source.book ?? "Source")}}` : escape(system.source?.book ?? "");
  const table = rows(system).map((r) => `<tr><th>${escape(r.label)}</th><td>${r.html}</td></tr>`).join("");
  const prose = [];
  for (const key of PROSE) if (system[key]) prose.push({ title: key === "description" ? "" : label(key), html: await enrich(system[key]) });
  // Species, creature types and templates keep each trait's text with its name.
  for (const q of [...(system.specialQualities ?? []), ...(system.traits ?? [])]) if (q?.description) prose.push({ title: q.name, html: await enrich(q.description) });
  // Notes: what it gives in a situation, shown on the rolls it is for.
  if (system.rollNotes?.length) {
    prose.push({ title: "When Rolling", html: `<ul>${system.rollNotes.map((n) => `<li>${escape(n.text)}${n.value ? ` <strong>(${escape(/^[-@]/.test(n.value) ? n.value : `+${n.value}`)})</strong>` : ""} <span class="modern20-meta">on ${escape(n.rolls.map(rollName).join(", "))}</span></li>`).join("")}</ul>` });
  }
  // A creature type's ability scores, minimum Hit Dice and natural weapons by size.
  if (system.sizes?.length) prose.push({ title: "By Size", html: sizeTable(system.sizes) });
  // Classes: requirements, the level table, then each feature and talent tree.
  if (system.requirements?.length) prose.push({ title: "Requirements", html: await enrich(requirementsList(system.requirements)) });
  if (system.levels?.[0]?.baseAttackBonus) prose.push({ title: "Class Table", html: levelTable(system.levels) });
  for (const f of system.features ?? []) {
    const at = f.levels?.length ? ` (${f.levels.map(ordinal).join(", ")})` : "";
    prose.push({ title: `${f.name}${at}`, html: await enrich(f.description) });
  }
  for (const t of system.talentTrees ?? []) {
    prose.push({ title: `${t.name} Talent Tree`, html: await enrich(`${t.description}<p>${t.talents.map(entry).join(", ")}</p>`) });
  }
  const typeLabel = game.i18n.localize(CONFIG[doc.documentName]?.typeLabels?.[doc.type] ?? `TYPES.${doc.documentName}.${doc.type}`);
  return { doc, typeLabel, source: await enrich(source), table: await enrich(`<table class="modern20-fields">${table}</table>`), prose };
}

/**
 * A sheet with an edit view: the Edit button in its header swaps the read-only
 * view for a form of every stored field. Changes save as they are made.
 */
export function Editable(Base) {
  return class extends Base {
    static DEFAULT_OPTIONS = {
      form: { submitOnChange: true, closeOnSubmit: false },
      actions: { toggleEdit: this.onToggleEdit, addEntry: this.onAddEntry, removeEntry: this.onRemoveEntry },
    };

    /** Whether the edit view is showing. */
    editing = false;

    /** The type's field description, as one object (data/models.mjs). */
    get fieldSpec() {
      const models = this.document.documentName === "Item" ? ITEM_MODELS : ACTOR_MODELS;
      return obj(models[this.document.type] ?? {});
    }

    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      context.canEdit = this.isEditable;
      context.editing = this.editing && this.isEditable;
      if (context.editing) {
        // Not "editor": Foundry has a Handlebars helper of that name, which a template value of the same name loses to.
        context.editFormHtml = editForm(this.fieldSpec.fields, this.document.system.toObject(), { html: richText });
      }
      return context;
    }

    /** What the form sent, as the document's data: lists rebuilt from their entries' inputs. */
    _processFormData(event, form, formData) {
      const data = super._processFormData(event, form, formData);
      if (data.system) data.system = fromForm(this.fieldSpec, data.system, this.document.system.toObject());
      return data;
    }

    static onToggleEdit() {
      this.editing = !this.editing;
      this.render();
    }

    /** Add an entry to a list ("system.traits"), with its fields' defaults. */
    static async onAddEntry(event, target) {
      const path = target.dataset.path;
      const spec = specAt(this.fieldSpec, path.replace(/^system\.?/, ""));
      if (spec?.kind !== "array") return;
      const list = [...(foundry.utils.getProperty(this.document.toObject(), path) ?? []), initial(spec.of)];
      await this.document.update({ [path]: list });
    }

    static async onRemoveEntry(event, target) {
      const path = target.dataset.path;
      const list = [...(foundry.utils.getProperty(this.document.toObject(), path) ?? [])];
      list.splice(Number(target.dataset.index), 1);
      await this.document.update({ [path]: list });
    }
  };
}

/** Foundry's rich text editor for an HTML field, or a plain text area if it cannot make one. */
function richText(name, value) {
  try {
    return new foundry.data.fields.HTMLField().toInput({ name, value, toggled: true }).outerHTML;
  } catch {
    return `<textarea name="${escape(name)}" rows="6">${escape(value)}</textarea>`;
  }
}

export class Modern20ItemSheet extends Editable(HandlebarsApplicationMixin(ItemSheetV2)) {
  static DEFAULT_OPTIONS = {
    classes: ["modern20", "sheet", "item"],
    position: { width: 600, height: 640 },
    window: { resizable: true },
  };

  static PARTS = {
    body: { template: "systems/modern20/templates/document-sheet.hbs", scrollable: [""] },
  };

  async _prepareContext(options) {
    return Object.assign(await super._prepareContext(options), await describe(this.document));
  }
}
