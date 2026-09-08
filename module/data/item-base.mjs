const fields = foundry.data.fields;

export const int = (initial = 0, opts = {}) =>
  new fields.NumberField({ required: true, integer: true, initial, ...opts });

/** Fields every item carries, including the OGL attribution for scraped content. */
export class Modern20ItemBase extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      source: new fields.StringField({ initial: "" }),
      srdUrl: new fields.StringField({ initial: "" })
    };
  }
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
