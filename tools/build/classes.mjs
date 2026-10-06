/**
 * Classes and talents: every page in a BasicClasses or AdvancedClasses
 * directory, and the talent trees of the basic classes.
 *
 * The layout every class page must follow:
 *
 *   # Class Name
 *   ## Requirements              (advanced and prestige classes) bold labels:
 *                                **Base Attack Bonus:** +3. **Skills:** ... **Feats:** ...
 *   ## Class Information
 *   ### Ability                  (basic classes) the class's ability
 *   ### Hit Die                  "1d8", or "... gain 1d8 hit points per level ..."
 *   ### Action Points            "<n> + one-half ..."
 *   ### Class Skills             a list of `Skill (specialty) (Abl)` items, then
 *                                **Skill Points at Each Level:** (or the basic classes'
 *                                **at 1st Level:** and **at Each Additional Level:**)
 *   ### Starting Feats           (basic classes)
 *   ### Class Table              one table: Class Level, Base Attack Bonus, Fort/Ref/Will
 *                                Save, Class Features or Special, Defense Bonus, Reputation Bonus
 *   ## Class Features
 *   ### <Feature>                one section per feature the table names
 *   ### Bonus Feats              a list of feats
 *   ### Talents                  (basic classes) #### <Tree> Talent Tree, ##### <Talent>
 *
 * A spellcasting or psionic class's casting section (### Arcane Spells, ### Divine
 * Spells, ### Psionic Powers) holds its tables, read into `casting` (readCasting):
 * spells per day by class level, spells or powers known, power points a day, and
 * the bonus spells or power points of a high ability score.
 *
 * Every feature the class table names must have its section (FEATURE_ALIASES
 * pairs the few the book names differently), every listed feat must be in the
 * feats pack (NOT_IN_SRD names the few the SRD never prints), and every class
 * skill must be a skill page with the ability printed beside it.
 */
import { once } from "./once.mjs";
import { posix } from "node:path";
import { listPages, readPage, toHtml, text } from "../srd/reader.mjs";
import { stableId } from "./ids.mjs";
import { BOOKS, pageUuid } from "./journal.mjs";
import { featLookup } from "./feats.mjs";
import { skillAbilities } from "./occupations.mjs";

const CLASS_PAGES = /^(Modern|Arcana|Future)\/(BasicClasses|AdvancedClasses)\/[^/]+\.md$/;
const INDEX_PAGES = new Set([
  "Modern/BasicClasses/BasicClasses.md",
  "Modern/BasicClasses/MulticlassCharacters.md",
  "Modern/AdvancedClasses/AdvancedClasses.md",
  "Arcana/AdvancedClasses/arcanaclasses.md",
  "Future/AdvancedClasses/futureclasses.md",
]);

const ICONS = {
  class: "systems/modern20/assets/icons/delapouite/graduate-cap.svg",
  talent: "systems/modern20/assets/icons/lorc/muscle-up.svg",
};

/** Class table entries the book names differently from the feature's heading: page -> entry -> heading. */
export const FEATURE_ALIASES = {
  "Arcana/AdvancedClasses/Mystic.md": { "Turn undead": "Turn or Rebuke Undead", "Turn humans": "Turn or Rebuke Humans" },
  "Arcana/AdvancedClasses/SpeedDemon.md": { "One with the machine": "One with the Vehicle" },
  "Modern/AdvancedClasses/Acolyte.md": { "Spontaneous cast": "Spontaneous Casting" },
  "Modern/AdvancedClasses/Negotiator.md": {
    "Talk down one opponent": "Talk Down", "Talk down several opponents": "Talk Down", "Talk down all opponents": "Talk Down",
  },
};

/** Class feature sections that are not features a character is given: bonus feats and talents are picked. */
const NOT_FEATURES = new Set(["Bonus Feats", "Talents"]);

/** Feats a class lists that the SRD never prints, so the feats pack cannot have them. */
export const NOT_IN_SRD = new Set(["Improved Sunder", "Armor Proficiency (archaic)"]);

