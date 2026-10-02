/**
 * Occupations: every page in an Occupations directory.
 *
 * The layout every occupation page must follow:
 *
 *   # Name
 *   description paragraphs
 *   | Stat | Value |             Prerequisite, Reputation Bonus Increase, Wealth Bonus Increase
 *   ## Skills                    "Choose <n> of the following skills ...", a list of
 *                                `Skill (specialty) (Abl)` items, and optionally
 *                                "Or add a new ... Language."
 *   ## Bonus Feat                (optional) "Select <n> of the following:" and a list of
 *                                feats; with no "Select" line every listed feat is granted
 *   ## <anything else>           (optional) extra rules, kept in the description
 *
 * Skills are checked against the skill pages (the name, and the key ability
 * printed with it), and feats against the feats pack, so an occupation can only
 * offer things that exist.
 */
import { listPages, readPage, toHtml } from "../srd/reader.mjs";
import { stableId } from "./ids.mjs";
import { BOOKS, pageUuid } from "./journal.mjs";
import { featLookup } from "./feats.mjs";

const ICON = "systems/modern20/assets/icons/delapouite/briefcase.svg";
const OCCUPATION_DIRS = /^[^/]+\/Occupations\/[^/]+\.md$/;
const INDEX_PAGES = new Set(["Modern/Occupations/occupations.md", "Arcana/Occupations/occupations.md", "Future/Occupations/occupations.md"]);
const STATS = ["Prerequisite", "Reputation Bonus Increase", "Wealth Bonus Increase"];
const NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const ABILITIES = { Str: "str", Dex: "dex", Con: "con", Int: "int", Wis: "wis", Cha: "cha" };

export function isOccupation(path) {
  return OCCUPATION_DIRS.test(path) && !INDEX_PAGES.has(path);
}

/** Skill name -> key ability ("Int", or "None"), from every skill page's stat block. */
export function skillAbilities() {
  const out = {};
  for (const path of listPages()) {
    if (!/^[^/]+\/Skills\/[^/]+\.md$/.test(path)) continue;
    const top = readPage(path).root.children.find((s) => s.depth === 1);
    const ability = top?.stats["Key Ability"]?.value;
    if (ability) out[top.title] ??= ability;
  }
  return out;
}

/** "Choose three of ..." / "Select one of ..." -> 3 / 1, or null. */
function count(text, verb) {
  const m = text.match(new RegExp(`^${verb} (\\w+) of the following`));
  return m ? (NUMBERS[m[1]] ?? null) : null;
}

