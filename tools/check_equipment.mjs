/**
 * Every weapon and every suit of armor against the table it was printed in.
 *
 *     node tools/check_equipment.mjs
 *
 * Two hundred documents came out of HTML tables a dozen columns wide, and
 * until now nothing compared them to those tables. The failure mode is not a
 * typo, it is a column: the Molotov cocktail and the mild acid were imported
 * with a burst radius of "Fire" and one of "Acid", which is the Damage Type
 * column one place to the left. Nothing displays that field, so it was wrong
 * where only a check would ever look.
 *
 * The comparison has to undo what the import legitimately normalised — "1 lb."
 * became the number 1, "Med." became "medium", "Mil (+3)" became the rating
 * "mil" and a black-market DC that lives in config — so each column says how
 * it is read. A column with no rule here is not checked, which is the honest
 * way round: adding one is how coverage grows.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { installStubs } from "./lib/foundry-stubs.mjs";
import { packDocuments } from "./lib/packs.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
installStubs();
const { MODERN20 } = await import("../module/config.mjs");

let failures = 0;
const fail = (message) => { failures++; console.log(`FAIL  ${message}`); };

/* -- reading the printed tables ----------------------------------------- */

const rules = JSON.parse(readFileSync(join(ROOT, "data", "rules.json"), "utf8"));
const pages = [];
(function walk(node) {
  if (Array.isArray(node)) node.forEach(walk);
  else if (node && typeof node === "object") {
    if (node.name && node.html) pages.push(node);
    Object.values(node).forEach(walk);
  }
})(rules);

