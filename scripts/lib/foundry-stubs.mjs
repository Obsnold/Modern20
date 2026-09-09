/**
 * Minimal stand-ins for the Foundry client API, enough to import the system
 * and build every document schema outside a browser.
 *
 * The stubs enforce Foundry's real invariants rather than merely resolving
 * names. A permissive stub passes code that then dies at world load, which is
 * exactly what happened with the shared-DataField bug: the harness went green
 * and the world rendered as a black page.
 */

export class DataField {
  constructor(options = {}) {
    this.options = options;
    this.name = null;
    this.parent = null;
  }
}

export class SchemaField extends DataField {
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
      // Foundry's own rule: a field belongs to exactly one parent schema.
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

export class ArrayField extends DataField {
  constructor(element, options) {
    super(options);
    if (!(element instanceof DataField)) throw new TypeError("ArrayField element must be a DataField");
    if (element.parent !== null) throw new Error("ArrayField element may not be reused");
    this.element = element;
    element.parent = this;
  }
}

/**
 * A leaf field that enforces the invariants a schema author can get wrong.
 *
 * `defaults` are the field type's own option defaults, since a field that
 * forbids a blank string while defaulting to one only fails when a document is
 * actually created — on a drag to a sheet, long after every check passed.
 */
const leaf = (defaults = {}) => class extends DataField {
  constructor(options = {}) {
    super({ ...defaults, ...options });
    const { blank, initial } = this.options;
    if (blank === false && initial === "") {
      throw new TypeError(
        'A field with blank: false cannot have initial: "" — "may not be a blank string"'
      );
    }
  }
};

export class TypeDataModel {
  static defineSchema() { return {}; }
  prepareBaseData() {}
  prepareDerivedData() {}
}

/** Sub-documents that are not a document subtype extend DataModel directly. */
export class DataModel {
  static defineSchema() { return {}; }
}

/**
 * A union of schemas discriminated by a `type` property. The stub builds each
 * member's schema so a broken activity schema fails here rather than at load.
 */
export class TypedSchemaField extends DataField {
  constructor(types, options) {
    super(options);
    this.types = {};
    for (const [name, model] of Object.entries(types)) {
      if (typeof model?.defineSchema !== "function") {
        throw new TypeError(`TypedSchemaField: "${name}" is not a DataModel`);
      }
      const schema = model.defineSchema();
      // Foundry adds the discriminator for a plain schema object but not for a
      // DataModel class, and then requires it: 'The "attack" field must have a
      // "type" StringField.'
      if (!schema.type) {
        throw new TypeError(`The "${name}" field must have a "type" StringField.`);
      }
      this.types[name] = new SchemaField(schema);
    }
  }
}

/** A mapping of arbitrary keys to one field type. */
export class TypedObjectField extends DataField {
  constructor(element, options) {
    super(options);
    if (!(element instanceof DataField)) {
      throw new TypeError("TypedObjectField element must be a DataField");
    }
    this.element = element;
    element.parent = this;
  }
}

/**
 * Install the stubs as globals and return the recorders, so a caller can see
 * what the system registered during its init hook.
 */
export function installStubs() {
  const hooks = [];
  const registeredSheets = [];

  globalThis.Hooks = { once: (event, fn) => hooks.push([event, fn]), on: () => {}, callAll: () => {} };
  globalThis.CONFIG = {
    Actor: {}, Item: {}, Combat: {},
    statusEffects: [],
    // Foundry maps a few effects to engine behaviour (defeated, blind, ...).
    specialStatusEffects: {},
  };
  globalThis.game = {
    i18n: { localize: (k) => k, format: (k) => k },
    system: { id: "modern20" },
    keybindings: { get: () => [] },
  };
  globalThis.ui = { notifications: { warn: () => {}, error: () => {} } };
  globalThis.Handlebars = { registerHelper: () => {} };

  globalThis.foundry = {
    data: {
      fields: {
        SchemaField, ArrayField, TypedSchemaField, TypedObjectField,
        NumberField: leaf(), StringField: leaf({ blank: true }), BooleanField: leaf(),
        HTMLField: leaf({ blank: true }), ObjectField: leaf(),
        // Foundry's own defaults: nullable, blank: false, initial: null.
        FilePathField: leaf({ nullable: true, blank: false, initial: null }),
      },
    },
    abstract: { TypeDataModel, DataModel },
    documents: { Actor: class {}, Item: class {}, ChatMessage: class {} },
    dice: { Roll: class {} },
    applications: {
      api: {
        // Applications that are not document sheets extend ApplicationV2
        // directly, so the stub must offer it as a real base class.
        ApplicationV2: class { constructor(options = {}) { this.options = options; } },
        DialogV2: class {
          static async prompt() { return null; }
          static async wait() { return null; }
        },
        HandlebarsApplicationMixin: (Base) => class extends Base {}
      },
      sheets: { ActorSheetV2: class {}, ItemSheetV2: class {} },
      apps: {
        DocumentSheetConfig: {
          registerSheet: (...args) => registeredSheets.push(args),
          unregisterSheet: (...args) => registeredSheets.push(args),
        },
      },
      ux: { TextEditor: { implementation: { enrichHTML: async (html) => html } } },
      handlebars: {
        renderTemplate: async () => "",
        loadTemplates: async () => [],
        getTemplate: async () => (() => ""),
      },
    },
    utils: { mergeObject: (a, b) => ({ ...a, ...b }) },
  };

  return { hooks, registeredSheets };
}

/** Import the system and run its init hook. Returns the recorders. */
export async function loadSystem(entryUrl) {
  const recorders = installStubs();
  await import(entryUrl);
  for (const [event, fn] of recorders.hooks) {
    if (event === "init") fn();
  }
  return recorders;
}
