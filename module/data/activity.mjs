const fields = foundry.data.fields;
const int = (initial = 0, opts = {}) =>
  new fields.NumberField({ required: true, integer: true, initial, ...opts });

/**
 * Activities: the things an item can do, as typed sub-documents.
 *
 * Stored as a TypedObjectField of TypedSchemaField, which is Foundry's own
 * machinery for "a union of schema-constrained objects discriminable via a
 * type property", keyed by id. That gives each activity its own validated
 * schema while letting one item hold several of different types — a firearm
 * with three firing modes, a grenade with an area and a save, a magic item
 * with something the attack code has never heard of.
 *
 * New types are registered rather than hard-coded, so a module can add one.
 */

/**
 * The discriminator TypedSchemaField uses to pick a schema.
 *
 * Foundry adds this automatically when a type is declared as a plain schema
 * object, but not when it is a DataModel class — it wraps those in an
 * EmbeddedDataField and then requires the field to be present. Declared here
 * to match the shape Foundry would have generated.
 */
function typeField(type) {
  return new fields.StringField({
    required: true,
    blank: false,
    initial: type,
    validate: (value) => value === type,
    validationError: `must be equal to "${type}"`
  });
}

/** Fields every activity has, whatever it does. */
function baseFields(type) {
  return {
    type: typeField(type),
    name: new fields.StringField({ initial: "" }),
    // FilePathField defaults to nullable with a null initial and blank: false,
    // so an empty string is invalid: "may not be a blank string".
    img: new fields.FilePathField({ categories: ["IMAGE"] }),
    // Shown on the button and explained on the card.
    note: new fields.StringField({ initial: "" }),
    // Gates: a feat the owner must have, and ammunition that must be loaded.
    requiresFeat: new fields.StringField({ initial: "" }),
    requiresAmmo: int(0, { min: 0 }),
    consume: new fields.SchemaField({
      ammo: int(0, { min: 0 }),
      actionPoints: int(0, { min: 0 }),
      quantity: int(0, { min: 0 })
    }),
    area: new fields.SchemaField({
      shape: new fields.StringField({ initial: "" }),
      size: int(0, { min: 0 })
    })
  };
}

/** Damage an activity deals, defaulting to the item's own. */
function damageFields() {
  return {
    damage: new fields.SchemaField({
      // Blank means "use the item's damage".
      formula: new fields.StringField({ initial: "" }),
      type: new fields.StringField({ initial: "" }),
      // Burst fire's "+2 dice of damage": more of the weapon's own die.
      extraDice: int(0),
      addAbility: new fields.BooleanField({ initial: true })
    })
  };
}

/** An attack roll against Defense. */
export class AttackActivity extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      ...baseFields("attack"),
      ...damageFields(),
      attack: new fields.SchemaField({
        // Blank follows the SRD: Strength in melee, Dexterity at range.
        ability: new fields.StringField({ initial: "" }),
        bonus: int(0),
        // Autofire rolls against an area's Defense rather than a creature's.
        defenseOverride: new fields.NumberField({
          required: false, nullable: true, integer: true, initial: null
        }),
        usesRange: new fields.BooleanField({ initial: true })
      })
    };
  }
}

/** A saving throw against a fixed DC, as explosives use. */
export class SaveActivity extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      ...baseFields("save"),
      ...damageFields(),
      save: new fields.SchemaField({
        ability: new fields.StringField({ initial: "ref" }),
        dc: int(10),
        onSuccess: new fields.StringField({ initial: "half", choices: ["half", "negate", "none"] })
      })
    };
  }
}

/** Damage with no roll to hit: a fall, a fire, an explosion already placed. */
export class DamageActivity extends foundry.abstract.DataModel {
  static defineSchema() {
    return { ...baseFields("damage"), ...damageFields() };
  }
}

/** Anything that just happens, described rather than rolled. */
export class UtilityActivity extends foundry.abstract.DataModel {
  static defineSchema() {
    return baseFields("utility");
  }
}

/**
 * The registered activity types.
 *
 * Exposed on CONFIG.MODERN20.activityTypes at init so a module can add its own
 * before any item is prepared.
 */
export const ACTIVITY_TYPES = {
  attack: AttackActivity,
  save: SaveActivity,
  damage: DamageActivity,
  utility: UtilityActivity
};

/**
 * The field an item uses to store its activities: a map of id to a typed
 * activity, each validated against the schema its own type declares.
 */
export function activitiesField() {
  return new fields.TypedObjectField(
    new fields.TypedSchemaField(ACTIVITY_TYPES),
    { initial: {} }
  );
}
