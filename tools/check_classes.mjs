/**
 * Every class against the page it was imported from.
 *
 *     node tools/check_classes.mjs
 *
 * A class item is read constantly — its hit die is rolled at every level, its
 * skill points are the budget the creator and the level-up screen hand out —
 * and both are one number scraped from one line. A number that failed to
 * scrape does not announce itself: it takes the schema's default and the
 * sheet shows a plausible figure for ever. Thirteen classes shipped with
 * three skill points per level because three is what the field starts at,
 * and four carried a whole sentence where a die belongs.
 *
 * The join is srdUrl, not the name: the page for the Acolyte is called
 * "Acolyte (Arcane)", which is exactly why nothing noticed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { packDocuments } from "./lib/packs.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

let failures = 0;
const fail = (message) => { failures++; console.log(`FAIL  ${message}`); };

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
const bySource = new Map();
for (const page of pages) {
  if (!bySource.has(page.source)) bySource.set(page.source, []);
  bySource.get(page.source).push(page);
}

/**
 * The basic six print their skill points in the tables of what a nonhuman
 * gets rather than on their own pages, one fewer than a human's.
 */
const fromNonhumanTable = (() => {
  const out = new Map();
  for (const page of pages) {
    const text = flat(page.html);
    const start = text.indexOf("Basic Class Skill Points per Level") >= 0
      ? text.indexOf("Basic Class Skill Points per Level")
      : text.indexOf("Skill Points Per Level");
    if (start < 0) continue;
    const table = text.slice(start, start + 400);
    for (const match of table.matchAll(
      /(Strong|Fast|Tough|Smart|Dedicated|Char(?:is|si)matic)\s+(\d+)\s*\+\s*Int/g
    )) {
      const name = match[1].startsWith("Char") ? "Charismatic" : match[1];
      out.set(`${name} Hero`, Number(match[2]) + 1);
    }
  }
  return out;
})();

const classes = packDocuments(ROOT, "classes");
let checked = 0;

for (const entry of classes) {
  const system = entry.system ?? {};
  const source = (system.srdUrl ?? "").split("/").pop();
  const text = (bySource.get(source) ?? []).map((page) => flat(page.html)).join(" ");

  if (!text) {
    fail(`${entry.name}: srdUrl names "${source}", which is not a page in `
      + "data/rules.json, so nothing can be checked against it");
    continue;
  }

  // "Skill Points at Each Level: 7 + Int modifier"
  const printed = text.match(
    /Skill Points (?:at Each Level|per Level)\s*:?\s*(\d+)\s*\+\s*Int/
  );
  const wanted = printed ? Number(printed[1]) : fromNonhumanTable.get(entry.name);

  if (wanted === undefined) {
    fail(`${entry.name}: no printed skill point line on its own page and no `
      + "row in the nonhumans table, so its budget is unverifiable");
  } else {
    checked++;
    if (system.skillPointsPerLevel !== wanted) {
      fail(`${entry.name}: the pack gives ${system.skillPointsPerLevel} skill `
        + `points per level, the book prints ${wanted}`);
    }
  }

  // "Hit Die: d10", or "The Acolyte gains 1d8 hit points per level".
  const die = text.match(/Hit Di(?:e|ce)\s*:?\s*(?:The [\w ]*? gains )?(\d?d\d+)/i);
  if (die) {
    const want = /^\d/.test(die[1]) ? die[1] : `1${die[1]}`;
    if (String(system.hitDie) !== want) {
      fail(`${entry.name}: the pack's hit die is ${JSON.stringify(system.hitDie)}, `
        + `the book prints ${want}`);
    }
  }

  // Whatever else is wrong with it, a hit die has to be a die: the level-up
  // screen and the creator both parse a number out of this string.
  if (!/^\d*d\d+$/.test(String(system.hitDie))) {
    fail(`${entry.name}: ${JSON.stringify(system.hitDie)} is not a die`);
  }
}

console.log(`${classes.length} classes checked against their own pages, `
  + `${checked} skill point budgets confirmed against a printed figure`);
console.log(failures ? `\n${failures} FAILURES` : "\nall class checks passed");
process.exit(failures ? 1 : 0);