/** Check one occupation page; returns `{ entry, problems }`. */
export function readOccupation(path, { skills, feats }) {
  const page = readPage(path);
  const problems = [];
  const fail = (line, message) => problems.push({ path, line, message });

  const h1s = page.root.children.filter((s) => s.depth === 1);
  if (h1s.length !== 1) { fail(1, `expected one # heading, found ${h1s.length}`); return { entry: null, problems }; }
  const top = h1s[0];
  for (const b of page.root.blocks) fail(b.line, "content before the # heading");

  // Stat block.
  const statBlocks = top.blocks.filter((b) => b.kind === "stats");
  if (statBlocks.length !== 1) fail(top.line, `expected one stat block, found ${statBlocks.length}`);
  const stats = statBlocks[0]?.rows ?? {};
  for (const [key, row] of Object.entries(stats)) if (!STATS.includes(key)) fail(row.line, `unknown occupation stat "${key}" (allowed: ${STATS.join(", ")})`);
  for (const key of STATS) if (!stats[key]) fail(statBlocks[0]?.line ?? top.line, `no "${key}" row`);
  const bonus = (key) => {
    const v = stats[key]?.value ?? "—";
    if (v === "—") return 0;
    const m = v.match(/^\+(\d+)$/);
    if (!m) fail(stats[key].line, `"${key}" is "${v}"; expected +<n> or —`);
    return m ? Number(m[1]) : 0;
  };
  const prerequisite = stats.Prerequisite?.value ?? "";
  const age = prerequisite.match(/^Age (\d+)\+$/);

  // Skills.
  const skillSec = top.child("Skills");
  const skillOut = { choose: 0, options: [], languages: "" };
  if (!skillSec) fail(top.line, "no ## Skills section");
  else {
    const lists = skillSec.blocks.filter((b) => b.kind === "list");
    if (lists.length !== 1) fail(skillSec.line, `expected one skill list, found ${lists.length}`);
    for (const b of skillSec.blocks) {
      if (b.kind === "paragraph" && b.text.startsWith("Choose ")) {
        skillOut.choose = count(b.text, "Choose") ?? (fail(b.line, `cannot read how many skills from "${b.text.slice(0, 40)}..."`), 0);
      } else if (b.kind === "paragraph" && /^Or add a new .*Language\.$/.test(b.text)) {
        skillOut.languages = b.text;
      } else if (b.kind !== "list") fail(b.line, `unexpected ${b.kind} in ## Skills`);
    }
    if (!skillSec.blocks.some((b) => b.kind === "paragraph" && b.text.startsWith("Choose "))) fail(skillSec.line, `no "Choose <n> of the following skills" line`);
    for (const item of lists[0]?.items ?? []) {
      const m = item.text.match(/^(.+?)(?: \(([^)]+)\))? \((Str|Dex|Con|Int|Wis|Cha)\)$/);
      if (!m) { fail(item.line, `skill "${item.text}" is not "Skill (specialty) (Abl)"`); continue; }
      const [, name, specialty = "", ability] = m;
      if (!skills[name]) fail(item.line, `"${name}" is not a skill page`);
      else if (skills[name] !== ability) fail(item.line, `${name}'s key ability is ${skills[name]}, not ${ability}`);
      skillOut.options.push({ name, specialty, ability: ABILITIES[ability] });
    }
  }

  // Bonus feats.
  const featSec = top.child("Bonus Feat");
  const featOut = { choose: 0, options: [] };
  if (featSec) {
    const lists = featSec.blocks.filter((b) => b.kind === "list");
    if (lists.length !== 1) fail(featSec.line, `expected one feat list, found ${lists.length}`);
    for (const b of featSec.blocks) {
      if (b.kind === "paragraph" && b.text.startsWith("Select ")) featOut.choose = count(b.text, "Select") ?? (fail(b.line, `cannot read how many feats from "${b.text}"`), 0);
      else if (b.kind !== "list") fail(b.line, `unexpected ${b.kind} in ## Bonus Feat`);
    }
    for (const item of lists[0]?.items ?? []) {
      const feat = feats(item.text, page.book);
      if (feat) featOut.options.push(feat); else fail(item.line, `"${item.text}" is not a feat in the feats pack`);
    }
    if (!featOut.choose) featOut.choose = featOut.options.length;   // no "Select" line: all of them
  }

  // Everything that is not a stat block, the skill list or the feat list is description.
  const nodes = top.blocks.filter((b) => b.kind !== "stats").map((b) => b.node);
  for (const s of top.children) {
    if (s === skillSec || s === featSec) continue;
    for (const c of s.walk()) nodes.push(c.heading, ...c.blocks.map((b) => b.node));
  }

  return {
    entry: {
      name: top.title, path, book: page.book,
      system: {
        prerequisite, minimumAge: age ? Number(age[1]) : null,
        reputationBonus: bonus("Reputation Bonus Increase"),
        wealthBonus: bonus("Wealth Bonus Increase"),
        skills: skillOut, feats: featOut,
        description: toHtml(nodes),
      },
    },
    problems,
  };
}

/** Build the occupations pack: `{ documents, problems }`. */
export function buildOccupations() {
  const context = { skills: skillAbilities(), feats: featLookup() };
  const problems = [];
  const folders = {};
  const documents = [];
  const seen = new Map();
  for (const path of listPages().filter(isOccupation)) {
    const { entry, problems: p } = readOccupation(path, context);
    problems.push(...p);
    if (!entry) continue;
    if (seen.has(entry.name)) { problems.push({ path, line: 1, message: `"${entry.name}" is also printed in ${seen.get(entry.name)}` }); continue; }
    seen.set(entry.name, path);
    const folder = (folders[entry.book] ??= stableId(`occupation-folder:${entry.book}`));
    const id = stableId(`occupation:${path}`);
    documents.push({
      _id: id, _key: `!items!${id}`, name: entry.name, type: "occupation", img: ICON, folder, sort: 0,
      system: { ...entry.system, source: { book: BOOKS[entry.book] ?? entry.book, page: pageUuid(path) } },
      effects: [], ownership: { default: 0 }, flags: { modern20: { srd: path } },
    });
  }
  for (const [book, id] of Object.entries(folders)) {
    documents.push({ _id: id, _key: `!folders!${id}`, name: BOOKS[book] ?? book, type: "Item", folder: null, sorting: "a", color: null, flags: {} });
  }
  return { documents, problems };
}
