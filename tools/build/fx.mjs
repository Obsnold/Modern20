/**
 * Spells, psionic powers and incantations: every page in a Spells, Psionics
 * or Incantations directory.
 *
 * The layout every spell, power or incantation page must follow:
 *
 *   # Name
 *   | Stat | Value |             (the stat block, first thing under the heading)
 *   description paragraphs, lists and tables
 *
 * with no ## sections. The stat block's rows must come from the keys below, in
 * the order listed, and each value is checked: the school, the class levels,
 * the components, the display. A page that says "As *x*, except ..." may leave
 * rows out, so only the rows every page needs are required.
 *
 * Index pages in the same directories (class spell lists and the like) are
 * named in INDEX_PAGES and skipped; any other page without a stat block is an
 * error, so a spell that loses its table is caught rather than dropped.
 */
import { once } from "./once.mjs";
import { listPages, readPage, toHtml } from "../srd/reader.mjs";
import { stableId } from "./ids.mjs";
import { BOOKS, pageUuid } from "./journal.mjs";
import { resolveDuplicates } from "./duplicates.mjs";

const SPELL_DIRS = /^(Modern\/FX\/Spells|Arcana\/Spells)\/[^/]+\.md$/;
const POWER_DIRS = /^(Modern\/FX\/Psionics|Arcana\/Psionics)\/[^/]+\.md$/;
const INCANTATION_DIRS = /^Arcana\/Incantations\/[^/]+\.md$/;

/** Pages in those directories that are not spells or powers. */
export const INDEX_PAGES = new Set([
  "Modern/FX/Spells/spells.md",
  "Arcana/Spells/spells.md",
  "Arcana/Spells/ArcaneSpells.md",
  "Arcana/Spells/DivineSpells.md",
  "Arcana/Psionics/psionics.md",
  "Arcana/Psionics/BattleMindPowers.md",
  "Arcana/Psionics/TelepathPowers.md",
  "Arcana/Psionics/PsionicAgentPowers.md",
  "Arcana/Incantations/incantations.md",
]);

/** Spells and powers printed in more than one book; see duplicates.mjs. */
export const DUPLICATES = {
  spell: { Shatter: "suffix" },
  power: {},
  incantation: {},
};

/** The rows that say what a spell or power affects; each page has at most one. */
const TARGETING = ["Target", "Targets", "Target or Targets", "Target or Area", "Area or Target", "Target, Effect, or Area", "Area", "Effect"];

const KINDS = {
  spell: {
    dirs: SPELL_DIRS,
    icon: "systems/modern20/assets/icons/lorc/magic-swirl.svg",
    keys: ["School", "Subschool", "Descriptors", "Level", "Components", "Casting Time", "Range", ...TARGETING, "Duration", "Saving Throw", "Spell Resistance"],
    required: ["School", "Level"],
    classes: ["Acolyte", "Mage", "Arcane", "Divine"],
    components: { V: "verbal", S: "somatic", M: "material", F: "focus", DF: "divineFocus" },
  },
  power: {
    dirs: POWER_DIRS,
    icon: "systems/modern20/assets/icons/lorc/psychic-waves.svg",
    keys: ["Key Ability", "Descriptors", "Level", "Display", "Manifestation Time", "Range", ...TARGETING, "Duration", "Saving Throw", "Power Resistance", "Power Point Cost"],
    required: ["Key Ability", "Level", "Power Point Cost"],
    classes: ["Telepath", "Battle Mind", "Psionic Agent"],
  },
  incantation: {
    dirs: INCANTATION_DIRS,
    icon: "systems/modern20/assets/icons/lorc/tied-scroll.svg",
    keys: ["School", "Subschool", "Descriptors", "Skill Check", "Failure", "Components", "Casting Time", "Range", ...TARGETING, "Duration", "Saving Throw", "Spell Resistance"],
    required: ["School", "Skill Check", "Failure", "Components", "Casting Time"],
    components: { V: "verbal", S: "somatic", M: "material", F: "focus", SC: "secondaryCasters", B: "backlash", XP: "experience" },
  },
};

const SCHOOLS = ["Abjuration", "Conjuration", "Divination", "Enchantment", "Evocation", "Illusion", "Necromancy", "Transmutation", "Universal"];
const SUBSCHOOLS = ["Calling", "Compulsion", "Creation", "Healing", "Summoning", "Teleporting"];
const ABILITIES = { Strength: "str", Dexterity: "dex", Constitution: "con", Intelligence: "int", Wisdom: "wis", Charisma: "cha" };
const DISPLAYS = ["Audible", "Material", "Mental", "Olfactory", "Visual"];

/** Footer labels naming what a component is: `**Focus:** A tuning fork.` */
const COMPONENT_LABELS = {
  "Material Component": "material", "Material Components": "material",
  "Arcane Material Component": "arcaneMaterial", "Arcane Material Components": "arcaneMaterial",
  "Focus": "focus", "Arcane Focus": "arcaneFocus", "Divine Focus": "divineFocus",
  "Secondary Casters": "secondaryCasters", "Backlash": "backlash", "Experience Point Cost": "experience",
};

