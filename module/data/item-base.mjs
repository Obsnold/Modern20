const fields = foundry.data.fields;

export const int = (initial = 0, opts = {}) =>
  new fields.NumberField({ required: true, integer: true, initial, ...opts });

/** Fields every item carries, including the OGL attribution for scraped content. */
export class Modern20ItemBase extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      source: new fields.StringField({ initial: "" }),
      srdUrl: new fields.StringField({ initial: "" }),
      // Every item type can carry activities, so a magic gadget or a piece of
      // gear can act without needing a new document type.
      activities: new fields.ArrayField(activityField(), { initial: [] })
    };
  }
}

/**
 * One thing an item can do.
 *
 * An item is not a single action: a firearm shoots, autofires and bursts; a
 * grenade damages an area and allows a save; a magic item might do something
 * unrelated to either. Modelling each as an activity means a new kind of item
 * adds an activity rather than a branch in the attack code.
 *
 * Activities are generated for compendium weapons from their rate of fire, and
 * authored by hand for anything else.
 */
export function activityField() {
  return new fields.SchemaField({
    id: new fields.StringField({ required: true, blank: false }),
    type: new fields.StringField({
      required: true,
      initial: "attack",
      choices: ["attack", "damage", "save", "heal", "utility"]
    }),
    name: new fields.StringField({ initial: "" }),

    attack: new fields.SchemaField({
      // Blank means "decide from the weapon": Strength in melee, Dexterity at
      // range, which is what the SRD's two attack bonus formulas say.
      ability: new fields.StringField({ initial: "" }),
      bonus: int(0),
      // Autofire rolls against the area rather than a creature.
      defenseOverride: new fields.NumberField({
        required: false, nullable: true, integer: true, initial: null
      }),
      usesRange: new fields.BooleanField({ initial: true })
    }),

    damage: new fields.SchemaField({
      // Blank means the weapon's own damage.
      formula: new fields.StringField({ initial: "" }),
      type: new fields.StringField({ initial: "" }),
      // Burst fire deals "+2 dice of damage" - more of the weapon's own die.
      extraDice: int(0),
      addAbility: new fields.BooleanField({ initial: true })
    }),

    save: new fields.SchemaField({
      ability: new fields.StringField({ initial: "" }),
      dc: int(0),
      onSuccess: new fields.StringField({ initial: "half" })
    }),

    area: new fields.SchemaField({
      shape: new fields.StringField({ initial: "" }),
      size: int(0)
    }),

    consume: new fields.SchemaField({
      ammo: int(0),
      actionPoints: int(0),
      quantity: int(0)
    }),

    // Shown on the button and the card, e.g. why a mode is unavailable.
    requiresFeat: new fields.StringField({ initial: "" }),
    requiresAmmo: int(0),
    note: new fields.StringField({ initial: "" })
  });
}

/**
 * Anything you can buy. Modern gear has no price in currency: it has a
 * purchase DC rolled against your Wealth bonus, and a legal restriction rating.
 */
export function purchasableFields() {
  return {
    purchaseDC: int(0),
    restriction: new fields.StringField({ initial: "none" }),
    weight: new fields.NumberField({ required: true, initial: 0, min: 0 }),
    quantity: new fields.NumberField({ required: true, integer: true, initial: 1, min: 0 }),
    equipped: new fields.BooleanField({ initial: false })
  };
}

/** Free-text prerequisites. Checked for display only, never enforced. */
export function prerequisiteField() {
  return new fields.ArrayField(new fields.StringField({ blank: false }), { initial: [] });
}
