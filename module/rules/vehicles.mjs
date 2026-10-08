/**
 * Vehicles (Modern/VehicleCombat): their speed categories and what they do, and damage to them.
 *
 *   speed        stationary, alley (1–20 squares a round at character scale), street (21–50), highway (51–150),
 *                all-out (151+), none past the vehicle's top speed; one category faster or slower a round. Street
 *                +1 Defense and −1 on the checks and attack rolls of all aboard; highway +2 and −2; all-out +4 and −4
 *   damage       its hardness off every hit; energy as to objects (Modern/Combat/AttackAnObject): electricity and
 *                fire half, cold a quarter, before hardness; acid and sonic in full
 *   driving      a Drive (Pilot, for an aircraft) check for each stunt, with the vehicle's maneuver and its speed's
 *                modifier; its DC by the stunt; −4 for a class of vehicle without its operation feat; a GM's crew
 *                by its quality. Driving defensively: +2 Defense, −4 on attacks aboard; total defense +4, −8
 *   condition    disabled at 0 hit points (it stops functioning, losing a speed category a round); destroyed when it
 *                has lost twice its full normal hit points (at minus its total): it cannot be repaired
 */

/** The speed categories, in order: squares a round at each scale, the turn number, and the Defense and check/roll modifiers. */
export const SPEEDS = {
  stationary: { label: "Stationary", character: [0, 0], chase: [0, 0], turn: "—", defense: 0, check: 0 },
  alley: { label: "Alley speed", character: [1, 20], chase: [1, 2], turn: "1 (chase 1)", defense: 0, check: 0 },
  street: { label: "Street speed", character: [21, 50], chase: [3, 5], turn: "2 (chase 1)", defense: 1, check: -1 },
  highway: { label: "Highway speed", character: [51, 150], chase: [6, 15], turn: "4 (chase 2)", defense: 2, check: -2 },
  allOut: { label: "All-out", character: [151, Infinity], chase: [16, Infinity], turn: "8 (chase 2)", defense: 4, check: -4 },
};
const ORDER = Object.keys(SPEEDS);

/** The categories a vehicle can reach, by its top speed at character scale: none whose least is past it. */
export const reachable = (topSpeed) => ORDER.filter((k) => SPEEDS[k].character[0] <= Math.max(0, topSpeed ?? 0));

/** The categories it can go to from `current` this round: one faster or slower, as far as its top speed allows. */
export function nextSpeeds(current, topSpeed) {
  const can = reachable(topSpeed);
  const i = ORDER.indexOf(current in SPEEDS ? current : "stationary");
  return ORDER.filter((k, j) => Math.abs(j - i) <= 1 && can.includes(k));
}

/** What its speed (and how it is driven) does: its Defense now, and the modifier on the checks and attack rolls of everyone aboard. */
export function atSpeed(defense, speed, driving = "normal") {
  const s = SPEEDS[speed] ?? SPEEDS.stationary;
  return { defense: (defense ?? 0) + s.defense + (DRIVING[driving]?.defense ?? 0), check: s.check, label: s.label };
}

/** How much of an energy's damage an object (a vehicle) takes: electricity and fire half, cold a quarter. */
const ENERGY_SHARE = { electricity: 0.5, fire: 0.5, cold: 0.25 };

/**
 * A hit's damage to a vehicle: its parts (`[{ type, amount }]`, as a damage card splits them) each cut as energy cuts
 * an object's, added up, then the vehicle's hardness off. `{ total, before, stopped: [{ by, amount }] }`.
 */
export function vehicleDamage(parts, hardness = 0) {
  const stopped = [];
  let before = 0;
  for (const p of parts) {
    const kinds = String(p.type ?? "").toLowerCase();
    const share = Object.entries(ENERGY_SHARE).find(([k]) => kinds.includes(k))?.[1] ?? 1;
    const amount = Math.floor(Math.max(0, p.amount) * share);
    if (amount < p.amount) stopped.push({ by: `${kinds.match(/electricity|fire|cold/)[0]} against an object (×${share === 0.25 ? "¼" : "½"})`, amount: p.amount - amount });
    before += amount;
  }
  const cut = Math.min(before, Math.max(0, hardness));
  if (cut) stopped.push({ by: `hardness ${hardness}`, amount: cut });
  return { total: before - cut, before, stopped };
}

/** The condition its hit points put it in: "destroyed" at minus its full normal total or lower, "disabled" at 0 or lower. */
export function vehicleState(value, max) {
  if (value <= -Math.abs(max ?? 0)) return "destroyed";
  if (value <= 0) return "disabled";
  return null;
}

/**
 * A GM's crew (Modern/VehicleCombat/FightingFromVehicles, Crew Quality): its check modifier, for Drive, Pilot and Repair
 * checks with the vehicle, and its attack bonus.
 */
