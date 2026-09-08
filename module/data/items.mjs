import { MODERN20 } from "../config.mjs";
import { Modern20ItemBase, purchasableFields, prerequisiteField, int } from "./item-base.mjs";

const fields = foundry.data.fields;

/**
 * A basic, advanced or prestige class. Per-level progression lives in `levels`
 * so the class item is the single source of truth for BAB, saves, Defense and
 * Reputation, and the actor just sums what it has.
 */
export class Modern20Class extends Modern20ItemBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      tier: new fields.StringField({
        required: true,
        initial: "basic",
        choices: Object.keys(MODERN20.classTiers)
      }),
      levels: new fields.NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      keyAbility: new fields.StringField({ initial: "" }),
      hitDie: new fields.StringField({ initial: "d8" }),
      skillPointsPerLevel: int(3, { min: 0 }),
      classSkills: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      prerequisites: prerequisiteField(),
      // One entry per class level, in order.
      progression: new fields.ArrayField(
        new fields.SchemaField({
          level: int(1, { min: 1 }),
          baseAttack: int(0),
          fort: int(0),
          ref: int(0),
          will: int(0),
          defense: int(0),
          reputation: int(0),
          features: new fields.ArrayField(new fields.StringField(), { initial: [] })
        }),
        { initial: [] }
      )
    };
  }

  /** Cumulative bonuses at the number of levels the character actually has. */
  get bonusesAtLevel() {
    const row = this.progression.find((r) => r.level === this.levels);
    return row ?? { baseAttack: 0, fort: 0, ref: 0, will: 0, defense: 0, reputation: 0 };
  }
}

/** A starting occupation: skill bonuses, a bonus feat and a Wealth bump. */
export class Modern20Occupation extends Modern20ItemBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      prerequisites: prerequisiteField(),
      // Occupations grant a choice from a list, so store both the options and the pick.
      skillOptions: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      skillsChosen: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      bonusFeatOptions: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      bonusFeatChosen: new fields.StringField({ initial: "" }),
      wealthBonus: int(0),
      reputationBonus: int(0)
    };
  }
}

/** A talent from one of a basic class's talent trees. */
export class Modern20Talent extends Modern20ItemBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      tree: new fields.StringField({ initial: "" }),
      sourceClass: new fields.StringField({ initial: "" }),
      prerequisites: prerequisiteField()
    };
  }
}

export class Modern20Feat extends Modern20ItemBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      featType: new fields.StringField({
        required: true,
        initial: "general",
        choices: Object.keys(MODERN20.featTypes)
      }),
      prerequisites: prerequisiteField(),
      benefit: new fields.HTMLField({ initial: "" }),
      normal: new fields.HTMLField({ initial: "" }),
      special: new fields.HTMLField({ initial: "" }),
      repeatable: new fields.BooleanField({ initial: false })
    };
  }
}

export class Modern20Weapon extends Modern20ItemBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      ...purchasableFields(),
      category: new fields.StringField({
        initial: "simple",
        choices: Object.keys(MODERN20.weaponCategories)
      }),
      damage: new fields.StringField({ initial: "1d4" }),
      damageType: new fields.StringField({ initial: "ballistic" }),
      critical: new fields.StringField({ initial: "20" }),
      // Firearms use a range increment; melee weapons leave this at 0.
      rangeIncrement: int(0, { min: 0 }),
      rateOfFire: new fields.StringField({ initial: "" }),
      magazine: new fields.StringField({ initial: "" }),
      ammo: new fields.SchemaField({ value: int(0, { min: 0 }), max: int(0, { min: 0 }) }),
      size: new fields.StringField({ initial: "medium" }),
      // Attacks add Dex instead of Str when the weapon is ranged.
      ranged: new fields.BooleanField({ initial: false }),
      attackBonus: int(0),
      damageBonus: int(0)
    };
  }
}

export class Modern20Armor extends Modern20ItemBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      ...purchasableFields(),
      armorType: new fields.StringField({
        initial: "light",
        choices: Object.keys(MODERN20.armorTypes)
      }),
      equipmentBonus: int(0),
      // Null means the armor imposes no cap on the Dex bonus to Defense.
      maxDex: new fields.NumberField({
        required: false, nullable: true, integer: true, initial: null
      }),
      armorPenalty: int(0),
      speedPenalty: new fields.StringField({ initial: "" }),
      proficiency: new fields.StringField({ initial: "light" })
    };
  }
}

export class Modern20Gear extends Modern20ItemBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      ...purchasableFields(),
      category: new fields.StringField({ initial: "general" })
    };
  }
}

export class Modern20VehicleMod extends Modern20ItemBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      ...purchasableFields(),
      slot: new fields.StringField({ initial: "" }),
      effect: new fields.StringField({ initial: "" })
    };
  }
}

/** Arcane spells from the FX chapter. */
export class Modern20Spell extends Modern20ItemBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      level: int(0, { min: 0 }),
      school: new fields.StringField({ initial: "" }),
      subschool: new fields.StringField({ initial: "" }),
      components: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      castingTime: new fields.StringField({ initial: "1 standard action" }),
      range: new fields.StringField({ initial: "" }),
      area: new fields.StringField({ initial: "" }),
      target: new fields.StringField({ initial: "" }),
      duration: new fields.StringField({ initial: "" }),
      savingThrow: new fields.StringField({ initial: "" }),
      spellResistance: new fields.StringField({ initial: "" }),
      prepared: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
    };
  }
}

/** Psionic powers, kept separate from spells so a non-FX game can ignore both. */
export class Modern20PsiPower extends Modern20ItemBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      level: int(0, { min: 0 }),
      display: new fields.StringField({ initial: "" }),
      powerPoints: int(1, { min: 0 }),
      castingTime: new fields.StringField({ initial: "1 standard action" }),
      range: new fields.StringField({ initial: "" }),
      target: new fields.StringField({ initial: "" }),
      duration: new fields.StringField({ initial: "" }),
      savingThrow: new fields.StringField({ initial: "" })
    };
  }
}