const ABILITIES = { Strength: "str", Dexterity: "dex", Constitution: "con", Intelligence: "int", Wisdom: "wis", Charisma: "cha" };
const ABBR = { Str: "str", Dex: "dex", Con: "con", Int: "int", Wis: "wis", Cha: "cha" };
const COLUMNS = ["Class Level", "Base Attack Bonus", "Fort Save", "Ref Save", "Will Save", "Defense Bonus", "Reputation Bonus"];

const key = (s) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9/]+/g, " ").trim();
const num = (s) => Number(String(s).replace("–", "-").replace("+", "").match(/^-?\d+/)?.[0] ?? NaN);
const sections = (s) => [...s.walk()].slice(1);
const html = (s) => toHtml([...s.blocks.map((b) => b.node), ...sections(s).flatMap((c) => [c.heading, ...c.blocks.map((b) => b.node)])]);

export function isClass(path) {
  return CLASS_PAGES.test(path) && !INDEX_PAGES.has(path);
}

/** Prestige classes: the pages an index lists under a "Prestige Classes" heading. */
function prestigeClasses() {
  const out = new Set();
  for (const path of INDEX_PAGES) {
    let page;
    try { page = readPage(path); } catch { continue; }
    for (const s of page.root.walk()) {
      if (!/Prestige/.test(s.title)) continue;
      for (const b of s.blocks) if (b.kind === "list") for (const i of b.items) {
        const link = i.node.children?.[0]?.children?.find?.((n) => n.type === "link");
        if (link) out.add(posix.normalize(posix.join(posix.dirname(path), link.url)));
      }
    }
  }
  return out;
}

