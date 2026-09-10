/**
 * Check the rules compendium against the text it was built from.
 *
 * The journal pack is the one part of the system a reader reads rather than
 * rolls, and its failure modes are quiet: a page that lost its content is
 * still a page, and an entry pointing at a folder that is not in the pack
 * lands in the compendium root with no sign anything went wrong.
 *
 *     node scripts/check_rules.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PACK = join(ROOT, "src", "packs", "rules");

let problems = 0;
const fail = (message) => { problems++; console.log(`FAIL  ${message}`); };

const source = JSON.parse(readFileSync(join(ROOT, "data", "rules.json"), "utf8"));
const documents = readdirSync(PACK)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(join(PACK, name), "utf8")));

const folders = documents.filter((document) => document._key?.startsWith("!folders!"));
const entries = documents.filter((document) => document._key?.startsWith("!journal!"));

/* -- every document, with the pages it was built from -------------------- */

if (entries.length !== source.length) {
  fail(`${source.length} documents imported, ${entries.length} entries built`);
}

// Matched on the file it came from rather than on the name: three titles
// appear in two books each, and those entries are named for their book.
const bySource = new Map(entries.map((entry) => [entry.flags?.modern20?.source, entry]));
let pages = 0;
for (const document of source) {
  const entry = bySource.get(document.source);
  if (!entry) { fail(`no entry for "${document.title}" (${document.source})`); continue; }

  if (entry.pages.length !== document.pages.length) {
    fail(`${document.title}: ${document.pages.length} pages imported, `
      + `${entry.pages.length} built`);
  }
  for (const [index, page] of entry.pages.entries()) {
    pages++;
    if (!page.name) fail(`${document.title}: page ${index} has no name`);
    if (!page.text?.content?.trim()) fail(`${document.title}: "${page.name}" is empty`);
    // Format 1 is HTML. Foundry renders format 2 as markdown, which would
    // show the tags rather than the tables.
    if (page.text?.format !== 1) {
      fail(`${document.title}: "${page.name}" is format ${page.text?.format}, not HTML`);
    }
    if (page.type !== "text") fail(`${document.title}: "${page.name}" is a ${page.type} page`);
  }
}
console.log(`${entries.length} entries and ${pages} pages checked against data/rules.json`);

/* -- ids, folders and the shape a pack has to have ----------------------- */

const ids = new Set();
for (const document of documents) {
  if (ids.has(document._id)) fail(`two documents share the id ${document._id}`);
  ids.add(document._id);
  if (!/^[A-Za-z0-9]{16}$/.test(document._id)) {
    fail(`"${document.name}" has an id Foundry will not accept: ${document._id}`);
  }
}
for (const entry of entries) {
  const pageIds = new Set();
  for (const page of entry.pages) {
    if (pageIds.has(page._id)) fail(`${entry.name}: two pages share the id ${page._id}`);
    pageIds.add(page._id);
  }
  // A folder that is not in the pack is not an error Foundry reports: the
  // entry simply appears at the root.
  if (!folders.some((folder) => folder._id === entry.folder)) {
    fail(`${entry.name} points at a folder that is not in the pack`);
  }
}
if (folders.length !== 4) fail(`${folders.length} folders, expected one per book`);

// Two identical rows in a compendium search help nobody.
const names = entries.map((entry) => entry.name);
for (const name of new Set(names)) {
  if (names.filter((other) => other === name).length > 1) {
    fail(`two entries are both called "${name}"`);
  }
}
for (const folder of folders) {
  if (folder.type !== "JournalEntry") {
    fail(`the "${folder.name}" folder holds ${folder.type}, not JournalEntry`);
  }
}
console.log(`${documents.length} documents, ${folders.length} folders, all ids unique`);

/* -- what the conversion is not allowed to leave behind ------------------ */

// Headings inside a table cell are column headers, and reading them as
// sections put three of them in the middle of the spell list.
for (const entry of entries) {
  for (const page of entry.pages) {
    const content = page.text.content;
    if (/<td[^>]*>\s*<h[1-6]/.test(content)) {
      fail(`${entry.name}: "${page.name}" still has a heading inside a table cell`);
    }
    if (/class="(?:odd|even|heading)"/.test(content)) {
      fail(`${entry.name}: "${page.name}" still carries pandoc's row striping`);
    }
    if (/<script/i.test(content)) fail(`${entry.name}: "${page.name}" contains a script tag`);
  }
}

// The Open Game Content notice each document opens with has to survive the
// conversion: it is the licence under which any of this can ship.
const licensed = entries.filter((entry) => entry.pages.some(
  (page) => /Open Game Content/i.test(page.text.content)
));
if (licensed.length < entries.length * 0.9) {
  fail(`only ${licensed.length} of ${entries.length} entries kept their Open Game Content notice`);
}
console.log(`${licensed.length} entries carry the Open Game Content notice`);

console.log(problems ? `\n${problems} problems` : "\nall rules checks passed");
process.exit(problems ? 1 : 0);
