/**
 * Species: the playable Shadowkind of Urban Arcana, one page each.
 *
 * A species page is a run of bold-labelled traits under its heading, as the
 * book prints them:
 *
 *   # Name
 *   **Size:** Medium. ...         (first)
 *   **Ability Modifiers:** +2 Constitution, –2 Charisma.
 *   **Base Speed:** 20 feet. ...
 *   **<Special Quality>:** ...    (any number, each with any paragraphs, lists
 *                                  or tables that follow it)
 *   **Bonus Feat:** ...
 *   **Free Language Skills:** ...
 *   **Other Languages:** ...
 *   **Level Adjustment:** +1.     (optional)
 *
 * with no ## sections. The traits every species has are read into fields and
 * checked; every other trait is kept, by name, as a special quality.
 */
import { listPages, readPage, toHtml } from "../srd/reader.mjs";
import { stableId } from "./ids.mjs";
import { BOOKS, pageUuid } from "./journal.mjs";
import { featLookup } from "./feats.mjs";

const ICON = "systems/modern20/assets/icons/lorc/alien-stare.svg";
const SPECIES_DIRS = /^Arcana\/Shadowkind\/[^/]+\.md$/;
const INDEX_PAGES = new Set(["Arcana/Shadowkind/shadowkind.md", "Arcana/Shadowkind/Languages.md"]);

const REQUIRED = ["Size", "Ability Modifiers", "Base Speed", "Free Language Skills", "Other Languages"];
/** Traits read into their own fields rather than kept as special qualities. */
const CORE = new Set([...REQUIRED, "Extra Starting Hit Dice", "Bonus Feat", "Level Adjustment"]);
const SIZES = ["Fine", "Diminutive", "Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan", "Colossal"];
const ABILITIES = { Strength: "str", Dexterity: "dex", Constitution: "con", Intelligence: "int", Wisdom: "wis", Charisma: "cha" };

/** Feat choices the book words as a group rather than naming one feat. */
const FEAT_GROUPS = {
  "Exotic Weapon Proficiency (any one)": ["Exotic Firearms Proficiency", "Exotic Melee Weapon Proficiency"],
};

export function isSpecies(path) {
  return SPECIES_DIRS.test(path) && !INDEX_PAGES.has(path);
}

const sign = (s) => Number(s.replace("–", "-").replace("+", ""));

/** Group a page's blocks into traits: each bold label and the blocks after it, up to the next label. */
function traits(blocks) {
  const out = [];
  const lead = [];
  for (const b of blocks) {
    if (b.kind === "label") out.push({ name: b.label, value: b.value, line: b.line, blocks: [b] });
    else (out.at(-1)?.blocks ?? lead).push(b);
  }
  return { lead, traits: out };
}

