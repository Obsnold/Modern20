/**
 * The FX Items pack: the magic and psionic items of Modern/FX/Items and Arcana/FXItems.
 *
 * An item is a section (## or ###) with a stat table whose Type row names its category ("Weapon (magic)",
 * "Wondrous Item (vehicular)", "Potion"); its description is the section's text, with any sections under it
 * that are not items themselves (an ARCANOBOTS action figure's statistics). Sections without one (a page's
 * rules, the magic weapon special abilities) are not items.
 *
 *   weapons and armor     the weapon or armor they are made from (BASES: the Flaming Machete is a machete),
 *                         with its enhancement bonus; a purchase DC printed for each bonus ("25 (+1), 30 (+2)")
 *                         is kept for each
 *   potions, scrolls,     a charged item (`consumable`): one use, or a wand's and a staff's 50 charges, and the
 *   wands and staffs      spells it holds, by its name ("Wand of Web") or, for a staff, its lines ("Fireball
 *                         (DC 15); uses 1 charge.")
 *   the rest              equipment: rings, tattoos, wondrous items, vehicular items and artifacts
 *
 * Every item keeps its caster (or manifester) level, its kind (magic, psionic, vehicular) and category.
 */
import { once } from "./once.mjs";
import { listPages, readPage, toHtml, text } from "../srd/reader.mjs";
import { stableId } from "./ids.mjs";
import { BOOKS, pageUuid } from "./journal.mjs";
import { buildEquipment } from "./equipment.mjs";
import { buildSpells, buildPowers, buildIncantations } from "./fx.mjs";

export const FX_ITEM_PAGES = /^(Modern\/FX\/Items|Arcana\/FXItems)\//;

/** The categories a Type row names, and the item type each is. */
const CATEGORIES = {
  Weapon: "weapon", Armor: "armor", Potion: "consumable", Scroll: "consumable", Wand: "consumable", Staff: "consumable",
  Ring: "equipment", Tattoo: "equipment", "Wondrous Item": "equipment", Artifact: "equipment",
};

/**
 * What an FX weapon or armor is made from (its name in the equipment pack), and the enhancement bonus it
 * has when bought as the book first prices it; null for one made from a weapon of the buyer's choosing.
 */
export const BASES = {
  "Charged Nunchaku": { base: "Nunchaku", enhancement: 1 },
  "Flaming Machete": { base: "Machete", enhancement: 1 },
  "Fragmentation Grenade of Distance": { base: "Fragmentation grenade", enhancement: 1 },
  "Holy Crossbow": { base: "Crossbow", enhancement: 1 },
  "Keen Chain Saw": { base: "Chain saw", enhancement: 1 },
  // "Each bladegun is a specific make of handgun"; the Wounding Handgun is any handgun.
  "Wounding Handgun": { base: null, enhancement: 1 },
  "Bladegun": { base: null, enhancement: 1 },
  "Chain Saw of the Psycho": { base: "Chain saw", enhancement: 1 },
  "Cloudkill Grenade": { base: "Smoke grenade", enhancement: 0 },
  "Deadeye Rifle": { base: "Barrett Light Fifty (.50 sniper rifle)", enhancement: 1 },
  // "use the warhammer statistics"
  "Demolition Hammer": { base: "Warhammer", enhancement: 1 },
  "Thunderclap Taser": { base: "Taser", enhancement: 0 },
  "Illusory Concealable Vest": { base: "Concealable vest", enhancement: 1 },
  "Undercover Vest of Landing": { base: "Undercover vest", enhancement: 1 },
  // "the same protection as a +1 leather jacket"
  "Bulletproof Shirt": { base: "Leather jacket", enhancement: 1 },
  "Riot Shield of Fear": { base: "Shield, riot", enhancement: 1 },
  "Scalemail of the Dragon": { base: "Scale mail", enhancement: 1 },
};

/** A staff whose use the book gives in its text, not a line: the Doppler Staff's control weather incantation. */
const USES = {
  "Doppler Staff": [{ name: "Control Weather", charges: 1, note: "an incantation, cast without secondary casters; +4 on its Knowledge (arcane lore) checks" }],
};

