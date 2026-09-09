/**
 * Exercise the system's own code against stand-ins for Foundry: catches
 * import-time throws, init-hook throws and schema construction errors without
 * a browser or a running world.
 *
 *     node scripts/check_models.mjs
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { installStubs } from "./lib/foundry-stubs.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const { hooks, registeredSheets, registeredSettings } = installStubs();

let failures = 0;
const fail = (label, error) => {
  failures++;
  console.log(`FAIL  ${label}\n      ${error.constructor.name}: ${error.message}`);
};

try {
  await import(join(ROOT, "module", "modern20.mjs"));
  console.log("PASS  import modern20.mjs");
} catch (error) {
  fail("import modern20.mjs", error);
}

for (const [event, fn] of hooks) {
  try { fn(); console.log(`PASS  ${event} hook`); }
  catch (error) { fail(`${event} hook`, error); }
}

// Built twice on purpose: Foundry builds a subtype schema more than once
// (localization, then instantiation), and the second build is when a reused
// DataField throws.
for (const [kind, models] of [["Actor", CONFIG.Actor.dataModels], ["Item", CONFIG.Item.dataModels]]) {
  for (const [type, cls] of Object.entries(models ?? {})) {
    try {
      const schema = cls.defineSchema();
      cls.defineSchema();
      console.log(`PASS  ${kind}.${type}.defineSchema (${Object.keys(schema).length} fields, built twice)`);
    } catch (error) {
      fail(`${kind}.${type}.defineSchema`, error);
    }
  }
}

if (!registeredSheets.length) {
  failures++;
  console.log("FAIL  no sheets registered during init");
} else {
  console.log(`PASS  ${registeredSheets.length} sheets registered`);
}

/**
 * Every setting must have a name, a hint, and a string for each of its
 * choices, and every setting must be read somewhere.
 *
 * check_lang cannot see these — Foundry builds the key from the setting id —
 * so they are checked here against the real key list instead of a prefix.
 */
{
  const { readFileSync } = await import("node:fs");
  const { SETTINGS } = await import(join(ROOT, "module", "settings.mjs"));
  const lang = JSON.parse(readFileSync(join(ROOT, "lang", "en.json"), "utf8"));
  const strings = lang.MODERN20?.Settings ?? {};

  // Every module, so "is this setting actually wired to anything?" is a real
  // question rather than a hopeful one.
  const sources = [];
  const walk = async (dir) => {
    const { readdirSync, statSync } = await import("node:fs");
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) await walk(path);
      else if (entry.endsWith(".mjs") && entry !== "settings.mjs") {
        sources.push(readFileSync(path, "utf8"));
      }
    }
  };
  await walk(join(ROOT, "module"));
  const code = sources.join("\n");

  let bad = 0;
  // Every setting the module declares has to have actually reached Foundry.
  for (const key of Object.keys(SETTINGS)) {
    if (!registeredSettings.has(`modern20.${key}`)) {
      failures++;
      console.log(`FAIL  setting "${key}" is declared but never registered at init`);
    }
  }

  for (const [key, definition] of Object.entries(SETTINGS)) {
    const entry = strings[key];
    if (!entry?.name) { bad++; console.log(`FAIL  setting "${key}" has no name string`); }
    if (!entry?.hint) { bad++; console.log(`FAIL  setting "${key}" has no hint string`); }

    for (const choice of Object.keys(definition.choices ?? {})) {
      if (!entry?.[choice]) {
        bad++;
        console.log(`FAIL  setting "${key}" choice "${choice}" has no string`);
      }
    }
    // A setting nothing reads is a promise the system does not keep.
    if (!code.includes(`setting("${key}")`)) {
      bad++;
      console.log(`FAIL  setting "${key}" is registered but never read`);
    }
  }

  failures += bad;
  if (!bad) console.log(`PASS  ${Object.keys(SETTINGS).length} settings named, hinted and wired`);
}

console.log(failures ? `\n${failures} FAILURES` : "\nall checks passed");
process.exit(failures ? 1 : 0);
