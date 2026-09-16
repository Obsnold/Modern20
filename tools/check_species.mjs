/**
 * Every playable species against the two chapters that print them.
 *
 *     node tools/check_species.mjs
 *
 * d20 Modern needs none of this: everyone is human and the baseline is the
 * rules. Urban Arcana prints eighteen playable species across two chapters,
 * and every one of them moves numbers the rest of the system reads — a size
 * that changes Defense and grapple, ability modifiers that change everything,
 * natural armor, an attack bonus, a reach.
 *
 * The numbers below are transcribed from the printed blocks rather than read
 * out of the packs, for the same reason the creature check transcribes its
 * own: a check fed by the importer only proves the importer is consistent
 * with itself. These are what the book says. If the parse drifts, or somebody
 * edits a pack file, this is where it stops.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { packDocuments } from "./lib/packs.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

let failures = 0;
const fail = (message) => { failures++; console.log(`FAIL  ${message}`); };

/**
 * name: [size, [str, dex, con, int, wis, cha], speed, extraHD, naturalArmor,
 *        attackBonus, reach, levelAdjustment, [feats always granted], options]
 *
 * A level adjustment of null is the aasimar, whose entry prints the label and
 * leaves the value blank. Zero would be a claim the book does not make.
 */
const PRINTED = {
  // Shadowkind: the baseline species, with no level adjustment.
  "Dwarf":      ["medium", [0, 0, 2, 0, 0, -2], 20, 0, 0, 0, 5, 0, ["Archaic Weapons Proficiency"], 0],
  "Elf":        ["medium", [0, 2, -2, 0, 0, 0], 30, 0, 0, 0, 5, 0, ["Archaic Weapons Proficiency"], 0],
  "Gnome":      ["small",  [-2, 0, 2, 0, 0, 0], 20, 0, 0, 0, 5, 0, ["Archaic Weapons Proficiency"], 0],
  "Goblin":     ["small",  [-2, 2, 0, 0, 0, -2], 30, 0, 0, 0, 5, 0, ["Alertness"], 0],
  "Half-Elf":   ["medium", [0, 0, 0, 0, 0, 0], 30, 0, 0, 0, 5, 0, ["Archaic Weapons Proficiency"], 0],
  "Half-Orc":   ["medium", [2, 0, 0, -2, 0, -2], 30, 0, 0, 0, 5, 0, ["Archaic Weapons Proficiency"], 0],
  "Halfling":   ["small",  [-2, 2, 0, 0, 0, 0], 20, 0, 0, 0, 5, 0, ["Archaic Weapons Proficiency"], 0],
  "Orc":        ["medium", [4, 0, 0, -2, -2, -2], 30, 0, 0, 0, 5, 0,
                 ["Archaic Weapons Proficiency", "Armor Proficiency (light)",
                  "Armor Proficiency (medium)"], 0],
  "Shadowkind Human": ["medium", [0, 0, 0, 0, 0, 0], 30, 0, 0, 0, 5, 0, [], 23],

  /*
   * The baseline, which the SRD prints no entry for because in d20 Modern
   * there is nothing to distinguish it from. Medium, 30 feet and no modifiers
   * are what a human character is; what it carries over a nonhuman is two
   * starting feats instead of one and a skill point a level, which is the
   * `nonhuman` flag below and is checked against the book's own pairs.
   */
  "Human": ["medium", [0, 0, 0, 0, 0, 0], 30, 0, 0, 0, 5, 0, [], 0],

  // More Powerful Shadowkind, which is what a level adjustment is for.
  "Aasimar":    ["medium", [0, 0, 0, 0, 2, 2], 30, 0, 0, 0, 5, null, [], 2],
  "Bugbear":    ["medium", [4, 2, 2, 0, 0, -2], 30, 3, 3, 2, 5, 2, ["Simple Weapons Proficiency"], 0],
  "Dragonblooded Human": ["medium", [2, 0, 2, 0, 0, 2], 30, 0, 0, 0, 5, 1, [], 2],
  "Drow (Dark Elf)": ["medium", [0, 2, -2, 2, 0, 2], 30, 0, 0, 0, 5, 2, ["Archaic Weapons Proficiency"], 0],
  "Gnoll":      ["medium", [4, 0, 2, -2, 0, -2], 30, 2, 1, 1, 5, 1, ["Simple Weapons Proficiency"], 0],
  // "+8 Strength (+4 Strength if half-dragon has wings)": the printed value is
  // the +8, and the winged variant stays in the entry's own text.
  "Half-Dragon": ["medium", [8, 0, 2, 2, 0, 2], 30, 0, 4, 0, 5, 3, [], 0],
  "Half-Ogre":  ["medium", [4, -2, 2, -2, 0, -2], 30, 2, 3, 1, 5, 1, ["Simple Weapons Proficiency"], 0],
  "Ogre":       ["large",  [10, -2, 4, -4, 0, -4], 30, 4, 5, 3, 10, 3, [], 2],
  "Tiefling":   ["medium", [0, 2, 0, 2, 0, -2], 30, 0, 0, 0, 5, 1, [], 2]
};

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];

