/**
 * The Vehicles pack: the vehicles of Modern/Equipment/Vehicles, as actors.
 *
 * Each row of a "Table: Vehicles: ..." is a vehicle, its statistics as printed: crew, passengers, cargo, initiative,
 * maneuver, top speed ("265 (26)": squares a round at character and chase scale), Defense, hardness, hit points, size,
 * purchase DC and restriction. Its description is the section its name heads ("Acura 3.2 TL"), and gives its footprint
 * ("two squares wide and four squares long": its token's) and the cover it gives its occupants ("It provides full
 * cover"; else the page's, "civilian cars provide three-quarters cover"). Its mounted weapons (WEAPONS) are its items:
 * the cannons of Table: Vehicle Weapons, and the M2HB of the equipment pack.
 */
import { once } from "./once.mjs";
import { listPages, readPage, toHtml } from "../srd/reader.mjs";
import { stableId } from "./ids.mjs";
import { BOOKS, pageUuid } from "./journal.mjs";
import { buildEquipment } from "./equipment.mjs";
import { slug } from "../../module/rules/identify.mjs";
import { conform, obj } from "../../module/data/schema.mjs";
import { ITEM_MODELS } from "../../module/data/models.mjs";

export const VEHICLE_PAGES = /^Modern\/Equipment\/Vehicles\/(?!vehicles\.md)/;
const WEAPONS_PAGE = "Modern/Equipment/Vehicles/vehicles.md";

/** A vehicle described under another name than its row's (the book's own two spellings). */
const DESCRIPTIONS = { "Jaguar XJS (luxury sedan)": "Jaguar XJ Sedan", "Harley Davidson FLSTF (street bike)": "Harley-Davidson FLSTF Fat Boy" };

/** The weapons a vehicle "comes equipped with" (its description): a Table: Vehicle Weapons row, or the equipment pack's. */
export const WEAPONS = {
  "BMP-2 (tracked APC)": ["BMP-2 30mm cannon"],
  "M1A2 Abrams (tracked tank)": ["M1A2 Abrams tank cannon", "M2HB (heavy machine gun)"],
  "M2A2 Bradley (tracked APC)": ["M2A2 Bradley 25mm cannon"],
};

const COVER = { "no": "none", "one-quarter": "one-quarter", "one-half": "one-half", "three-quarters": "three-quarters", "nine-tenths": "nine-tenths", full: "full" };
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

const MARKER = /[¹²³]/g;
const strip = (s) => String(s ?? "").replace(MARKER, "").trim();
const num = (s) => Number(strip(s).replace(/[–−]/g, "-").replace("+", "").replace(/,/g, ""));

/** "Lic (+1)" -> { value, level: "lic", modifier: 1 }. */
function restriction(v) {
  const m = strip(v).match(/^(Lic|Res|Mil|Illegal) \(\+(\d)\)$/);
  return m ? { value: v, level: m[1].toLowerCase(), modifier: Number(m[2]) } : { value: v, level: "", modifier: 0 };
}

/** "265 (26)" -> { value, character: 265, chase: 26 }. */
export function topSpeed(v) {
  const m = strip(v).match(/^([\d,]+)\s*\(([\d,]+)\)$/);
  return m ? { value: strip(v), character: num(m[1]), chase: num(m[2]) } : { value: strip(v), character: 0, chase: 0 };
}

/** Its footprint, from its description: "three squares wide and twelve squares long" -> { wide: 3, long: 12 }; a plane's with its wings. */
export function footprint(text) {
  // A plane's width counts its wings: "seven squares wide (including wings; fuselage is one square wide) and six squares long".
  const m = String(text).replace(/\s+/g, " ").match(/\b(\w+) squares? wide(?: \([^)]*\))? and (\w+) squares? long/i);
  const n = (w) => WORDS[w.toLowerCase()] ?? (Number(w) || null);
  return m && n(m[1]) && n(m[2]) ? { wide: n(m[1]), long: n(m[2]) } : null;
}

/** The cover it gives its occupants, from text: "It provides full cover", "provide three-quarters cover", "no cover". */
export function coverIn(text) {
  const m = String(text).match(/\bprovides? (no|one-quarter|one-half|three-quarters|nine-tenths|full) cover\b/i);
  return m ? COVER[m[1].toLowerCase()] : null;
}

