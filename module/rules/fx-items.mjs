/**
 * FX items in use (Modern/FX/Items/fxitems): what a charged item's use costs and its saving throw, and the
 * limit on FX items worn at once.
 *
 *   a use            a potion or scroll is used up; a wand's use takes a charge; a staff's takes the charges its
 *                    line gives (some none); a wand or staff with too few left cannot
 *   saving throw     10 + 1.5 × the level of the spell, power or effect (rounded down), unless the item says
 *   worn at once     1 headband, headset, hat or helmet; 1 pair of eyeglasses, contact lenses, sunglasses or
 *                    goggles; 1 amulet, brooch, medallion, necklace, necktie or scarab; 1 suit of armor; 1 robe,
 *                    jacket, windbreaker or coat; 1 cloak, cape, poncho, sweater or mantle; 1 vest or shirt; 1 pair
 *                    of bracers or bracelets, or 1 watch; 1 pair of gloves or gauntlets; 1 pair of earrings;
 *                    2 rings; 1 belt; 1 pair of boots, shoes or sandals; 6 tattoos. Any number carried.
 */

/** The kinds of FX item worn at once, each with how many count and the words that name it. */
export const WORN = {
  head: { label: "headband, headset, hat or helmet", limit: 1, words: /\b(headbands?|headsets?|hats?|helmets?)\b/i },
  eyes: { label: "eyeglasses, contact lenses, sunglasses or goggles", limit: 1, words: /\b(eyeglasses|glasses|contact lenses|sunglasses|goggles|spectacles)\b/i },
  neck: { label: "amulet, brooch, medallion, necklace, necktie or scarab", limit: 1, words: /\b(amulets?|brooch(es)?|medallions?|necklaces?|neckties?|scarabs?|talismans?|watch fob)\b/i },
  armor: { label: "suit of armor", limit: 1, words: null },
  coat: { label: "robe, jacket, windbreaker or coat", limit: 1, words: /\b(robes?|jackets?|windbreakers?|coats?|parkas?)\b/i },
  cloak: { label: "cloak, cape, poncho, sweater or mantle", limit: 1, words: /\b(cloaks?|capes?|ponchos?|sweaters?|mantles?)\b/i },
  vest: { label: "vest or shirt", limit: 1, words: /\b(vests?|shirts?)\b/i },
  wrists: { label: "bracers, bracelets or a watch", limit: 1, words: /\b(bracers?|bracelets?|watch(es)?|wristwatch(es)?)\b/i },
  hands: { label: "gloves or gauntlets", limit: 1, words: /\b(gloves?|gauntlets?)\b/i },
  ears: { label: "earrings", limit: 1, words: /\bearrings?\b/i },
  ring: { label: "rings", limit: 2, words: null },
  belt: { label: "belt", limit: 1, words: /\bbelts?\b/i },
  feet: { label: "boots, shoes or sandals", limit: 1, words: /\b(boots?|shoes?|sandals?)\b/i },
  tattoo: { label: "tattoos", limit: 6, words: null },
};

/**
 * The kind of FX item worn an item is, from its category and name: a ring, a tattoo, a suit of armor (not a
 * shield), or what its name says it is ("Running Shoes of Striding" is shoes); "" for one not worn.
 */
export function wornSlot(type, category, name, weightClass = "") {
  if (category === "Ring") return "ring";
  if (category === "Tattoo") return "tattoo";
  if (type === "armor") return weightClass === "shield" ? "" : "armor";
  if (!["Wondrous Item", "Artifact"].includes(category)) return "";
  // The watch fob before the watch: it hangs on a chain.
  const base = String(name ?? "").replace(/\bof\b.*$/i, "");
  for (const [slot, w] of Object.entries(WORN)) if (w.words?.test(base) && !(slot === "wrists" && /watch fob/i.test(base))) return slot;
  return "";
}

/**
 * FX items worn beyond the limit (`items`: `{ id, name, sort, system }`, those equipped): `{ slot, label, limit,
 * items: [names], over: [ids] }` for each kind with more than its limit; `over` the ones past it, in the Gear
 * tab's order (by sort, then name), so a player chooses which work by dragging them up.
 */
export function wornOverLimit(items) {
  const by = {};
  const ordered = [...items].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.name).localeCompare(String(b.name)));
  for (const i of ordered) {
    const slot = i.system?.fx?.slot;
    if (!slot || !WORN[slot] || !i.system.equipped || i.system.stored) continue;
    (by[slot] ??= []).push(i);
  }
  return Object.entries(by).filter(([slot, list]) => list.length > WORN[slot].limit)
    .map(([slot, list]) => ({ slot, label: WORN[slot].label, limit: WORN[slot].limit, items: list.map((i) => i.name), over: list.slice(WORN[slot].limit).map((i) => i.id) }));
}

/** The saving throw DC of an FX item's effect of `level` (a spell's or power's): 10 + 1.5 × level, rounded down. */
export const itemSaveDC = (level) => 10 + Math.floor(1.5 * Math.max(0, level ?? 0));

/**
 * A spell's level as an item casts it: on the list the item's caster level names ("9th (arcane)": the arcane
 * classes', Mage; "divine": Acolyte), or else the lowest it has. `levels` are the spell's `{ class, level }`.
 */
export function spellLevelFor(levels, casterLevelText = "") {
  const list = levels ?? [];
  if (!list.length) return null;
  const want = /arcane/i.test(casterLevelText) ? /mage|arcane/i : /divine/i.test(casterLevelText) ? /acolyte|divine/i : null;
  const on = want ? list.filter((l) => want.test(l.class)) : [];
  return Math.min(...(on.length ? on : list).map((l) => l.level));
}

/** A DC the book gives with a staff's use ("Reflex save DC 15", "DC 13"), or null. */
export const printedDC = (note) => Number(String(note ?? "").match(/\bDC (\d+)/)?.[1]) || null;

/**
 * Using a charged item (`system`: its kind, charges and spells) for its `index`th spell: `{ ok, reason, charges,
 * used, consumed }`, `charges` left after, `used` what the use took, `consumed` when the item is used up (a potion
 * or scroll).
 */
export function useCharges(system, index = 0) {
  const use = system.spells?.[index];
  const single = ["potion", "scroll"].includes(system.kind);
  const cost = single ? 1 : use ? use.charges : 1;
  const left = system.charges?.value ?? 0;
  if (left < cost) return { ok: false, reason: left ? `${left} charge${left === 1 ? "" : "s"} left, and this takes ${cost}` : "no charges left", charges: left, used: 0, consumed: false };
  return { ok: true, reason: "", charges: left - cost, used: cost, consumed: single };
}
