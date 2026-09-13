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
/** A stand-in for Foundry's id-indexing statusEffects Proxy. */
function statusEffectsProxy() {
  return new Proxy([], {
    set(statuses, prop, value) {
      if (prop === "length") {
        for (let i = value; i < statuses.length; i++) {
          const id = statuses[i]?.id;
          if (id !== undefined) delete statuses[id];
        }
        statuses.length = value;
        return true;
      }
      const index = Number(prop);
      if (Number.isInteger(index)) {
        const previous = statuses.at(index)?.id;
        if (previous !== undefined) delete statuses[previous];
        statuses[value.id] = value;
        statuses[index] = value;
        return true;
      }
      statuses[prop] = value;
      return true;
    },
  });
}


export function installStubs() {
  const hooks = [];
  const registeredSheets = [];

  globalThis.Hooks = { once: (event, fn) => hooks.push([event, fn]), on: () => {}, callAll: () => {} };
  globalThis.CONFIG = {
    Actor: {}, Item: {}, Combat: {},
    /**
     * Foundry's own CONFIG.statusEffects is a Proxy over an array that also
     * mirrors each entry under its `id`, which is how Actor#toggleStatusEffect
     * looks one up: `CONFIG.statusEffects[statusId]`. Modelled here because
     * assigning a plain array over it silently destroys that lookup, and every
     * toggleStatusEffect call then throws "Invalid status ID".
     */
    statusEffects: statusEffectsProxy(),
    // Foundry maps a few effects to engine behaviour (defeated, blind, ...).
    specialStatusEffects: {},
    // The text enrichers a system adds to, which is how the rules text's own
    // "DC 15 Climb check" becomes something to click.
    TextEditor: { enrichers: [] },
  };
  const registeredSettings = new Map();
  const registeredMenus = new Map();

  globalThis.game = {
    i18n: { localize: (k) => k, format: (k) => k },
    system: { id: "modern20" },
    keybindings: { get: () => [] },
    // The world the ready hook looks at: a migration counts what needs
    // changing, and a hotbar macro looks for the item by name.
    user: { isGM: false, character: null },
    actors: [],
    scenes: [],
    macros: [],
    // A real registry rather than a stub that answers everything: Foundry
    // throws on an unregistered key, and reading a setting returns its
    // default until someone changes it. Checks that exercise behaviour then
    // see the defaults the system actually ships with.
    settings: {
      register(namespace, key, definition) {
        registeredSettings.set(`${namespace}.${key}`, definition);
      },
      // A button in the settings panel, which opens an application rather
      // than storing a value. Absent from this stub until the self-test
      // registered one: the init hook threw, every later registration was
      // skipped, and the harness reported eighteen failures for one line.
      registerMenu(namespace, key, definition) {
        registeredMenus.set(`${namespace}.${key}`, definition);
      },
      get(namespace, key) {
        const definition = registeredSettings.get(`${namespace}.${key}`);
        if (!definition) throw new Error(`"${namespace}.${key}" is not a registered game setting`);
        return definition.default;
      },
      set(namespace, key, value) {
        const definition = registeredSettings.get(`${namespace}.${key}`);
        if (!definition) throw new Error(`"${namespace}.${key}" is not a registered game setting`);
        definition.default = value;
      },
    },
  };
  // The handful of Foundry constants this system reads. DEFAULT_TOKEN is the
  // grey mystery-man, and what the migration compares a token's artwork
  // against to tell "nobody chose this" from "somebody did".
  globalThis.CONST = { DEFAULT_TOKEN: "icons/svg/mystery-man.svg" };
  globalThis.ui = { notifications: { warn: () => {}, error: () => {} } };
  globalThis.canvas = { tokens: { controlled: [] } };
  globalThis.Handlebars = {
    registerHelper: () => {},
    escapeExpression: (text) => String(text),
    SafeString: class { constructor(html) { this.html = html; } toString() { return this.html; } },
  };
  // The ready hook installs one delegated click handler for rules links and
  // rules rolls, and the checks run every hook they recorded.
  globalThis.document = {
    addEventListener: () => {},
    createElement: () => ({ dataset: {}, classList: { add: () => {} }, append: () => {} }),
  };

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

  return { hooks, registeredSheets, registeredSettings, registeredMenus };
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