/** Check one species page; returns `{ entry, problems }`. */
export function readSpecies(path, { feats }) {
  const page = readPage(path);
  const problems = [];
  const fail = (line, message) => problems.push({ path, line, message });

  const h1s = page.root.children.filter((s) => s.depth === 1);
  if (h1s.length !== 1) { fail(1, `expected one # heading, found ${h1s.length}`); return { entry: null, problems }; }
  const top = h1s[0];
  for (const b of page.root.blocks) fail(b.line, "content before the # heading");
  for (const s of top.children) fail(s.line, `unexpected section "${s.title}"; species traits are bold labels under the # heading`);

  const { lead, traits: list } = traits(top.blocks);
  const by = {};
  for (const t of list) {
    if (by[t.name]) fail(t.line, `"**${t.name}:**" appears twice`);
    by[t.name] ??= t;
  }
  for (const key of REQUIRED) if (!by[key]) fail(top.line, `no "**${key}:**" trait`);
  if (list[0] && list[0].name !== "Size") fail(list[0].line, `the first trait is "${list[0].name}"; it should be "Size"`);

  // Size: "Medium. ..."
  const sizeWord = by.Size?.value.match(/^(\w+)\./)?.[1];
  if (by.Size && !SIZES.includes(sizeWord)) fail(by.Size.line, `Size "${by.Size.value.slice(0, 30)}..." does not start with a size`);

  // Ability Modifiers: "+2 Constitution, –2 Charisma." or "None."
  const abilities = Object.fromEntries(Object.values(ABILITIES).map((k) => [k, 0]));
  const am = by["Ability Modifiers"];
  if (am && am.value !== "None.") {
    // Split on commas outside parentheses: "+8 Strength (+4 Strength if ...), +2 Constitution".
    for (const part of am.value.replace(/\.$/, "").split(/,(?![^(]*\))/).map((s) => s.trim())) {
      const m = part.match(/^([+–-]\d+) (\w+)(?: \(.*\))?$/);
      if (!m || !ABILITIES[m[2]]) { fail(am.line, `ability modifier "${part}" is not "+<n> <Ability>"`); continue; }
      abilities[ABILITIES[m[2]]] = sign(m[1]);
    }
  }

  // Base Speed: "30 feet. ..."
  const speed = by["Base Speed"]?.value.match(/^(\d+) feet\./);
  if (by["Base Speed"] && !speed) fail(by["Base Speed"].line, `Base Speed "${by["Base Speed"].value.slice(0, 30)}" does not start with "<n> feet."`);

  // Level Adjustment: "+1."
  const la = by["Level Adjustment"]?.value.match(/^\+(\d+)\.$/);
  if (by["Level Adjustment"] && !la) fail(by["Level Adjustment"].line, `Level Adjustment "${by["Level Adjustment"].value}" is not "+<n>."`);

  // Extra Starting Hit Dice: "A bugbear gains 3 Hit Dice (3d8 hit points)."
  const hd = by["Extra Starting Hit Dice"]?.value.match(/gains (\d+) Hit Dice \(\1d(\d+) hit points\)/);
  if (by["Extra Starting Hit Dice"] && !hd) fail(by["Extra Starting Hit Dice"].line, `cannot read "<n> Hit Dice (<n>d<die> hit points)"`);

  // Natural armor, wherever a trait prints "+<n> natural armor bonus".
  const na = by["Natural Armor Bonus"]?.value.match(/\+(\d+) natural armor bonus/);
  if (by["Natural Armor Bonus"] && !na) fail(by["Natural Armor Bonus"].line, `cannot read "+<n> natural armor bonus"`);

  // Bonus Feat: the feats named in its first paragraph, or the list that follows it.
  const bonusFeats = { choose: 0, options: [] };
  const bf = by["Bonus Feat"];
  if (bf) {
    const listBlock = bf.blocks.find((b) => b.kind === "list");
    const names = listBlock
      ? listBlock.items.map((i) => ({ text: i.text, line: i.line }))
      : feats.names
          .filter((n) => !/ \((Modern|Arcana|Future|Menace)\)$/.test(n))
          .sort((a, b) => b.length - a.length)
          .reduce((found, n) => {
            const at = bf.value.indexOf(n);
            if (at >= 0 && !found.some((f) => f.at <= at && at < f.at + f.text.length)) found.push({ text: n, at, line: bf.line });
            return found;
          }, [])
          .sort((a, b) => a.at - b.at);
    if (!names.length) fail(bf.line, `"**Bonus Feat:**" names no feat in the feats pack`);
    for (const n of names) {
      for (const text of FEAT_GROUPS[n.text] ?? [n.text]) {
        const feat = feats(text, page.book);
        if (feat) bonusFeats.options.push(feat); else fail(n.line, `"${text}" is not a feat in the feats pack`);
      }
    }
    // "either A or B", or a list to choose from: one of them. Otherwise every feat named is granted.
    bonusFeats.choose = listBlock || /\beither\b/.test(bf.value) ? 1 : bonusFeats.options.length;
  }

  const languages = (key) => (by[key]?.value ?? "").replace(/\.$/, "").split(/, (?![^(]*\))/).map((s) => s.trim()).filter(Boolean);
  const special = list.filter((t) => !CORE.has(t.name)).map((t) => ({ name: t.name, description: toHtml(t.blocks.map((b) => b.node)) }));

  return {
    entry: {
      name: top.title, path, book: page.book,
      system: {
        size: (sizeWord ?? "medium").toLowerCase(),
        abilities,
        speed: speed ? Number(speed[1]) : 30,
        levelAdjustment: la ? Number(la[1]) : 0,
        hitDice: hd ? { count: Number(hd[1]), die: Number(hd[2]) } : { count: 0, die: 0 },
        naturalArmor: na ? Number(na[1]) : 0,
        bonusFeats,
        languages: { free: languages("Free Language Skills"), other: languages("Other Languages") },
        specialQualities: special,
        description: toHtml(top.blocks.map((b) => b.node)),   // the whole page, as printed
      },
    },
    problems,
  };
}

/** Build the species pack: `{ documents, problems }`. */
export function buildSpecies() {
  const context = { feats: featLookup() };
  const problems = [];
  const folders = {};
  const documents = [];
  for (const path of listPages().filter(isSpecies)) {
    const { entry, problems: p } = readSpecies(path, context);
    problems.push(...p);
    if (!entry) continue;
    const folder = (folders[entry.book] ??= stableId(`species-folder:${entry.book}`));
    const id = stableId(`species:${path}`);
    documents.push({
      _id: id, _key: `!items!${id}`, name: entry.name, type: "species", img: ICON, folder, sort: 0,
      system: { ...entry.system, source: { book: BOOKS[entry.book] ?? entry.book, page: pageUuid(path) } },
      effects: [], ownership: { default: 0 }, flags: { modern20: { srd: path } },
    });
  }
  for (const [book, id] of Object.entries(folders)) {
    documents.push({ _id: id, _key: `!folders!${id}`, name: BOOKS[book] ?? book, type: "Item", folder: null, sorting: "a", color: null, flags: {} });
  }
  return { documents, problems };
}
