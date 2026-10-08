/**
 * Vehicles (Modern/VehicleCombat): their speed categories and what they do, and damage to them.
 *
 *   speed        stationary, alley (1–20 squares a round at character scale), street (21–50), highway (51–150),
 *                all-out (151+), none past the vehicle's top speed; one category faster or slower a round. Street
 *                +1 Defense and −1 on the checks and attack rolls of all aboard; highway +2 and −2; all-out +4 and −4
 *   damage       its hardness off every hit; energy as to objects (Modern/Combat/AttackAnObject): electricity and
 *                fire half, cold a quarter, before hardness; acid and sonic in full
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

/** What its speed does: its Defense now, and the modifier on the checks and attack rolls of everyone aboard. */
export function atSpeed(defense, speed) {
  const s = SPEEDS[speed] ?? SPEEDS.stationary;
  return { defense: (defense ?? 0) + s.defense, check: s.check, label: s.label };
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
