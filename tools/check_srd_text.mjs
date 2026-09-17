/**
 * Every word of prose in the packs, against the SRD it is supposed to be.
 *
 *     node tools/check_srd_text.mjs
 *
 * The packs were scraped from a website and are the only copy of some of what
 * is in them, so what they say is not checkable by reading. Three things had
 * got in: the site's own page footer on eleven documents, two of them
 * carrying the author's e-mail address; a paragraph of the D&D 3.5 ring of the
 * ram on the d20 Modern one; and one grenade's sentence on another, reworded.
 * check_provenance.py catches the shapes of the first. This is the general
 * question — is this text the book's? — and it is harder, so it is worth
 * saying exactly how it is asked and what the answer is worth.
 *
 * How: each field's words are normalised and slid over in windows of eight.
 * A window either appears somewhere in the SRD or it does not, and what is
 * reported is the longest unbroken run of windows that do not. Sentence-level
 * comparison does not work here — creature biographies are assembled from
 * stat block table cells and FX descriptions join bulleted lists, so a
 * splitter produces text that is nowhere contiguous, and an earlier attempt
 * flagged 724 sentences of which 720 were its own fault.
 *
 * The threshold is measured, not chosen. With this system's own prose set
 * aside (below), the largest run anywhere is 20 words, every one of them a
 * creature's assembled stat line. A paragraph from another book, planted back
 * in, runs to 36. Twenty-five sits between them.
 *
 * What a pass is worth: no run of twenty-five words of prose that is not in
 * the SRD. It does not prove every sentence is on the right item — the
 * grenade's borrowed line was the SRD's own words, just somebody else's — and
 * it cannot, from here.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { packDocuments } from "./lib/packs.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

let failures = 0;
const fail = (message) => { failures++; console.log(`FAIL  ${message}`); };

const WINDOW = 8;
const THRESHOLD = 25;

const normalise = (text) => String(text ?? "")
  .replace(/@(?:Check|UUID)\[[^\]]*\]\{([^}]*)\}/g, "$1")
  .replace(/@(?:Check|UUID)\[[^\]]*\]/g, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[–—−]/g, "-")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

/* -- the book ----------------------------------------------------------- */

const rules = JSON.parse(readFileSync(join(ROOT, "data", "rules.json"), "utf8"));
const pages = [];
(function walk(node) {
  if (Array.isArray(node)) node.forEach(walk);
  else if (node && typeof node === "object") {
    if (node.name && node.html) pages.push(node);
    Object.values(node).forEach(walk);
  }
})(rules);

const corpus = normalise(pages.map((page) => page.html).join(" ")).split(" ");
const grams = new Set();
for (let at = 0; at + WINDOW <= corpus.length; at++) {
  grams.add(corpus.slice(at, at + WINDOW).join(" "));
}

/** The longest unbroken run of words whose window is nowhere in the book. */
function longestGap(text) {
  const words = normalise(text).split(" ").filter(Boolean);
  if (words.length < WINDOW) return { run: 0, excerpt: "" };

  let worst = 0;
  let worstAt = 0;
  let run = 0;
  let start = 0;
  for (let at = 0; at + WINDOW <= words.length; at++) {
    if (grams.has(words.slice(at, at + WINDOW).join(" "))) {
      run = 0;
      continue;
    }
    if (run === 0) start = at;
    run++;
    if (run > worst) { worst = run; worstAt = start; }
  }
  return { run: worst, excerpt: words.slice(worstAt, worstAt + worst + WINDOW).join(" ") };
}

/* -- this system's own prose -------------------------------------------- */

/**
 * Text this project wrote, which is not in the SRD because it is not the
 * SRD's. Each one is named with what it is, so the list is a statement of
 * everything in these packs that the book did not write rather than a way of
 * quietening the check.
 */
function authored(pack, name, field, text) {
  /*
   * Two placeholders, both beginning the same way and both this system's:
   * "Printed in this creature's stat block, but described neither in the
   * creature's own species traits nor in..." on 226 abilities, and "...but
   * not defined in the SRD's feat list" on 59 feats. Matched on the stem they
   * share, so a third sibling is covered rather than found one failure at a
   * time — which is how the second one was found.
   */
  if (/printed in this creature.s stat block/i.test(text)) {
    return "the placeholder for something a stat block names and never defines";
  }
  if (pack === "pregens" && field === "biography") {
    return "a ready-made character's own write-up";
  }
  if (pack === "species" && name === "Human") {
    return "the baseline species, assembled from the character-creation rules";
  }
  return null;
}

const PROSE = ["description", "benefit", "normal", "special", "biography"];

/** The fields that quote the book directly, and so can be placed on a page. */
const PLACEABLE = ["description", "benefit", "normal", "special"];

