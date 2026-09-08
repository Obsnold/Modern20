/**
 * Emit the FIELDS localization blocks for every document subtype.
 *
 * Foundry takes a field's label from lang/en.json at
 * <LOCALIZATION_PREFIXES entry>.FIELDS.<path>.label, so a field with no entry
 * renders as an unlabelled input. Walking the real schemas rather than listing
 * fields by hand means a field added later cannot be forgotten.
 *
 *     node scripts/gen_field_labels.mjs > /tmp/fields.json
 */
import { installStubs, SchemaField } from "./lib/foundry-stubs.mjs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const { hooks } = installStubs();

// The system logs on init, which would corrupt the JSON on stdout.
const log = console.log;
console.log = () => {};
await import(join(ROOT, "module", "modern20.mjs"));
for (const [event, fn] of hooks) if (event === "init") fn();
console.log = log;

// Initialisms the SRD writes in caps; everything else is title-cased.
const ACRONYMS = {
  dc: "DC", hp: "HP", ap: "AP", srd: "SRD", url: "URL", cr: "CR",
  bab: "BAB", fx: "FX", id: "ID", ac: "AC",
};

// Names whose humanised form reads badly or is ambiguous on a sheet.
const OVERRIDES = {
  str: "Strength", dex: "Dexterity", con: "Constitution",
  int: "Intelligence", wis: "Wisdom", cha: "Charisma",
  fort: "Fortitude", ref: "Reflex", will: "Will",
  hp: "Hit Points", baseAttack: "Base Attack Bonus",
  maxDex: "Maximum Dex Bonus", classBonus: "Class Defense Bonus",
  massiveDamageThreshold: "Massive Damage Threshold",
  srdUrl: "SRD Reference", tempMod: "Temporary Modifier",
  levels: "Class Levels", tier: "Class Tier",
  ranged: "Ranged Weapon", prepared: "Prepared",
};

// Small words stay lowercase unless they lead the label.
const MINOR = new Set(["of", "to", "per", "and", "the", "at", "in", "for", "or"]);

function humanize(name) {
  if (OVERRIDES[name]) return OVERRIDES[name];
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_]+/)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (ACRONYMS[lower]) return ACRONYMS[lower];
      if (index > 0 && MINOR.has(lower)) return lower;
      return word[0].toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/** Field paths, one level into nested schemas — deeper is never form-rendered. */
function paths(schema, prefix = "", depth = 0) {
  const out = {};
  for (const [name, field] of Object.entries(schema)) {
    const path = prefix ? `${prefix}.${name}` : name;
    out[path] = humanize(name);
    if (field instanceof SchemaField && depth < 1) {
      Object.assign(out, paths(field.fields, path, depth + 1));
    }
  }
  return out;
}

const blocks = {};
for (const [kind, models] of [["Actor", CONFIG.Actor.dataModels], ["Item", CONFIG.Item.dataModels]]) {
  for (const [type, cls] of Object.entries(models ?? {})) {
    const prefix = (cls.LOCALIZATION_PREFIXES ?? []).at(-1);
    if (!prefix) continue;
    const fields = {};
    for (const [path, label] of Object.entries(paths(cls.defineSchema()))) {
      fields[path] = { label };
    }
    blocks[prefix] = { FIELDS: fields };
  }
}

console.log(JSON.stringify(blocks, null, 2));
