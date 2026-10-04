/**
 * Creatures: every stat block on the pages in a Creatures directory, as an actor.
 *
 * A creature page is laid out:
 *
 *   # Name
 *   description
 *   ## Species Traits            (or Template Traits) traits every creature on the page shares
 *   ## <Creature>                one section per creature: a | Stat | Value | block,
 *                                then **Skills:**, **Feats:**, **Talents (<Class>):**,
 *                                **Advancement:** and any other bold labels
 *   ## <anything else>           rules the creatures share (Building a Robot, ...)
 *
 * A section is a creature when its stat block has the rows every creature has
 * (REQUIRED); a stat block of anything else on a creature page (the spell
 * "Create Crawling Claw") is not. Each creature's skills are checked against
 * the skill pages and its feats and talents against their packs, so a creature
 * can only list what exists.
 */
import { listPages, readPage, toHtml } from "../srd/reader.mjs";
import { stableId } from "./ids.mjs";
import { BOOKS, pageUuid } from "./journal.mjs";
import { featLookup } from "./feats.mjs";
import { skillAbilities } from "./occupations.mjs";
import { classSkillSections, NOT_IN_SRD as CLASS_NOT_IN_SRD, buildTalents, buildClasses } from "./classes.mjs";
import { resolveDuplicates } from "./duplicates.mjs";
import { buildCreatureTypes, buildTemplates } from "./creature-rules.mjs";

const CREATURE_PAGES = /^[^/]+\/Creatures\/[^/]+\.md$/;
/**
 * Each creature is pictured by its type, as on main. The token is the same
 * figure cut as a disc (assets/tokens). A type not listed here stops the build,
 * so a new one is decided rather than drawn as something else.
 */
export const TYPE_ICONS = {
  aberration: "delapouite/floating-tentacles",
  animal: "lorc/wolf-head",
  construct: "lorc/vintage-robot",
  dragon: "lorc/dragon-head",
  elemental: "sbed/fire",
  fey: "lorc/fairy",
  giant: "delapouite/giant",
  humanoid: "delapouite/person",
  "humanoid magical beast": "lorc/beast-eye",
  "magical beast": "lorc/beast-eye",
  "monstrous humanoid": "lorc/horned-helm",
  ooze: "delapouite/slime",
  outsider: "lorc/daemon-skull",
  plant: "delapouite/carnivorous-plant",
  undead: "delapouite/shambling-zombie",
  vermin: "skoll/long-legged-spider",
  "": "delapouite/person",   // a partial stat block that does not repeat its type (a werewolf's other forms)
};

/** Creatures pictured other than by their type: a replacement is a machine wearing a person. */
export const CREATURE_ICONS = {
  "Replacement Scientist (Human Smart Ordinary 5/Charismatic Ordinary 2)": "lorc/vintage-robot",
};

const art = (icon) => ({ img: `systems/modern20/assets/icons/${icon}.svg`, token: `systems/modern20/assets/tokens/${icon}.svg` });

/** A token's width and height in grid squares, by size: the SRD's Space column. */
export const TOKEN_SQUARES = {
  fine: 0.5, diminutive: 0.5, tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4, colossal: 6,
};

/**
 * How a token draws its artwork: twice the token, anchored a quarter down, so a
 * figure stands on its square rather than being contained by it. A drawing that
 * exactly fills its square reads small on a map. Terry's numbers, from main.
 */
export const TOKEN_TEXTURE = { scaleX: 2, scaleY: 2, anchorX: 0.5, anchorY: 0.25 };

/** A creature's prototype token: sized by the book, its hit points on a bar, and its darkvision. */
function prototypeToken(name, system, token) {
  const squares = TOKEN_SQUARES[system.size] ?? 1;
  const darkvision = system.specialQualities.map((q) => q.match(/^darkvision ([\d,]+)/i)?.[1]?.replace(/,/g, "")).find(Boolean);
  return {
    name, width: squares, height: squares,
    disposition: -1,                    // CONST.TOKEN_DISPOSITIONS.HOSTILE
    displayName: 20, displayBars: 20,   // CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER
    bar1: { attribute: "hp" },
    texture: { src: token, ...TOKEN_TEXTURE },
    sight: darkvision ? { enabled: true, range: Number(darkvision), visionMode: "darkvision" } : { enabled: false },
  };
}

/** Rows every creature's stat block has; a block without them is not a creature. */
const REQUIRED = ["Init", "Spd", "Defense", "Atk", "Str", "Dex"];

