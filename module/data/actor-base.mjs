import { MODERN20 } from "../config.mjs";

const fields = foundry.data.fields;

const int = (initial = 0, opts = {}) =>
  new fields.NumberField({ required: true, integer: true, initial, ...opts });

/** An ability score plus the temporary modifier that damage/drain and effects target. */
function abilityField() {
  return new fields.SchemaField({
    value: int(10, { min: 0 }),
    tempMod: int(0),
    damage: int(0, { min: 0 })
  });
}

/**
 * Ranks are stored; totals are always derived. Storing a total would make
 * level-up and ability changes impossible to recompute correctly.
 */
function skillEntryField() {
  return new fields.SchemaField({
    ranks: new fields.NumberField({ required: true, initial: 0, min: 0 }),
    misc: int(0),
    classSkill: new fields.BooleanField({ initial: false })
  });
}

function skillField() {
  return new fields.SchemaField({
    ranks: new fields.NumberField({ required: true, initial: 0, min: 0 }),
    misc: int(0),
    classSkill: new fields.BooleanField({ initial: false }),
    specialties: new fields.ArrayField(
      new fields.SchemaField({
        name: new fields.StringField({ required: true, blank: false }),
        ranks: new fields.NumberField({ required: true, initial: 0, min: 0 }),
        misc: int(0),
        classSkill: new fields.BooleanField({ initial: false })
      }),
      { initial: [] }
    )
  });
}

/**
 * Fresh attribute fields.
 *
 * A factory rather than a shared object: a DataField instance belongs to
 * exactly one parent schema, and Foundry throws "already belongs to some other
 * parent and may not be reused" if a subclass spreads another schema's field
 * instances into its own. Subtypes that extend `attributes` call this to get
 * their own instances.
 */
function attributeFields() {
  return {
    baseAttack: int(0),
    size: new fields.StringField({
      required: true,
      initial: "medium",
      choices: Object.keys(MODERN20.sizes)
    }),
    speed: int(30),
    initiative: new fields.SchemaField({ misc: int(0) }),
    damageReduction: int(0),
    // Blank means "use the Constitution score", which is the default rule.
    massiveDamageThreshold: new fields.NumberField({
      required: false, nullable: true, integer: true, initial: null
    })
  };
}

/**
 * Everything with hit points, abilities and Defense. `hero`, `ordinary` and
 * `creature` all extend this; `vehicle` does not.
 */
export class Modern20ActorBase extends foundry.abstract.TypeDataModel {

  static defineSchema() {
    return {
      abilities: new fields.SchemaField(
        Object.fromEntries(Object.keys(MODERN20.abilities).map((k) => [k, abilityField()]))
      ),

      hp: new fields.SchemaField({
        value: int(6),
        max: int(6),
        temp: int(0),
        formula: new fields.StringField({ initial: "" })
      }),

      // Defense replaces armor class: a class-granted bonus plus Dex, equipment
      // and size. Equipment bonus is derived from worn armor, never stored.
      defense: new fields.SchemaField({
        classBonus: int(0),
        naturalArmor: int(0),
        misc: int(0)
      }),

      saves: new fields.SchemaField(
        Object.fromEntries(
          Object.keys(MODERN20.saves).map((k) => [
            k,
            new fields.SchemaField({ base: int(0), misc: int(0) })
          ])
        )
      ),

      attributes: new fields.SchemaField(attributeFields()),

      skills: new fields.SchemaField(
        Object.fromEntries(Object.keys(MODERN20.skills).map((k) => [k, skillField()]))
      ),

      allegiances: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField({ required: true, blank: false }),
          strength: new fields.StringField({
            initial: "none",
            choices: Object.keys(MODERN20.allegianceStrength)
          })
        }),
        { initial: [] }
      ),

      biography: new fields.HTMLField({ initial: "" })
    };
  }

  /** Ability modifiers must exist before anything that reads them. */
  prepareBaseData() {
    for (const ability of Object.values(this.abilities)) {
      ability.total = ability.value + ability.tempMod - ability.damage;
      ability.mod = Math.floor((ability.total - 10) / 2);
    }
    // Overwritten in prepareDerivedData once equipped armor is known.
    this.defense.equipment = 0;
    this.attributes.armorCheckPenalty = 0;
    this.attributes.maxDex = null;
  }

  prepareDerivedData() {
    this.#prepareEquipmentModifiers();
    this.#prepareDefense();
    this.#prepareSaves();
    this.#prepareSkills();

    this.attributes.initiative.value =
      this.abilities.dex.mod + this.attributes.initiative.misc;

    this.attributes.massiveDamage =
      this.attributes.massiveDamageThreshold ?? this.abilities.con.total;

    const grapple = MODERN20.sizes[this.attributes.size]?.grapple ?? 0;
    this.attributes.grapple = this.attributes.baseAttack + this.abilities.str.mod + grapple;
  }

  /** Sum equipped armor into an equipment bonus, max Dex cap and check penalty. */
  #prepareEquipmentModifiers() {
    const worn = this.parent?.items?.filter(
      (i) => i.type === "armor" && i.system.equipped
    ) ?? [];

    let equipment = 0;
    let penalty = 0;
    let maxDex = null;

    for (const armor of worn) {
      equipment += armor.system.equipmentBonus;
      penalty += armor.system.armorPenalty;
      if (armor.system.maxDex !== null) {
        maxDex = maxDex === null ? armor.system.maxDex : Math.min(maxDex, armor.system.maxDex);
      }
    }

    this.defense.equipment = equipment;
    this.attributes.armorCheckPenalty = penalty;
    this.attributes.maxDex = maxDex;
  }

  /** Dex contribution to Defense, capped by armor. */
  get dexToDefense() {
    const dex = this.abilities.dex.mod;
    return this.attributes.maxDex === null ? dex : Math.min(dex, this.attributes.maxDex);
  }

  #prepareDefense() {
    const size = MODERN20.sizes[this.attributes.size]?.mod ?? 0;
    const d = this.defense;
    const common = d.classBonus + d.equipment + d.naturalArmor + d.misc + size;

    d.value = 10 + common + this.dexToDefense;
    // Touch ignores equipment and natural armor; flat-footed loses Dex.
    d.touch = 10 + d.classBonus + d.misc + size + this.dexToDefense;
    d.flatFooted = 10 + common;
  }

  #prepareSaves() {
    for (const [key, cfg] of Object.entries(MODERN20.saves)) {
      const save = this.saves[key];
      save.value = save.base + this.abilities[cfg.ability].mod + save.misc;
    }
  }

  #prepareSkills() {
    for (const [key, cfg] of Object.entries(MODERN20.skills)) {
      const skill = this.skills[key];
      const abilityMod = cfg.ability ? this.abilities[cfg.ability].mod : 0;
      const penalty = cfg.armorCheck ? this.attributes.armorCheckPenalty : 0;

      const totalOf = (entry) => entry.ranks + abilityMod + entry.misc + penalty;

      skill.ability = cfg.ability;
      skill.trainedOnly = cfg.trainedOnly;
      skill.armorCheck = cfg.armorCheck;
      skill.total = totalOf(skill);
      // A trained-only skill cannot be used at all without ranks.
      skill.usable = !cfg.trainedOnly || skill.ranks > 0;

      for (const specialty of skill.specialties) {
        specialty.total = totalOf(specialty);
        specialty.usable = !cfg.trainedOnly || specialty.ranks > 0;
      }
    }
  }
}

export { abilityField, skillField, skillEntryField, attributeFields, int };
