/**
 * The parts creatures are built from: creature types and templates.
 *
 * A creature type page (Modern/Creatures/Types/<Type>.md) is laid out:
 *
 *   # Type
 *   description
 *   | Stat | Value |              Hit Die, Base Attack Bonus, Good Saving Throws,
 *                                 Skill Points, Feats
 *   ## Traits                     bold-labelled traits every creature of the type shares,
 *                                 and a **Table: <Types>** of ability scores, minimum Hit
 *                                 Dice and natural weapon damage by size
 *
 * A template page is any page with a "## Template Traits" section: an opening
 * paragraph saying whether the template is acquired or inherited and what it can
 * be added to, then bold-labelled changes (Challenge Rating, Type, Ability
 * Scores, Feats, Special Qualities, ...).
 *
 * What a system can apply is read into fields (a type's Hit Die and attack
 * progression, a template's ability adjustments, new type and CR adjustment);
 * every trait is kept, by name, with its text, so what needs a GM's judgement
 * ("loses all feats except ...") is still there to read.
 */
import { listPages, readPage, toHtml, text } from "../srd/reader.mjs";
import { stableId } from "./ids.mjs";
import { BOOKS, pageUuid } from "./journal.mjs";

const TYPE_PAGES = /^[^/]+\/Creatures\/Types\/[^/]+\.md$/;
const TYPE_INDEX = "Modern/Creatures/Types/creaturetypes.md";
const TYPE_STATS = ["Hit Die", "Base Attack Bonus", "Good Saving Throws", "Skill Points", "Feats"];
const ICONS = {
  creatureType: "systems/modern20/assets/icons/lorc/beast-eye.svg",
  template: "systems/modern20/assets/icons/delapouite/transform.svg",
};