/** Find names from `names` in prose, longest first, without overlaps, in the order printed. */
function namesIn(textValue, names) {
  const lower = textValue.toLowerCase();
  const found = [];
  for (const n of [...names].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(^|[^a-z])${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z])`);
    const m = lower.match(re);
    if (!m) continue;
    const at = m.index + m[1].length;
    if (!found.some((f) => at < f.at + f.name.length && f.at < at + n.length)) found.push({ name: n, at });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.name);
}

/**
 * Split a class table cell into features. Names may contain commas
 * ("Shake, rattle, and roll (1/day)") and carry a detail ("Know location (+2)",
 * "Contact, low-level"), so cells are matched against the feature headings
 * rather than split blindly.
 */
function splitFeatures(cell, headings, aliases) {
  const parts = cell.split(/,\s*/).map((s) => s.trim()).filter((s) => s && s !== "—");
  const out = [];
  const match = (phrase) => {
    if (aliases[phrase]) return { heading: aliases[phrase], detail: "" };
    const m = phrase.match(/^(.*?)(?:\s*(\([^)]*\)|\S*\d\S*))?$/);
    for (const candidate of [phrase, m[1]]) {
      const k = key(candidate);
      for (const h of headings) {
        const hk = key(h);
        if (hk === k || hk === `${k}s` || (k.endsWith("s") && hk === k.slice(0, -1))) return { heading: h, detail: candidate === phrase ? "" : (m[2] ?? "") };
      }
    }
    return null;
  };
  for (let i = 0; i < parts.length;) {
    let hit = null, j = parts.length;
    for (; j > i; j--) if ((hit = match(parts.slice(i, j).join(", ")))) break;
    if (hit) { out.push({ name: parts.slice(i, j).join(", "), ...hit }); i = j; continue; }
    // A bare detail after a feature: "Contact, low-level".
    if (out.length && /^[a-z]/.test(parts[i]) && !match(parts[i])) { out.at(-1).detail = [out.at(-1).detail, parts[i]].filter(Boolean).join(", "); out.at(-1).name += `, ${parts[i]}`; i++; continue; }
    out.push({ name: parts[i], heading: null, detail: "" });
    i++;
  }
  return out;
}

/**
 * Skills the FX classes define in their own pages ("#### Spellcraft (Int)" under
 * Class Features) rather than as skill pages: name -> ability.
 */
export const classSkillSections = once(function classSkillSections() {
  const out = {};
  for (const path of listPages().filter(isClass)) {
    const features = readPage(path).root.children[0]?.child("Class Features");
    for (const s of features ? sections(features) : []) {
      const m = s.title.match(/^(.+) \((Str|Dex|Con|Int|Wis|Cha)\)$/);
      if (m) out[m[1]] ??= m[2];
    }
  }
  return out;
});

/** Check one class page; returns `{ entry, talents, problems }`. */
export function readClass(path, { feats, skills, prestige }) {
  const page = readPage(path);
  const problems = [];
  const fail = (line, message) => problems.push({ path, line, message });
  const book = page.book;

  const h1s = page.root.children.filter((s) => s.depth === 1);
  if (h1s.length !== 1) { fail(1, `expected one # heading, found ${h1s.length}`); return { entry: null, talents: [], problems }; }
  const top = h1s[0];
  const name = top.title;
  const classType = /BasicClasses/.test(path) ? "basic" : prestige.has(path) ? "prestige" : "advanced";

  const expected = classType === "basic" ? ["Class Information", "Class Features"] : ["Requirements", "Class Information", "Class Features"];
  const got = top.children.map((s) => s.title);
  for (const t of expected) if (!got.includes(t)) fail(top.line, `no "## ${t}" section`);
  const info = top.child("Class Information");
  const features = top.child("Class Features");
  if (!info || !features) return { entry: null, talents: [], problems };
  const sub = (t) => info.child(t);
  const needed = ["Hit Die", "Action Points", "Class Skills", "Class Table", ...(classType === "basic" ? ["Ability", "Starting Feats"] : [])];
  for (const t of needed) if (!sub(t)) fail(info.line, `no "### ${t}" section`);

  // Ability (basic classes).
  const abilityText = sub("Ability") ? text(sub("Ability").blocks.map((b) => b.node)) : "";
  if (sub("Ability") && !ABILITIES[abilityText]) fail(sub("Ability").line, `Ability "${abilityText}" is not an ability`);

  // Hit Die and action points.
  const hdText = sub("Hit Die") ? text(sub("Hit Die").blocks.map((b) => b.node)) : "";
  const hd = hdText.match(/\b1d(\d+)\b/);
  if (sub("Hit Die") && !hd) fail(sub("Hit Die").line, `cannot find the hit die in "${hdText.slice(0, 40)}"`);
  const apText = sub("Action Points") ? text(sub("Action Points").blocks.map((b) => b.node)) : "";
  const ap = apText.match(/(\d+) (?:\+|plus) one-half/);
  if (sub("Action Points") && !ap) fail(sub("Action Points").line, `cannot find "<n> + one-half" in the action points`);

  // Class skills and skill points.
  const classSkills = [];
  const skillPoints = { perLevel: null, value: "", firstLevel: "" };
  if (sub("Class Skills")) {
    const s = sub("Class Skills");
    const lists = s.blocks.filter((b) => b.kind === "list");
    if (lists.length !== 1) fail(s.line, `expected one skill list, found ${lists.length}`);
    for (const item of lists[0]?.items ?? []) {
      const m = item.text.match(/^(.+?)(?: \(([^)]+)\))? \((Str|Dex|Con|Int|Wis|Cha|none)\)$/);
      if (!m) { fail(item.line, `class skill "${item.text}" is not "Skill (specialty) (Abl)"`); continue; }
      const [, skill, specialty = "", abl] = m;
      if (!skills[skill]) fail(item.line, `"${skill}" is not a skill page`);
      else if (skills[skill].toLowerCase() !== abl.toLowerCase()) fail(item.line, `${skill}'s key ability is ${skills[skill]}, not ${abl}`);
      classSkills.push({ name: skill, specialty, ability: ABBR[abl] ?? "" });
    }
    const labels = s.labels;
    const each = labels["Skill Points at Each Level"] ?? labels["Skill Points at Each Additional Level"];
    if (!each) fail(s.line, `no "**Skill Points at Each Level:**" label`);
    else {
      skillPoints.value = each.value;
      skillPoints.perLevel = num(each.value.match(/^(\d+)/)?.[1] ?? "");
      if (Number.isNaN(skillPoints.perLevel)) fail(each.line, `cannot read skill points from "${each.value}"`);
    }
    skillPoints.firstLevel = labels["Skill Points at 1st Level"]?.value ?? "";
    if (classType === "basic" && !skillPoints.firstLevel) fail(s.line, `no "**Skill Points at 1st Level:**" label`);
  }

  // Starting feats (basic classes): every feat the paragraph names.
  const startingFeats = [];
  if (sub("Starting Feats")) {
    const t = text(sub("Starting Feats").blocks.map((b) => b.node));
    for (const n of namesIn(t, feats.names.filter((n) => !/ \((Modern|Arcana|Future|Menace)\)$/.test(n)))) startingFeats.push(feats(n, book));
    if (!startingFeats.length) fail(sub("Starting Feats").line, "the starting feats name no feat in the feats pack");
  }

  // Feature sections: every ### under Class Features.
  const featureSections = features.children;
  const headings = featureSections.map((s) => s.title);
  const aliases = FEATURE_ALIASES[path] ?? {};

  // Class table.
  const levels = [];
  const tableSec = sub("Class Table");
  const tables = tableSec?.blocks.filter((b) => b.kind === "table") ?? [];
  if (tableSec && tables.length !== 1) fail(tableSec.line, `expected one class table, found ${tables.length}`);
  const table = tables[0];
  const featureLevels = new Map();
  if (table) {
    if (!table.caption) fail(table.line, `the class table has no "**Table: ...**" caption`);
    const col = (h) => table.header.indexOf(h);
    for (const h of COLUMNS) if (col(h) < 0) fail(table.line, `the class table has no "${h}" column`);
    const fcol = table.header.findIndex((h) => h === "Class Features" || h === "Special");
    if (fcol < 0) fail(table.line, `the class table has no "Class Features" or "Special" column`);
    for (const row of table.rows) {
      const cell = (h) => row.cells[col(h)] ?? "";
      const level = num(cell("Class Level"));
      if (level !== levels.length + 1) fail(row.line, `level "${cell("Class Level")}" is out of sequence`);
      const entries = fcol < 0 ? [] : splitFeatures(row.cells[fcol] ?? "", headings, aliases);
      for (const e of entries) {
        if (!e.heading) fail(row.line, `"${e.name}" has no "### ${e.name}" section under Class Features; add it to FEATURE_ALIASES in tools/build/classes.mjs if the book names it differently`);
        else (featureLevels.get(e.heading) ?? featureLevels.set(e.heading, []).get(e.heading)).push(level);
      }
      const numeric = (h) => { const v = num(cell(h)); if (Number.isNaN(v)) fail(row.line, `"${h}" is "${cell(h)}"; expected +<n>`); return v; };
      levels.push({
        level,
        baseAttackBonus: { value: cell("Base Attack Bonus"), bonus: numeric("Base Attack Bonus") },
        saves: { fort: numeric("Fort Save"), ref: numeric("Ref Save"), will: numeric("Will Save") },
        defense: numeric("Defense Bonus"),
        reputation: numeric("Reputation Bonus"),
        features: entries.map((e) => ({ name: e.name, feature: e.heading ?? "", detail: e.detail })),
      });
    }
  }

  // Bonus feats.
  const bonusFeats = [];
  const bf = features.child("Bonus Feats");
  if (bf) {
    const lists = bf.blocks.filter((b) => b.kind === "list");
    if (lists.length !== 1) fail(bf.line, `expected one bonus feat list, found ${lists.length}`);
    for (const item of lists[0]?.items ?? []) {
      const feat = feats(item.text, book);
      if (feat) bonusFeats.push(feat);
      else if (NOT_IN_SRD.has(item.text)) bonusFeats.push({ name: item.text, specialty: "", uuid: "" });
      else fail(item.line, `bonus feat "${item.text}" is not a feat in the feats pack; add it to NOT_IN_SRD in tools/build/classes.mjs if the SRD never prints it`);
    }
  }

  // Talents (basic classes): #### <Tree> Talent Tree, ##### <Talent>.
  const talents = [];
  const trees = [];
  const talentSec = features.child("Talents");
  if (classType === "basic" && !talentSec) fail(features.line, `no "### Talents" section`);
  for (const tree of talentSec?.children ?? []) {
    if (!/ Talent Tree$/.test(tree.title)) { fail(tree.line, `"${tree.title}" under ### Talents is not a "<Name> Talent Tree"`); continue; }
    const treeName = tree.title.replace(/ Talent Tree$/, "");
    const names = [];
    for (const t of tree.children) {
      if (t.depth !== tree.depth + 1) fail(t.line, `talent "${t.title}" should be one heading level below its tree`);
      for (const s of sections(t)) fail(s.line, `talent "${t.title}" has a subsection; talents are one section each`);
      const pre = t.labels.Prerequisites ?? t.labels.Prerequisite;
      talents.push({
        name: t.title, path, book, className: name, tree: treeName, line: t.line,
        prerequisites: pre?.value ?? "",
        description: toHtml(t.blocks.filter((b) => b !== pre).map((b) => b.node)),
      });
      names.push(t.title);
    }
    if (!names.length) fail(tree.line, `the ${tree.title} has no talents`);
    trees.push({ name: treeName, description: toHtml(tree.blocks.map((b) => b.node)), talents: names });
  }

  // Requirements: every label as printed, with the feats and talents it names.
  const requirements = [];
  let requiredBAB = null;
  for (const b of top.child("Requirements")?.blocks ?? []) {
    if (b.kind !== "label") continue;
    const r = { label: b.label, value: b.value, feats: [] };
    if (b.label === "Base Attack Bonus") {
      requiredBAB = num(b.value);
      if (Number.isNaN(requiredBAB)) fail(b.line, `Base Attack Bonus requirement "${b.value}" is not +<n>`);
    }
    if (b.label === "Feats") {
      for (const n of namesIn(b.value, feats.names.filter((n) => !/ \((Modern|Arcana|Future|Menace)\)$/.test(n)))) r.feats.push(feats(n, book));
      if (!r.feats.length) fail(b.line, `the Feats requirement names no feat in the feats pack`);
    }
    requirements.push(r);
  }

  // Features: each ### under Class Features, with the levels the table grants it at.
  const featureList = [];
  for (const s of featureSections) {
    // The talent trees are talent items of their own; the Talents feature keeps only its introduction.
    const description = s.title === "Talents" ? toHtml(s.blocks.map((b) => b.node)) : html(s);
    featureList.push({ name: s.title, levels: featureLevels.get(s.title) ?? [], description });
  }
  const description = toHtml(top.blocks.map((b) => b.node));
  const casting = readCasting(name, features, fail);

  return {
    entry: {
      name, path, book, classType,
      system: {
        classType,
        ability: ABILITIES[abilityText] ?? "",
        hitDie: hd ? Number(hd[1]) : null,
        actionPoints: { value: apText, base: ap ? Number(ap[1]) : null },
        classSkills,
        skillPoints,
        startingFeats,
        requirements,
        requiredBaseAttackBonus: requiredBAB,
        levels,
        maxLevel: levels.length,
        bonusFeats,
        features: featureList,
        talentTrees: trees,
        casting,
        description,
      },
    },
    talents,
    problems,
  };
}