const documents = packDocuments(ROOT, "species");
const byName = new Map(documents.map((entry) => [entry.name, entry]));

if (documents.length !== Object.keys(PRINTED).length) {
  fail(`the pack holds ${documents.length} species, the chapters print `
    + `${Object.keys(PRINTED).length}`);
}

for (const [name, printed] of Object.entries(PRINTED)) {
  const entry = byName.get(name);
  if (!entry) { fail(`no species "${name}" in the pack`); continue; }

  const system = entry.system ?? {};
  const [size, mods, speed, extraHitDice, naturalArmor,
         attackBonus, reach, levelAdjustment, feats, options] = printed;

  const same = (label, got, want) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      fail(`${name}: ${label} is ${JSON.stringify(got)}, the book prints `
        + `${JSON.stringify(want)}`);
    }
  };

  same("size", system.size, size);
  same("ability modifiers",
       ABILITIES.map((key) => system.abilityModifiers?.[key] ?? 0), mods);
  same("base speed", system.baseSpeed, speed);
  same("extra starting Hit Dice", system.extraHitDice, extraHitDice);
  same("natural armor", system.naturalArmor, naturalArmor);
  same("attack bonus", system.attackBonus, attackBonus);
  same("reach", system.reach, reach);
  same("level adjustment", system.levelAdjustment ?? null, levelAdjustment);
  same("the feats it always grants", system.bonusFeats, feats);
  same("the number of feats it picks one of",
       (system.bonusFeatOptions ?? []).length, options);

  const human = name === "Human";
  same("whether it counts as nonhuman", Boolean(system.nonhuman), !human);

  // Bookkeeping for what a roll came to, which no pack document has yet done.
  if (system.rolledHitPoints) {
    fail(`${name}: ships with ${system.rolledHitPoints} rolled hit points, `
      + "which is a record of a roll on somebody's character");
  }

  // A species with nothing to show is a species nobody can tell they have.
  if (!system.traits?.length) fail(`${name}: no named qualities`);
  for (const trait of system.traits ?? []) {
    if (!trait.name) fail(`${name}: a quality with no name`);
    if (!trait.description) fail(`${name}: "${trait.name}" has no rules text`);
  }
  if (!system.freeLanguages) fail(`${name}: no free languages`);
  if (!system.rulesPage) fail(`${name}: no link to the page it is printed on`);
  if (!system.description) fail(`${name}: no description`);
}

