/**
 * Equipment: every row of every item table on the equipment pages.
 *
 * An item table is a table whose first column is one of ITEM_COLUMNS, with a
 * `**Table: ...**` caption directly above it. Each row is one item, of the kind
 * the first column names (Weapon, Armor/Shield, Object, Ammunition). The
 * caption gives the item's category (and its compendium folder), and for most
 * weapon tables the proficiency feat it needs.
 *
 * Footnote markers (¹ ² ³) in a row are looked up in the footnote paragraph
 * under the table, or under the last table of a split group, and kept with the
 * item. A marker with no footnote is an error.
 *
 * Each row's description is the section whose heading names it: "Beretta 92F
 * (9mm autoloader)" is described under "## Beretta 92F", "Mace, light" under
 * "## Mace, Light and Heavy". Rows the rules cannot pair are listed in
 * DESCRIPTIONS by hand, with `null` for an item the page does not describe; any
 * other unpaired row is an error, as is a DESCRIPTIONS entry that no longer
 * matches the page.
 *
 * Every value is kept as printed; the ones a sheet will compute with (weight,
 * purchase DC, restriction, damage dice, bonuses) are also parsed.
 */
import { once } from "./once.mjs";
import { listPages, readPage, toHtml } from "../srd/reader.mjs";
import { stableId } from "./ids.mjs";
import { BOOKS, pageUuid } from "./journal.mjs";
import { featLookup } from "./feats.mjs";
import { resolveDuplicates } from "./duplicates.mjs";

const EQUIPMENT_PAGES = /^(Modern|Arcana|Future)\/Equipment\/(?!Vehicles\/)(?!Vehicles\.md$)/;

const ITEM_COLUMNS = {
  "Weapon": "weapon",
  "Armor": "armor",
  "Shield": "armor",
  "Object": "equipment",
  "Ammunition Type": "ammunition",
  "Ammunition Type (Quantity)": "ammunition",
  "Ammunition (Quantity)": "ammunition",
};

const ICONS = {
  weapon: "systems/modern20/assets/icons/john-colburn/pistol-gun.svg",
  armor: "systems/modern20/assets/icons/skoll/kevlar-vest.svg",
  equipment: "systems/modern20/assets/icons/delapouite/toolbox.svg",
  ammunition: "systems/modern20/assets/icons/delapouite/machine-gun-magazine.svg",
};

const MARKERS = "¹²³⁴⁵⁶⁷⁸⁹";
const MARKER = new RegExp(`[${MARKERS}]`, "g");
const STARTS_WITH_MARKER = new RegExp(`^[${MARKERS}]`);

/**
 * Rows whose description the matching rules cannot find: page -> row -> heading
 * (or null when the page has no description for that item).
 */
