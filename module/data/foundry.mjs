/**
 * The data models as Foundry classes: one TypeDataModel per item and actor
 * type, its schema built from the descriptions in models.mjs.
 */
import { toSchema } from "./schema.mjs";
import { ITEM_MODELS, ACTOR_MODELS, ABILITIES, abilityModifier } from "./models.mjs";
import { deriveCharacter } from "../rules/character.mjs";
import { migrateLanguages } from "../rules/languages.mjs";
import { atSpeed, vehicleState } from "../rules/vehicles.mjs";

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

/**
 * A character: abilities, hit points and skill ranks stored; everything else
 * (level, BAB, saves, Defense, skill totals) worked out from the items it owns,
 * each time it is prepared.
 */
class CharacterData extends model("CharacterData", ACTOR_MODELS.character) {
  /** A character saved before the language skills had a language each: its languages bought with ranks, as those skills' specialties. */
  static migrateData(source) {
    return super.migrateData(migrateLanguages(source));
  }

  prepareDerivedData() {
    // Each item with its active effects, for the system's own (Custom) changes they carry; the character's
    // own effects come along too, for a Custom change made on the sheet. Foundry has applied the rest.
    const active = (effects) => [...(effects ?? [])].filter((e) => e.active ?? !e.disabled).map((e) => ({ name: e.name, changes: e.changes ?? [], disabled: false, transfer: e.transfer }));
    // A feat or talent granted outside a level (module/levelup.mjs) does not count against what the levels allow.
    const items = this.parent?.items?.map((i) => ({ id: i.id, sort: i.sort, type: i.type, name: i.name, system: i.system, effects: active(i.effects).filter((e) => e.transfer), granted: !!i.flags?.modern20?.grantNote })) ?? [];
    items.push({ type: "actor", name: this.parent?.name ?? "", system: {}, effects: active(this.parent?.effects) });
    this.derived = deriveCharacter(this, items);
    // Not stored: the maximum beside the current value, so a token bar on "hp" has both.
    this.hp.max = this.derived.hitPoints.max;
  }
}

/** A vehicle: its statistics as printed, and what its hit points and speed make of them now (rules/vehicles.mjs). */
class VehicleData extends model("VehicleData", ACTOR_MODELS.vehicle) {
  prepareDerivedData() {
    // Not stored: current hit points (an empty value is its full total), its condition, and its Defense at its speed.
    const value = this.hp.value ?? this.hp.max;
    const speed = atSpeed(this.defense, this.speed);
    this.derived = { hp: value, state: vehicleState(value, this.hp.max), defense: speed.defense, check: speed.check, speedLabel: speed.label };
  }
}

/** Register every model with Foundry; called from the init hook. */
export function registerModels() {
  for (const [type, fields] of Object.entries(ITEM_MODELS)) {
    CONFIG.Item.dataModels[type] = model(`${type[0].toUpperCase()}${type.slice(1)}Data`, fields);
  }
  CONFIG.Actor.dataModels.creature = CreatureData;
  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Actor.dataModels.vehicle = VehicleData;
}
