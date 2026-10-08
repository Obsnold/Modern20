/**
 * The edit view of a document: a form built from its type's field descriptions
 * (data/models.mjs), so every item type and the creature stat block can be
 * edited without a template of its own, and a new field is editable as soon as
 * a model declares it.
 *
 *   text, numbers, yes/no   an input each; a field with choices a select
 *   rich text               the `html` input given (Foundry's editor on a sheet)
 *   a group of fields       a fieldset
 *   a list of values        a text box, one value a line (values may hold commas)
 *   a list of entries       a fieldset per entry, with buttons to add and remove one
 *   a link or an id         not shown (data/models.mjs `ref`: a uuid, a source page, the ammunition loaded)
 *
 * Plain functions over plain data, so `npm test` checks the round trip: the
 * form's values, read back with `fromForm`, are the document's data.
 */
const escape = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** "spellResistance" -> "Spell Resistance", "damageReduction5" -> "Damage Reduction 5", "purchaseDCModifier" -> "Purchase DC Modifier" */
export const label = (key) => String(key).replace(/([a-z])([A-Z0-9])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

/**
 * Fields a person knows by another name than the key's, with what to put in them: the number a printed value is
 * worked out to (`lb` beside "3 lb."), and groups whose key says little ("fx").
 */
const NAMES = {
  lb: ["Pounds", "Worked out from the weight as printed, when that changes"],
  dc: ["DC", "Worked out from the purchase DC as printed, when that changes"],
  ft: ["Feet", "Worked out from the range increment as printed, when that changes"],
  formula: ["Dice to roll", "Worked out from the damage as printed (2d6, 1d8+1), when that changes"],
  byBonus: ["DC for each bonus", "An FX item's, printed for +1, +2 and +3: one a line"],
  fx: ["FX item (magic or psionic)"],
  rollNotes: ["Roll notes (bonuses in a situation)"],
  choice: ["Chosen", "What was chosen of it: a weapon for Weapon Focus, a Dashboard Figurine's kind (humorous, monstrous, religious)"],
};

/** A value as printed beside the number worked from it ("3 lb." and 3): its group has a `value` and a NUMBERS field. */
const isPrinted = (fields) => fields?.value?.kind === "string" && Object.keys(fields).some((k) => k in NUMBERS);

/** The numbers a value as printed is worked out to: "3 lb." -> 3 pounds, "18" -> DC 18, "30 ft." -> 30 feet, "2d6+1" -> 2d6+1. */
const NUMBERS = {
  lb: (t) => (/^\s*([\d.]+)\s*lb/i.test(t) ? Number(t.match(/([\d.]+)/)[1]) : /^\s*(—|-|)\s*\.?\s*$/.test(t) ? null : undefined),
  dc: (t) => (/^\s*(\d+)/.test(t) ? Number(t.match(/(\d+)/)[1]) : /^\s*(—|-|)\s*$/.test(t) ? null : undefined),
  ft: (t) => (/^\s*(\d+)\s*ft/i.test(t) ? Number(t.match(/(\d+)/)[1]) : /^\s*(—|-|)\s*$/.test(t) ? null : undefined),
  formula: (t) => {
    const m = String(t).match(/^\s*(\d*d\d+(?:\s*[+−–-]\s*\d+)?)\b/i);
    return m ? m[1].replace(/[−–]/g, "-").replace(/\s+/g, "") : undefined;
  },
};

/**
 * The document's data with each value as printed followed by its number: where the printed value changed and its
 * number did not (typed "3 lb." in the weight, and left the pounds), the number worked out from the text.
 */
export function followPrinted(spec, before, after) {
  if (spec?.kind !== "object" || !after || typeof after !== "object") return after;
  const out = { ...after };
  if (isPrinted(spec.fields) && out.value !== before?.value) {
    for (const k of Object.keys(spec.fields).filter((x) => x in NUMBERS)) {
      if (JSON.stringify(out[k]) !== JSON.stringify(before?.[k])) continue;
      const n = NUMBERS[k](out.value ?? "");
      if (n !== undefined) out[k] = n;
    }
  }
  for (const [k, s] of Object.entries(spec.fields)) if (s.kind === "object" && k in out) out[k] = followPrinted(s, before?.[k], out[k]);
  return out;
}

const isScalar = (spec) => ["string", "number", "boolean"].includes(spec.kind);
const textarea = (name, value) => `<textarea name="${escape(name)}" rows="6">${escape(value)}</textarea>`;

/** One input for a scalar field. */
function input(spec, name, value) {
  const n = escape(name);
  if (spec.kind === "boolean") return `<input type="checkbox" name="${n}" ${value ? "checked" : ""}>`;
  if (spec.kind === "number") {
    return `<input type="number" name="${n}" value="${value ?? ""}" ${spec.integer ? 'step="1"' : 'step="any"'} ${spec.nullable ? 'placeholder="—"' : ""}>`;
  }
  if (spec.choices) {
    const options = ["", ...spec.choices].map((c) => `<option value="${escape(c)}" ${c === value ? "selected" : ""}>${escape(c ? label(c) : "—")}</option>`).join("");
    return `<select name="${n}">${options}</select>`;
  }
  return `<input type="text" name="${n}" value="${escape(value)}">`;
}

/**
 * The form for `value` described by `fields`, its inputs named from `prefix`
 * ("system.damage.value"). `html(name, value)` renders a rich text input.
 */
export function editForm(fields, value, { prefix = "system", html = textarea } = {}) {
  return `<div class="m20-edit">${group(fields, value ?? {}, prefix, html)}</div>`;
}

function group(fields, value, prefix, html) {
  const scalars = [], blocks = [];
  const printed = isPrinted(fields);
  for (const [key, spec] of Object.entries(fields)) {
    // A link or an id the sheet keeps (data/models.mjs `ref`): not shown, and kept as it is (fromForm).
    if (spec.hidden) continue;
    const name = `${prefix}.${key}`;
    const v = value?.[key];
    // A field's own label where the model gives one ("Feat needed"), or a name a person knows it by, else its key's.
    const [title, hint] = spec.label ? [spec.label, spec.hint] : printed && key === "value" ? ["As printed", "As the book prints it: \"3 lb.\", \"18\", \"30 ft.\", \"2d6\""] : NAMES[key] ?? [label(key)];
    if (isScalar(spec)) scalars.push(`<label${hint ? ` data-tooltip="${escape(hint)}"` : ""}>${escape(title)}</label>${input(spec, name, v)}`);
    else if (spec.kind === "array" && isScalar(spec.of)) {
      const lines = (v ?? []).map((x) => x ?? "").join("\n");
      scalars.push(`<label${hint ? ` data-tooltip="${escape(hint)}"` : ""}>${escape(title)}</label><textarea name="${escape(name)}" rows="${Math.min(Math.max((v ?? []).length, 1), 8)}" placeholder="One a line">${escape(lines)}</textarea>`);
    } else if (spec.kind === "html") blocks.push(`<div class="m20-edit-html"><h4>${escape(title)}</h4>${html(name, v ?? "")}</div>`);
    else if (spec.kind === "object") blocks.push(`<fieldset><legend>${escape(title)}</legend>${group(spec.fields, v ?? {}, name, html)}</fieldset>`);
    else if (spec.kind === "array") blocks.push(entries(spec.of, v ?? [], name, title, html));
  }
  return `${scalars.length ? `<div class="m20-edit-grid">${scalars.join("")}</div>` : ""}${blocks.join("")}`;
}

/** A list of entries: a fieldset each, with remove buttons, and one to add. */
function entries(of, list, name, title, html) {
  const rows = list.map((v, i) => {
    const inner = of.kind === "object" ? group(of.fields, v, `${name}.${i}`, html) : group({ value: of }, { value: v }, `${name}.${i}`, html);
    return `<fieldset class="m20-edit-entry"><legend>${i + 1} <a data-action="removeEntry" data-path="${escape(name)}" data-index="${i}" data-tooltip="Remove"><i class="fa-solid fa-trash"></i></a></legend>${inner}</fieldset>`;
  }).join("");
  return `<fieldset class="m20-edit-list"><legend>${escape(title)} <a data-action="addEntry" data-path="${escape(name)}" data-tooltip="Add"><i class="fa-solid fa-plus"></i></a></legend>${rows}</fieldset>`;
}

/** A form value as the field wants it. */
function cast(spec, v, before) {
  switch (spec.kind) {
    case "number": {
      if (v === "" || v === null || v === undefined) return spec.nullable ? null : 0;
      const n = Number(v);
      return Number.isNaN(n) ? before : spec.integer ? Math.round(n) : n;
    }
    case "boolean": return v === true || v === "on" || v === "true";
    case "string": case "html": return v == null ? "" : String(v);
    default: return v;
  }
}

/**
 * The document's data from what the form submitted (expanded to objects, so a
 * list's entries arrive as `{ 0: ..., 1: ... }`), on top of `source`, its data
 * before: a field the form did not show keeps its value, and a list keeps its
 * length (entries are added and removed by the buttons, not the form).
 */
export function fromForm(spec, form, source) {
  if (form === undefined) return source;
  if (spec.kind === "object") {
    const out = { ...(source ?? {}) };
    if (!form || typeof form !== "object") return out;
    for (const [k, s] of Object.entries(spec.fields)) if (k in form) out[k] = fromForm(s, form[k], source?.[k]);
    return out;
  }
  if (spec.kind === "array") {
    if (isScalar(spec.of)) {
      const parts = Array.isArray(form) ? form : String(form ?? "").split(/\r?\n/).map((p) => p.trim());
      // Numbers keep their places, blank lines included (a hit point roll not yet made, a casting
      // table's "—"); text drops blank lines.
      if (spec.of.kind === "number") return form === "" ? [] : parts.map((p) => cast(spec.of, p));
      return parts.filter(Boolean).map((p) => cast(spec.of, p));
    }
    const list = source ?? [];
    return list.map((el, i) => {
      const f = Array.isArray(form) ? form[i] : form?.[i];
      if (f === undefined) return el;
      return spec.of.kind === "object" ? fromForm(spec.of, f, el) : fromForm(spec.of, f?.value, el);
    });
  }
  return cast(spec, form, source);
}

/** The description at a dotted path below `system` ("traits.0.description"), or null. */
export function specAt(spec, path) {
  let s = spec;
  for (const seg of path.split(".").filter(Boolean)) {
    if (s?.kind === "object") s = s.fields[seg];
    else if (s?.kind === "array" && /^\d+$/.test(seg)) s = s.of;
    else return null;
  }
  return s ?? null;
}

/**
 * A list edited by its entries' inputs ("system.specialtySkills.0.ranks"), which a form sends as
 * `{ 0: { ranks } }`: those fields merged into the list's entries, keeping the fields the form
 * does not show (a specialty skill's skill and specialty). Entries the form sends that the list
 * does not have are ignored.
 */
export function mergeIndexed(list, form) {
  if (!form || Array.isArray(form)) return form ?? list;
  return list.map((entry, i) => (form[i] && typeof form[i] === "object" ? { ...entry, ...form[i] } : entry));
}

/**
 * Numbers from a form as their fields take them: an emptied box 0 (or null, where the field
 * allows none), and a whole-number field rounded. Only the fields present are touched; a list
 * sent as its rows (`{ 0: {...} }`) or as an array is gone through row by row.
 */
export function castNumbers(spec, value) {
  if (value === undefined) return value;
  if (spec.kind === "number") return cast(spec, value, null);
  if (spec.kind === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    const out = { ...value };
    for (const [k, s] of Object.entries(spec.fields)) if (k in out) out[k] = castNumbers(s, out[k]);
    return out;
  }
  if (spec.kind === "array" && value && typeof value === "object") {
    if (Array.isArray(value)) return value.map((v) => castNumbers(spec.of, v));
    return Object.fromEntries(Object.entries(value).map(([i, v]) => [i, castNumbers(spec.of, v)]));
  }
  return value;
}
