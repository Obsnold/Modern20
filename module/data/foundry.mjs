/**
 * The data models as Foundry classes: one TypeDataModel per item and actor
 * type, its schema built from the descriptions in models.mjs.
 */
import { toSchema } from "./schema.mjs";
import { ITEM_MODELS, ACTOR_MODELS, ABILITIES, abilityModifier } from "./models.mjs";

/** A TypeDataModel class whose schema is `fields`. */
function model(name, fields) {
  const cls = class extends foundry.abstract.TypeDataModel {
    static defineSchema() {
      return toSchema(fields);
    }
  };
  Object.defineProperty(cls, "name", { value: name });
  return cls;
}

/** A creature: its stat block as printed, with the values worked out from it. */
class CreatureData extends model("CreatureData", ACTOR_MODELS.creature) {
  prepareDerivedData() {
    // Not stored: worked out from the scores each time the actor is prepared.
    this.modifiers = Object.fromEntries(ABILITIES.map((a) => [a, abilityModifier(this.abilities[a])]));
  }
}

/** Register every model with Foundry; called from the init hook. */
export function registerModels() {
  for (const [type, fields] of Object.entries(ITEM_MODELS)) {
    CONFIG.Item.dataModels[type] = model(`${type[0].toUpperCase()}${type.slice(1)}Data`, fields);
  }
  CONFIG.Actor.dataModels.creature = CreatureData;
}