/** A wand's and a staff's charges when new (Modern/FX/Items/Wands, Staffs); a potion or scroll is one use. */
const CHARGES = { wand: 50, staff: 50, potion: 1, scroll: 1 };

const ICONS = {
  weapon: "systems/modern20/assets/icons/lorc/energy-sword.svg",
  armor: "systems/modern20/assets/icons/lorc/magic-shield.svg",
  potion: "systems/modern20/assets/icons/delapouite/magic-potion.svg",
  scroll: "systems/modern20/assets/icons/lorc/scroll-unfurled.svg",
  wand: "systems/modern20/assets/icons/lorc/crystal-wand.svg",
  staff: "systems/modern20/assets/icons/lorc/fairy-wand.svg",
  Ring: "systems/modern20/assets/icons/delapouite/diamond-ring.svg",
  Tattoo: "systems/modern20/assets/icons/lorc/pierced-body.svg",
  Artifact: "systems/modern20/assets/icons/delapouite/glowing-artifact.svg",
  vehicular: "systems/modern20/assets/icons/delapouite/city-car.svg",
  "Wondrous Item": "systems/modern20/assets/icons/lorc/magic-swirl.svg",
};

const MARKER = /[¹²³]/g;
const strip = (s) => String(s ?? "").replace(MARKER, "").trim();
/** The folders, by category. */
const FOLDERS = {
  Weapon: "Weapons", Armor: "Armor and Shields", Potion: "Potions", Scroll: "Scrolls", Wand: "Wands", Staff: "Staffs",
  Ring: "Rings", Tattoo: "Tattoos", "Wondrous Item": "Wondrous Items", Artifact: "Artifacts", vehicular: "Vehicular Items",
};

/** "9th (arcane)" -> 9; "4th (+1), 7th (+2), 10th (+3)" -> 4 (the first); "—" -> null. */
export function casterLevel(v) {
  const m = strip(v).match(/^(\d+)(?:st|nd|rd|th)\b/);
  return m ? Number(m[1]) : null;
}

/**
 * A purchase DC as printed: `{ value, dc, byBonus }`, `dc` the first number (the +1 one, of several), and
 * `byBonus` the DC for each bonus where one is printed for each ("25 (+1), 30 (+2), 35 (+3)" -> [25, 30, 35]).
 * A DC printed from another's ("16 + pistol's purchase DC (+1)") has none.
 */
export function purchaseDC(v) {
  const s = strip(v);
  const each = [...s.matchAll(/(?:^|, )(\d+) \(\+(\d)\)/g)];
  if (each.length && each.length === s.split(/, /).length) {
    const byBonus = [];
    for (const [, dc, b] of each) byBonus[Number(b) - 1] = Number(dc);
    return { value: v, dc: byBonus[0] ?? null, byBonus };
  }
  const m = s.match(/^(\d+)\b(?! \+)/);
  return { value: v, dc: m ? Number(m[1]) : null, byBonus: [] };
}

/** "3 lb." -> 3, "2 lb. (per grenade)." -> 2; "—" and anything else -> null. */
function pounds(v) {
  const m = strip(v).match(/^([\d.]+) lb\./);
  return m ? Number(m[1]) : null;
}

/** A spell or power of a pack's documents by its name, a split duplicate's ("Shatter (Modern)") by its bare name, from the item's book first. */
function finder(documents) {
  const all = documents.filter((d) => d.system).map((d) => ({ uuid: `Compendium.modern20.${{ power: "powers", incantation: "incantations" }[d.type] ?? "spells"}.Item.${d._id}`, name: d.name, bare: d.name.replace(/ \((Modern|Arcana|Future|Menaces)\)$/, "").toLowerCase(), book: d.flags?.modern20?.srd?.split("/")[0] }));
  return (name, book) => {
    const want = strip(name).replace(/\*/g, "").toLowerCase();
    const found = all.filter((d) => d.bare === want);
    return found.find((d) => d.book === book) ?? found[0] ?? null;
  };
}

/**
 * A staff's uses, one a paragraph: "Fireball (9d6 points of fire damage; DC 15); uses 1 charge." ->
 * `{ name: "Fireball", note: "9d6 points of fire damage; DC 15", charges: 1 }`; null for any other paragraph.
 */