/**
 * Nothing printed may be quietly dropped.
 *
 * Each entry is a list of "Label: text" paragraphs. Eleven labels are read
 * into fields; the rest become the species' named qualities. A label that is
 * neither is one the import silently threw away — which is how a species
 * would come to be missing its darkvision and nobody notice.
 */
{
  const HANDLED = new Set([
    "Size", "Ability Modifiers", "Base Speed", "Extra Starting Hit Dice",
    "Natural Armor Bonus", "Attack Bonus", "Reach", "Level Adjustment",
    "Free Language Skills", "Other Languages", "Bonus Feat",
    // Derived from size, the way it is for every other creature.
    "Fighting Space"
  ]);

  const rules = JSON.parse(readFileSync(join(ROOT, "data", "rules.json"), "utf8"));
  const pages = [];
  const walk = (node) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") {
      if (node.name && node.html) pages.push(node);
      Object.values(node).forEach(walk);
    }
  };
  walk(rules);

  let labels = 0;
  for (const [name, entry] of byName) {
    // The baseline is assembled from the character-creation rules rather than
    // from a species entry, because the SRD prints no such entry.
    if (name === "Human") continue;

    const page = pages.find((candidate) => candidate.name === name
      && ["urbanspecies.html", "urbanpowerkind.html"].includes(candidate.source));
    if (!page) { fail(`${name}: no printed entry to check against`); continue; }

    const held = new Set((entry.system.traits ?? []).map((trait) => trait.name));
    for (const match of page.html.matchAll(/<p><b>(.*?)<\/b>\s*:/gs)) {
      let label = match[1].replace(/<[^>]+>/g, "").trim();
      label = label.replace(/^[A-Z][A-Z'()\- ]+\s(?=[A-Z][a-z])/, "").trim();
      labels++;
      if (!HANDLED.has(label) && !held.has(label)) {
        fail(`${name}: the entry prints "${label}" and the species has no `
          + "field or quality for it");
      }
    }
  }
  if (!failures) console.log(`${labels} printed labels all accounted for`);
}

// The senses are what a token's vision would be set from, so they have to be
// marked rather than left as prose among the rest.
{
  const SENSES = ["Darkvision", "Low-Light Vision", "Scent"];
  let marked = 0;
  for (const [name, entry] of byName) {
    for (const trait of entry.system.traits ?? []) {
      const sense = SENSES.includes(trait.name);
      if (sense !== Boolean(trait.sense)) {
        fail(`${name}: "${trait.name}" is ${trait.sense ? "" : "not "}marked a `
          + `sense and ${sense ? "is" : "is not"} one`);
      }
      if (sense) marked++;
    }
  }
  if (!failures) console.log(`${marked} senses marked across ${byName.size} species`);
}

/**
 * What being a nonhuman costs, against the numbers the book prints twice.
 *
 * Seventeen classes print both figures — eleven advanced ones inline, as
 * "5 + Int modifier (4 + Int modifier for nonhumans)", and all six basic ones
 * in Table: Skill Points per Class Level for Nonhumans — and the packs store
 * the human one. If the gap is ever not exactly one, the single subtraction
 * the system implements is the wrong rule and every nonhuman character has
 * the wrong number of skill points.
 */
{
  const rules = JSON.parse(readFileSync(join(ROOT, "data", "rules.json"), "utf8"));
  const pages = [];
  const walk = (node) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") {
      if (node.name && node.html) pages.push(node);
      Object.values(node).forEach(walk);
    }
  };
  walk(rules);

  const flat = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const classes = new Map(
    packDocuments(ROOT, "classes")
      .map((entry) => [entry.name, entry.system?.skillPointsPerLevel])
  );

  let pairs = 0;
  for (const page of pages) {
    const text = flat(page.html);

    // "5 + Int modifier (4 + Int modifier for nonhumans)"
    for (const match of text.matchAll(
      /(\d+)\s*\+\s*Int modifier\s*\(\s*(\d+)\s*\+\s*Int modifier for nonhumans?\s*\)/gi
    )) {
      pairs++;
      const [printed, nonhuman] = [Number(match[1]), Number(match[2])];
      if (printed - nonhuman !== 1) {
        fail(`${page.name}: the book prints ${printed} for a human and `
          + `${nonhuman} for a nonhuman, a gap of ${printed - nonhuman} and not 1`);
      }
      const stored = classes.get(page.name);
      if (stored !== undefined && stored !== printed) {
        fail(`${page.name}: the pack stores ${stored} skill points per level, `
          + `the book prints ${printed} for a human`);
      }
    }

    // Table: Skill Points per Class Level for Nonhumans, for the basic six.
    // "Charsimatic" is the book's own typo and is matched as printed.
    if (!page.name.includes("Advancing Creatures")) continue;
    const table = text.slice(text.indexOf("Basic Class Skill Points per Level"));
    for (const match of table.matchAll(
      /(Strong|Fast|Tough|Smart|Dedicated|Char(?:is|si)matic)\s+(\d+)\s*\+\s*Int/g
    )) {
      const name = match[1].startsWith("Char") ? "Charismatic" : match[1];
      const stored = classes.get(`${name} Hero`);
      if (stored === undefined) { fail(`no "${name} Hero" class to compare`); continue; }
      pairs++;
      if (stored - Number(match[2]) !== 1) {
        fail(`${name} Hero: the pack stores ${stored} and the nonhuman table `
          + `prints ${match[2]}, a gap of ${stored - Number(match[2])} and not 1`);
      }
    }
  }

  if (pairs < 17) {
    fail(`only ${pairs} printed human/nonhuman skill point pairs found, expected 17`);
  } else if (!failures) {
    console.log(`${pairs} printed skill point pairs, every gap exactly one`);
  }
}

console.log(failures ? `\n${failures} FAILURES` : "\nall species checks passed");
process.exit(failures ? 1 : 0);
