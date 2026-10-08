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

/** "spellResistance" -> "Spell Resistance", "damageReduction5" -> "Damage Reduction 5" */
export const label = (key) => String(key).replace(/([a-z])([A-Z0-9])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

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
  for (const [key, spec] of Object.entries(fields)) {
    // A link or an id the sheet keeps (data/models.mjs `ref`): not shown, and kept as it is (fromForm).
    if (spec.hidden) continue;
    const name = `${prefix}.${key}`;
    const v = value?.[key];
    // A field's own label where the model gives one ("The proficiency feat it needs"), else its name's.
    if (isScalar(spec)) scalars.push(`<label${spec.hint ? ` data-tooltip="${escape(spec.hint)}"` : ""}>${escape(spec.label ?? label(key))}</label>${input(spec, name, v)}`);
    else if (spec.kind === "array" && isScalar(spec.of)) {
      const lines = (v ?? []).map((x) => x ?? "").join("\n");
      scalars.push(`<label>${escape(label(key))}</label><textarea name="${escape(name)}" rows="${Math.min(Math.max((v ?? []).length, 1), 8)}" placeholder="One a line">${escape(lines)}</textarea>`);
    } else if (spec.kind === "html") blocks.push(`<div class="m20-edit-html"><h4>${escape(label(key))}</h4>${html(name, v ?? "")}</div>`);
    else if (spec.kind === "object") blocks.push(`<fieldset><legend>${escape(label(key))}</legend>${group(spec.fields, v ?? {}, name, html)}</fieldset>`);
    else if (spec.kind === "array") blocks.push(entries(spec.of, v ?? [], name, label(key), html));
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