export function staffUse(line) {
  const m = strip(line).replace(/\s+/g, " ").match(/^(.+?)(?: \(([^)]*(?:\([^)]*\)[^)]*)*)\))?[;,] uses? (no|one|two|three|\d+) charges?\.?$/i);
  if (!m) return null;
  const words = { no: 0, one: 1, two: 2, three: 3 };
  return { name: m[1].trim(), note: m[2] ?? "", charges: words[m[3].toLowerCase()] ?? Number(m[3]) };
}

/** Read one page's items: `{ items, problems }`. */
export function readFxItemPage(path) {
  const page = readPage(path);
  const problems = [];
  const fail = (line, message) => problems.push({ path, line, message });
  const items = [];
  const isItem = (s) => !!s.stats.Type && !s.stats.CR;
  for (const s of page.root.walk()) {
    if (!isItem(s)) continue;
    const st = s.stats;
    const type = st.Type.value;
    const m = type.match(/^(Weapon|Armor|Potion|Scroll|Wand|Staff|Ring|Tattoo|Wondrous Item|Artifact)(?: \((magic|psionic|vehicular)\))?$/);
    if (!m) { fail(st.Type.line, `"${type}" is not a category of FX item (${Object.keys(CATEGORIES).join(", ")}, with (magic), (psionic) or (vehicular))`); continue; }
    const [, category, kind = ""] = m;
    const level = st["Caster Level"] ?? st["Manifester Level"];
    if (!level) fail(s.line, `${s.title}: no "Caster Level" or "Manifester Level" row`);
    if (!st["Purchase DC"]) fail(s.line, `${s.title}: no "Purchase DC" row`);
    if (!st.Weight) fail(s.line, `${s.title}: no "Weight" row`);
    for (const k of Object.keys(st)) if (!["Type", "Caster Level", "Manifester Level", "Purchase DC", "Weight"].includes(k)) fail(st[k].line, `${s.title}: unexpected stat "${k}"`);
    // Its text: the section's, and any below it that are not items, less the stat table and its "¹ See the ... sidebar" note.
    const parts = [];
    const add = (sec, top) => {
      if (!top) parts.push(sec.heading);
      for (const b of sec.blocks) if (b.kind !== "stats" && !(b.kind === "paragraph" && /^[¹²³]/.test(b.text))) parts.push(b.node);
      for (const c of sec.children) if (!isItem(c)) add(c, false);
    };
    add(s, true);
    // Its paragraphs and list items, as text: a staff's uses are one or the other.
    const paragraphs = [s, ...s.children.filter((c) => !isItem(c))].flatMap((sec) => sec.blocks.flatMap((b) => (b.kind === "paragraph" ? [b.text] : b.kind === "list" ? b.node.children.map((li) => text(li.children)) : [])));
    items.push({
      name: strip(s.title), path, book: page.book, line: s.line, category, kind, paragraphs,
      type: CATEGORIES[category],
      fx: {
        category, power: kind, incantation: /[¹²³]/.test(level?.value ?? ""),
        casterLevel: { value: strip(level?.value ?? ""), level: casterLevel(level?.value ?? ""), label: st["Manifester Level"] ? "Manifester Level" : "Caster Level" },
      },
      purchaseDC: purchaseDC(st["Purchase DC"]?.value ?? ""),
      weight: { value: strip(st.Weight?.value ?? "").replace(/^—\.$/, "—"), lb: pounds(st.Weight?.value ?? "") },
      description: toHtml(parts),
    });
  }
  return { items, problems };
}

