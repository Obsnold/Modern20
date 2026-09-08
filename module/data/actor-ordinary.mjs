import { Modern20ActorBase, int } from "./actor-base.mjs";

const fields = foundry.data.fields;

/** An ordinary: an NPC built on ordinary levels, with no talents or action points. */
export class Modern20Ordinary extends Modern20ActorBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      details: new fields.SchemaField({
        level: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1 }),
        occupation: new fields.StringField({ initial: "" }),
        challengeRating: new fields.StringField({ initial: "1/2" })
      }),
      wealth: new fields.SchemaField({ bonus: int(0) }),
      reputation: new fields.SchemaField({ base: int(0), misc: int(0) })
    };
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    this.reputation.value = this.reputation.base + this.reputation.misc;
  }
}
