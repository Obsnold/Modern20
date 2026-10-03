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

/** A link to another document, or a named entry in a list ("Craft (writing) (int)"), as HTML. */
function entry(value) {
  const text = [value.name ?? value.value, value.specialty && `(${value.specialty})`, value.ability && `(${value.ability})`].filter(Boolean).join(" ");
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
      if (!value.length || (!prefix && key === "specialQualities")) continue;
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

const ordinal = (n) => `${n}${["th", "st", "nd", "rd"][(n % 100 - 20) % 10] ?? ["th", "st", "nd", "rd"][n % 100] ?? "th"}`;

export class Modern20ItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["modern20", "sheet", "item"],
    position: { width: 600, height: 640 },
    window: { resizable: true },
  };

  static PARTS = {
    body: { template: "systems/modern20/templates/item-sheet.hbs", scrollable: [""] },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const system = item.system ?? {};
    const enrich = (html) => TextEditor.implementation.enrichHTML(html, { relativeTo: item, secrets: item.isOwner });

    const source = system.source?.page ? `@UUID[${system.source.page}]{${escape(system.source.book ?? "Source")}}` : escape(system.source?.book ?? "");
    const table = rows(system).map((r) => `<tr><th>${escape(r.label)}</th><td>${r.html}</td></tr>`).join("");
    const prose = [];
    for (const key of PROSE) if (system[key]) prose.push({ title: key === "description" ? "" : label(key), html: await enrich(system[key]) });
    // Species keep each special quality's text with its name.
    for (const q of system.specialQualities ?? []) prose.push({ title: q.name, html: await enrich(q.description) });
    // Classes: requirements, the level table, then each feature and talent tree.
    if (system.requirements?.length) prose.push({ title: "Requirements", html: await enrich(requirementsList(system.requirements)) });
    if (system.levels?.length) prose.push({ title: "Class Table", html: levelTable(system.levels) });
    for (const f of system.features ?? []) {
      const at = f.levels?.length ? ` (${f.levels.map(ordinal).join(", ")})` : "";
      prose.push({ title: `${f.name}${at}`, html: await enrich(f.description) });
    }
    for (const t of system.talentTrees ?? []) {
      prose.push({ title: `${t.name} Talent Tree`, html: await enrich(`${t.description}<p>${t.talents.map(entry).join(", ")}</p>`) });
    }

    Object.assign(context, {
      item,
      typeLabel: game.i18n.localize(CONFIG.Item.typeLabels?.[item.type] ?? `TYPES.Item.${item.type}`),
      source: await enrich(source),
      table: await enrich(`<table class="modern20-fields">${table}</table>`),
      prose,
    });
    return context;
  }
}