/** Build the FX Items pack: `{ documents, problems, skipped }`. */
export const buildFxItems = once(function buildFxItems() {
  const problems = [];
  const documents = [];
  const equipment = buildEquipment().documents.filter((d) => d.system);
  const spell = finder(buildSpells().documents), power = finder(buildPowers().documents), incantation = finder(buildIncantations().documents);
  const all = [];
  for (const path of listPages().filter((p) => FX_ITEM_PAGES.test(p))) {
    const r = readFxItemPage(path);
    problems.push(...r.problems);
    all.push(...r.items);
  }
  const names = all.map((i) => i.name);
  for (const i of all.filter((x, n) => names.indexOf(x.name) !== n)) problems.push({ path: i.path, line: i.line, message: `a second "${i.name}"` });
  for (const name of Object.keys(BASES)) if (!names.includes(name)) problems.push({ path: "tools/build/fx-items.mjs", line: 1, message: `BASES lists "${name}", which is not an FX item` });

  const folders = new Map();
  const folder = (book, category) => {
    const bookKey = `fx-items-folder:${book}`;
    if (!folders.has(bookKey)) folders.set(bookKey, { id: stableId(bookKey), name: BOOKS[book] ?? book, parent: null });
    const key = `${bookKey}:${category}`;
    if (!folders.has(key)) folders.set(key, { id: stableId(key), name: category, parent: folders.get(bookKey).id });
    return folders.get(key).id;
  };

  for (const item of all) {
    const fail = (message) => problems.push({ path: item.path, line: item.line, message: `${item.name}: ${message}` });
    let system = { fx: item.fx, purchaseDC: item.purchaseDC, weight: item.weight, description: item.description, category: item.category };
    let img = ICONS[item.kind === "vehicular" ? "vehicular" : item.category];
    if (item.type === "weapon" || item.type === "armor") {
      const b = BASES[item.name];
      if (!b) { fail(`a ${item.category.toLowerCase()} with no entry in BASES (tools/build/fx-items.mjs)`); continue; }
      const base = b.base ? equipment.find((d) => d.name === b.base) : null;
      if (b.base && (!base || base.type !== item.type)) { fail(`its base "${b.base}" is not a ${item.type} in the equipment pack`); continue; }
      // The base's statistics; the FX item's own price, weight, text and source.
      const stats = { ...(base?.system ?? {}) };
      for (const k of ["description", "source", "purchaseDC", "weight", "identifier", "fx"]) delete stats[k];
      system = { ...stats, ...system, category: base?.system.category ?? item.category, enhancement: b.enhancement, mastercraft: 0, ...(item.type === "weapon" && !base ? { damage: { value: "See text", formula: "" } } : {}) };
      if (base && base.system.weight?.lb !== null && system.weight.lb === null) system.weight = base.system.weight;
      img = ICONS[item.type];
    } else if (item.type === "consumable") {
      const kind = item.category.toLowerCase();
      const find = (n) => (item.kind === "psionic" ? power : spell)(n, item.book) ?? (item.kind === "psionic" ? spell : power)(n, item.book) ?? incantation(n, item.book);
      let spells = [];
      if (kind === "staff") {
        spells = (USES[item.name] ?? item.paragraphs.map(staffUse).filter(Boolean)).map((u) => {
          const found = find(u.name);
          if (!found) fail(`its use "${u.name}" is not a spell or power`);
          return { name: found?.name ?? u.name, uuid: found?.uuid ?? "", charges: u.charges, note: u.note };
        });
        if (!spells.length) fail("a staff whose uses (\"<spell> (...); uses 1 charge.\") are not found");
      } else {
        // "Wand of Web", "Vaporex (Potion of Gaseous Form)": the spell its name gives, if there is one.
        const named = item.name.match(/(?:Potion|Scroll|Wand) of (.+?)\)?$/)?.[1];
        const found = named ? find(named) : null;
        if (found) spells = [{ name: found.name, uuid: found.uuid, charges: 1, note: "" }];
        else if (kind !== "potion") fail(`no spell named "${named}"`);
      }
      system = { ...system, kind, charges: { value: CHARGES[kind], max: CHARGES[kind] }, spells };
      img = ICONS[kind];
    }
    const id = stableId(`fx-item:${item.path}:${item.name}`);
    documents.push({
      _id: id, _key: `!items!${id}`, name: item.name, type: item.type, img,
      folder: folder(item.book, FOLDERS[item.kind === "vehicular" ? "vehicular" : item.category]), sort: 0,
      system: { ...system, source: { book: BOOKS[item.book] ?? item.book, page: pageUuid(item.path) } },
      effects: [], ownership: { default: 0 }, flags: { modern20: { srd: item.path } },
    });
  }
  for (const f of folders.values()) {
    documents.push({ _id: f.id, _key: `!folders!${f.id}`, name: f.name, type: "Item", folder: f.parent, sorting: "a", color: null, flags: {} });
  }
  return { documents, problems, skipped: [] };
});