export const DESCRIPTIONS = {
  "Arcana/Equipment/GeneralEquipment.md": {
    "Clothing outfit, business": "Clothing",
    "Clothing outfit, double-sided": "Double-sided",
    "Clothing outfit, stealth": "Stealth",
    "Chemistry kit": null,
    "Headset w/light": "Headset, Microphone",
    "Headset w/camera": "Headset, Microphone",
    "Skis and poles": "Skis and Snowboards",
    "Snowboard": "Skis and Snowboards",
  },
  "Arcana/Equipment/MeleeWeapons.md": { "Mace, heavy": null, "Mace, light": null },
  "Arcana/Equipment/RangedWeapons.md": {
    "Air pistol (simple)": "Air Pistols and Air Rifles",
    "Air rifle (simple)": "Air Pistols and Air Rifles",
    "Paint ball gun (simple)": "Paintball Gun",
  },
  "Future/Equipment/EnergyAgeArmor.md": { "Unisoldier combat armor": "Unisoldier Heavy Combat Armor" },
  "Future/Equipment/FusionAgeWeapons.md": { "Power pack (50)": null },
  "Future/Equipment/GravityAgeArmor.md": { "Space combat suit": "Space Combat Armor" },
  "Future/Equipment/GravityAgeWeapons.md": { "Rail gun shards (20)": "Rail Gun" },
  "Future/Equipment/InformationAgeWeapons.md": { "TacMil sniper rifle": "Tactical Military (TACMIL) Sniper Rifle" },
  "Modern/Equipment/General/ComputersAndConsumerElectronics.md": { "Portable satellite phone": "Portable Satellite Telephone" },
  "Modern/Equipment/General/SurvivalGear.md": { "Chemical light sticks (5)": "Chemical Light Stick" },
  "Modern/Equipment/Weapons/Handguns.md": { "SITES M9 (9mm autoloader)": "SITES M9 Resolver" },
  "Modern/Equipment/Weapons/Ammunition.md": {
    ...Object.fromEntries(["5.56mm (20)", "7.62mm (20)", "7.62mmR (20)", ".444 caliber (20)", ".50 caliber (20)"].map((r) => [r, "5.56mm, 7.62mm, 7.62mmR, .444, .50"])),
    ...Object.fromEntries(["9mm (50)", "10mm (50)", ".22 caliber (50)", ".32 caliber (50)", ".38 special (50)", ".357 caliber (50)", ".44 caliber (50)", ".45 caliber (50)", ".50AE caliber (50)"].map((r) => [r, "9mm, 10mm, .22, .32, .38 S, .357, .44, .45, .50AE"])),
    "10-gauge buckshot (10)": "10-gauge Buckshot, 12-gauge Buckshot",
    "12-gauge buckshot (10)": "10-gauge Buckshot, 12-gauge Buckshot",
  },
};

/** Items printed in more than one book; see duplicates.mjs. */
export const DUPLICATES = {
  "Clothing outfit, business": { keep: "Modern" },   // Urban Arcana reprints it without a size
};

/** Proficiency words printed in parentheses after a weapon's name. */
const ROW_PROFICIENCY = {
  simple: "Simple Weapons Proficiency",
  archaic: "Archaic Weapons Proficiency",
  exotic: "Exotic Melee Weapon Proficiency",
  "grenade launcher": "Exotic Firearms Proficiency (grenade launchers)",
  "no feat needed": "",
  "no feat required": "",
};

const strip = (s) => s.replace(MARKER, "").trim();

/**
 * The dice a weapon's printed damage rolls: "2d6"; a double weapon's first end ("1d8/1d8"; the other
 * end's shows beside it on the sheet); the dice of "2d10 + special" and "4d6 nonlethal" (the
 * rest is the weapon's text); a ranged weapon's flat "1" (a blowgun, a shuriken). Brass knuckles'
 * "1" is not a roll: it adds to an unarmed strike. "" for none ("Special", "Varies", "—").
 */
