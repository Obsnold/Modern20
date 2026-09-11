import { CREATURE_TYPES } from "../creature-types.mjs";
import { creatureType } from "../apps/creature-types.mjs";
import { Modern20ActorBase, attributeFields } from "./actor-base.mjs";

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
        // What the creature fills, in feet, from the stat block's own FS/Reach
        // line. Not an integer: a Tiny creature occupies two and a half feet
        // and a Fine one six inches, and rounding those to whole feet is how
        // every creature ended up on a one-square token.
        space: new fields.NumberField({ required: true, initial: 5, min: 0 })
      }),
      senses: new fields.StringField({ initial: "" }),
      specialQualities: new fields.StringField({ initial: "" })
    };
  }

  /**
   * Normalise a creature type written as free text.
   *
   * The field was a text input before the fifteen types were imported, so a
   * creature made or edited then holds whatever was typed — and the compendium
   * held stat-block phrasing like "elemental (air)". Anything that resolves
   * becomes the type's id so the picker can show it; anything that does not is
   * left exactly as it was rather than being guessed at.
   */
  static migrateData(source) {
    const written = source.details?.creatureType;
    if (written && !CREATURE_TYPES[written]) {
      const resolved = creatureType(written);
      if (resolved) {
        source.details.creatureType = resolved.id;
        if (!source.details.subtype) {
          source.details.subtype = String(written).match(/\(([^)]*)\)/)?.[1]?.trim() ?? "";
        }
      }
    }
    return super.migrateData(source);
  }

  /**
   * "Manifester level 10th" is printed in the stat block and belongs in the
   * override; without one a creature casts at its Hit Dice, which is the
   * SRD's default for a creature's spell-like abilities.
   */
  get defaultCasterLevel() {
    return Number(String(this.details.hitDice ?? "").match(/^\s*(\d+)/)?.[1]) || 1;
  }
}