/** An incantation's other footers: `**Failure:** Mirrorcast. ...` */
const INCANTATION_LABELS = { "Failure": "failure", "Options": "options" };

/** Which kind a page is, or null when it is neither. */
export function kindOf(path) {
  if (INDEX_PAGES.has(path)) return null;
  return Object.keys(KINDS).find((k) => KINDS[k].dirs.test(path)) ?? null;
}

/** "Acolyte 2, Mage 3" -> [{ class: "Acolyte", level: 2 }, ...] */
function parseLevels(value, classes, fail) {
  const out = [];
  for (const part of value.split(",").map((s) => s.trim())) {
    const m = part.match(/^(.+?) (\d)$/);
    if (!m || !classes.includes(m[1])) { fail(`Level "${part}" is not "<${classes.join("|")}> <0-9>"`); continue; }
    out.push({ class: m[1], level: Number(m[2]) });
  }
  return out;
}

/** "V, S, M/DF" -> { verbal, somatic, material, focus, divineFocus } flags; "M (see text)" counts as M. */
function parseComponents(value, allowed, fail) {
  const out = Object.fromEntries(Object.values(allowed).map((k) => [k, false]));
  for (const part of value.split(",").map((s) => s.trim().replace(/ \(see text\)$/, ""))) {
    for (const c of part.split("/")) {
      if (allowed[c]) out[allowed[c]] = true;
      else fail(`unknown component "${c}" (allowed: ${Object.keys(allowed).join(", ")})`);
    }
  }
  return out;
}

/**
 * "Knowledge (arcane lore) DC 31, 5 successes, and Navigate DC 31, 1 success"
 * -> [{ skill, dc, successes }, ...]. A check printed without a DC gets null.
 */
function parseSkillCheck(value, fail) {
  const out = [];
  for (const part of value.split(/, and /)) {
    const m = part.match(/^(.+?)(?: DC (\d+))?, (\d+) success(?:es)?(?: \((?:and )?see text\))?$/);
    if (!m) { fail(`Skill Check part "${part}" is not "<Skill> DC <n>, <n> successes"`); continue; }
    out.push({ skill: m[1], dc: m[2] ? Number(m[2]) : null, successes: Number(m[3]) });
  }
  return out;
}

