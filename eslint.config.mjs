/**
 * Lint: chiefly to catch a name used but never defined (a function lost in an edit), which the
 * tests cannot, as they never run the Foundry side. `npm test` runs it first.
 */
import js from "@eslint/js";
import globals from "globals";

/** What Foundry puts on the page for a system's code. */
const foundry = {
  foundry: "readonly", game: "readonly", Hooks: "readonly", CONFIG: "readonly", CONST: "readonly", ui: "readonly",
  canvas: "readonly", fromUuid: "readonly", fromUuidSync: "readonly", ChatMessage: "readonly", Actor: "readonly",
  Item: "readonly", Roll: "readonly",
};

export default [
  { ignores: ["node_modules/", "packs/", "srd/", "build/"] },
  js.configs.recommended,
  {
    files: ["module/**/*.mjs"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...globals.browser, ...foundry } },
  },
  {
    files: ["tools/**/*.mjs", "eslint.config.mjs"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...globals.node } },
  },
  {
    // The Foundry tests: a Node runner, and checks it sends into the game's page.
    files: ["tools/foundry/**/*.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser, ...foundry } },
  },
  {
    rules: {
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
    },
  },
];
