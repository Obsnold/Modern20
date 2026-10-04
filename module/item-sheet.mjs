/**
 * A read-only sheet for every item type.
 *
 * It shows what the importer stored, so the packs can be checked in Foundry
 * before there are data models or per-type sheets: the item's fields as a
 * table, its rules text, and a link to the SRD page it came from.
 */
const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
const { TextEditor } = foundry.applications.ux;

/** Fields shown as rules text rather than in the table, in this order. */
const PROSE = ["benefit", "normal", "special", "description"];
/** Fields not in the table: the source is the header link; a class's levels, features and talent trees get sections of their own. */
const HIDDEN = new Set(["source", ...PROSE, "features", "talentTrees", "requirements"]);

const escape = (s) => foundry.utils.escapeHTML(String(s));

/** "spellResistance" -> "Spell Resistance" */
const label = (key) => key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

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
    const name = prefix ? `${prefix}: ${label(key)}` : label(key);
    if (value === null || value === undefined || value === "" || value === false) continue;
    if (prefix && value === 0) continue;
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

const ordinal = (n) => `${n}${["th", "st", "nd", "rd"][(n % 100 - 20) % 10] ?? ["th", "st", "nd", "rd"][n % 100] ?? "th"}`;

/** What the read-only template shows for any document: header, field table and rules text. */
export async function describe(doc) {
  // The stored fields, as plain data; a creature's ability modifiers are worked out, not stored.
  const system = doc.system?.toObject?.() ?? doc.system ?? {};
  if (doc.system?.modifiers) system.modifiers = doc.system.modifiers;
  const enrich = (html) => TextEditor.implementation.enrichHTML(html, { relativeTo: doc, secrets: doc.isOwner });
  const source = system.source?.page ? `@UUID[${system.source.page}]{${escape(system.source.book ?? "Source")}}` : escape(system.source?.book ?? "");
  const table = rows(system).map((r) => `<tr><th>${escape(r.label)}</th><td>${r.html}</td></tr>`).join("");
  const prose = [];
  for (const key of PROSE) if (system[key]) prose.push({ title: key === "description" ? "" : label(key), html: await enrich(system[key]) });
  // Species, creature types and templates keep each trait's text with its name.
  for (const q of [...(system.specialQualities ?? []), ...(system.traits ?? [])]) if (q?.description) prose.push({ title: q.name, html: await enrich(q.description) });
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

export class Modern20ItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
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