/** Check one spell or power page; returns `{ entry, problems }` (entry is null when the page is unusable). */
export function readFx(path, kind = kindOf(path)) {
  const spec = KINDS[kind];
  const page = readPage(path);
  const problems = [];
  const fail = (line, message) => problems.push({ path, line, message });

  const h1s = page.root.children.filter((s) => s.depth === 1);
  if (h1s.length !== 1) { fail(1, `expected one # heading, found ${h1s.length}`); return { entry: null, problems }; }
  const top = h1s[0];
  for (const b of page.root.blocks) fail(b.line, "content before the # heading");
  for (const s of top.children) fail(s.line, `unexpected section "${s.title}"; a ${kind} page has no sections`);

  const [first, ...rest] = top.blocks;
  if (first?.kind !== "stats") { fail(top.line, `no stat block directly under the heading`); return { entry: null, problems }; }
  for (const b of rest) if (b.kind === "stats") fail(b.line, "a second stat block");

  const stats = first.rows;
  if (first.node.children.length - 1 !== Object.keys(stats).length) fail(first.line, "a stat appears twice in the stat block");
  let last = -1;
  for (const [key, row] of Object.entries(stats)) {
    const i = spec.keys.indexOf(key);
    if (i < 0) { fail(row.line, `unknown ${kind} stat "${key}" (allowed: ${spec.keys.join(", ")})`); continue; }
    if (i < last) fail(row.line, `"${key}" is out of order (expected: ${spec.keys.filter((k) => stats[k]).join(", ")})`);
    last = Math.max(last, i);
    if (!row.value) fail(row.line, `"${key}" is empty`);
  }
  for (const key of spec.required) if (!stats[key]) fail(first.line, `no "${key}" row`);
  const targeting = TARGETING.filter((k) => stats[k]);
  if (targeting.length > 1) fail(stats[targeting[1]].line, `both "${targeting[0]}" and "${targeting[1]}"; use one combined row`);

  const v = (key) => stats[key]?.value ?? "";
  const check = (key, f) => stats[key] && f((m) => fail(stats[key].line, m));

  const footers = {}, notes = {};
  for (const b of rest) {
    if (b.kind !== "label") continue;
    if (COMPONENT_LABELS[b.label]) footers[COMPONENT_LABELS[b.label]] = b.value;
    else if (kind === "incantation" && INCANTATION_LABELS[b.label]) notes[INCANTATION_LABELS[b.label]] = b.value;
  }

  const common = {
    descriptors: v("Descriptors") ? v("Descriptors").split(",").map((s) => s.trim()) : [],
    range: v("Range"),
    target: targeting.length ? { label: targeting[0], value: v(targeting[0]) } : { label: "", value: "" },
    duration: v("Duration"),
    savingThrow: v("Saving Throw"),
    description: toHtml(rest.map((b) => b.node)),
  };
  let levels = [];
  check("Level", (f) => { levels = parseLevels(v("Level"), spec.classes, f); });

  let system;
  if (kind === "spell" || kind === "incantation") {
    check("School", (f) => SCHOOLS.includes(v("School")) || f(`unknown school "${v("School")}"`));
    check("Subschool", (f) => SUBSCHOOLS.includes(v("Subschool")) || f(`unknown subschool "${v("Subschool")}"`));
    let components = parseComponents("", spec.components, () => {});
    check("Components", (f) => { components = parseComponents(v("Components"), spec.components, f); });
    system = {
      school: v("School"), subschool: v("Subschool"), ...common,
      components: { value: v("Components"), ...components, text: footers },
      castingTime: v("Casting Time"),
      spellResistance: v("Spell Resistance"),
    };
    if (kind === "spell") system.levels = levels;
    else {
      let checks = [];
      check("Skill Check", (f) => { checks = parseSkillCheck(v("Skill Check"), f); });
      if (!notes.failure) fail(top.line, `no "**Failure:**" paragraph saying what happens on a failed casting`);
      // Each component an incantation lists is explained in a footer, and each footer has its component.
      for (const [label, key] of Object.entries(COMPONENT_LABELS)) {
        if (!(key in components) || label.endsWith("s")) continue;
        if (components[key] && !footers[key]) fail(stats.Components.line, `"${v("Components")}" includes ${key} but there is no "**${label}:**" paragraph`);
        if (!components[key] && footers[key]) fail(stats.Components.line, `"**${label}:**" is given but "${v("Components")}" does not include it`);
      }
      Object.assign(system, {
        skillCheck: { value: v("Skill Check"), checks },
        failure: { value: v("Failure"), text: notes.failure ?? "" },
        options: notes.options ?? "",
      });
    }
  } else {
    check("Key Ability", (f) => ABILITIES[v("Key Ability")] || f(`unknown key ability "${v("Key Ability")}"`));
    const display = [];
    check("Display", (f) => {
      const value = v("Display").replace(/ \(see text\)$/, "");
      if (value === "None") return;
      for (const d of value.split(",").map((s) => s.trim())) {
        if (DISPLAYS.includes(d)) display.push(d.toLowerCase());
        else f(`unknown display "${d}" (allowed: ${DISPLAYS.join(", ")}, None)`);
      }
    });
    const cost = { value: 0, text: v("Power Point Cost") };
    check("Power Point Cost", (f) => {
      const m = v("Power Point Cost").match(/^(\d+)(?: \(see text\))?$/);
      if (m) cost.value = Number(m[1]); else f(`Power Point Cost "${v("Power Point Cost")}" is not a number`);
    });
    system = {
      keyAbility: ABILITIES[v("Key Ability")] ?? "", levels, ...common,
      display: { value: v("Display"), types: display },
      manifestationTime: v("Manifestation Time"),
      powerResistance: v("Power Resistance"),
      powerPointCost: cost,
    };
  }
  return { entry: { name: top.title, path, book: page.book, kind, system }, problems };
}

/** Build one pack (`spell`, `power` or `incantation`): `{ documents, problems, skipped }`. */
function buildKind(kind) {
  const spec = KINDS[kind];
  const problems = [];
  const entries = [];
  for (const path of listPages()) {
    if (kindOf(path) !== kind) continue;
    const { entry, problems: p } = readFx(path, kind);
    problems.push(...p);
    if (entry) entries.push(entry);
  }
  const { chosen, problems: dup, skipped } = resolveDuplicates(entries, DUPLICATES[kind], "tools/build/fx.mjs");
  problems.push(...dup);

  const folders = {};
  const documents = [];
  for (const e of chosen) {
    const folder = (folders[e.book] ??= stableId(`${kind}-folder:${e.book}`));
    const id = stableId(`${kind}:${e.path}`);
    documents.push({
      _id: id, _key: `!items!${id}`, name: e.name, type: kind, img: spec.icon, folder, sort: 0,
      system: { ...e.system, source: { book: BOOKS[e.book] ?? e.book, page: pageUuid(e.path) } },
      effects: [], ownership: { default: 0 }, flags: { modern20: { srd: e.path } },
    });
  }
  for (const [book, id] of Object.entries(folders)) {
    documents.push({ _id: id, _key: `!folders!${id}`, name: BOOKS[book] ?? book, type: "Item", folder: null, sorting: "a", color: null, flags: {} });
  }
  return { documents, problems, skipped };
}

export const buildSpells = once(() => buildKind("spell"));
export const buildPowers = once(() => buildKind("power"));
export const buildIncantations = once(() => buildKind("incantation"));
