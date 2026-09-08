/**
 * Exercise the system's own code against minimal stand-ins for Foundry.
 *
 * Catches import-time throws, init-hook throws and defineSchema errors without
 * needing a browser or a running world. Requires Node 18+; if there is no local
 * Node, run it on the Foundry host, which has one for the packing CLI:
 *
 *     node scripts/check_models.mjs
 *
 * The stubs deliberately enforce Foundry's real invariants — a DataField
 * belongs to exactly one parent — because a permissive stub passes code that
 * then dies at world load with a black screen.
 */

class DataField {
  constructor(options = {}) {
    this.options = options;
    this.name = null;
    this.parent = null;
  }
}

class SchemaField extends DataField {
  constructor(fields, options) {
    super(options);
    if (fields === null || typeof fields !== "object") {
      throw new TypeError("SchemaField requires an object of fields");
    }
    this.fields = fields;
    for (const [name, field] of Object.entries(fields)) {
      if (!(field instanceof DataField)) {
        throw new TypeError(
          `SchemaField: "${name}" is ${field === undefined ? "undefined" : typeof field}, not a DataField`
        );
      }
      // Foundry's own invariant. Spreading another schema's `.fields` into a
      // subclass trips this and takes the whole UI down at world load.
      if (field.parent !== null) {
        throw new Error(
          `The "${name}" field already belongs to some other parent and may not be reused.`
        );
      }
      field.name = name;
      field.parent = this;
    }
  }
}

class ArrayField extends DataField {
  constructor(element, options) {
    super(options);
    if (!(element instanceof DataField)) throw new TypeError("ArrayField element must be a DataField");
    if (element.parent !== null) throw new Error("ArrayField element may not be reused");
    this.element = element;
    element.parent = this;
  }
}

const leaf = () => class extends DataField {};

class TypeDataModel {
  static defineSchema() { return {}; }
  prepareBaseData() {}
  prepareDerivedData() {}
}

const hooks = [];
globalThis.Hooks = { once: (event, fn) => hooks.push([event, fn]), on: () => {}, callAll: () => {} };
globalThis.CONFIG = { Actor: {}, Item: {}, Combat: {} };
globalThis.game = { i18n: { localize: (k) => k, format: (k) => k }, system: { id: "modern20" } };
globalThis.ui = { notifications: { warn: () => {}, error: () => {} } };
globalThis.Handlebars = { registerHelper: () => {} };

const registered = [];
globalThis.foundry = {
  data: {
    fields: {
      SchemaField, ArrayField,
      NumberField: leaf(), StringField: leaf(), BooleanField: leaf(),
      HTMLField: leaf(), ObjectField: leaf(), FilePathField: leaf(),
    },
  },
  abstract: { TypeDataModel },
  documents: { Actor: class {}, Item: class {}, ChatMessage: class {} },
  dice: { Roll: class {} },
  applications: {
    api: { HandlebarsApplicationMixin: (Base) => class extends Base {} },
    sheets: { ActorSheetV2: class {}, ItemSheetV2: class {} },
    apps: {
      DocumentSheetConfig: {
        registerSheet: (...args) => registered.push(args),
        unregisterSheet: (...args) => registered.push(args),
      },
    },
    ux: { TextEditor: { implementation: { enrichHTML: async (html) => html } } },
    handlebars: { renderTemplate: async () => "" },
  },
  utils: { mergeObject: (a, b) => ({ ...a, ...b }) },
};

const here = new URL(".", import.meta.url).pathname;
const entry = `${here}../module/modern20.mjs`;
let failures = 0;

function fail(label, error) {
  failures++;
  console.log(`FAIL  ${label}\n      ${error.constructor.name}: ${error.message}`);
}

try {
  await import(entry);
  console.log("PASS  import modern20.mjs");
} catch (error) {
  fail("import modern20.mjs", error);
}

for (const [event, fn] of hooks) {
  try { fn(); console.log(`PASS  ${event} hook`); }
  catch (error) { fail(`${event} hook`, error); }
}

// Each model is built twice: Foundry itself builds a subtype schema more than
// once (localization, then instantiation), which is when field reuse surfaces.
for (const [kind, models] of [["Actor", CONFIG.Actor.dataModels], ["Item", CONFIG.Item.dataModels]]) {
  for (const [type, cls] of Object.entries(models ?? {})) {
    try {
      const first = cls.defineSchema();
      cls.defineSchema();
      console.log(`PASS  ${kind}.${type}.defineSchema (${Object.keys(first).length} fields, built twice)`);
    } catch (error) {
      fail(`${kind}.${type}.defineSchema`, error);
    }
  }
}

console.log(`\n${registered.length} sheets registered`);
console.log(failures ? `${failures} FAILURES` : "all checks passed");
process.exit(failures ? 1 : 0);
