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
  if (text.includes("described neither")) {
    return "the placeholder for an ability a stat block names and never describes";
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

console.log(`${fields} prose fields checked against ${corpus.length.toLocaleString()} `
  + `words of SRD, ${ours} skipped as this system's own`);
console.log(`widest run of text not in the book: ${widest} words `
  + `(the threshold is ${THRESHOLD})`);
console.log(failures ? `\n${failures} FAILURES` : "\nall SRD text checks passed");
process.exit(failures ? 1 : 0);