export const CREW = {
  untrained: { label: "Untrained", check: -4, attack: -2 },
  normal: { label: "Normal", check: 2, attack: 0 },
  skilled: { label: "Skilled", check: 4, attack: 2 },
  expert: { label: "Expert", check: 8, attack: 4 },
  ace: { label: "Ace", check: 12, attack: 8 },
};

/** How the driver drives (Attack Options): defensively, +2 to its Defense and −4 on attacks aboard; total defense +4, −8 and none by the driver. */
export const DRIVING = {
  normal: { label: "Normally", defense: 0, attack: 0 },
  defensively: { label: "Defensively", defense: 2, attack: -4 },
  total: { label: "Total defense", defense: 4, attack: -8 },
};

/**
 * The stunts (Modern/VehicleCombat/DrivingAVehicle), each a Drive (or Pilot) check: its DC, or the DCs it chooses
 * among (`options`: `[label, dc]`), and what a failure does (`fail`), with the check to keep control it calls for.
 */
export const STUNTS = {
  check: { label: "A check (another DC)", dc: 15, ask: "dc", fail: "" },
  control: { label: "Keep control", dc: 15, ask: "dc", fail: "", control: true },
  avoid: { label: "Avoid hazard", options: [["Caltrops", 15], ["Oil slick", 15], ["Small object (tire, light debris)", 5], ["Medium object (crate)", 10], ["Large object (pile of wreckage)", 15]], fail: "It hits the hazard: caltrops attack it; an oil slick calls for a check to keep control (DC 15); an object, a collision." },
  bootleg: { label: "Bootleg turn", options: [["45 degrees", 5], ["90 degrees", 10], ["135 degrees", 15], ["180 degrees", 20]], fail: "It turns only 45 degrees.", keepAtDC: true, stops: true },
  dash: { label: "Dash (one speed category faster)", dc: 15, fail: "No faster.", faster: 1 },
  brake: { label: "Hard brake (up to two categories slower)", dc: 15, fail: "No slower.", slower: 2, keep: 15 },
  hardTurn: { label: "Hard turn (45 degrees in half the turn number)", dc: 15, fail: "It goes forward its full turn number before turning.", keep: 15 },
  jump: { label: "Jump", options: [["1–3 ft. (ditch)", 15], ["4–8 ft. (culvert)", 20], ["8–15 ft. (creek, small ravine)", 25], ["16–25 ft. (narrow road, small pond)", 35], ["26–40 ft. (wide road, small river)", 45]], bySpeed: { alley: 10, street: 5, highway: 0, allOut: -5 }, fail: "It falls into the gap, or hits its far side: a collision." },
  sideswipe: { label: "Sideswipe", dc: 15, sideswipe: true, fail: "Both vehicles take the sideswipe's damage anyway; the other driver need not check to keep control." },
};

/** A stunt's DC: its own, the one chosen of its options, a jump's by the vehicle's speed, a sideswipe's by size and speed. */
export function stuntDC(stunt, { option = 0, dc, speed = "stationary", larger = 0, speedsApart = 0 } = {}) {
  const s = STUNTS[stunt];
  if (!s) return null;
  if (s.ask) return Number(dc) || s.dc;
  let base = s.options ? s.options[Math.min(option, s.options.length - 1)][1] : s.dc;
  if (s.bySpeed) base += s.bySpeed[speed] ?? 0;
  // Each size category the target is larger, −5; smaller, +5; each speed category apart, −2.
  if (s.sideswipe) base += -5 * larger - 2 * Math.abs(speedsApart);
  return base;
}

/** What a failed check to keep control does: a spin, or, failed by 10 or more, the vehicle rolls. */
export const lostControl = (total, dc) => (total >= dc ? null : dc - total >= 10 ? "rolls" : "spins");

/**
 * The penalty for operating a vehicle of a class without its feat (Surface Vehicle Operation, Aircraft Operation): −4 on
 * its Drive or Pilot checks and on attacks with its weapons. `feats` are the operator's `{ name, choice }`.
 */
export function operationPenalty(operation, feats = []) {
  const cls = operation?.class;
  if (!cls) return 0;
  const feat = operation.skill === "pilot" ? "aircraft operation" : "surface vehicle operation";
  return feats.some((f) => f.name.toLowerCase() === feat && String(f.choice ?? "").toLowerCase().includes(cls.toLowerCase().replace(/s$/, ""))) ? 0 : -4;
}

/**
 * What being aboard does to a character's rolls (the vehicle's `system`, and its `role`): its speed's check/roll
 * modifier on skill checks and attack rolls, and on attacks how the driver drives (defensively, total defense).
 */
export function aboard(system, role = "passenger") {
  const speed = SPEEDS[system?.speed] ?? SPEEDS.stationary;
  const driving = DRIVING[system?.driving] ?? DRIVING.normal;
  return { check: speed.check, attack: speed.check + driving.attack, speedLabel: speed.label, drivingLabel: driving.label, cannotAttack: role === "driver" && system?.driving === "total" };
}