/** Every row a creature stat block may have, in the order printed. */
const ROWS = ["Class", "CR", "Size", "Type", "HD", "hp", "Mas", "Init", "Spd", "Defense", "Touch", "Flat-Footed", "Defense Breakdown", "Defense (Flame Shield)",
  "BAB", "Grap", "Atk", "Full Atk", "FS", "Reach", "SA", "SQ", "AL", "Fort", "Ref", "Will", "AP", "Rep", "Str", "Dex", "Con", "Int", "Wis", "Cha"];

/** Feats creatures have that the d20 Modern SRD does not print as feats. */
export const NOT_IN_SRD = new Set([...CLASS_NOT_IN_SRD, "Weapon Specialization", "Improved Critical", "Multiweapon Fighting"]);

/**
 * Talents a stat block names without saying which one: "uncanny dodge" could be
 * Uncanny Dodge 1 or 2. Kept by name, unlinked, rather than guessed.
 */
export const AMBIGUOUS_TALENTS = new Set(["uncanny dodge"]);

/** Items printed in more than one book; see duplicates.mjs. */
export const DUPLICATES = {};

const SIZES = ["Fine", "Diminutive", "Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan", "Colossal"];
const MARKERS = /[¹²³⁴⁵⁶⁷⁸⁹]/g;

/**
 * Split on commas outside parentheses: "Survival +1 (+5 when tracking, by scent), Hide +3".
 * A comma between digits is a thousands separator ("darkvision 1,200 ft."), not a break.
 */
export function splitList(value) {
  const out = [];
  let depth = 0, cur = "";
  const text = value.replace(/\.$/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    const thousands = ch === "," && /\d/.test(text[i - 1] ?? "") && /^\d{3}\b/.test(text.slice(i + 1));
    if (ch === "," && !depth && !thousands) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** The leading signed number of a stat ("+3", "–1", "14 (+4 with shield)"), or null for "—". */
function number(value) {
  const m = value.replace(MARKERS, "").trim().match(/^([+–-]?\d+)/);
  return m ? Number(m[1].replace("–", "-").replace("+", "")) : null;
}

/** "1/2" -> 0.5, "3" -> 3. */
function challenge(value) {
  const m = value.match(/^(\d+)(?:\/(\d+))?/);
  return m ? (m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1])) : null;
}

/** A stat block of a creature with character class levels: "Cat Folk Fast Hero 1/Charismatic Hero 2". */
const CLASSED = /\b(Strong|Fast|Tough|Smart|Dedicated|Charismatic) (Hero|Ordinary)\b|\b(Hero|Ordinary) \d/;

/** Examples that are not built on the creature their page is about: a puppeteer's host is the human it controls. */
export const NO_BASE = new Set(["Puppeteer Host (Human Charismatic Ordinary 5)"]);

/** Is this section a creature? */
const isCreature = (section) => section.blocks.some((b) => b.kind === "stats" && REQUIRED.every((k) => k in b.rows));

export function isCreaturePage(path) {
  return CREATURE_PAGES.test(path);
}

