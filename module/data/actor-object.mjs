import { MODERN20 } from "../config.mjs";
import { OBJECT_DEFENSE, OBJECT_DEFAULTS, SUBSTANCES } from "../object-data.mjs";

const fields = foundry.data.fields;
const int = (initial = 0, opts = {}) =>
  new fields.NumberField({ required: true, integer: true, initial, ...opts });

/**
 * A door, a chain, a cinderblock wall.
 *
 * The SRD gives objects a stat block of their own — a Defense by size, a
 * hardness subtracted from every hit, hit points by substance or by size, and
 * a break DC for forcing them rather than destroying them — and a GM has
 * nowhere to put one. This is that stat block, so a door can be dropped on
 * the canvas and shot at like anything else.
 *
 * Like a vehicle, an object has no abilities, saves or skills, so it does not
 * extend the actor base: "unattended objects never make saving throws".
 */
export class Modern20Object extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["MODERN20.Actor.Object"];

  static defineSchema() {
    return {
      size: new fields.StringField({
        required: true,
        initial: "medium",
        choices: Object.keys(MODERN20.sizes)
      }),
      // What it is made of, keyed to the SRD's substance table. Blank where
      // the object is one the SRD names outright, which prints its own
      // hardness and hit points instead.
      substance: new fields.StringField({ initial: "" }),
      // Inches, since the SRD gives a substance's hit points as a rate:
      // "10/inch of thickness".
      thickness: new fields.NumberField({ required: true, initial: 0, min: 0 }),
      hardness: int(0, { min: 0 }),
      hp: new fields.SchemaField({ value: int(5, { min: 0 }), max: int(5, { min: 0 }) }),
      // "When a character tries to break something with sudden force rather
      // than by dealing damage, use a Strength check."
      breakDC: int(0, { min: 0 }),
      // An object's Defense comes from its size; this is for the GM who wants
      // it somewhere else.
      defenseMisc: int(0),
      description: new fields.HTMLField({ initial: "" }),
      source: new fields.StringField({ initial: "" }),
      srdUrl: new fields.StringField({ initial: "" }),
      // The page of the rules compendium this is printed on.
      rulesPage: new fields.StringField({ initial: "" })
    };
  }

  prepareDerivedData() {
    const printed = OBJECT_DEFENSE[this.size]?.defense ?? 5;
    this.defense = printed + this.defenseMisc;

    // "If an object has lost half or more of its hit points, the DC to break
    // it decreases by 2." Held apart from the printed DC so the sheet can
    // show both the object's own number and the one that applies now.
    const damaged = this.hp.max > 0 && this.hp.value <= this.hp.max / 2;
    this.currentBreakDC = Math.max(0, this.breakDC - (damaged ? 2 : 0));
    this.damaged = damaged;

    // What the substance would give, for an object the SRD does not name.
    const substance = SUBSTANCES[this.substance];
    this.suggested = {
      hardness: substance?.hardness ?? OBJECT_DEFAULTS[this.size]?.hardness ?? 0,
      hitPoints: substance && this.thickness
        ? Math.round(substance.hitPointsPerInch * this.thickness)
        : OBJECT_DEFAULTS[this.size]?.hitPoints ?? 0,
      breakDC: OBJECT_DEFAULTS[this.size]?.breakDC ?? 0
    };
  }
}