const ABILITIES = { str: "str", dex: "dex", con: "con", int: "int", wis: "wis", cha: "cha", strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha" };
const SAVES = { fortitude: "fort", reflex: "ref", will: "will" };

/** Template labels the book words more than one way, under one name. */
const TEMPLATE_LABELS = {
  "Abilities": "Ability Scores", "Ability Modifiers": "Ability Scores",
  "Language(s)": "Languages", "Automatic Language": "Languages", "Automatic Languages": "Languages",
  "Bonus Feat": "Bonus Feats",
};

const signed = (s) => Number(s.replace("–", "-").replace("+", ""));

/** Read one creature type page. */
export function readCreatureType(path) {
  const page = readPage(path);
  const problems = [];
  const fail = (line, message) => problems.push({ path, line, message });
  const top = page.root.children.find((s) => s.depth === 1);
  const stats = top?.blocks.find((b) => b.kind === "stats");
  if (!stats) { fail(top?.line ?? 1, "no stat block under the heading"); return { entry: null, problems }; }
  for (const k of TYPE_STATS) if (!stats.rows[k]) fail(stats.line, `no "${k}" row`);
  for (const [k, row] of Object.entries(stats.rows)) if (!TYPE_STATS.includes(k)) fail(row.line, `unknown creature type stat "${k}"`);
  const v = (k) => stats.rows[k]?.value ?? "";

  const hd = v("Hit Die").match(/^d(\d+)$/);
  if (!hd) fail(stats.rows["Hit Die"]?.line ?? stats.line, `Hit Die "${v("Hit Die")}" is not d<n>`);
  // "3/4 of total Hit Dice", "Total Hit Dice", "1/2 of total Hit Dice"
  const bab = v("Base Attack Bonus");
  const rate = /^Total Hit Dice/.test(bab) ? 1 : bab.match(/^(\d)\/(\d) of total Hit Dice/)?.slice(1).reduce((a, b) => a / b);
  if (rate === undefined) fail(stats.rows["Base Attack Bonus"]?.line ?? stats.line, `cannot read the attack progression from "${bab}"`);
  const goodSaves = Object.entries(SAVES).filter(([word]) => new RegExp(`\\b${word}\\b`, "i").test(v("Good Saving Throws"))).map(([, k]) => k);

  const traitsSec = top.child("Traits");
  if (!traitsSec) fail(top.line, `no "## Traits" section`);
  const traits = [], sizes = [];
  for (const b of traitsSec?.blocks ?? []) {
    if (b.kind === "label") traits.push({ name: b.label, description: toHtml(b.node) });
    if (b.kind === "table" && b.header[0] === "Size") {
      const col = (row, h) => row.cells[b.header.findIndex((x) => x.replace(/[¹²]/g, "") === h)] ?? "";
      for (const row of b.rows) sizes.push({
        size: row.cells[0].toLowerCase(), str: col(row, "Str"), dex: col(row, "Dex"), con: col(row, "Con"),
        minimumHitDice: col(row, "Minimum HD"), extraHitPoints: col(row, "Extra Hit Points"),
        slam: col(row, "Slam"), bite: col(row, "Bite"), claw: col(row, "Claw"), gore: col(row, "Gore"),
      });
    }
  }
  if (traitsSec && !sizes.length) fail(traitsSec.line, `no size table ("| Size | Str | ...") under Traits`);

  return {
    entry: {
      name: top.title, path, book: page.book,
      system: {
        hitDie: hd ? Number(hd[1]) : null,
        baseAttack: { value: bab.replace(/\s*\(see Table:.*\)$/, ""), rate: rate ?? null },
        goodSaves: { value: v("Good Saving Throws"), saves: goodSaves },
        skillPoints: v("Skill Points"),
        feats: v("Feats"),
        traits,
        sizes,
        description: toHtml(top.blocks.filter((b) => b !== stats).map((b) => b.node)),
      },
    },
    problems,
  };
}

/** "Str +2, Dex –2" or "–2 Str, +2 Con" or "Dexterity +2" -> { str: 2, dex: -2 }. */
export function abilityChanges(sentence) {
  const out = {};
  for (const m of sentence.matchAll(/\b(Str|Dex|Con|Int|Wis|Cha|Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) ([+–-]\d+)/gi)) out[ABILITIES[m[1].toLowerCase()]] = signed(m[2]);
  for (const m of sentence.matchAll(/([+–-]\d+) (Str|Dex|Con|Int|Wis|Cha)\b/g)) out[ABILITIES[m[2].toLowerCase()]] = signed(m[1]);
  return out;
}

/** Read the template on one page, or null when the page has none. */
export function readTemplate(path) {
  const page = readPage(path);
  const top = page.root.children.find((s) => s.depth === 1);
  const traitsSec = top?.child("Template Traits");
  if (!traitsSec) return null;
  const problems = [];
  const fail = (line, message) => problems.push({ path, line, message });

  const opening = traitsSec.blocks.find((b) => b.kind === "paragraph")?.text ?? "";
  const kind = opening.match(/\b(acquired|inherited)\b/)?.[1] ?? "";
  if (!/can be added to/.test(opening)) fail(traitsSec.line, `the Template Traits do not open with what the template "can be added to"`);
  const appliesTo = opening.match(/can be added to (.+?)(?: \(referred to|\.)/)?.[1] ?? "";

  const traits = [];
  const labels = {};
  for (const s of traitsSec.walk()) for (const b of s.blocks) {
    if (b.kind !== "label") continue;
    const name = TEMPLATE_LABELS[b.label] ?? b.label;
    traits.push({ name, description: toHtml(b.node) });
    labels[name] ??= b;
  }
  const all = text([...traitsSec.walk()].flatMap((s) => s.blocks.map((b) => b.node)));

  // Type: "The creature's type changes to undead", wherever the template says it.
  const newType = all.match(/type changes to ([a-z]+(?: [a-z]+)?)(?: \(|\.|,)/i)?.[1]?.toLowerCase() ?? "";
  // Abilities: the first sentence of Ability Scores (later sentences are conditions: "in wolf form ...").
  const abilityText = labels["Ability Scores"]?.value ?? "";
  const abilities = abilityChanges(abilityText.split(/(?<=\.)\s/)[0] ?? "");
  const lost = [...abilityText.matchAll(/no (Constitution|Intelligence|Strength|Dexterity|Wisdom|Charisma)(?: or (Constitution|Intelligence))? score/g)]
    .flatMap((m) => [m[1], m[2]]).filter(Boolean).map((a) => ABILITIES[a.toLowerCase()]);
  // CR: "Same as base creature +2" (size-based CRs stay as text).
  const crText = labels["Challenge Rating"]?.value ?? "";
  const cr = crText.match(/^Same as (?:the )?(?:base creature|character|original),? ?([+–-]\d+)/);
  if (!labels["Challenge Rating"]) fail(traitsSec.line, `no "**Challenge Rating:**" label`);

  return {
    entry: {
      name: top.title.replace(/\s*\(Template\)$/, ""), path, book: page.book,
      system: {
        kind, appliesTo,
        challengeRating: { value: crText, adjustment: cr ? signed(cr[1]) : null },
        type: newType,
        abilities: { value: abilityText, changes: abilities, lost: [...new Set(lost)] },
        traits,
        description: toHtml([...top.blocks.map((b) => b.node), ...traitsSec.blocks.filter((b) => b.kind !== "label").map((b) => b.node)]),
      },
    },
    problems,
  };
}

function documents(entries, kind) {
  const out = [], folders = {};
  for (const e of entries) {
    const folder = (folders[e.book] ??= stableId(`${kind}-folder:${e.book}`));
    const id = stableId(`${kind}:${e.path}`);
    out.push({
      _id: id, _key: `!items!${id}`, name: e.name, type: kind, img: ICONS[kind], folder, sort: 0,
      system: { ...e.system, source: { book: BOOKS[e.book] ?? e.book, page: pageUuid(e.path) } },
      effects: [], ownership: { default: 0 }, flags: { modern20: { srd: e.path } },
    });
  }
  for (const [book, id] of Object.entries(folders)) out.push({ _id: id, _key: `!folders!${id}`, name: BOOKS[book] ?? book, type: "Item", folder: null, sorting: "a", color: null, flags: {} });
  return out;
}

export function buildCreatureTypes() {
  const problems = [], entries = [];
  for (const path of listPages().filter((p) => TYPE_PAGES.test(p) && p !== TYPE_INDEX)) {
    const { entry, problems: p } = readCreatureType(path);
    problems.push(...p);
    if (entry) entries.push(entry);
  }
  return { documents: documents(entries, "creatureType"), problems };
}

export function buildTemplates() {
  const problems = [], entries = [];
  for (const path of listPages()) {
    const r = readTemplate(path);
    if (!r) continue;
    problems.push(...r.problems);
    entries.push(r.entry);
  }
  return { documents: documents(entries, "template"), problems };
}