/** Read the creatures on one page; returns `{ creatures, problems }`. */
export function readCreaturePage(path, { feats, skills, talents, classes }) {
  const page = readPage(path);
  const problems = [];
  const fail = (line, message) => problems.push({ path, line, message });
  const book = page.book;

  const top = page.root.children.find((s) => s.depth === 1);
  if (!top) return { creatures: [], problems };
  // On a creature page every creature is a ## section. Elsewhere a creature is a
  // section of its own wherever it is printed: the Arcanobot is the creature an
  // FX item becomes, in a ### under the item.
  const onCreaturePage = isCreaturePage(path);
  const creatureSections = onCreaturePage ? top.children.filter(isCreature) : [...top.walk()].filter((s) => s !== top && isCreature(s));
  if (!creatureSections.length) return { creatures: [], problems };

  // What every creature on a creature page shares: its description, its traits, and its other sections.
  // A creature printed elsewhere shares the section it is printed under (the item's description).
  const shared = [];
  if (onCreaturePage) {
    shared.push(...top.blocks.map((b) => b.node));
    for (const s of top.children.filter((s) => !isCreature(s))) for (const c of s.walk()) shared.push(c.heading, ...c.blocks.map((b) => b.node));
  }

  const creatures = [];
  for (const section of creatureSections) {
    const blocks = section.blocks;
    const context = onCreaturePage || !section.parent || section.parent === top ? [] : section.parent.blocks.filter((b) => b.kind !== "stats").map((b) => b.node);
    const statBlocks = blocks.filter((b) => b.kind === "stats");
    if (statBlocks.length !== 1) fail(section.line, `"${section.title}" has ${statBlocks.length} stat blocks; one creature per section`);
    const stats = statBlocks[0].rows;
    if (statBlocks[0].node.children.length - 1 !== Object.keys(stats).length) fail(statBlocks[0].line, `a stat appears twice in "${section.title}"`);
    let last = -1;
    for (const [k, row] of Object.entries(stats)) {
      const i = ROWS.indexOf(k);
      if (i < 0) { fail(row.line, `unknown creature stat "${k}"`); continue; }
      if (i < last) fail(row.line, `"${k}" is out of order`);
      last = Math.max(last, i);
    }
    for (const sub of section.children) fail(sub.line, `"${sub.title}" is a subsection of a creature; creatures have bold labels, not sections`);

    const v = (k) => stats[k]?.value ?? "";
    const n = (k, line = stats[k]?.line) => {
      if (!stats[k]) return null;
      const x = number(v(k));
      if (x === null && !/^—/.test(v(k))) fail(line, `${k} "${v(k)}" does not start with a number`);
      return x;
    };
    if (stats.Size && !SIZES.includes(v("Size"))) fail(stats.Size.line, `Size "${v("Size")}" is not a size`);
    const type = v("Type").match(/^([^(]+?)\s*(?:\((.*)\))?$/);

    // Labels after the stat block are the creature's skills, feats, talents and so on. Labels
    // above it are its traits (a homunculus's "Skills:" trait explains how its master assigns them).
    const labels = {};
    for (const b of blocks.slice(blocks.indexOf(statBlocks[0]) + 1)) if (b.kind === "label") labels[b.label] ??= b;

    // Skills: "Hide +3, Listen +6, Survival +1 (+5 when tracking by scent), Speak Draconic".
    const skillList = [], languages = [];
    for (const key of ["Skills", "Adjusted Skills"]) {
      if (!labels[key]) continue;
      if (/^None\b/.test(labels[key].value)) continue;
      for (const raw of splitList(labels[key].value)) {
        const part = raw.replace(MARKERS, "");
        const lang = part.match(/^(Read\/Write|Speak) (.+)$/);
        if (lang && !/[+–-]\d/.test(lang[2])) { languages.push(part); continue; }
        const m = part.match(/^(.+?)(?: \(([^)]+)\))? ([+–-]\d+)(?: \((.+)\))?$/);
        if (!m) { fail(labels[key].line, `skill "${part}" is not "Skill (specialty) +<n>"`); continue; }
        if (!skills[m[1]]) fail(labels[key].line, `"${m[1]}" is not a skill`);
        if (key === "Skills") skillList.push({ name: m[1], specialty: m[2] ?? "", bonus: number(m[3]), note: m[4] ?? "" });
      }
    }

    // Feats: "Alertness, Weapon Finesse (bite), Multiattack".
    const featList = [];
    if (labels.Feats && !/^(None|—)\.?$/.test(labels.Feats.value)) {
      for (const part of splitList(labels.Feats.value)) {
        const text = part.replace(MARKERS, "").replace(/\s*[×x]\s*\d+$/, "").trim();
        const feat = feats(text, book) ?? feats(text.replace(/\s*\(.*\)$/, ""), book);
        if (feat) featList.push(feat.name === text ? feat : { ...feat, specialty: feat.specialty || (text.match(/\((.*)\)$/)?.[1] ?? "") });
        else if (NOT_IN_SRD.has(text.replace(/\s*\(.*\)$/, ""))) featList.push({ name: text, specialty: "", uuid: "" });
        else fail(labels.Feats.line, `feat "${part}" is not in the feats pack; add it to NOT_IN_SRD in tools/build/creatures.mjs if the SRD never prints it`);
      }
    }

    // Talents: "**Talents (Fast Hero):** Evasion, uncanny dodge 1."
    const talentList = [];
    for (const [label, b] of Object.entries(labels)) {
      const cls = label.match(/^Talents \((.+)\)$/)?.[1];
      if (!cls) continue;
      const known = talents.get(cls);
      if (!known) {
        if (!classes.has(cls)) fail(b.line, `"${label}": there is no ${cls} class`);
        for (const part of splitList(b.value)) talentList.push({ className: cls, name: part, detail: "", uuid: "" });
        continue;
      }
      for (const part of splitList(b.value)) {
        // "Charm (males)", "Savant (research)", "Acid resistance 7": the talent, then a detail.
        const candidates = [part, part.replace(/\s*\(.*\)$/, ""), part.replace(/\s+\d+$/, "")];
        // Hyphens and spaces do not tell talents apart: "fast talk" is Fast-Talk.
        const loose = (x) => x.trim().toLowerCase().replace(/[-\s]+/g, " ");
        const t = candidates.map((c) => known.get(c.trim().toLowerCase()) ?? [...known.values()].find((k) => loose(k.name) === loose(c))).find(Boolean);
        if (!t && AMBIGUOUS_TALENTS.has(part.toLowerCase())) { talentList.push({ className: cls, name: part, detail: "", uuid: "" }); continue; }
        if (t) talentList.push({ className: cls, name: t.name, detail: part === t.name ? "" : part, uuid: t.uuid });
        else fail(b.line, `"${part}" is not a ${cls} talent`);
      }
    }

    const description = toHtml([
      ...shared,
      ...context,
      ...blocks.filter((b) => b.kind !== "stats").map((b) => b.node),
    ]);
    const abilities = Object.fromEntries(["Str", "Dex", "Con", "Int", "Wis", "Cha"].map((k) => [k.toLowerCase(), stats[k] ? number(v(k)) : null]));

    const name = section.title.replace(MARKERS, "").trim();   // "Police Assault Drone¹"
    const icon = CREATURE_ICONS[name] ?? TYPE_ICONS[(type?.[1] ?? "").toLowerCase()];
    if (!icon) fail(stats.Type?.line ?? section.line, `no icon for the "${type?.[1]}" type; add it to TYPE_ICONS in tools/build/creatures.mjs`);
    creatures.push({
      name, path, book, line: section.line, art: art(icon ?? "delapouite/person"),
      system: {
        class: v("Class"),   // a character's class levels, on the stat blocks of named characters
        // Filled in once every creature is read: whether this is one of the book's worked examples.
        example: { classed: CLASSED.test(name) || !!stats.Class || !!labels.Occupation || Object.keys(labels).some((l) => /^Talents \(/.test(l)), base: { name: "", uuid: "" } },
        cr: { value: v("CR"), number: stats.CR ? challenge(v("CR")) : null },
        size: v("Size").toLowerCase(),
        type: { value: v("Type"), base: type?.[1] ?? "", subtypes: type?.[2] ? splitList(type[2]) : [] },
        hitDice: v("HD"),
        hp: { value: n("hp"), max: n("hp") },   // a value and a maximum, so a token bar can show it
        massiveDamage: n("Mas"),
        initiative: n("Init"),
        speed: { value: v("Spd"), ft: Number(v("Spd").match(/(\d+) ft\./)?.[1] ?? NaN) || null },   // "swim 80 ft." too
        defense: { value: n("Defense"), touch: n("Touch"), flatFooted: n("Flat-Footed"), breakdown: v("Defense Breakdown"), flameShield: v("Defense (Flame Shield)") },
        baseAttackBonus: { value: v("BAB"), bonus: n("BAB") },
        grapple: n("Grap"),
        attack: v("Atk"),
        fullAttack: v("Full Atk"),
        space: v("FS"),
        reach: v("Reach"),
        specialAttacks: v("SA"),
        specialQualities: stats.SQ ? splitList(v("SQ")) : [],
        allegiances: v("AL"),
        saves: { fort: n("Fort"), ref: n("Ref"), will: n("Will") },
        actionPoints: n("AP"),
        reputation: n("Rep"),
        abilities,
        skills: skillList,
        languages,
        feats: featList,
        talents: talentList,
        occupation: labels.Occupation?.value ?? "",
        advancement: labels.Advancement?.value ?? "",
        possessions: labels.Possessions?.value ?? "",
        description,
      },
    });
  }
  return { creatures, problems };
}

/** Build the creatures pack: `{ documents, problems, skipped }`. */
export function buildCreatures() {
  const talents = new Map();   // class -> talent name (lower case) -> { name, uuid }
  for (const d of buildTalents().documents) {
    if (d.type !== "talent") continue;
    if (!talents.has(d.system.className)) talents.set(d.system.className, new Map());
    talents.get(d.system.className).set(d.name.toLowerCase(), { name: d.name, uuid: `Compendium.modern20.talents.Item.${d._id}` });
  }
  const classes = new Set(buildClasses().documents.filter((d) => d.type === "class").map((d) => d.name));
  const context = { feats: featLookup(), skills: { ...classSkillSections(), ...skillAbilities() }, talents, classes };
  const problems = [];
  const all = [];
  const perPage = new Map();
  for (const path of listPages()) {
    const { creatures, problems: p } = readCreaturePage(path, context);
    problems.push(...p);
    all.push(...creatures);
    perPage.set(path, creatures.length);
  }
  const { chosen, problems: dup, skipped } = resolveDuplicates(all, DUPLICATES, "tools/build/creatures.mjs");
  const idOf = (c) => stableId(`creature:${c.path}:${c.name}`);

  // Each creature links to its type, and an example printed on a template's page to that template.
  const uuid = (pack, d) => `Compendium.modern20.${pack}.Item.${d._id}`;
  const types = new Map(buildCreatureTypes().documents.filter((d) => d.type === "creatureType").map((d) => [d.name.toLowerCase(), uuid("creature-types", d)]));
  const templates = new Map(buildTemplates().documents.filter((d) => d.type === "template").map((d) => [d.flags.modern20.srd, uuid("templates", d)]));
  // An example is a creature with class levels, or one printed on a template's page. On a creature page
  // it links to the base creature it was built from: the page's only other creature, or the one whose
  // name it starts with ("Fleshraker Fast Hero 3" is a "Fleshraker (Knife Fiend)").
  const isExample = (c) => c.system.example.classed || !!templates.get(c.path);
  for (const c of chosen) {
    if (!isExample(c) || !isCreaturePage(c.path) || NO_BASE.has(c.name)) continue;
    const bases = chosen.filter((b) => b.path === c.path && !isExample(b));
    const base = bases.length === 1 ? bases[0] : bases.find((b) => c.name.startsWith(b.name.replace(/\s*\(.*\)$/, "")));
    if (base) c.system.example.base = { name: base.name, uuid: `Compendium.modern20.creatures.Actor.${idOf(base)}` };
  }
  for (const c of chosen) {
    // The type as printed, or the type its wording ends with: the book prints a classed gargoyle as a
    // "humanoid magical beast", and the gargoyle is a magical beast.
    const base = c.system.type.base.toLowerCase();
    const named = types.get(base) ?? [...types.keys()].filter((t) => base.endsWith(` ${t}`)).sort((a, b) => b.length - a.length).map((t) => types.get(t))[0];
    c.system.type.uuid = named ?? "";
    c.system.template = templates.get(c.path) ?? "";
  }
  problems.push(...dup);

  const folders = new Map();
  const folder = (book, path) => {
    const bookKey = `creature-folder:${book}`;
    if (!folders.has(bookKey)) folders.set(bookKey, { id: stableId(bookKey), name: BOOKS[book] ?? book, parent: null });
    if (perPage.get(path) < 2 && isCreaturePage(path) && !hasExample.has(path)) return folders.get(bookKey).id;
    // A page with several creatures (age categories, variants, a base creature and its examples), or any
    // page other than a creature page (an organization's people, a robot), gets a folder of its own,
    // kept in the order the book prints them: the base creature first.
    const pageKey = `${bookKey}:${path}`;
    if (!folders.has(pageKey)) folders.set(pageKey, { id: stableId(pageKey), name: readPage(path).title, parent: folders.get(bookKey).id, sorting: "m" });
    return folders.get(pageKey).id;
  };

  const hasExample = new Set(chosen.filter(isExample).map((c) => c.path));
  const documents = [];
  for (const c of chosen) {
    const id = idOf(c);
    documents.push({
      _id: id, _key: `!actors!${id}`, name: c.name, type: "creature", img: c.art.img,
      folder: folder(c.book, c.path), sort: c.line,
      system: { ...c.system, source: { book: BOOKS[c.book] ?? c.book, page: pageUuid(c.path) } },
      prototypeToken: prototypeToken(c.name, c.system, c.art.token),
      items: [], effects: [], ownership: { default: 0 }, flags: { modern20: { srd: c.path } },
    });
  }
  for (const f of folders.values()) {
    documents.push({ _id: f.id, _key: `!folders!${f.id}`, name: f.name, type: "Actor", folder: f.parent, sorting: f.sorting ?? "a", color: null, flags: {} });
  }
  return { documents, problems, skipped };
}
