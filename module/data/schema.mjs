/**
 * Field descriptions for the system's data models, written once and used twice.
 *
 * Each document type's `system` data is described with the small vocabulary
 * below (str, int, list, obj, ...). In Foundry, `toField` turns a description
 * into the real `foundry.data.fields` classes, so Foundry validates documents and
 * fills in defaults. Outside Foundry, `validate` checks a value against the same
 * description, which is how `npm test` holds every document the build writes to
 * the models, including any key a model does not declare (Foundry would drop it
 * without a word).
 */

/** A string. `choices` limits it to those values ("" is always allowed). */
export const str = (options = {}) => ({ kind: "string", ...options });
/** Rich text, shown enriched on sheets. */
export const html = () => ({ kind: "html" });
/** A whole number; `nullable` allows null (the book prints "—"). */
export const int = (options = {}) => ({ kind: "number", integer: true, ...options });
/** A number that may have a fraction (a CR of 1/2, a weight of 0.5 lb.). */
export const num = (options = {}) => ({ kind: "number", integer: false, ...options });
export const bool = () => ({ kind: "boolean" });
/** A list of `of`. */
export const list = (of) => ({ kind: "array", of });
/** An object with exactly these fields. */
export const obj = (fields) => ({ kind: "object", fields });

const defaults = {
  string: (s) => s.initial ?? "",
  html: () => "",
  number: (s) => s.initial ?? (s.nullable ? null : 0),
  boolean: () => false,
  array: () => [],
};

/** The Foundry field for a description. */
export function toField(spec) {
  const f = foundry.data.fields;
  switch (spec.kind) {
    case "string": return new f.StringField({ required: true, blank: true, initial: defaults.string(spec), ...(spec.choices ? { choices: ["", ...spec.choices] } : {}) });
    case "html": return new f.HTMLField({ required: true, blank: true, initial: "" });
    case "number": return new f.NumberField({ required: true, nullable: !!spec.nullable, integer: spec.integer, initial: defaults.number(spec) });
    case "boolean": return new f.BooleanField({ required: true, initial: false });
    case "array": return new f.ArrayField(toField(spec.of), { required: true, initial: [] });
    case "object": return new f.SchemaField(Object.fromEntries(Object.entries(spec.fields).map(([k, s]) => [k, toField(s)])), { required: true });
    default: throw new Error(`unknown field kind "${spec.kind}"`);
  }
}

/** The Foundry schema for a type: its fields, as `defineSchema` returns them. */
export function toSchema(fields) {
  return Object.fromEntries(Object.entries(fields).map(([k, s]) => [k, toField(s)]));
}

/** The value a new document starts with for a description. */
export function initial(spec) {
  if (spec.kind === "object") return Object.fromEntries(Object.entries(spec.fields).map(([k, s]) => [k, initial(s)]));
  return defaults[spec.kind](spec);
}

/**
 * Check `value` against a description; returns a list of "path: problem"
 * messages. Strict where Foundry would lose data quietly: a key the description
 * does not declare is a problem, not an extra.
 */
export function validate(spec, value, path = "system") {
  const out = [];
  const fail = (m) => out.push(`${path}: ${m}`);
  switch (spec.kind) {
    case "string":
    case "html":
      if (typeof value !== "string") fail(`expected a string, got ${JSON.stringify(value)}`);
      else if (spec.choices && value !== "" && !spec.choices.includes(value)) fail(`"${value}" is not one of ${spec.choices.join(", ")}`);
      break;
    case "number":
      if (value === null) { if (!spec.nullable) fail("is null, and may not be"); break; }
      if (typeof value !== "number" || Number.isNaN(value)) fail(`expected a number, got ${JSON.stringify(value)}`);
      else if (spec.integer && !Number.isInteger(value)) fail(`expected a whole number, got ${value}`);
      break;
    case "boolean":
      if (typeof value !== "boolean") fail(`expected true or false, got ${JSON.stringify(value)}`);
      break;
    case "array":
      if (!Array.isArray(value)) { fail(`expected a list, got ${JSON.stringify(value)}`); break; }
      value.forEach((v, i) => out.push(...validate(spec.of, v, `${path}[${i}]`)));
      break;
    case "object":
      if (!value || typeof value !== "object" || Array.isArray(value)) { fail(`expected an object, got ${JSON.stringify(value)}`); break; }
      for (const k of Object.keys(value)) if (!(k in spec.fields)) fail(`"${k}" is not a field (Foundry would drop it)`);
      for (const [k, s] of Object.entries(spec.fields)) {
        if (!(k in value)) fail(`"${k}" is missing`);
        else out.push(...validate(s, value[k], `${path}.${k}`));
      }
      break;
    default:
      fail(`unknown field kind "${spec.kind}"`);
  }
  return out;
}

/**
 * `value` with every field the description declares, missing ones filled with
 * their defaults, as Foundry fills them when it loads a document. Keys the
 * description does not declare are left for `validate` to report.
 */
export function conform(spec, value) {
  if (spec.kind === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    const out = { ...value };
    for (const [k, s] of Object.entries(spec.fields)) out[k] = k in value ? conform(s, value[k]) : initial(s);
    return out;
  }
  if (spec.kind === "array" && Array.isArray(value)) return value.map((v) => conform(spec.of, v));
  return value;
}
