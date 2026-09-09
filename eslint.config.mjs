/**
 * Lint rules for the system's ES modules.
 *
 * Correctness only, no style. Every rule here is one that changes what the
 * code does, and the two that would have caught a bug already shipped are
 * `no-redeclare` — a second definition of a name that already exists silently
 * wins, which happened twice in the scraper — and `no-undef`, since a
 * mistyped Foundry global is a runtime error on a sheet nobody opens until
 * the session it breaks.
 *
 * `no-unused-vars` is a warning rather than an error: it is worth seeing and
 * is not worth failing a build over, and nothing in it can be wrong at run
 * time. Warnings do not change the exit code, so CI stays honest about the
 * difference.
 */

// The globals Foundry still provides at v14, which is the same list
// scripts/check_globals.py maintains as STILL_GLOBAL. Anything removed from
// that list has to be reached through `foundry.*`, which is what that check
// enforces and this one cannot.
const foundryGlobals = {
  foundry: "readonly",
  game: "readonly",
  canvas: "readonly",
  ui: "readonly",
  CONFIG: "readonly",
  CONST: "readonly",
  Hooks: "readonly",
  Handlebars: "readonly"
};

const correctness = {
  "no-undef": "error",
  "no-redeclare": "error",
  "no-const-assign": "error",
  "no-func-assign": "error",
  "no-import-assign": "error",
  "no-dupe-args": "error",
  "no-dupe-keys": "error",
  "no-dupe-class-members": "error",
  "no-dupe-else-if": "error",
  "no-duplicate-case": "error",
  "no-unreachable": "error",
  "no-fallthrough": "error",
  "no-cond-assign": "error",
  "no-unsafe-negation": "error",
  "no-obj-calls": "error",
  "no-sparse-arrays": "error",
  "no-self-assign": "error",
  "no-self-compare": "error",
  "use-isnan": "error",
  "valid-typeof": "error",
  // Seen, not enforced: an unused local is untidy rather than wrong.
  "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
  "no-empty": ["warn", { allowEmptyCatch: true }]
};

export default [
  {
    // The system itself: browser context, Foundry globals.
    files: ["module/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...foundryGlobals,
        document: "readonly",
        window: "readonly",
        console: "readonly"
      }
    },
    rules: correctness
  },
  {
    // The checks, which run under Node and install their own Foundry stubs.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...foundryGlobals,
        console: "readonly",
        process: "readonly",
        globalThis: "readonly"
      }
    },
    rules: correctness
  }
];