/**
 * The spell lists each caster casts from: its own, and d20 Arcana's arcane or divine
 * list (the spells pack's levels name these). A Mystic or Holy/Unholy Knight casts
 * as an Acolyte, a Techno Mage as a Mage.
 */
const SPELL_LISTS = {
  "Mage": ["Mage", "Arcane"], "Techno Mage": ["Mage", "Arcane"],
  "Acolyte": ["Acolyte", "Divine"], "Mystic": ["Acolyte", "Divine"], "Holy/Unholy Knight": ["Acolyte", "Divine"],
  "Telepath": ["Telepath"], "Battle Mind": ["Battle Mind"], "Psionic Agent": ["Psionic Agent"],
};
/** Spells a caster's list leaves out: "Mystics do not have 'cure' or 'inflict' spells", nor raise dead. */
const EXCLUDED = { "Mystic": "^(mass )?(cure|inflict) |^raise dead$" };
/** Classes that add to others' casting: their levels count toward its caster level, and raise its spells a day. */
const BOOSTS = { "Archmage": "arcane", "Ecclesiarch": "divine" };

const ORDINAL = /^(\d+)/;
const range = (cell) => {
  const m = cell.replace(/[–—]/g, "-").match(/^(\d+)(?:\s*-\s*(\d+))?/);
  return m ? { from: Number(m[1]), to: Number(m[2] ?? m[1]) } : null;
};
const value = (cell) => (/^\s*[—–-]?\s*$/.test(cell) ? null : Number(cell.replace(/\*/g, "")));

