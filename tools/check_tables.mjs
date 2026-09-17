/**
 * Every random table's results against the row each one is printed on.
 *
 *     node tools/check_tables.mjs
 *
 * Twenty-six RollTables hold 371 results, and until now nothing read one of
 * them. `check_packs.py` checks that the ranges cover the die and
 * `check_rules_links.py` checks that each table cites its page, but a
 * RollTable has no `system` and no `pages`, so both of the provenance checks
 * walked straight past the text — and the text is what a GM actually draws.
 *
 * An eight-gram window is no use here: "20/+2" is one word. So this joins
 * each result to its printed row by the thing that has to agree, the roll
 * range, and then requires the text to be that row's cells:
 *
 *   - a result on 34-45 has to come from the row printed against 34-45, in a
 *     table on the page the document itself names
 *   - a multi-column row is assembled as "first cell, then Header: cell", so
 *     each piece is compared against the column it claims and the header
 *     above it, which is how a column read one place to the left surfaces
 *   - a footnote marker is not part of a value. The site sets superscripts as
 *     plain text in the cell, so the scrape reads "5/specific weapon type 1"
 *     and "Collision Damage 1" — and shipped them, the marker looking for all
 *     the world like a weapon category and a damage grade. The printed cell
 *     is compared with its marker stripped, which is to say a table that
 *     still carries one fails here.
 *
 * The footnotes themselves are the book's rules and are not thrown away: they
 * are appended to the table's description, which is where Foundry shows them.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { packDocuments } from "./lib/packs.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

let failures = 0;
const fail = (message) => { failures++; console.log(`FAIL  ${message}`); };

const tables = JSON.parse(readFileSync(join(ROOT, "data", "tables.json"), "utf8"));

/** Every dash the site sets, as the one a comparison can use. */
const DASHES = /[‐‑‒–—―−]/g;
const norm = (text) => String(text ?? "").replace(DASHES, "-")
  .replace(/\s+/g, " ").trim();

/**
 * A roll cell as the span it means, or null if the cell is not a range.
 *
 * "01-06" and "100" and "01" all appear, and so does "97-00": on a d% the
 * book writes 100 as 00, which is why the top of a percentile table reads
 * 98-00 rather than 98-100. A cell that is merely a number the table happens
 * to print — a damage die, an MP cost — parses here too, which is why a match
 * also has to agree about the text beside it.
 */
const hundred = (number) => (number === 0 ? 100 : number);

function span(cell) {
  const range = norm(cell).match(/^0*(\d+)\s*-\s*0*(\d+)$/);
  if (range) return [Number(range[1]), hundred(Number(range[2]))];
  const one = norm(cell).match(/^0*(\d+)$/);
  return one ? [hundred(Number(one[1])), hundred(Number(one[1]))] : null;
}

/** The footnote markers a printed table defines, as "1", "2", "3". */
function markers(printed) {
  const found = new Set();
  for (const row of printed.rows ?? []) {
    if (row.length !== 1) continue;
    const note = norm(row[0]).match(/^([1-9])\s+\S/);
    if (note) found.add(note[1]);
  }
  return found;
}

/** A printed cell as it should be stored: without the table's own footnote. */
const stripped = (cell, notes) => {
  const marked = norm(cell).match(/^(.*\S)\s([1-9])$/);
  return marked && notes.has(marked[2]) ? marked[1] : norm(cell);
};

/**
 * One repair, recorded rather than waived.
 *
 * The site's own HTML has an empty roll cell for this row — the value is
 * printed and the range is not — so there is no printed range to join to.
 * 91-93 is the gap between the 5/+2 above it and the 15/+2 below, and without
 * the row a d% of 91, 92 or 93 draws nothing at all.
 */
const REPAIRED = new Set([
  "Celestial Immunities, Resistances, and Damage Reduction: Damage Reduction"
    + "\t10/+2\t91-93",
]);

/**
 * Does this result read as the row printed against its range?
 *
 * The value for a range sits in the cell after it, and the cells after that
 * are labelled with their own headers — so a match is anchored at the roll
 * cell and walks right, which is what makes a one-column shift visible.
 */
function matches(result, printed, notes) {
  const want = norm(result.text);
  const [low, high] = result.range ?? [];
  const header = (printed.header ?? []).map((cell) => stripped(cell, notes));

  for (const row of printed.rows ?? []) {
    for (let at = 0; at < row.length - 1; at++) {
      const found = span(row[at]);
      if (!found || found[0] !== low || found[1] !== high) continue;

      const pieces = [stripped(row[at + 1], notes)];
      for (let column = at + 2; column < row.length; column++) {
        const label = header[column];
        if (!label) break;
        pieces.push(`${label}: ${stripped(row[column], notes)}`);
      }
      // The assembly stops at whatever the import took, so a result may be
      // the first cell alone or the first cell and every labelled one after.
      for (let take = 1; take <= pieces.length; take++) {
        if (pieces.slice(0, take).join(" - ") === want) return true;
      }
    }
  }
  return false;
}

let checked = 0;
let repaired = 0;

for (const document of packDocuments(ROOT, "tables")) {
  const source = document.flags?.modern20?.source;
  if (!source) {
    fail(`"${document.name}" does not say which page it is printed on`);
    continue;
  }

  const printed = tables[source];
  if (!printed) {
    fail(`"${document.name}" names ${source}, which is not in the scrape`);
    continue;
  }

  for (const result of document.results ?? []) {
    checked++;
    const at = (result.range ?? []).join("-");
    if (REPAIRED.has(`${document.name}\t${result.text}\t${at}`)) {
      repaired++;
      continue;
    }

    if (printed.some((table) => matches(result, table, markers(table)))) continue;

    fail(`"${document.name}" on ${at} reads "${String(result.text).slice(0, 90)}", `
      + `which is not the row printed against ${at} in ${source}`);
  }
}

console.log(`\n${checked} table results checked against their printed rows, `
  + `${repaired} a recorded repair of the site's own HTML`);
console.log(failures ? `${failures} FAILURES` : "all table checks passed");
process.exit(failures ? 1 : 0);