export function damageFormula(text, melee) {
  const t = text.trim();
  const dice = t.match(/^(\d+d\d+)(?:\/\d+d\d+|\s*\+\s*special|\s+nonlethal(?:\s+plus\s+special)?)?$/i);
  if (dice) return dice[1];
  return !melee && /^\d+$/.test(t) ? t : "";
}
const markersIn = (s) => s.match(MARKER) ?? [];
const key = (s) => strip(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const num = (s) => Number(s.replace("–", "-").replace("+", ""));

/** "Lic (+1)" -> { value: "Lic (+1)", level: "lic", modifier: 1 }; "—" or empty -> none. */
function restriction(v) {
  const m = strip(v).match(/^(Lic|Res|Mil|Illegal) \(\+(\d)\)$/);
  return m ? { value: v, level: m[1].toLowerCase(), modifier: Number(m[2]) } : { value: v, level: "", modifier: 0 };
}

/** "3 lb." -> 3; "0.5 lb." -> 0.5; anything else -> null. */
function weight(v) {
  const m = strip(v).match(/^([\d.]+) lb\.$/);
  return m ? Number(m[1]) : null;
}

/** "30 ft." -> 30. */
function feet(v) {
  const m = strip(v).match(/^(\d+) ft\.$/);
  return m ? Number(m[1]) : null;
}

/** "+3" -> 3, "–1" -> -1, "—" -> 0. */
function bonus(v) {
  const s = strip(v);
  // "+0" and "–0" are both 0 (and not -0, which a form would save back as 0).
  return /^[+–-]\d+$/.test(s) ? num(s) + 0 : 0;
}

/** Parse footnote paragraphs: "¹ Reach weapon.\ ² Double weapon." -> { "¹": "Reach weapon.", ... } */
function footnotes(text) {
  const out = {};
  for (const m of text.matchAll(new RegExp(`([${MARKERS}])\\s*([^${MARKERS}]+)`, "g"))) out[m[1]] = m[2].trim();
  return out;
}

/** The weapon's proficiency feat from its table caption, or from its row ("Javelin (Simple)"). */
function proficiency(caption, category, rowName) {
  const fromCaption = caption.match(/\(.*?requires? (?:the |a specific )?(.+?) feat\)/);
  if (fromCaption) return { text: fromCaption[1], fromRow: false };
  if (/in parentheses/.test(caption)) {
    const m = rowName.match(/^(.*?) \(([^)]+)\)$/);
    if (m && m[2].toLowerCase() in ROW_PROFICIENCY) return { text: ROW_PROFICIENCY[m[2].toLowerCase()], fromRow: true, name: m[1] };
    return { text: null, fromRow: true };
  }
  const word = category.match(/\b(Simple|Archaic|Exotic)\b/)?.[1];
  if (word) return { text: ROW_PROFICIENCY[word.toLowerCase()], fromRow: false };
  return { text: "", fromRow: false };
}

/** Candidate headings for a row name, most specific first. */
function headingKeys(name) {
  const n = strip(name);
  const out = [n, n.replace(/\s*\([^)]*\)/g, "")];
  const [parent, variant] = n.split(/, (.+)/);
  if (variant) out.push(parent, `${variant} ${parent}`, variant);
  const qty = n.match(/^(.*?) \(\d+\)$/);
  if (qty) out.push(qty[1], `Ammunition, ${qty[1]}`);
  return [...new Set(out.map(key))];
}

/** Find a row's description section on its page. */
function describe(name, sections, labels) {
  const keys = headingKeys(name);
  for (const k of keys) if (sections.has(k)) return sections.get(k);
  // "Evidence kit, basic" -> "## Evidence Kits"
  for (const k of keys) if (sections.has(`${k}s`)) return sections.get(`${k}s`);
  // "Coat" -> the section with a "**Coat:**" paragraph (here "## Outerwear")
  for (const k of keys) if (labels.has(k)) return labels.get(k);
  // "Laser pistol" -> "## Laser Weapons"
  const group = `${key(name).split(" ")[0]} weapons`;
  if (sections.has(group)) return sections.get(group);
  // "Mace, light" -> "## Mace, Light and Heavy"
  const [parent, variant] = strip(name).split(/, (.+)/);
  if (variant) {
    for (const [k, s] of sections) {
      const m = k.match(/^(.+?) (.+) and (.+)$/);
      if (m && m[1] === key(parent) && [m[2], m[3]].includes(key(variant))) return s;
    }
  }
  return null;
}

/** Every item table on a page, with its section, caption and footnotes. */
function itemTables(page, fail) {
  const out = [];
  for (const section of page.root.walk()) {
    let pending = [];
    for (const b of section.blocks) {
      if (b.kind === "table" && ITEM_COLUMNS[b.header[0]]) {
        if (!b.caption) fail(b.line, `item table with no "**Table: ...**" caption above it`);
        const t = { block: b, kind: ITEM_COLUMNS[b.header[0]], caption: b.caption ?? "", notes: {} };
        out.push(t);
        pending.push(t);
      } else if (b.kind === "paragraph" && STARTS_WITH_MARKER.test(b.text) && pending.length) {
        const notes = footnotes(b.text);
        for (const t of pending) t.notes = notes;
        pending = [];
      }
    }
  }
  return out;
}