/**
 * A casting table: its spell level columns and its rows (a class level, or a range of
 * ability scores, and a number per column). A two-row header (the spell levels in a
 * row of their own under "—Spells per Day by Spell Level—") is read as one.
 */
function castingTable(table, fail) {
  let header = table.header, rows = table.rows;
  if (rows[0] && !rows[0].cells[0]?.trim() && rows[0].cells.slice(1).some((c) => ORDINAL.test(c.replace(/\*/g, "")))) {
    header = header.map((h, i) => (i > 0 && rows[0].cells[i]?.trim()) || h);
    rows = rows.slice(1);
  }
  const cols = header.map((h, i) => ({ i, m: h.replace(/\*/g, "").trim().match(ORDINAL) })).filter((c) => c.i > 0 && c.m);
  const points = header.findIndex((h) => /Pts\/Day|Power Points/i.test(h));
  const out = { columns: cols.map((c) => Number(c.m[1])), rows: [], points: [] };
  for (const row of rows) {
    const r = range(row.cells[0] ?? "");
    if (!r) { fail(row.line, `casting table row "${row.cells[0]}" is not a level or score range`); continue; }
    out.rows.push({ ...r, values: cols.map((c) => value(row.cells[c.i] ?? "")) });
    if (points >= 0) out.points.push({ ...r, points: value(row.cells[points] ?? "") ?? 0 });
  }
  return out;
}

