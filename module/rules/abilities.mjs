/**
 * Magic weapon and armor special abilities (Arcana/FXItems/Weapons, Magic Weapon Special Abilities; ArmorAndShields,
 * Magic Armor and Shield Special Abilities): a weapon's or armor's `abilities`, each `{ id, choice }`.
 *
 *   weapons    acidic, flaming, frost, shocking, thundering: +1d6 of the energy on a hit; merciful +1d6, all
 *              nonlethal; holy, unholy, lawful, chaotic: +2d6 against a creature of the allegiance it opposes;
 *              disruption +2d6 against undead; bane +2 enhancement and +2d6 against the foe chosen; energy
 *              blast +1d10 of the energy chosen on a critical (2d10 at ×3, 3d10 at ×4); keen doubles the threat
 *              range; distance doubles the range increment; the rest (brilliant, dancing, defending, ghost touch,
 *              mighty cleaving, returning, speed, wounding) are the table's, said on the card
 *   armor      acid, cold, electricity, fire, sonic resistance: 10 against the energy; damage reduction 5/+1 or
 *              10/+1; shadow +5 Hide; silent moves +10 Move Silently; slick +5 Escape Artist; the rest
 *              (fortification, spell resistance, animated, bashing, blinding, catching, ghost touch, glamered)
 *              said where they apply
 *   price      each adds its purchase DC modifier (sponsorship takes 2 off)
 *
 * Extra dice are rolled once on a critical, not multiplied (as an ammunition load's are).
 */

const energy = (label, type) => ({ label, dc: 1, dice: "1d6", type });
const against = (label, foe, dc = 1) => ({ label, dc, against: { dice: "2d6", foe } });
const hint = (label, dc, text) => ({ label, dc, hint: text });

export const WEAPON_ABILITIES = {
  acidic: energy("Acidic", "acid"),
  flaming: energy("Flaming", "fire"),
  frost: energy("Frost", "cold"),
  shocking: energy("Shocking", "electricity"),
  thundering: energy("Thundering", "sonic"),
  merciful: { label: "Merciful", dc: 1, dice: "1d6", type: "", nonlethal: true },
  holy: against("Holy", "a creature with an allegiance to evil"),
  unholy: against("Unholy", "a creature with an allegiance to good"),
  lawful: against("Lawful", "a creature with an allegiance to chaos"),
  chaotic: against("Chaotic", "a creature with an allegiance to law"),
  disruption: against("Disruption", "undead"),
  bane: { label: "Bane", dc: 2, against: { dice: "2d6", foe: "its designated foe", enhancement: 2 }, choice: "foe" },
  energyBlast: { label: "Energy Blast", dc: 2, blast: true, choice: "energy" },
  keen: { label: "Keen", dc: 1, keen: true },
  distance: { label: "Distance", dc: 2, distance: true },
  brilliant: hint("Brilliant", 3, "Brilliant: equipment and enhancement bonuses to Defense do not count against it; it cannot harm undead, constructs or objects"),
  dancing: hint("Dancing", 3, "Dancing: loosed (a move action), it attacks on its own for 4 rounds at its wielder's base attack bonus"),
  defending: hint("Defending", 2, "Defending: some or all of its enhancement bonus can go to Defense until the next turn"),
  ghostTouch: hint("Ghost Touch", 1, "Ghost Touch: full damage against incorporeal creatures"),
  mightyCleaving: hint("Mighty Cleaving", 2, "Mighty Cleaving: one more Cleave attempt a round"),
  returning: hint("Returning", 1, "Returning: back in the thrower's hand at the start of the next turn"),
  speed: hint("Speed", 3, "Speed: one extra attack a round at the highest bonus"),
  wounding: hint("Wounding", 3, "Wounding: each wound bleeds 1 hit point a round until Treat Injury (DC 15) or healing magic"),
};

const resist = (label, type) => ({ label, dc: 2, changes: [[`energyResistance.${type}`, 10]] });
const note = (label, dc, text) => ({ label, dc, note: text });

