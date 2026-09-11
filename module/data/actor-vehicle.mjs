import { MODERN20 } from "../config.mjs";

const fields = foundry.data.fields;
const int = (initial = 0, opts = {}) =>
  new fields.NumberField({ required: true, integer: true, initial, ...opts });

/** A vehicle. Vehicles have no abilities or saves, so this does not extend the actor base. */
export class Modern20Vehicle extends foundry.abstract.TypeDataModel {
  /** Field labels and hints come from lang/en.json under these prefixes. */
  static LOCALIZATION_PREFIXES = ["MODERN20.Actor.Vehicle"];

  static defineSchema() {
    return {
      crew: int(1, { min: 0 }),
      passengers: int(0, { min: 0 }),
      cargo: new fields.StringField({ initial: "" }),
      initiative: int(0),
      maneuver: int(0),
      topSpeed: new fields.StringField({ initial: "" }),
      defense: int(10),
      hardness: int(0, { min: 0 }),
      hp: new fields.SchemaField({ value: int(30), max: int(30) }),
      size: new fields.StringField({
        required: true,
        initial: "large",
        choices: Object.keys(MODERN20.sizes)
      }),
      purchaseDC: int(0),
      restriction: new fields.StringField({
        initial: "none",
        choices: Object.keys(MODERN20.restrictions)
      }),
      description: new fields.HTMLField({ initial: "" }),
      // Shipped in the compendium since vehicles were imported, and dropped
      // on the way in for want of a field to land in.
      source: new fields.StringField({ initial: "" }),
      srdUrl: new fields.StringField({ initial: "" }),
      // The page of the rules compendium this is printed on.
      rulesPage: new fields.StringField({ initial: "" })
    };
  }
}