const ABILITY_WORDS = { Strength: "str", Dexterity: "dex", Constitution: "con", Intelligence: "int", Wisdom: "wis", Charisma: "cha" };

/** A caster's casting, from its casting section's tables and text; `kind` "" for a class that does not cast. */
export function readCasting(name, features, fail) {
  const empty = { columns: [], rows: [] };
  const none = { kind: "", feature: "", ability: "", bonusAbility: "", spontaneous: false, boosts: false, lists: [], excluded: "", perDay: empty, known: empty, powerPoints: [], bonusSpells: empty, bonusPoints: [] };
  if (BOOSTS[name]) return { ...none, kind: BOOSTS[name], boosts: true };
  const section = features.children.find((s) => /^(Arcane Spells|Divine Spells|Psionic Powers)$/.test(s.title));
  if (!section) return none;
  const kind = { "Arcane Spells": "arcane", "Divine Spells": "divine", "Psionic Powers": "psionic" }[section.title];
  if (!SPELL_LISTS[name]) fail(section.line, `${name} casts, but SPELL_LISTS in tools/build/classes.mjs does not say from which lists`);
  const words = text(section.blocks.map((b) => b.node));
  // "10 + the spell's level + the Mage's Intelligence modifier"; a psionic power's DC uses each power's own key ability.
  const dc = words.match(/10 \+ the (?:spell|power)[’']s level \+ the [^.]*?(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) modifier/);
  if (kind !== "psionic" && !dc) fail(section.line, `cannot find the saving throw DC ("10 + the spell's level + the ... <Ability> modifier")`);
  const c = {
    kind, feature: section.title, ability: dc ? ABILITY_WORDS[dc[1]] : "", bonusAbility: "", spontaneous: false, boosts: false,
    lists: SPELL_LISTS[name] ?? [], excluded: EXCLUDED[name] ?? "",
    perDay: empty, known: empty, powerPoints: [], bonusSpells: empty, bonusPoints: [],
  };
  for (const b of section.blocks.filter((x) => x.kind === "table")) {
    const first = b.header[0] ?? "";
    const t = castingTable(b, fail);
    const score = first.match(/^(Str|Dex|Con|Int|Wis|Cha) Score$/);
    if (score) {
      c.bonusAbility = score[1].toLowerCase();
      if (/Power Points/i.test(b.header[1] ?? "")) c.bonusPoints = t.points;
      else c.bonusSpells = { columns: t.columns, rows: t.rows };
    } else if (/Known/i.test(b.caption ?? "")) {
      c.known = { columns: t.columns, rows: t.rows };
      c.spontaneous = true;
    } else if (kind === "psionic") {
      c.known = { columns: t.columns, rows: t.rows };
      c.powerPoints = t.points.map((p) => p.points);
    } else c.perDay = { columns: t.columns, rows: t.rows };
  }
  if (kind !== "psionic" && !c.perDay.rows.length) fail(section.line, `no spells per day table`);
  if (kind === "psionic" && !c.powerPoints.length) fail(section.line, `no Pts/Day column in the powers table`);
  return c;
}

/** Build the classes and talents packs: `{ classes, talents }`, each `{ documents, problems }`. */
export function buildClassesAndTalents() {
  const context = { feats: featLookup(), skills: { ...classSkillSections(), ...skillAbilities() }, prestige: prestigeClasses() };
  const problems = [];
  const entries = [], talents = [];
  for (const path of listPages().filter(isClass)) {
    const r = readClass(path, context);
    problems.push(...r.problems);
    if (r.entry) entries.push(r.entry);
    talents.push(...r.talents);
  }

  // Talents first, so classes and other talents can link to them.
  const talentDocs = [], talentFolders = {};
  const talentUuid = new Map();   // "<class>:<talent name, lower case>" -> uuid
  const talentName = new Map();   // the same key -> the talent's name as printed
  for (const t of talents) {
    const id = stableId(`talent:${t.path}:${t.name}`);
    const k = `${t.className}:${t.name.toLowerCase()}`;
    if (talentUuid.has(k)) problems.push({ path: t.path, line: t.line, message: `talent "${t.name}" appears twice in the ${t.className}` });
    talentUuid.set(k, `Compendium.modern20.talents.Item.${id}`);
    talentName.set(k, t.name);
    t.id = id;
  }
  for (const t of talents) {
    talentFolders[t.className] ??= stableId(`talent-folder:${t.className}`);
    const treeFolder = (talentFolders[`${t.className}:${t.tree}`] ??= stableId(`talent-folder:${t.className}:${t.tree}`));
    // Prerequisite talents: names printed in the prerequisite that are talents of the same class.
    const own = [...talentUuid.keys()].filter((k) => k.startsWith(`${t.className}:`)).map((k) => k.slice(t.className.length + 1));
    const required = namesIn(t.prerequisites, own).filter((n) => n !== t.name.toLowerCase());
    talentDocs.push({
      _id: t.id, _key: `!items!${t.id}`, name: t.name, type: "talent", img: ICONS.talent, folder: treeFolder, sort: 0,
      system: {
        className: t.className, tree: t.tree,
        prerequisites: { value: t.prerequisites, talents: required.map((n) => ({ name: talentName.get(`${t.className}:${n}`), uuid: talentUuid.get(`${t.className}:${n}`) })) },
        description: t.description,
        source: { book: BOOKS[t.book] ?? t.book, page: pageUuid(t.path) },
      },
      effects: [], ownership: { default: 0 }, flags: { modern20: { srd: t.path } },
    });
  }
  for (const c of entries.filter((c) => c.classType === "basic")) {
    const parent = talentFolders[c.name];
    if (!parent) continue;
    talentDocs.push({ _id: parent, _key: `!folders!${parent}`, name: c.name, type: "Item", folder: null, sorting: "m", color: null, flags: {} });
    for (const tree of c.system.talentTrees) {
      const id = talentFolders[`${c.name}:${tree.name}`];
      talentDocs.push({ _id: id, _key: `!folders!${id}`, name: `${tree.name} Talent Tree`, type: "Item", folder: parent, sorting: "m", color: null, flags: {} });
    }
  }

  // Class features: an item each, for a character to be given as the class reaches its level. Bonus feats and
  // talents are not features of their own: a character picks those from the class's lists and trees.
  const featureDocs = [], featureFolders = {};
  for (const c of entries) {
    for (const f of c.system.features) {
      if (NOT_FEATURES.has(f.name)) { f.uuid = ""; continue; }
      const id = stableId(`feature:${c.path}:${f.name}`);
      f.uuid = `Compendium.modern20.features.Item.${id}`;
      const folder = (featureFolders[c.name] ??= stableId(`feature-folder:${c.name}`));
      featureDocs.push({
        _id: id, _key: `!items!${id}`, name: f.name, type: "feature", img: ICONS.class, folder, sort: 0,
        system: { className: c.name, levels: f.levels, description: f.description, source: { book: BOOKS[c.book] ?? c.book, page: pageUuid(c.path) } },
        effects: [], ownership: { default: 0 }, flags: { modern20: { srd: c.path } },
      });
    }
  }
  for (const [name, id] of Object.entries(featureFolders)) featureDocs.push({ _id: id, _key: `!folders!${id}`, name, type: "Item", folder: null, sorting: "a", color: null, flags: {} });

  // Classes.
  const classDocs = [], classFolders = {};
  const allTalents = [...talentUuid.keys()];
  for (const c of entries) {
    const folderKey = `class-folder:${c.book}:${c.classType}`;
    const folder = (classFolders[folderKey] ??= { id: stableId(folderKey), name: `${BOOKS[c.book] ?? c.book}: ${{ basic: "Basic", advanced: "Advanced", prestige: "Prestige" }[c.classType]} Classes` }).id;
    const id = stableId(`class:${c.path}`);
    for (const tree of c.system.talentTrees) tree.talents = tree.talents.map((n) => ({ name: n, uuid: talentUuid.get(`${c.name}:${n.toLowerCase()}`) }));
    // Talent requirements ("Charismatic Hero Talents: Charm, favor.") link the talents they name.
    for (const r of c.system.requirements) {
      const cls = r.label.match(/^(.+ Hero) Talents$/)?.[1];
      if (!cls) continue;
      const names = allTalents.filter((k) => k.startsWith(`${cls}:`)).map((k) => k.slice(cls.length + 1));
      r.talents = namesIn(r.value, names).map((n) => ({ name: talentName.get(`${cls}:${n}`), uuid: talentUuid.get(`${cls}:${n}`) }));
    }
    classDocs.push({
      _id: id, _key: `!items!${id}`, name: c.name, type: "class", img: ICONS.class, folder, sort: 0,
      system: { ...c.system, source: { book: BOOKS[c.book] ?? c.book, page: pageUuid(c.path) } },
      effects: [], ownership: { default: 0 }, flags: { modern20: { srd: c.path } },
    });
  }
  for (const f of Object.values(classFolders)) classDocs.push({ _id: f.id, _key: `!folders!${f.id}`, name: f.name, type: "Item", folder: null, sorting: "a", color: null, flags: {} });

  return { classes: { documents: classDocs, problems }, talents: { documents: talentDocs, problems: [] }, features: { documents: featureDocs, problems: [] } };
}

const both = once(buildClassesAndTalents);
export const buildClasses = () => both().classes;
export const buildTalents = () => both().talents;
export const buildFeatures = () => both().features;
