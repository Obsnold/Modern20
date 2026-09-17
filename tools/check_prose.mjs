/**
 * The packs the tables do not cover, against the scrape they were built from.
 *
 *     node tools/check_prose.mjs
 *
 * Feats, occupations and talents are prose entries rather than table rows, so
 * check_equipment cannot reach them and nothing else named them: 222
 * documents with no check on their contents at all. What they do have is the
 * scrape they were imported from, field for field, and that is what this
 * compares them to. It is a weaker claim than checking against the book — the
 * scrape could be wrong and this would agree with it — but it catches the
 * failure that keeps happening here, which is a printed field that never
 * reached the pack.
 *
 * Three things the import legitimately does, which the comparison undoes:
 *
 *   - descriptions are enriched. A talent's text gains
 *     "@Check[skill:gamble]{Gamble check}" where the scrape says "Gamble
 *     checks", which is the point of the enricher pass.
 *   - an occupation's skillChoices is one object in the scrape and two fields
 *     in the pack, a count and a list of options.
 *   - prerequisites are split out of a sentence, so some keep its full stop.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { packDocuments } from "./lib/packs.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

let failures = 0;
const fail = (message) => { failures++; console.log(`FAIL  ${message}`); };

/** An enricher renders as its label, which is what the scrape has. */
const unenrich = (text) => String(text ?? "")
  .replace(/@(?:Check|UUID)\[[^\]]*\]\{([^}]*)\}/g, "$1")
  .replace(/@(?:Check|UUID)\[[^\]]*\]/g, "")
  .replace(/<[^>]+>/g, "")
  .replace(/\s+/g, " ")
  .trim();

const list = (value) => (value ?? []).map((entry) =>
  String(entry).trim().replace(/\.$/, "").toLowerCase());

/**
 * Where the scrape is wrong and the pack is right.
 *
 * Alertness has no prerequisite in d20 Modern. The scrape captured its
 * benefit — "The character gets a +2 bonus on all Listen checks and Spot
 * checks" — in that field, and the import was right to drop it.
 */
const SCRAPE_WRONG = new Map([
  ["feats:Alertness:prerequisites", "the scrape has the benefit text here"],
  ["feats:Alertness:benefit", "and so has nothing left in this field"]
]);

const PACKS = [
  {
    pack: "feats",
    fields: [
      ["prerequisites", "prerequisites", "list"],
      ["benefit", "benefit", "prose"],
      ["normal", "normal", "prose"],
      ["special", "special", "prose"]
    ]
  },
  {
    pack: "occupations",
    fields: [
      ["prerequisites", "prerequisites", "list"],
      ["wealthBonus", "wealthBonus", "number"],
      ["reputationBonus", "reputationBonus", "number"],
      ["description", "description", "prose"],
      ["skillChoices", "skillChoiceCount", "count"],
      ["skillChoices", "skillOptions", "options"]
    ]
  },
  {
    pack: "talents",
    fields: [
      ["tree", "tree", "prose"],
      ["sourceClass", "sourceClass", "prose"],
      ["prerequisites", "prerequisites", "list"],
      ["description", "description", "prose"]
    ]
  }
];

const agrees = {
  prose: (want, have) => unenrich(want).toLowerCase() === unenrich(have).toLowerCase(),
  list: (want, have) => JSON.stringify(list(want)) === JSON.stringify(list(have)),
  number: (want, have) => Number(want ?? 0) === Number(have ?? 0),
  count: (want, have) => Number(want?.count ?? 0) === Number(have ?? 0),
  options: (want, have) => (want?.options ?? []).length === (have ?? []).length
};

let compared = 0;
let skipped = 0;

for (const { pack, fields } of PACKS) {
  const scrape = new Map(
    JSON.parse(readFileSync(join(ROOT, "data", `${pack}.json`), "utf8"))
      .map((entry) => [entry.name, entry])
  );
  const documents = packDocuments(ROOT, pack);

  if (documents.length !== scrape.size) {
    fail(`${pack}: ${documents.length} documents and ${scrape.size} scraped entries`);
  }

  for (const document of documents) {
    const source = scrape.get(document.name);
    if (!source) { fail(`${pack}: "${document.name}" is in no scraped entry`); continue; }

    for (const [from, to, kind] of fields) {
      const excuse = SCRAPE_WRONG.get(`${pack}:${document.name}:${from}`);
      if (excuse) { skipped++; continue; }

      const want = source[from];
      const have = document.system?.[to];
      // Nothing either side is nothing to check.
      if (!want && !have) continue;

      compared++;
      if (agrees[kind](want, have)) continue;
      fail(`${pack}: "${document.name}" has ${to} `
        + `${JSON.stringify(String(have ?? "").slice(0, 60))}, the scrape has `
        + `${JSON.stringify(String(JSON.stringify(want)).slice(0, 60))}`);
    }
  }
  console.log(`${documents.length} ${pack} compared with data/${pack}.json`);
}

console.log(`${compared} fields compared, ${skipped} skipped where the scrape is wrong`);
console.log(failures ? `\n${failures} FAILURES` : "\nall prose checks passed");
process.exit(failures ? 1 : 0);