/** Read the items on one page; returns `{ items, problems }`. */
export function readEquipmentPage(path, { feats }) {
  const page = readPage(path);
  const problems = [];
  const fail = (line, message) => problems.push({ path, line, message });

  const sections = new Map(), labels = new Map();
  for (const s of page.root.walk()) {
    if (s.depth > 1) sections.set(key(s.title), s);
    // "Heads-Up Display (HUD)" also answers to "Heads-up display".
    if (s.depth > 1 && !sections.has(key(s.title.replace(/\s*\([^)]*\)/g, "")))) sections.set(key(s.title.replace(/\s*\([^)]*\)/g, "")), s);
    if (s.depth > 1) for (const b of s.blocks) if (b.kind === "label" && !labels.has(key(b.label))) labels.set(key(b.label), s);
  }
  const overrides = DESCRIPTIONS[path] ?? {};
  const usedOverrides = new Set();

  const items = [];
  for (const t of itemTables(page, fail)) {
    const { block, kind, caption } = t;
    const category = caption.replace(/^Table: /, "").replace(/\s*\(.*\)$/, "");
    const col = (row, name) => {
      const i = block.header.findIndex((h) => strip(h) === name);
      return i < 0 ? "" : (row.cells[i] ?? "");
    };

    for (const row of block.rows) {
      const printed = row.cells[0];
      const markers = new Set(row.cells.flatMap(markersIn));
      for (const h of block.header) for (const m of markersIn(h)) markers.add(m);
      const notes = [];
      for (const m of markers) {
        if (t.notes[m]) notes.push(t.notes[m]);
        else fail(row.line, `footnote ${m} on "${strip(printed)}" is not defined under the table`);
      }

      let name = strip(printed);
      const system = {
        category,
        notes,
        size: strip(col(row, "Size")).toLowerCase().replace("—", ""),
        weight: { value: col(row, "Weight"), lb: weight(col(row, "Weight")) },
        purchaseDC: { value: col(row, "Purchase DC"), dc: /^\d+$/.test(strip(col(row, "Purchase DC"))) ? Number(strip(col(row, "Purchase DC"))) : null },
        restriction: restriction(col(row, "Restriction")),
      };

      if (kind === "weapon") {
        const prof = proficiency(caption, category, name);
        if (prof.fromRow && prof.text === null) fail(row.line, `"${name}" has no proficiency in parentheses, which its table says it should`);
        if (prof.name) name = prof.name;
        const feat = prof.text ? feats(prof.text, page.book) : null;
        if (prof.text && !feat) fail(row.line, `proficiency "${prof.text}" is not a feat in the feats pack`);
        const damage = col(row, "Damage") || col(row, "Direct Hit Damage");
        const melee = /Melee/.test(category) || !["Rate of Fire", "Burst Radius", "Reflex DC"].some((h) => block.header.map(strip).includes(h));
        Object.assign(system, {
          damage: { value: damage, formula: damageFormula(strip(damage), melee) },
          splashDamage: col(row, "Splash Damage"),
          critical: col(row, "Critical"),
          damageType: strip(col(row, "Damage Type")),
          rangeIncrement: { value: col(row, "Range Increment"), ft: feet(col(row, "Range Increment")) },
          rateOfFire: col(row, "Rate of Fire"),
          magazine: col(row, "Magazine"),
          burstRadius: col(row, "Burst Radius"),
          reflexDC: col(row, "Reflex DC"),
          proficiency: { value: prof.text ?? "", uuid: feat?.uuid ?? "" },
          // Melee tables have no rate of fire or blast columns; thrown melee weapons still have a range increment.
          melee,
        });
      } else if (kind === "armor") {
        const isShield = block.header[0] === "Shield";
        const speed = block.header.find((h) => h.startsWith("Speed"));
        Object.assign(system, {
          armorType: strip(col(row, "Type")),
          category: category,
          weightClass: isShield ? "shield" : (category.match(/\b(Light|Medium|Heavy|Powered)\b/)?.[1] ?? "").toLowerCase(),
          equipmentBonus: bonus(col(row, isShield ? "Shield Bonus" : "Equipment Bonus")),
          nonproficientBonus: bonus(col(row, "Nonprof. Bonus")),
          maxDex: /^\+\d+$/.test(strip(col(row, "Max Dex Bonus"))) ? num(strip(col(row, "Max Dex Bonus"))) : null,
          armorPenalty: bonus(col(row, "Armor Penalty")),
          arcaneSpellFailure: col(row, "Arcane Spell Failure"),
          speed: { label: speed ?? "", value: speed ? col(row, speed) : "" },
        });
      } else if (kind === "ammunition") {
        const qty = name.match(/^(.*?) \((\d+)\)$/);
        if (qty) name = qty[1];
        Object.assign(system, {
          quantity: qty ? Number(qty[2]) : null,
          damageType: strip(col(row, "Damage Type")),
          purchaseDCModifier: col(row, "Purchase DC Modifier"),
        });
      }

      // Description.
      let section;
      if (printed in overrides || strip(printed) in overrides) {
        const want = overrides[printed] ?? overrides[strip(printed)];
        usedOverrides.add(printed in overrides ? printed : strip(printed));
        section = want === null ? null : sections.get(key(want));
        if (want !== null && !section) fail(row.line, `DESCRIPTIONS says "${strip(printed)}" is described under "${want}", which is not a heading on this page`);
      } else {
        section = describe(printed, sections, labels);
        if (!section) fail(row.line, `no section describes "${strip(printed)}"; add it to DESCRIPTIONS in tools/build/equipment.mjs`);
      }
      system.description = section ? toHtml([...section.walk()].flatMap((s, i) => [...(i ? [s.heading] : []), ...s.blocks.map((b) => b.node)])) : "";

      items.push({ name, kind, path, book: page.book, line: row.line, section: section?.title ?? null, system });
    }
  }
  for (const k of Object.keys(overrides)) if (!usedOverrides.has(k)) fail(1, `DESCRIPTIONS lists "${k}", which is not a row on this page`);
  return { items, problems };
}