export const ARMOR_ABILITIES = {
  acidResistance: resist("Acid Resistance", "acid"),
  coldResistance: resist("Cold Resistance", "cold"),
  electricityResistance: resist("Electricity Resistance", "electricity"),
  fireResistance: resist("Fire Resistance", "fire"),
  sonicResistance: resist("Sonic Resistance", "sonic"),
  damageReduction5: { label: "Damage Reduction 5/+1", dc: 1, changes: [["damageReductionMagic", 5]] },
  damageReduction10: { label: "Damage Reduction 10/+1", dc: 2, changes: [["damageReductionMagic", 10]] },
  shadow: { label: "Shadow", dc: 1, changes: [["skills.hide", 5]] },
  silentMoves: { label: "Silent Moves", dc: 1, changes: [["skills.moveSilently", 10]] },
  slick: { label: "Slick", dc: 1, changes: [["skills.escapeArtist", 5]] },
  lightFortification: note("Light Fortification", 1, "Light Fortification: a 25% chance a critical hit or sneak attack on you is rolled as normal damage"),
  moderateFortification: note("Moderate Fortification", 2, "Moderate Fortification: a 75% chance a critical hit or sneak attack on you is rolled as normal damage"),
  heavyFortification: note("Heavy Fortification", 3, "Heavy Fortification: critical hits and sneak attacks on you are rolled as normal damage"),
  spellResistance15: note("Spell Resistance 15", 1, "Spell resistance 15"),
  spellResistance19: note("Spell Resistance 19", 2, "Spell resistance 19"),
  spellResistance23: note("Spell Resistance 23", 3, "Spell resistance 23"),
  animated: note("Animated", 2, "Animated: on command it floats and protects you, leaving both hands free"),
  bashing: note("Bashing", 1, "Bashing: a shield bash deals 1d8 (large or riot shield) or 1d6 (small shield), as a +1 weapon"),
  blinding: note("Blinding", 1, "Blinding: twice a day, all within 20 feet but you make a Reflex save (DC 14) or are blinded for 1d4 rounds"),
  catching: note("Catching", 1, "Catching: +1 deflection bonus against ranged weapons, and ranged attacks at anyone within 5 feet come at you"),
  ghostTouch: note("Ghost Touch", 2, "Ghost Touch: its bonuses count against incorporeal attacks"),
  glamered: note("Glamered", 1, "Glamered: on command it looks like ordinary clothing"),
  sponsorship: { label: "Sponsorship", dc: -2 },
};

const of = (type) => (type === "armor" ? ARMOR_ABILITIES : WEAPON_ABILITIES);

/** An item's abilities, each with its rules and choice, those the tables know: `[{ id, choice, ...rules }]`. */
export function abilitiesOf(type, system) {
  const table = of(type);
  return (system?.abilities ?? []).filter((a) => table[a.id]).map((a) => ({ ...table[a.id], id: a.id, choice: a.choice ?? "" }));
}

/** An ability as the item's row and card name it: "Bane (lycanthropes)", "Energy Blast (fire)". */
export const abilityLabel = (a) => (a.choice ? `${a.label} (${a.choice})` : a.label);

/** Their purchase DC modifiers, added up. */
export const abilitiesDC = (type, system) => abilitiesOf(type, system).reduce((n, a) => n + a.dc, 0);

/** The tick boxes an attack with the weapon offers, for an ability that works against a kind of target: `[{ name, label }]`. */
export function abilityAsks(system) {
  return abilitiesOf("weapon", system).filter((a) => a.against).map((a) => ({
    name: `against_${a.id}`,
    label: `The target is ${a.id === "bane" && a.choice ? a.choice : a.against.foe} (${a.label}: +${a.against.dice}${a.against.enhancement ? `, +${a.against.enhancement} attack and damage` : ""})`,
  }));
}

/**
 * What the weapon's abilities do to an attack and its damage, with `ticked` the attack's tick boxes:
 * `{ attack, damage: [{ label, value }] (bane's +2), dice: [{ label, formula }] (extra dice, typed), blast,
 * nonlethal, hints, keen, distance }`.
 */
export function weaponAbilities(system, ticked = {}) {
  const out = { attack: [], damage: [], dice: [], blast: null, nonlethal: false, hints: [], keen: false, distance: false };
  for (const a of abilitiesOf("weapon", system)) {
    if (a.dice) out.dice.push({ label: `${a.label}${a.type ? ` (${a.type})` : ""}`, formula: a.type ? `${a.dice}[${a.type}]` : a.dice });
    if (a.nonlethal) out.nonlethal = true;
    if (a.against && ticked[`against_${a.id}`]) {
      out.dice.push({ label: `${abilityLabel(a)}`, formula: a.against.dice });
      if (a.against.enhancement) {
        out.attack.push({ label: abilityLabel(a), value: a.against.enhancement });
        out.damage.push({ label: abilityLabel(a), value: a.against.enhancement });
      }
    }
    if (a.blast) out.blast = { label: abilityLabel(a), type: a.choice || "" };
    if (a.keen) out.keen = true;
    if (a.distance) out.distance = true;
    if (a.hint) out.hints.push(a.hint);
  }
  return out;
}

/** A keen weapon's threat range, doubled: 20 → 19–20, 19–20 → 17–20, 18–20 → 15–20. */
export const keenThreat = (threat) => 21 - 2 * (21 - threat);

/** An energy blast's dice on a critical: 1d10 at ×2, 2d10 at ×3, 3d10 at ×4. */
export const blastDice = (multiplier, type) => `${Math.max(1, multiplier - 1)}d10${type ? `[${type}]` : ""}`;

/** What armor's abilities give, as `[key, value]` bonuses (rules/effects.mjs keys), and the notes for the table. */
export function armorAbilities(system) {
  const list = abilitiesOf("armor", system);
  return { changes: list.flatMap((a) => a.changes ?? []), notes: list.filter((a) => a.note).map((a) => a.note) };
}
