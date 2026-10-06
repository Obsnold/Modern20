/**
 * Ammunition and magazines (Modern/Equipment/Weapons).
 *
 *   magazine          "15 box", "6 cyl.", "7 int.": its capacity and type; "Linked" has no
 *                     limit; "—" none (a thrown weapon, or a bow loaded as it fires)
 *   reloading         a box magazine or a speed loader is a move action; a cylinder by hand
 *                     or an internal magazine a full-round action; a belt of linked
 *                     ammunition a full-round action
 *   rounds a shot     1; a double tap 2; a burst 5; autofire 10
 *   double tap        (the feat) a semiautomatic: −2 to attack, +1 die of damage
 *   burst fire        (the feat) an automatic: −4 to attack, +2 dice of damage, one target
 *   autofire          a 10-foot square, Defense 10 (−4 without Advanced Firearms
 *                     Proficiency); everyone in it makes a Reflex save (DC 15) or takes the
 *                     damage
 */

export const ROUNDS = { single: 1, doubleTap: 2, burst: 5, autofire: 10 };
export const AUTOFIRE_DEFENSE = 10;
export const AUTOFIRE_REFLEX_DC = 15;

/** A weapon's magazine as printed: `{ capacity, type }`, capacity Infinity for linked; null for none. */
export function magazineOf(text) {
  const t = (text ?? "").trim();
  if (/^linked$/i.test(t)) return { capacity: Infinity, type: "linked" };
  const m = t.match(/^(\d+)\s*(box|cyl|int)/i);
  if (!m) return null;
  return { capacity: Number(m[1]), type: { box: "box", cyl: "cylinder", int: "internal" }[m[2].toLowerCase()] };
}

/** How long reloading takes for a magazine type. */
export const reloadAction = (type) => (type === "box" ? "a move action" : type === "cylinder" ? "a move action with a speed loader, a full-round action by hand" : "a full-round action");

/** Whether a weapon can fire on automatic, or semiautomatic: its rate of fire includes A, or S. */
export const automatic = (weapon) => /\bA\b/.test(weapon.system.rateOfFire ?? "");
export const semiautomatic = (weapon) => /\bS\b|Semi/.test(weapon.system.rateOfFire ?? "");

/**
 * The caliber an ammunition item is for, as a weapon's name gives it: ".22 caliber" → ".22",
 * "9mm" → "9mm", "12-gauge buckshot" → "12-gauge"; null for ammunition named by its kind
 * (Armor Piercing, Tracer) rather than its caliber.
 */
export function caliberOf(name) {
  const m = (name ?? "").match(/^(\.\d+(?:AE)?|\d+(?:\.\d+)?mmR?|\d+-gauge)\b/i);
  return m ? m[1] : null;
}

const ENERGY = /^(laser|plasma|pulse|sonic|lightning|cryonic|disintegrator)\b/i;

/** Whether ammunition fits a weapon: its caliber in the weapon's name ("Beretta 92F (9mm autoloader)"), arrows and bolts for bows and crossbows, power packs for energy weapons. Any can still be chosen by hand. */
export function fits(weapon, ammo) {
  // "12-ga shotgun" is the 12-gauge.
  const n = (weapon.name ?? "").replace(/\b(\d+)-ga\b/g, "$1-gauge");
  if (/^arrow/i.test(ammo.name)) return /\bbow\b/i.test(n) && !/crossbow/i.test(n);
  if (/^crossbow bolt/i.test(ammo.name)) return /crossbow/i.test(n);
  // d20 Future: the energy weapons run on power packs, the rail gun on shards.
  if (/^power pack/i.test(ammo.name)) return ENERGY.test(n);
  if (/^rail gun shards/i.test(ammo.name)) return /^rail gun/i.test(n);
  const c = caliberOf(ammo.name);
  if (!c) return false;
  return calibersMatch(c, caliberIn(weapon) ?? "");
}

/** A caliber named in text: ".50", "9mm", "7.62mmR", "12-gauge" (or "12-ga"). */
const CALIBER = /(?:^|[\s(/])(\.\d+(?:AE)?|\d+(?:\.\d+)?mmR?|\d+-(?:gauge|ga)\b)/i;

/**
 * The caliber a weapon fires: the one its name gives ("Beretta 92F (9mm autoloader)"), or else
 * the first its description names ("This .50-caliber machine gun ...", the M2HB). Only the first,
 * so a weapon that mentions another (the OICW's 20mm grenade launcher) is not taken to fire it.
 */
export function caliberIn(weapon) {
  const fromName = (weapon.name ?? "").match(CALIBER)?.[1];
  const found = fromName ?? String(weapon.system?.description ?? "").replace(/<[^>]+>/g, " ").match(CALIBER)?.[1];
  return found ? found.replace(/-ga$/i, "-gauge") : null;
}

/** Whether two calibers are the same: ".50" is ".50", not ".50AE"; "7.62mm" is not "7.62mmR". */
const calibersMatch = (a, b) => a.toLowerCase() === b.toLowerCase();

/**
 * Firing: whether a weapon holding `loaded` rounds can fire in `mode`, and what is left.
 * A weapon with no magazine draws from its ammunition (`supply`) a round a shot, if it
 * uses any. Returns `{ ok, loaded, supply, rounds, reason }`.
 */
export function fire(weapon, mode, { loaded = 0, supply = null } = {}) {
  const rounds = ROUNDS[mode] ?? 1;
  const mag = magazineOf(weapon.system.magazine);
  if (mag) {
    if (mag.capacity !== Infinity && loaded < rounds) return { ok: false, rounds, reason: loaded ? `only ${loaded} round${loaded === 1 ? "" : "s"} loaded; ${mode === "single" ? "a shot" : mode} needs ${rounds}` : "it is empty" };
    if (mag.capacity === Infinity && supply !== null && supply < rounds) return { ok: false, rounds, reason: "the belt is out" };
    return { ok: true, rounds, loaded: mag.capacity === Infinity ? loaded : loaded - rounds, supply: mag.capacity === Infinity && supply !== null ? supply - rounds : supply };
  }
  if (supply === null) return { ok: true, rounds: 0, loaded, supply };
  if (supply < rounds) return { ok: false, rounds, reason: "no ammunition left" };
  return { ok: true, rounds, loaded, supply: supply - rounds };
}

/** Reloading: the rounds that go in (as many as fit, from what is carried), and what is left of each. */
export function reload(weapon, loaded, supply) {
  const mag = magazineOf(weapon.system.magazine);
  if (!mag || mag.capacity === Infinity) return { added: 0, loaded, supply };
  const added = Math.max(0, Math.min(mag.capacity - loaded, supply));
  return { added, loaded: loaded + added, supply: supply - added, action: reloadAction(mag.type) };
}

/** Damage with more dice of the weapon's die: a burst's two ("2d6" → "4d6"), a double tap's one. */
export const extraDice = (formula, n) => formula.replace(/^(\d+)d(\d+)/, (_, count, die) => `${Number(count) + n}d${die}`);

/** What each firing mode adds to the attack and the damage dice. */
export const MODES = {
  doubleTap: { label: "Double tap", attack: -2, dice: 1 },
  burst: { label: "Burst fire", attack: -4, dice: 2 },
  autofire: { label: "Autofire", attack: 0, dice: 0 },
};
