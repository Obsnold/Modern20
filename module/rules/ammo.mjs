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
  // A count with no type (the Abrams' cannon, "1" in Table: Vehicle Weapons): loaded a round at a time, as an internal one.
  if (/^\d+$/.test(t)) return { capacity: Number(t), type: "internal" };
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
  // A special load (Beanbag, Silver) fits the caliber chosen for it ("12-gauge").
  const c = caliberOf(ammo.name) ?? caliberOf(ammo.system?.caliber ?? "");
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

/** Damage with more (or fewer) dice of the weapon's die: a burst's two ("2d6" → "4d6"), birdshot's one fewer; never under one. */
export const extraDice = (formula, n) => formula.replace(/^(\d+)d(\d+)/, (_, count, die) => `${Math.max(1, Number(count) + n)}d${die}`);

/** What each firing mode adds to the attack and the damage dice. */
export const MODES = {
  doubleTap: { label: "Double tap", attack: -2, dice: 1 },
  burst: { label: "Burst fire", attack: -4, dice: 2 },
  autofire: { label: "Autofire", attack: 0, dice: 0 },
};

/**
 * Special ammunition (Arcana/Equipment/RangedWeapons, Ammunition; Future/Equipment): a load of a caliber
 * that changes what a shot does. By identifier:
 *
 *   attack       added to the attack roll (Flechette −1, Seeker +1)
 *   autofire     added to the attack on autofire only (Tracer)
 *   threat       widens the critical threat range (Flechette's one)
 *   dice         damage dice added or taken away (High Explosive +1, Birdshot −1)
 *   damage       added to the damage (Subsonic −2)
 *   extra        damage of another kind besides ("1d6", `extraType` fire: White Phosphorous)
 *   nonlethal    the damage is nonlethal (Beanbag, Rubber Round)
 *   overcomes    the damage reduction it gets past ("silver")
 *   half         half of the damage is this kind (Plasma-coated: fire)
 *   ask          asked when attacking or rolling damage, a bonus the table judges: `{ roll, label, value }`
 *   note         what else it does, for the table
 *   only         the weapons it is made for, matched on the weapon's name and category; `onlyText` says so
 */
export const SPECIAL_AMMO = {
  "armor-piercing": { ask: { roll: "attack", label: "The target is wearing armor (Armor Piercing: +2)", value: 2 } },
  "beanbag": { nonlethal: true, only: /shotgun|grenade launcher/i, onlyText: "shotguns and grenade launchers" },
  "birdshot": { dice: -1, only: /shotgun/i, onlyText: "shotguns" },
  "flechette": { attack: -1, threat: 1 },
  "frangible": { ask: { roll: "damage", label: "The target is unarmored, natural armor under +2 (Frangible: +1)", value: 1 } },
  "high-explosive": { dice: 1 },
  "rubber-round": { nonlethal: true, only: /Handguns|Longarms/, onlyText: "handguns and longarms" },
  "silver": { overcomes: "silver" },
  "subsonic": { damage: -2, note: "Range increment 20 ft. shorter; +10 to the DC of Listen checks to hear the shot.", only: /^(?!.*shotgun)(?=.*(Handguns|Longarms))/i, onlyText: "handguns and longarms, not shotguns" },
  "tracer": { autofire: 1, note: "Opponents get +5 on Spot checks to find the shooter." },
  "tranquilizer": { note: "A dart delivering a tranquilizer or poison (Craft (chemical)).", only: /air (rifle|pistol)/i, onlyText: "air rifles and pistols" },
  "white-phosphorous-wp": { extra: "1d6", extraType: "fire", note: "Goes off on anything between shooter and target; a target damaged risks catching on fire." },
  "seeker": { attack: 1 },
  "plasma-coated": { half: "fire", note: "Reduces the Defense bonus of the target's armor by 2, to a minimum of +1." },
  "deflecting": { note: "Bounces off walls and around corners: the benefit of the Skip Shot feat." },
  "phasing": { note: "Teleports past obstacles: the target gets no benefit from cover." },
  "bio-agent": { note: "Carries a biological agent: see its description." },
};

/** A special round's rules with its name, or null for ordinary ammunition. */
export function specialAmmo(identifier, name = "") {
  const r = SPECIAL_AMMO[identifier];
  return r ? { ...r, name: name || identifier } : null;
}

/** Whether a special round is made for a weapon (Beanbag: shotguns and grenade launchers); true when it says nothing. */
export const madeFor = (rules, weapon) => !rules?.only || rules.only.test(`${weapon.name} ${weapon.system?.category ?? ""}`);

/**
 * Whether a ranged weapon is thrown (a grenade, a javelin, a shuriken) rather than fired: it has no magazine,
 * and is not a bow, a crossbow or a gun. A thrown weapon reaches five range increments, a fired one ten
 * (Modern/Combat/CombatStatistics, Range Penalty).
 */
export function isThrown(weapon) {
  if (magazineOf(weapon.system?.magazine)) return false;
  return !/\b(bow|crossbow|launcher|gun|rifle|pistol|spray|cannon|taser|thrower|blowgun|watergun)\b/i.test(weapon.name ?? "");
}

/**
 * The range penalty at `distance` feet: −2 for each full range increment (Far Shot: a fired weapon's increment
 * half again, a thrown one's doubled). `{ increments, penalty, increment, beyond }`, `beyond` past the weapon's
 * reach (ten increments, five thrown); null for a weapon with no range increment, or no distance.
 */
export function rangePenalty(weapon, distance, { farShot = false } = {}) {
  const base = weapon.system?.rangeIncrement?.ft;
  if (!base || !(distance > 0)) return null;
  const thrown = isThrown(weapon);
  const increment = farShot ? base * (thrown ? 2 : 1.5) : base;
  const increments = Math.floor(distance / increment);
  return { increments, penalty: increments ? -2 * increments : 0, increment, beyond: distance > increment * (thrown ? 5 : 10) };
}

/** Shooting or throwing into a melee: −4, none with Precise Shot (Modern/Combat/ActionsInCombat). */
export const INTO_MELEE = -4;
