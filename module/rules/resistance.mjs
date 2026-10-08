/**
 * Damage reduction, resistance to energy and immunities (Modern/SpecialAbilities):
 *
 *   damage reduction    ignores an amount of damage from weapons and natural attacks (not
 *                       energy). Printed with what overcomes it: "10/+1" (a magic weapon),
 *                       "5/silver", "5/ballistic", "1/—" (nothing)
 *   resistance          ignores an amount of each hit of one energy type: acid, cold,
 *                       electricity, fire, sonic/concussion; or of one weapon type (a malleable
 *                       creature's "bludgeoning resistance 5")
 *   immunity            ignores all of a type ("immune to fire", "piercing immunity")
 *
 * Damage is reduced part by part: a creature's "1d8+9 plus 1d6 fire" is a physical part and a
 * fire part, each met by what stops it.
 */

export const ENERGY = ["acid", "cold", "electricity", "fire", "sonic"];
/** Weapon damage types that are energy, as weapons print them. */
const ENERGY_NAMES = { acid: "acid", cold: "cold", electricity: "electricity", fire: "fire", sonic: "sonic", concussion: "sonic" };

/** A printed damage type as the kinds it is: "Bludgeoning, Piercing" → ["bludgeoning", "piercing"]; "Concussion" → ["sonic"]. */
export function damageKinds(type) {
  return String(type ?? "").toLowerCase().split(/[,/]|\band\b/).map((t) => t.trim()).filter(Boolean).map((t) => ENERGY_NAMES[t] ?? t);
}

/** The weapon damage types a resistance can name (Menaces/Creatures/MalleableCreatureTemplate). */
const PHYSICAL = ["bludgeoning", "piercing", "slashing", "ballistic"];

/** Whether a part of damage is energy (resisted) rather than a weapon's (reduced by DR). */
export const isEnergy = (kinds) => kinds.some((k) => ENERGY.includes(k));

/**
 * A creature's defenses, from its printed special qualities: `{ dr: [{ amount, overcome }],
 * resist: { fire: 10, ... }, immune: ["fire", "piercing", ...] }`.
 */
export function readDefenses(qualities) {
  const out = { dr: [], resist: {}, immune: [], spellResistance: 0 };
  for (const q of qualities ?? []) {
    const t = q.toLowerCase();
    // Spell resistance: "SR 22", "spell resistance 10".
    const sr = t.match(/^(?:sr|spell resistance) (\d+)\b/);
    if (sr) out.spellResistance = Math.max(out.spellResistance, Number(sr[1]));
    const dr = t.match(/damage reduction (\d+)\/\s*([^\s(]+)/);
    if (dr) out.dr.push({ amount: Number(dr[1]), overcome: dr[2].replace(/^[–—-]$/, "—") });
    const res = t.match(/^((?:\w+(?:\/\w+)?)(?:,? (?:and )?\w+)*) resistance (\d+)$/);
    if (res) for (const k of damageKinds(res[1].replace(/\band\b/g, ","))) if ([...ENERGY, ...PHYSICAL].includes(k)) out.resist[k] = Math.max(out.resist[k] ?? 0, Number(res[2]));
    const imm = t.match(/^immune to (.+)$/) ?? t.match(/^(\w+) immunity$/);
    if (imm) for (const k of damageKinds(imm[1].replace(/\b(weapons|damage)\b/g, "").replace(/\band\b/g, ","))) {
      if ([...ENERGY, "piercing", "slashing", "bludgeoning", "ballistic"].includes(k)) out.immune.push(k);
    }
  }
  return out;
}

/** A character's defenses, from its bonuses (talents' and effects' damage reduction and resistances). */
export function characterDefenses(bonuses) {
  const dr = Number(bonuses?.damageReduction ?? 0), magic = Number(bonuses?.damageReductionMagic ?? 0);
  const resist = Object.fromEntries(ENERGY.map((k) => [k, Number(bonuses?.energyResistance?.[k] ?? 0)]).filter(([, v]) => v > 0));
  return { dr: [...(dr > 0 ? [{ amount: dr, overcome: "—" }] : []), ...(magic > 0 ? [{ amount: magic, overcome: "+1" }] : [])], resist, immune: [] };
}

/**
 * A rolled damage total split into its parts by the labels on its dice ("1d6[fire]"): `terms`
 * as `[{ operator }]` or `[{ flavor, total }]` (Foundry's rolled terms), the unlabelled rest of
 * the type `mainType`. Returns `[{ type, amount }]`.
 */
export function damageParts(terms, total, mainType) {
  const typed = {};
  let sign = 1;
  for (const t of terms) {
    if (t.operator) { sign = t.operator === "-" ? -1 : 1; continue; }
    const f = (t.flavor ?? "").toLowerCase().trim();
    if (f && typeof t.total === "number") typed[f] = (typed[f] ?? 0) + sign * t.total;
  }
  const labelled = Object.values(typed).reduce((n, v) => n + v, 0);
  return [{ type: mainType, amount: total - labelled }, ...Object.entries(typed).map(([type, amount]) => ({ type, amount }))].filter((p) => p.amount > 0);
}

/**
 * Damage after defenses: each part reduced by an immunity to it, by resistance (energy, or a weapon
 * type a resistance names), and a weapon's by damage reduction. DR the weapon overcomes is skipped: one that names the weapon's
 * kind ("5/piercing" against a piercing weapon), or any DR when `ignoreDR` (a magic or silver
 * weapon, which the card cannot know). The largest DR that applies is used.
 *
 * Returns `{ total, stopped: [{ by, amount }] }`.
 */
export function reduceDamage(parts, defenses, { ignoreDR = false } = {}) {
  const stopped = [];
  let total = 0;
  for (const p of parts) {
    const kinds = damageKinds(p.type);
    let amount = p.amount;
    const immune = kinds.find((k) => defenses.immune.includes(k));
    if (immune) {
      stopped.push({ by: `immune to ${immune}`, amount });
      continue;
    }
    const k = kinds.find((x) => defenses.resist[x]);
    if (k) {
      const cut = Math.min(amount, defenses.resist[k]);
      if (cut) stopped.push({ by: `${k} resistance ${defenses.resist[k]}`, amount: cut });
      amount -= cut;
    }
    if (!isEnergy(kinds) && !ignoreDR) {
      const dr = defenses.dr.filter((d) => !kinds.includes(d.overcome)).sort((a, b) => b.amount - a.amount)[0];
      if (dr) {
        const cut = Math.min(amount, dr.amount);
        if (cut) stopped.push({ by: `damage reduction ${dr.amount}/${dr.overcome}`, amount: cut });
        amount -= cut;
      }
    }
    total += amount;
  }
  return { total, stopped };
}
