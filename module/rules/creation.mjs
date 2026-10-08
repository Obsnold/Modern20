/**
 * Potions, scrolls and wands of a spell, bought or made (Modern/FX/Items: Potions, Scrolls, Wands; the creation
 * features of Modern/AdvancedClasses/Mage, Arcana/AdvancedClasses/Mystic and Artificer).
 *
 *   bought         purchase DC: a potion 17, a scroll 15, a wand 24, a tattoo 15, + caster level + spell level. A
 *                  potion holds a spell of 3rd level or lower, a wand 4th or lower; a wand has 50 charges; a potion
 *                  or a tattoo is for a spell that affects only the one who uses it
 *   caster level   at least the lowest that casts the spell (a Mage casts level L at 2L − 1: 1st at 1, 3rd at 5)
 *   made           by a feature that makes it: the raw materials' purchase DC (Brew Potion 15, Scribe Scroll 13; the
 *                  Artificer's Craft Wand 18, Improved Brew Potion 12, Improved Scribe Scroll and Tattoo 10) + spell
 *                  level + caster level; then a Craft check (chemical, writing, mechanical, visual art), DC 10 + spell level + caster
 *                  level: failed, the materials are used up. XP: spell level × caster level × the materials' DC
 *   magic          the Artificer's Magic Mastercraft: the components' purchase DC + 5, 10 or 15 for +1 to +3; Craft
 *   mastercraft    (mechanical) DC 20 (armor) or 25 (weapons) + the bonus, and Craft (chemical) DC 25 + the bonus −
 *                  the Artificer's level; XP the bonus × 10 × the components' DC
 */

export const KINDS = {
  potion: { label: "Potion", buyDC: 17, maxLevel: 3, charges: 1, craft: "chemical", weight: { value: "—", lb: null } },
  scroll: { label: "Scroll", buyDC: 15, maxLevel: 9, charges: 1, craft: "writing", weight: { value: "—", lb: null } },
  wand: { label: "Wand", buyDC: 24, maxLevel: 4, charges: 50, craft: "mechanical", weight: { value: "1 lb.", lb: 1 } },
  // "Single-use ... that affects only the bearer"; the book sets it no highest level.
  tattoo: { label: "Tattoo", buyDC: 15, maxLevel: 9, charges: 1, craft: "visual art", weight: { value: "—", lb: null } },
};

/**
 * The features that make each, by identifier (the class feature item's), with their raw materials' base purchase DC.
 * The Artificer's Craft Artifice is a talent chosen at each level: one who has it may have taken any of these.
 */
export const MAKERS = {
  potion: [{ feature: "brew-potion", label: "Brew Potion", materials: 15 }, { feature: "craft-artifice", label: "Improved Brew Potion (Craft Artifice)", materials: 12 }],
  scroll: [{ feature: "scribe-scroll", label: "Scribe Scroll", materials: 13 }, { feature: "craft-artifice", label: "Improved Scribe Scroll (Craft Artifice)", materials: 10 }],
  wand: [{ feature: "craft-artifice", label: "Craft Wand (Craft Artifice)", materials: 18 }],
  // "created in the same way (see Scribe Scroll), except that the pertinent skill is Craft (visual art)"
  tattoo: [{ feature: "craft-artifice", label: "Improved Scribe Tattoo (Craft Artifice)", materials: 10 }],
};

/** The lowest caster level that casts a spell of `level`: 1 for 0 and 1st, then 2 × level − 1. */
export const minCasterLevel = (level) => Math.max(1, 2 * level - 1);

const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

/** A spell's level on the list it is cast from: an arcane or divine list's, the lowest it has. */
export function spellLevel(levels) {
  return (levels ?? []).length ? Math.min(...levels.map((l) => l.level)) : null;
}

/** Arcane or divine, by the spell's lists: the Mage's and arcane lists arcane, the Acolyte's and divine divine. */
export const castingKind = (levels) => ((levels ?? []).some((l) => /mage|arcane/i.test(l.class)) ? "arcane" : (levels ?? []).some((l) => /acolyte|divine/i.test(l.class)) ? "divine" : "");

/** Whether an item of `kind` can hold a spell of `level`: `{ ok, reason }`. */
export function canHold(kind, level) {
  const k = KINDS[kind];
  if (!k) return { ok: false, reason: "not a potion, scroll or wand" };
  if (level === null || level === undefined) return { ok: false, reason: "the spell has no level" };
  if (level > k.maxLevel) return { ok: false, reason: `a ${kind} holds a spell of ${ordinal(k.maxLevel)} level or lower` };
  return { ok: true, reason: "" };
}

/** Its purchase DC, bought: the kind's base + caster level + spell level. */
export const buyDC = (kind, level, casterLevel) => KINDS[kind].buyDC + casterLevel + level;

/** Making it: the raw materials' purchase DC, the Craft check's skill and DC, and the XP it costs. */
export function making(kind, maker, level, casterLevel) {
  const materials = maker.materials + level + casterLevel;
  return { materials, craft: KINDS[kind].craft, craftDC: 10 + level + casterLevel, xp: level * casterLevel * materials };
}

/**
 * The item, as a character's FX item (tools/build/fx-items.mjs's charged items): "Wand of Web", its charges, the spell
 * it holds (`spell`: `{ name, uuid, system }`), its caster level and price.
 */
export function itemOf(kind, spell, casterLevel, { img = "" } = {}) {
  const k = KINDS[kind];
  const level = spellLevel(spell.system.levels);
  const casting = castingKind(spell.system.levels);
  const dc = buyDC(kind, level, casterLevel);
  return {
    name: `${k.label} of ${spell.name.replace(/ \((Modern|Arcana|Future|Menaces)\)$/, "")}`,
    type: "consumable", img,
    system: {
      kind, charges: { value: k.charges, max: k.charges },
      spells: [{ name: spell.name, uuid: spell.uuid ?? "", charges: 1, note: "" }],
      fx: { category: k.label, power: "magic", incantation: false, slot: "", bonus: 0, casterLevel: { value: `${ordinal(casterLevel)}${casting ? ` (${casting})` : ""}`, level: casterLevel, label: "Caster Level" } },
      purchaseDC: { value: String(dc), dc, byBonus: [] },
      weight: { ...k.weight },
      description: `<p>Holds <em>${spell.name}</em>, cast at caster level ${casterLevel}.</p>`,
    },
  };
}

/** Magic mastercraft (the Artificer's): the components' DC with the bonus, the two Craft checks' DCs, and the XP. */
export function magicMastercraft(type, components, bonus, artificerLevel) {
  return {
    materials: components + 5 * bonus,
    mechanicalDC: (type === "armor" ? 20 : 25) + bonus,
    chemicalDC: 25 + bonus - artificerLevel,
    xp: bonus * 10 * components,
  };
}