/** Its picture, by what it is ("(helicopter)", "(sports coupe)", the page). */
function art(name, path) {
  const kind = `${name} ${path}`.toLowerCase();
  const pick = /helicopter/.test(kind) ? ["delapouite", "helicopter"] : /plane|jet\)/.test(kind) ? ["skoll", "airplane"]
    : /tank|apc/.test(kind) ? ["lorc", "battle-tank"] : /bus\b/.test(kind) ? ["delapouite", "bus"]
      : /cruiser|runabout|watercraft|water/.test(kind) ? ["delapouite", "speed-boat"] : /truck|pickup|minivan/.test(kind) ? ["delapouite", "truck"]
        : /suv|atv|hummer/.test(kind) ? ["delapouite", "jeep"] : /sports coupe/.test(kind) ? ["skoll", "race-car"]
          : /bike|motorcycle/.test(kind) ? ["delapouite", "cycling"] : ["delapouite", "city-car"];
  return { img: `systems/modern20/assets/icons/${pick[0]}/${pick[1]}.svg`, token: `systems/modern20/assets/tokens/${pick[0]}/${pick[1]}.svg` };
}

/** Table: Vehicle Weapons's cannons, as weapon items' data (they are part of the vehicles they are on: no weight or price). */
function vehicleWeapons(problems) {
  const page = readPage(WEAPONS_PAGE);
  const out = {};
  for (const s of page.root.walk()) {
    for (const b of s.blocks.filter((x) => x.kind === "table" && /Vehicle Weapons/.test(x.caption ?? ""))) {
      const col = (row, name) => row.cells[b.header.findIndex((h) => strip(h) === name)] ?? "";
      let proficiency = "";
      for (const row of b.rows) {
        const name = strip(row.cells[0]);
        // A group's row ("Cannons (require the Exotic Firearms Proficiency [cannons] feat)") names what they need.
        if (!strip(col(row, "Damage"))) { proficiency = name.match(/require the (.+?) feat/)?.[1]?.replace(/\[(.+)\]/, "($1)") ?? ""; continue; }
        out[name] = {
          category: "Vehicle Weapons", damage: { value: strip(col(row, "Damage")), formula: strip(col(row, "Damage")) },
          critical: strip(col(row, "Critical")), damageType: strip(col(row, "Damage Type")),
          rangeIncrement: { value: strip(col(row, "Range Increment")), ft: Number(strip(col(row, "Range Increment")).match(/\d+/)?.[0]) || null },
          rateOfFire: strip(col(row, "Rate of Fire")), magazine: strip(col(row, "Magazine")), size: strip(col(row, "Size")).toLowerCase(),
          proficiency: { value: proficiency, uuid: "" }, melee: false, noAmmunition: true, equipped: true,
          notes: ["Part of the vehicle it is mounted on: weight, purchase DC and restriction do not apply."],
        };
      }
    }
  }
  if (!Object.keys(out).length) problems.push({ path: WEAPONS_PAGE, line: 1, message: "no Table: Vehicle Weapons" });
  return out;
}

/** Read one page's vehicles: `{ vehicles, problems }`. */
export function readVehiclePage(path) {
  const page = readPage(path);
  const problems = [];
  const fail = (line, message) => problems.push({ path, line, message });
  const top = page.root.children.find((s) => s.depth === 1);
  const pageCover = coverIn((top?.blocks ?? []).map((b) => b.text ?? "").join(" "));
  const sections = new Map([...page.root.walk()].filter((s) => s.depth > 1).map((s) => [s.title.toLowerCase(), s]));
  const vehicles = [];
  for (const s of page.root.walk()) {
    for (const b of s.blocks.filter((x) => x.kind === "table" && strip(x.header[0]) === "Name" && x.header.some((h) => strip(h) === "Hardness"))) {
      const col = (row, name) => row.cells[b.header.findIndex((h) => strip(h) === name)] ?? "";
      const category = String(b.caption ?? "").replace(/^Table: Vehicles: /, "").trim();
      for (const row of b.rows) {
        const name = strip(row.cells[0]);
        const heading = (DESCRIPTIONS[name] ?? name.replace(/\s*\(.*\)$/, "")).toLowerCase();
        const section = sections.get(heading);
        if (!section) fail(row.line, `no section describes "${name}"; add it to DESCRIPTIONS in tools/build/vehicles.mjs`);
        const text = section ? section.blocks.map((x) => x.text ?? "").join(" ") : "";
        const feet = footprint(text);
        if (section && !feet) fail(section.line, `${name}: its description gives no "N squares wide and N squares long"`);
        const cover = coverIn(text) ?? pageCover;
        if (!cover) fail(row.line, `${name}: no cover given, by its description or its page`);
        const hp = num(col(row, "Hit Points"));
        if (!Number.isFinite(hp) || hp <= 0) fail(row.line, `${name}: hit points "${col(row, "Hit Points")}" are not a number`);
        const cargo = strip(col(row, "Cargo"));
        vehicles.push({
          name, path, book: page.book, line: row.line, category,
          system: {
            category, crew: num(col(row, "Crew")) || 0, passengers: num(col(row, "Pass")) || 0,
            cargo: { value: cargo, lb: Number(cargo.replace(/,/g, "").match(/[\d.]+/)?.[0]) || null },
            initiative: num(col(row, "Init")) || 0, maneuver: num(col(row, "Maneuver")) || 0,
            topSpeed: topSpeed(col(row, "Top Speed")),
            defense: num(col(row, "Defense")) || 0, hardness: num(col(row, "Hardness")) || 0,
            hp: { value: null, max: hp }, size: strip(col(row, "Size")).toLowerCase(),
            squares: feet ?? { wide: 1, long: 1 }, cover: cover ?? "",
            purchaseDC: { value: strip(col(row, "Purchase DC")), dc: num(col(row, "Purchase DC")) || null },
            restriction: restriction(col(row, "Restriction")),
            description: section ? toHtml(section.blocks.map((x) => x.node)) : "",
          },
        });
      }
    }
  }
  return { vehicles, problems };
}