function* prose(system) {
  for (const key of PROSE) {
    if (typeof system?.[key] === "string" && system[key]) yield [key, system[key]];
  }
  for (const trait of system?.traits ?? []) {
    if (typeof trait?.description === "string") {
      yield [`traits[${trait.name}]`, trait.description];
    }
  }
}

/* -- the packs ---------------------------------------------------------- */

const manifest = JSON.parse(readFileSync(join(ROOT, "system.json"), "utf8"));
let fields = 0;
let ours = 0;
let widest = 0;

for (const pack of manifest.packs ?? []) {
  for (const document of packDocuments(ROOT, pack.name)) {
    for (const entry of [document, ...(document.items ?? [])]) {
      const system = entry.system;
      if (!system || typeof system !== "object") continue;

      for (const [field, text] of prose(system)) {
        if (authored(pack.name, entry.name, field, text)) { ours++; continue; }
        fields++;

        const { run, excerpt } = longestGap(text);
        widest = Math.max(widest, run);
        if (run < THRESHOLD) continue;

        fail(`${pack.name}: "${entry.name}" .${field} has ${run} words in a row `
          + `that are not in the SRD — "${excerpt.slice(0, 120)}"`);
      }
    }
  }
}

/**
 * An srdUrl has to name the page the entry is actually on.
 *
 * They were chapters, not entries. The ring of the ram linked to
 * fxitems.html, which is an index page holding none of the chapter's text;
 * its own entry is on fxpotion.html. 140 documents were like that, and the
 * consequence is not only a link that lands in the wrong place — it is that
 * an entry cannot be compared against the page it came from, which is the
 * only way to catch one item's text appearing on another.
 *
 * Checked as coverage, not equality: a document's words must be on the page
 * it names. Where a name is generic enough to be shared — a creature ability
 * called "Darkvision 60 ft." whose wording appears in two chapters — the page
 * holding some of it is accepted, because the parent creature really is
 * printed there.
 *
 * Two things are out of scope and have to be, or the check reports 341
 * problems of which 335 are its own. A creature's biography is assembled
 * from the cells of its stat block — "attack 2 melee 1d4 slam full attack 2
 * melee 1d4 slam skills hide 5" — and appears on no page in that order, not
 * even the right one. And an entry too short to place is not evidence:
 * "See Armor Proficiency (light)" is one window of cross-reference.
 */
{
  const sources = new Map();
  for (const page of pages) {
    const source = page.source ?? "";
    if (!sources.has(source)) sources.set(source, []);
    sources.get(source).push(page.html);
  }
  const pageGrams = new Map();
  for (const [source, htmls] of sources) {
    const words = normalise(htmls.join(" ")).split(" ").filter(Boolean);
    const set = new Set();
    for (let at = 0; at + WINDOW <= words.length; at++) {
      set.add(words.slice(at, at + WINDOW).join(" "));
    }
    pageGrams.set(source, set);
  }

  let placed = 0;
  let orphaned = 0;
  for (const pack of manifest.packs ?? []) {
    for (const document of packDocuments(ROOT, pack.name)) {
      for (const entry of [document, ...(document.items ?? [])]) {
        const system = entry.system;
        if (!system?.srdUrl) continue;

        const named = String(system.srdUrl).split("/").pop();
        const grams = pageGrams.get(named);
        if (!grams) {
          failures++;
          console.log(`FAIL  ${pack.name}: "${entry.name}" links to "${named}", `
            + "which is not a page in data/rules.json");
          continue;
        }

        if (authored(pack.name, entry.name, "description", String(system.description ?? ""))) {
          continue;
        }

        // Not biography: that field is assembled, not quoted.
        const text = PLACEABLE
          .map((key) => (typeof system[key] === "string" ? system[key] : ""))
          .join(" ");
        const words = normalise(text).split(" ").filter(Boolean);
        // Fewer than three windows is a cross-reference, not a passage.
        if (words.length < WINDOW + 2) continue;

        let found = 0;
        for (let at = 0; at + WINDOW <= words.length; at++) {
          if (grams.has(words.slice(at, at + WINDOW).join(" "))) found++;
        }
        placed++;
        if (found === 0) {
          orphaned++;
          failures++;
          console.log(`FAIL  ${pack.name}: "${entry.name}" links to "${named}", `
            + "which holds none of its text");
        }
      }
    }
  }
  console.log(`${placed} documents checked against the page they link to, `
    + `${orphaned} linking to a page without their text`);
}

console.log(`${fields} prose fields checked against ${corpus.length.toLocaleString()} `
  + `words of SRD, ${ours} skipped as this system's own`);
console.log(`widest run of text not in the book: ${widest} words `
  + `(the threshold is ${THRESHOLD})`);
console.log(failures ? `\n${failures} FAILURES` : "\nall SRD text checks passed");
process.exit(failures ? 1 : 0);