/** Build the equipment pack: `{ documents, problems, skipped }`. */
export const buildEquipment = once(function buildEquipment() {
  const context = { feats: featLookup() };
  const problems = [];
  const documents = [];
  const folders = new Map();
  const folder = (book, category) => {
    const bookKey = `equipment-folder:${book}`;
    if (!folders.has(bookKey)) folders.set(bookKey, { id: stableId(bookKey), name: BOOKS[book] ?? book, parent: null });
    const catKey = `${bookKey}:${category}`;
    if (!folders.has(catKey)) folders.set(catKey, { id: stableId(catKey), name: category, parent: folders.get(bookKey).id });
    return folders.get(catKey).id;
  };
  const pages = listPages().filter((p) => EQUIPMENT_PAGES.test(p));
  for (const p of Object.keys(DESCRIPTIONS)) if (!pages.includes(p)) problems.push({ path: p, line: 1, message: "DESCRIPTIONS lists a page that is not an equipment page" });
  const all = [];
  for (const path of pages) {
    const { items, problems: p } = readEquipmentPage(path, context);
    problems.push(...p);
    all.push(...items);
  }
  const { chosen, problems: dup, skipped } = resolveDuplicates(all, DUPLICATES, "tools/build/equipment.mjs");
  problems.push(...dup);
  for (const item of chosen) {
    const id = stableId(`equipment:${item.path}:${item.system.category}:${item.name}`);
    documents.push({
      _id: id, _key: `!items!${id}`, name: item.name, type: item.kind, img: ICONS[item.kind],
      folder: folder(item.book, item.system.category), sort: 0,
      system: { ...item.system, source: { book: BOOKS[item.book] ?? item.book, page: pageUuid(item.path) } },
      effects: [], ownership: { default: 0 }, flags: { modern20: { srd: item.path, section: item.section } },
    });
  }
  for (const f of folders.values()) {
    documents.push({ _id: f.id, _key: `!folders!${f.id}`, name: f.name, type: "Item", folder: f.parent, sorting: "a", color: null, flags: {} });
  }
  return { documents, problems, skipped };
});