const cellsOf = (row) =>
  [...row.matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gis)]
    .map(([, cell]) => cell.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ").trim());

/** Every row of every table whose header carries the named columns. */
function printedRows(...required) {
  const out = new Map();
  for (const page of pages) {
    let header = null;
    let section = null;
    for (const [, row] of page.html.matchAll(/<tr[^>]*>(.*?)<\/tr>/gis)) {
      const cells = cellsOf(row);
      if (cells.length < 4) continue;
      const joined = cells.join(" ").toLowerCase();
      if (required.every((column) => joined.includes(column))) {
        header = cells.map((cell) => cell.toLowerCase().trim());
        continue;
      }
      // A one-cell row is a heading: "Light Armor", "Shields".
      if (cells.length === 1) {
        const heading = cells[0].toLowerCase().match(/\b(light|medium|heavy|shield)/);
        if (heading) section = heading[1];
        continue;
      }
      if (!header || cells.length !== header.length) continue;
      const name = cells[0].replace(/[*†‡¹\s]+$/, "").trim().toLowerCase();
      if (name && !out.has(name)) {
        const row = Object.fromEntries(header.map((key, at) => [key, cells[at]]));
        // Not a column: the heading the row was printed under.
        if (section) row["§category"] = section;
        out.set(name, row);
      }
    }
  }
  return out;
}

/* -- how each column is read -------------------------------------------- */

// A trailing lone digit is a footnote marker: "Special 1", "10d6 2".
const text = (value) => String(value ?? "").replace(/–/g, "-").replace(/×/g, "x")
  .replace(/\s+/g, " ").trim().toLowerCase();
const plain = (value) => text(value).replace(/\s+\d$/, "");
const blank = (value) => ["", "-", "—", "none"].includes(plain(value));
const digits = (value) => {
  const found = plain(value).match(/-?\d+(\.\d+)?/);
  return found ? Number(found[0]) : null;
};

const SIZES = { fine: "fine", dim: "diminutive", tiny: "tiny", small: "small", sm: "small",
  med: "medium", medium: "medium", large: "large", lg: "large", huge: "huge",
  garg: "gargantuan", col: "colossal" };

const rules_ = {
  same: (book, pack) => plain(book) === plain(pack),
  number: (book, pack) => digits(book) === (pack ?? null) || (blank(book) && !pack),
  weight: (book, pack) => {
    const want = digits(book);
    return want === null ? true : Math.abs(want - Number(pack ?? 0)) < 0.001;
  },
  size: (book, pack) => {
    const word = plain(book).replace(/[.]/g, "").split(" ")[0];
    // A cell holding only a footnote marker states no size: the gauntlet's
    // row gives "*" and the entry's own text explains why.
    if (!word || /^[*†‡]+$/.test(word)) return true;
    return (SIZES[word] ?? word) === plain(pack);
  },
  /**
   * "Mil (+3)" is the rating and the black-market bump config keeps for it.
   *
   * The tables abbreviate some ratings and spell others out — "Mil (+3)" in
   * the weapons table, "Illegal (+4)" in the equipment one — and the config
   * keys are the abbreviations.
   */
  restriction: (book, pack) => {
    const RATINGS = { lic: "lic", licensed: "lic", res: "res", restricted: "res",
      mil: "mil", military: "mil", ill: "ill", illegal: "ill" };
    const word = plain(book).split(/[\s(]/)[0];
    const code = blank(word) ? "none" : (RATINGS[word] ?? word);
    if (code !== plain(pack)) return false;

    const bump = digits(plain(book).match(/\(([^)]*)\)/)?.[1] ?? "");
    if (bump === null) return true;
    return MODERN20.restrictions[plain(pack)]?.blackMarketDC === bump;
  },
  // Blank in the book has to be blank in the pack: this is the column leak.
  blankOrSame: (book, pack) => (blank(book) ? blank(pack) : plain(book) === plain(pack))
};

const WEAPONS = [
  ["damage", "damage", rules_.same],
  ["critical", "critical", rules_.same],
  ["type", "damageType", rules_.blankOrSame],
  ["burst radius", "burstRadius", rules_.blankOrSame],
  ["reflex dc", "reflexDC", rules_.number],
  ["rate of fire", "rateOfFire", rules_.blankOrSame],
  ["magazine", "magazine", rules_.blankOrSame],
  ["size", "size", rules_.size],
  ["weight", "weight", rules_.weight],
  ["purchase dc", "purchaseDC", rules_.number],
  ["restriction", "restriction", rules_.restriction]
];

const ARMOR = [
  // The table's own "Type" column is Archaic, Concealable, Tactical or
  // Impromptu, and this system stores none of them; what it stores is the
  // light/medium/heavy category, which the table gives as the heading each
  // block of rows sits under.
  ["§category", "armorType", rules_.same],
  ["equipment bonus", "equipmentBonus", rules_.number],
  ["maximum dex bonus", "maxDex", rules_.number],
  ["armor penalty", "armorPenalty", rules_.number],
  ["weight", "weight", rules_.weight],
  ["purchase dc", "purchaseDC", rules_.number],
  ["restriction", "restriction", rules_.restriction]
];

/**
 * The printed row for a document, allowing for how the tables write names.
 *
 * A row can carry a footnote as a bare digit — "Molotov Cocktail 1", "Glock 17
 * 1" — which is indistinguishable by shape from a name that ends in a number,
 * so the exact name is tried first and the footnoted one only after.
 *
 * Nothing looser than that. Matching on a prefix seemed reasonable until it
 * paired the chain with the chain saw and reported three differences that were
 * simply two different weapons. A document left unmatched is named in the
 * output and checks nothing, which is a gap somebody can see; a document
 * matched to the wrong row is a lie.
 */
function match(rows, name, strip) {
  const wanted = strip(name);
  return rows.get(name.toLowerCase())
    ?? rows.get(wanted)
    ?? rows.get(`${wanted} 1`)
    ?? rows.get(`${wanted} 2`)
    ?? null;
}

function compare(pack, rows, columns) {
  const strip = (name) => name.replace(/[*†‡]/g, "").replace(/\s*\(.*?\)\s*$/, "")
    .trim().toLowerCase();

  let compared = 0;
  const unmatched = [];
  let fields = 0;

  for (const document of packDocuments(ROOT, pack)) {
    const row = match(rows, document.name, strip);
    if (!row) { unmatched.push(document.name); continue; }
    compared++;

    /*
     * A splash weapon has no burst radius.
     *
     * The page prints two tables. Grenades and explosives run Damage,
     * Critical, Damage Type, Burst Radius; splash weapons run Direct Hit
     * Damage, Splash Damage, Critical, Damage Type and no burst radius at
     * all. The Molotov cocktail and the mild acid were imported carrying
     * "Fire" and "Acid" in that field — the Damage Type column, read off the
     * layout of the table one up the page.
     *
     * Absence on its own proves nothing: a dozen d20 Future grenades have a
     * burst radius their entry gives in prose, in tables with no such column.
     * What settles it is the Splash Damage column being there instead.
     */
    if ("splash damage" in row && !blank(document.system?.burstRadius)) {
      fields++;
      fail(`${pack}: "${document.name}" is printed as a splash weapon and has `
        + `a burst radius of ${JSON.stringify(document.system?.burstRadius)}`);
    }

    for (const [column, field, agrees] of columns) {
      if (!(column in row)) continue;
      fields++;
      if (agrees(row[column], document.system?.[field])) continue;
      fail(`${pack}: "${document.name}" has ${field} `
        + `${JSON.stringify(document.system?.[field])}, the table prints `
        + `${JSON.stringify(row[column])}`);
    }
  }
  console.log(`${compared} ${pack} matched a printed row, ${fields} columns compared`);
  if (unmatched.length) {
    // Named, not counted. A document nobody could match is a document nobody
    // is checking, and the Molotov cocktail — whose burst radius held the
    // damage type — was one of them: its row is printed "Molotov Cocktail 1",
    // the 1 being a footnote, so the name never lined up and the check that
    // was written for that exact bug skipped straight past it.
    console.log(`      ${unmatched.length} not matched to any printed row: `
      + unmatched.slice(0, 6).join("; ") + (unmatched.length > 6 ? " …" : ""));
  }
}

compare("weapons", printedRows("damage", "purchase dc"), WEAPONS);
compare("armor", printedRows("equipment bonus", "armor penalty"), ARMOR);

console.log(failures ? `\n${failures} FAILURES` : "\nall equipment checks passed");
process.exit(failures ? 1 : 0);
