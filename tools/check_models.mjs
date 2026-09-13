/**
 * Exercise the system's own code against stand-ins for Foundry: catches
 * import-time throws, init-hook throws and schema construction errors without
 * a browser or a running world.
 *
 *     node tools/check_models.mjs
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { installStubs } from "./lib/foundry-stubs.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const { hooks, registeredSheets, registeredSettings, registeredMenus } = installStubs();

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
 * Every condition has to be reachable by id.
 *
 * Actor#toggleStatusEffect looks a status up as `CONFIG.statusEffects[id]`,
 * which works because Foundry's is a Proxy that mirrors each entry under its
 * id. Assigning a plain array over that Proxy loses the lookup and every
 * toggle throws — silently, since nothing reads statusEffects by id until
 * something tries to apply a condition.
 */
{
  const statuses = CONFIG.statusEffects ?? [];
  const unreachable = [...statuses].filter((effect) => statuses[effect.id] !== effect);
  if (unreachable.length) {
    failures++;
    console.log(`FAIL  ${unreachable.length} conditions not reachable by id `
      + `(${unreachable.slice(0, 3).map((e) => e.id).join(", ")}...) — `
      + "CONFIG.statusEffects was replaced rather than filled");
  } else {
    console.log(`PASS  ${statuses.length} conditions reachable by id`);
  }

  // The ones the system toggles itself must exist, or the call throws in play.
  for (const id of ["flatfooted", "disabled", "dying", "dead", "stable"]) {
    if (!statuses[id]) {
      failures++;
      console.log(`FAIL  the system toggles "${id}" but no such status is registered`);
    }
  }
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

  // A settings menu is a button that opens an application, and every part of
  // it can be wrong in a way nothing else notices: a name that is not a string
  // in the language file renders as the key, and a `type` that is not a class
  // throws when somebody clicks it rather than when it is registered.
  for (const [key, menu] of registeredMenus) {
    const where = `settings menu "${key}"`;
    for (const field of ["name", "label", "hint"]) {
      const value = menu[field];
      if (typeof value !== "string" || !value) {
        bad++;
        console.log(`FAIL  ${where} has no ${field}`);
        continue;
      }
      // "MODERN20.SelfTest.Title" has to be a string somebody wrote.
      const path = value.split(".");
      let found = lang;
      for (const step of path) found = found?.[step];
      if (typeof found !== "string") {
        bad++;
        console.log(`FAIL  ${where} ${field} "${value}" is not in lang/en.json`);
      }
    }
    if (typeof menu.type !== "function") {
      bad++;
      console.log(`FAIL  ${where} has no application class to open`);
    }
    if (menu.restricted !== true) {
      // Everything this system puts in a menu is a GM tool.
      bad++;
      console.log(`FAIL  ${where} is not restricted to the GM`);
    }
  }

  failures += bad;
  if (!bad) {
    console.log(`PASS  ${Object.keys(SETTINGS).length} settings named, hinted and wired`);
    console.log(`PASS  ${registeredMenus.size} settings menu(s) named and openable`);
  }
}

console.log(failures ? `\n${failures} FAILURES` : "\nall checks passed");
process.exit(failures ? 1 : 0);
