/**
 * Check the object tables against the SRD.
 *
 * module/object-data.mjs is generated from the scrape, so the first job is
 * that the two still match. The rest is the arithmetic the object sheet does:
 * the Defense an object of each size has, and the hardness, hit points and
 * break DC of the objects the SRD names.
 *
 * The grapple modifiers are checked here too. They are printed on the same
 * page, they are hand-transcribed into config.mjs, and they are the one size
 * table whose numbers are not the ones every other size table uses — a
 * Colossal creature is -8 to attack and +16 to grapple.
 *
 *     node tools/check_objects.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { installStubs } from "./lib/foundry-stubs.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const { hooks } = installStubs();

const log = console.log;
console.log = () => {};
await import(join(ROOT, "module", "modern20.mjs"));
for (const [event, fn] of hooks) if (event === "init") fn();
console.log = log;

const { MODERN20 } = await import(join(ROOT, "module", "config.mjs"));
const { OBJECT_DEFENSE, SUBSTANCES, OBJECT_DEFAULTS, OBJECT_DAMAGE_SHARE } =
  await import(join(ROOT, "module", "object-data.mjs"));

let problems = 0;
const fail = (message) => { problems++; console.log(`FAIL  ${message}`); };

const scraped = JSON.parse(readFileSync(join(ROOT, "data", "objects.json"), "utf8"));

/* -- the generated module must match the scrape ------------------------- */

for (const size of scraped.sizes) {
  if (JSON.stringify(OBJECT_DEFENSE[size.size]) !== JSON.stringify(size)) {
    fail(`${size.size} differs between the scrape and object-data.mjs`);
  }
}
for (const substance of scraped.substances) {
  if (JSON.stringify(SUBSTANCES[substance.id]) !== JSON.stringify(substance)) {
    fail(`${substance.id} differs between the scrape and object-data.mjs`);
  }
}
console.log(`${scraped.sizes.length} sizes and ${scraped.substances.length} `
  + "substances compared with the scrape");

/* -- an object's Defense is its size, with no Dexterity ----------------- */

// "Medium-size (dirt bike) | 5" is 10 + the size modifier - 5: an immobile
// object has no Dexterity bonus to lose, so it is treated as having none.
// Deriving it is what lets a GM set any size and get the right number.
for (const printed of scraped.sizes) {
  const modifier = MODERN20.sizes[printed.size]?.mod;
  if (modifier === undefined) { fail(`no size "${printed.size}" in config`); continue; }
  const derived = 10 + modifier - 5;
  if (derived !== printed.defense) {
    fail(`${printed.size} object: derived Defense ${derived}, the SRD prints ${printed.defense}`);
  }
}
console.log(`${scraped.sizes.length} object Defenses derived from size`);

/* -- the grapple modifiers config.mjs transcribes ------------------------ */

const tables = JSON.parse(readFileSync(join(ROOT, "data", "tables.json"), "utf8"));
const grappleTable = (tables["combatsa.html"] ?? []).find(
  (table) => table.header.join(" ").toLowerCase().includes("grapple modifier")
);
if (!grappleTable) {
  fail("no grapple modifier table in the scrape");
} else {
  let checked = 0;
  for (const row of grappleTable.rows) {
    const word = (row[0] ?? "").replace(/\(.*/, "").trim().toLowerCase();
    const size = word === "medium-size" ? "medium" : word;
    if (!MODERN20.sizes[size]) continue;
    checked++;
    const printed = Number((row[1] ?? "").replace(/[^\d+-]/g, ""));
    if (MODERN20.sizes[size].grapple !== printed) {
      fail(`${size}: config has grapple ${MODERN20.sizes[size].grapple}, `
        + `the SRD prints ${printed}`);
    }
  }
  console.log(`${checked} grapple modifiers checked against the SRD`);
}

/* -- the objects the SRD names, as built --------------------------------- */

const named = scraped.objects.filter((entry) => !entry.size);
let built = 0;
for (const entry of named) {
  const slug = entry.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  let document;
  try {
    document = JSON.parse(readFileSync(join(ROOT, "src", "packs", "objects", `${slug}.json`), "utf8"));
  } catch {
    fail(`no built object for "${entry.name}"`);
    continue;
  }
  built++;
  const system = document.system;
  if (system.hardness !== entry.hardness) {
    fail(`${entry.name}: hardness ${system.hardness}, the SRD prints ${entry.hardness}`);
  }
  if (system.hp.max !== entry.hitPoints) {
    fail(`${entry.name}: ${system.hp.max} hit points, the SRD prints ${entry.hitPoints}`);
  }
  if (system.breakDC !== entry.breakDC) {
    fail(`${entry.name}: break DC ${system.breakDC}, the SRD prints ${entry.breakDC}`);
  }
  if (document.type !== "object") fail(`${entry.name} is a ${document.type}`);
}
console.log(`${built} named objects checked against their printed stats`);

/* -- the by-size defaults, and what energy an object takes --------------- */

// A GM building an object the SRD does not name gets these; a missing size
// would leave the sheet suggesting nothing at all.
for (const size of Object.keys(MODERN20.sizes)) {
  if (!OBJECT_DEFAULTS[size]) fail(`no manufactured-object defaults for ${size}`);
}
// "Electricity and fire attacks deal half damage to most objects... Cold
// attacks deal one-quarter damage."
for (const [type, share] of [["fire", 0.5], ["electricity", 0.5], ["cold", 0.25]]) {
  if (OBJECT_DAMAGE_SHARE[type] !== share) {
    fail(`an object should take ${share} of ${type} damage, not ${OBJECT_DAMAGE_SHARE[type]}`);
  }
}
if (OBJECT_DAMAGE_SHARE.acid || OBJECT_DAMAGE_SHARE.sonic) {
  fail("acid and sonic deal normal damage to objects; they should not be listed");
}
console.log(`${Object.keys(OBJECT_DEFAULTS).length} size defaults and 3 energy shares checked`);

console.log(problems ? `\n${problems} problems` : "\nall object checks passed");
process.exit(problems ? 1 : 0);
