import { Modern20ActorBase, attributeFields, int } from "./actor-base.mjs";

const fields = foundry.data.fields;

/** A creature stat block from the SRD Creatures chapter. */
export class Modern20Creature extends Modern20ActorBase {
  /** Field labels and hints come from lang/en.json under these prefixes. */
  static LOCALIZATION_PREFIXES = ["MODERN20.Actor.Creature"];

  static defineSchema() {
    const base = super.defineSchema();
    return {
      ...base,
      details: new fields.SchemaField({
        creatureType: new fields.StringField({ initial: "" }),
        subtype: new fields.StringField({ initial: "" }),
        challengeRating: new fields.StringField({ initial: "1" }),
        hitDice: new fields.StringField({ initial: "1d8" }),
        advancement: new fields.StringField({ initial: "" }),
        organization: new fields.StringField({ initial: "" }),
        treasure: new fields.StringField({ initial: "" })
      }),
      // Fresh field instances: a DataField cannot be shared between schemas.
      attributes: new fields.SchemaField({
        ...attributeFields(),
        reach: int(5),
        space: int(5)
      }),
      senses: new fields.StringField({ initial: "" }),
      specialQualities: new fields.StringField({ initial: "" })
    };
  }
}
