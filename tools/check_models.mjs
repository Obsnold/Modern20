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

  // And the other direction, which is the one that fails quietly. setting()
  // falls back to SETTINGS[key]?.default so that preparation can run before
  // registration, which means a key nothing declares reads as `undefined`
  // rather than throwing: the feature behind it switches itself off and stays
  // off. A typo does this, and so does deleting a setting whose callers are
  // still there.
  for (const key of [...code.matchAll(/\bsetting\("([^"]+)"\)/g)].map((m) => m[1])) {
    if (!(key in SETTINGS)) {
      failures++;
      console.log(`FAIL  setting("${key}") is read but nothing declares it, `
        + "so it reads as undefined and whatever depends on it is off");
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

/**
 * Every document type the manifest declares has to have a name.
 *
 * Foundry builds the label for a subtype from `TYPES.<Document>.<type>` in the
 * language file — a key nothing in the code writes out, which is why
 * check_lang cannot see it and why three of them were missing. What a player
 * gets without one is the raw id in the Create dialog: a system offering to
 * make you a "specialAbility".
 */
{
  const { readFileSync } = await import("node:fs");
  const manifest = JSON.parse(readFileSync(join(ROOT, "system.json"), "utf8"));
  const lang = JSON.parse(readFileSync(join(ROOT, "lang", "en.json"), "utf8"));

  let named = 0;
  for (const [kind, types] of Object.entries(manifest.documentTypes ?? {})) {
    for (const type of Object.keys(types)) {
      const label = lang.TYPES?.[kind]?.[type];
      if (typeof label === "string" && label) { named++; continue; }
      failures++;
      console.log(`FAIL  ${kind} type "${type}" has no TYPES.${kind}.${type} `
        + "label, so Foundry shows the raw id");
    }
  }
  if (named) console.log(`PASS  ${named} document types named for the UI`);
}

/**
 * A burst radius has to be a distance.
 *
 * The explosives table runs Damage, Critical, Damage Type, Burst Radius, and
 * the Molotov cocktail and mild acid — splash weapons, with a dash where the
 * radius goes — were imported carrying "Fire" and "Acid" in that field. The
 * column to their left. Neither has a Reflex DC so neither ever became an
 * explosive, and no template shows the field, so it was wrong where nobody
 * would ever look: exactly the kind of thing to check rather than read.
 */
{
  const { packDocuments } = await import("./lib/packs.mjs");
  let radii = 0;
  for (const entry of packDocuments(ROOT, "weapons")) {
    const printed = String(entry.system?.burstRadius ?? "").trim();
    if (!printed) continue;
    radii++;
    // A number of feet, or the book deferring to the entry's own text.
    if (/\d/.test(printed) || /^see text$/i.test(printed)) continue;
    failures++;
    console.log(`FAIL  "${entry.name}" has a burst radius of `
      + `${JSON.stringify(printed)}, which is not a distance`);
  }
  console.log(`PASS  ${radii} burst radii are distances`);
}

/**
 * What a successful save does, against what the document's own text says.
 *
 * "Reflex save for half damage" and "Fortitude save or be blinded" are
 * different rules, and an activity that confuses them is wrong in the
 * player's favour half the time and against it the other half, silently.
 * Four activities built this session defaulted to half and four should have
 * negated.
 *
 * Matched to the @Check the activity actually is, by save and DC: a breath
 * weapon can print two — Reflex for half the damage and Fortitude against the
 * disease that follows — and reading the wrong one calls a correct entry a
 * mistake. That happened while writing this.
 */
{
  const { packDocuments } = await import("./lib/packs.mjs");
  const { readFileSync } = await import("node:fs");
  const manifest = JSON.parse(readFileSync(join(ROOT, "system.json"), "utf8"));

  let judged = 0;
  for (const pack of manifest.packs ?? []) {
    for (const entry of packDocuments(ROOT, pack.name)) {
      for (const document of [entry, ...(entry.items ?? [])]) {
        const system = document.system ?? {};
        const text = JSON.stringify(system).replace(/<[^>]+>/g, " ");

        // A spell prints its own saving-throw line — "Fortitude partial" —
        // which the import parsed into saveEffect and check_casting holds the
        // activity to. That is a better answer than anything guessed from the
        // prose, which cannot tell "reduces damage to half and negates the
        // blinding effect" (partial) from plain half. This check is for the
        // creature abilities and gear that have only the prose.
        if (system.saveEffect !== undefined) continue;

        for (const activity of Object.values(system.activities ?? {})) {
          const save = activity?.save;
          if (!save?.ability || !save.onSuccess) continue;

          // The @Check this activity is, not merely the first one present.
          const checks = [...text.matchAll(
            /@Check\[save:(\w+)(?:\|dc:(\d+))?\]\{[^}]*\}/g
          )];
          const mine = checks.find(([, ability, dc]) =>
            ability === save.ability && (!dc || Number(dc) === save.dc));
          if (!mine) continue;

          // Either side of it, because the book writes it both ways: "must
          // succeed at a Fortitude save (DC …) or die instantly" puts the
          // outcome after, and "takes 2d6 points of acid damage, or half
          // damage if a Reflex save succeeds" puts it before. Looking only
          // after the check could read a third of these.
          const at = mine.index ?? 0;
          const window = text.slice(Math.max(0, at - 140), at + mine[0].length + 140);

          const printed = /\bhalf|halve/i.test(window)
            ? "half"
            : (/\bor\s+(?:be\s+|become\s+|gain\s+|die|contract|fall|take)/i.test(window)
              ? "negate" : null);
          if (!printed) continue;

          judged++;
          if (save.onSuccess !== printed) {
            failures++;
            console.log(`FAIL  ${pack.name}: "${document.name}" saves `
              + `${save.onSuccess} on a success, its text says ${printed} `
              + `(${JSON.stringify(window.trim().slice(0, 60))})`);
          }
        }
      }
    }
  }
  console.log(`PASS  ${judged} save outcomes agree with their own text`);
}

/**
 * Every area shape the packs name has to be one the canvas can draw.
 *
 * A shape the code does not know is refused at the table now rather than
 * drawn as a circle, which means an activity naming one is an activity whose
 * button reports a failure. Better to find that here.
 */
{
  const { packDocuments } = await import("./lib/packs.mjs");
  const { readFileSync } = await import("node:fs");
  const manifest = JSON.parse(readFileSync(join(ROOT, "system.json"), "utf8"));
  const source = readFileSync(join(ROOT, "module", "apps", "area.mjs"), "utf8");
  const block = source.slice(source.indexOf("const SHAPES = {"));
  const known = new Set(
    [...block.slice(0, block.indexOf("};")).matchAll(/^\s*(\w+):/gm)].map((m) => m[1])
  );

  const used = new Map();
  for (const pack of manifest.packs ?? []) {
    for (const entry of packDocuments(ROOT, pack.name)) {
      for (const document of [entry, ...(entry.items ?? [])]) {
        for (const activity of Object.values(document.system?.activities ?? {})) {
          const shape = activity?.area?.shape;
          if (shape) used.set(shape, (used.get(shape) ?? 0) + 1);
        }
      }
    }
  }

  for (const [shape, count] of used) {
    if (!known.has(shape)) {
      failures++;
      console.log(`FAIL  ${count} activit(ies) name a "${shape}" area and `
        + "module/apps/area.mjs cannot draw one");
    }
  }
  console.log(`PASS  ${used.size} area shape(s) used across the packs, all drawable`);
}

/**
 * Every pack of items has to be in the compendium browser.
 *
 * Modern20Browser.PACKS is a list somebody keeps by hand, and the species
 * pack was not on it — nineteen packs in the manifest, thirteen searched, and
 * no way to tell from either end. A pack of Actors is a judgment call (the
 * pregens are six characters, not a catalogue) but a pack of Items is the
 * thing the browser is for.
 */
{
  const { readFileSync } = await import("node:fs");
  const manifest = JSON.parse(readFileSync(join(ROOT, "system.json"), "utf8"));
  const source = readFileSync(join(ROOT, "module", "apps", "browser.mjs"), "utf8");
  const listed = new Set(
    [...source.slice(source.indexOf("static PACKS = ["))
      .slice(0, source.slice(source.indexOf("static PACKS = [")).indexOf("]"))
      .matchAll(/"([a-z]+)"/g)].map((match) => match[1])
  );

  let browsable = 0;
  for (const pack of manifest.packs ?? []) {
    if (pack.type !== "Item") continue;
    if (listed.has(pack.name)) { browsable++; continue; }
    failures++;
    console.log(`FAIL  the "${pack.name}" pack holds Items and is not in `
      + "Modern20Browser.PACKS, so nothing can browse it");
  }
  console.log(`PASS  ${browsable} item packs reachable from the browser`);
}

/**
 * Every gun the SRD gives a magazine must derive a capacity from it.
 *
 * `ammo.max` is not stored: the equipment tables print the magazine as prose
 * — "30 box", "6 cyl.", "1 int." — and the weapon model parses the number out
 * of it. Everything about ammunition is gated on the result being non-zero:
 * whether the Reload activity is offered, whether firing spends a round, and
 * whether the gear tab shows 8/8 at all. A parse that comes back zero
 * therefore does not fail, it just quietly turns the feature off for that
 * weapon — which is how all eighty-two of them shipped with it off.
 *
 * Checked against the packs rather than a few strings, so a magazine written
 * in a shape the parse does not read is a failure here and not a gun nobody
 * can reload. The two things the tables print instead of a number are named:
 * "-" for a weapon that has no magazine at all, and "Linked" for a belt-fed
 * machine gun, which the SRD gives no capacity for either.
 */
{
  const { packDocuments } = await import("./lib/packs.mjs");
  const Weapon = CONFIG.Item.dataModels.weapon;
  const NO_MAGAZINE = ["-", "linked"];

  const printed = packDocuments(ROOT, "weapons")
    .filter((document) => document.system?.magazine);
  const empty = [];
  let none = 0;

  for (const document of printed) {
    const magazine = document.system.magazine;
    const system = { magazine, ammo: { value: 0, max: 0 } };
    Weapon.prototype.prepareDerivedData.call(system);

    if (system.ammo.max) continue;
    if (NO_MAGAZINE.includes(magazine.trim().toLowerCase())) { none++; continue; }
    empty.push(`${document.name} ("${magazine}")`);
  }

  if (empty.length) {
    failures++;
    console.log(`FAIL  ${empty.length} weapons print a magazine that derives no `
      + `capacity, so they cannot be reloaded or fired dry: `
      + `${empty.slice(0, 3).join(", ")}...`);
  } else {
    console.log(`PASS  ${printed.length - none} printed magazines derive a capacity, `
      + `${none} print no magazine`);
  }
}

console.log(failures ? `\n${failures} FAILURES` : "\nall checks passed");
process.exit(failures ? 1 : 0);
