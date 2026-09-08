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
const { hooks, registeredSheets } = installStubs();

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

console.log(failures ? `\n${failures} FAILURES` : "\nall checks passed");
process.exit(failures ? 1 : 0);