/** Build the Vehicles pack: `{ documents, problems, skipped }`. */
export const buildVehicles = once(function buildVehicles() {
  const problems = [];
  const documents = [];
  const cannons = vehicleWeapons(problems);
  const equipment = buildEquipment().documents.filter((d) => d.system);
  const all = [];
  for (const path of listPages().filter((p) => VEHICLE_PAGES.test(p))) {
    const r = readVehiclePage(path);
    problems.push(...r.problems);
    all.push(...r.vehicles);
  }
  for (const name of Object.keys(WEAPONS)) if (!all.some((v) => v.name === name)) problems.push({ path: "tools/build/vehicles.mjs", line: 1, message: `WEAPONS lists "${name}", which is not a vehicle` });
  const folders = new Map();
  const folder = (category) => {
    if (!folders.has(category)) folders.set(category, { id: stableId(`vehicles-folder:${category}`), name: category });
    return folders.get(category).id;
  };
  const weaponModel = obj(ITEM_MODELS.weapon);
  for (const v of all) {
    const id = stableId(`vehicle:${v.path}:${v.name}`);
    const { img, token } = art(v.name, v.path);
    // Its mounted weapons, items of its own.
    const items = (WEAPONS[v.name] ?? []).map((w) => {
      const base = cannons[w] ? { name: w, type: "weapon", img: "systems/modern20/assets/icons/john-colburn/pistol-gun.svg", system: cannons[w] } : equipment.find((d) => d.name === w);
      if (!base) { problems.push({ path: v.path, line: v.line, message: `${v.name}: its weapon "${w}" is not in Table: Vehicle Weapons or the equipment pack` }); return null; }
      const itemId = stableId(`vehicle-weapon:${id}:${w}`);
      return {
        _id: itemId, _key: `!actors.items!${id}.${itemId}`, name: base.name, type: "weapon", img: base.img, sort: 0,
        system: conform(weaponModel, { identifier: slug(base.name), ...base.system, equipped: true }), effects: [], ownership: { default: 0 }, flags: {},
        ...(base._id ? { _stats: { compendiumSource: `Compendium.modern20.equipment.Item.${base._id}` } } : {}),
      };
    }).filter(Boolean);
    documents.push({
      _id: id, _key: `!actors!${id}`, name: v.name, type: "vehicle", img, folder: folder(v.category), sort: 0,
      system: { ...v.system, source: { book: BOOKS[v.book] ?? v.book, page: pageUuid(v.path) } },
      prototypeToken: {
        name: v.name, width: v.system.squares.wide, height: v.system.squares.long, actorLink: false, disposition: 0,
        displayName: 20, displayBars: 20, bar1: { attribute: "hp" }, texture: { src: token }, lockRotation: false,
      },
      items, effects: [], ownership: { default: 0 }, flags: { modern20: { srd: v.path } },
    });
  }
  for (const f of folders.values()) documents.push({ _id: f.id, _key: `!folders!${f.id}`, name: f.name, type: "Actor", folder: null, sorting: "a", color: null, flags: {} });
  return { documents, problems, skipped: [] };
});
