import { MODERN20 } from "../config.mjs";
import { setting } from "../settings.mjs";

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
    // A flat modifier on attack rolls, which several conditions impose.
    attackMisc: int(0),
    size: new fields.StringField({
      required: true,
      initial: "medium",
      choices: Object.keys(MODERN20.sizes)
    }),
    speed: int(30),
    // How far this actor can strike in melee. Five feet for anything
    // Medium-sized; a creature's stat block may say otherwise.
    reach: int(5, { min: 0 }),
    initiative: new fields.SchemaField({ misc: int(0) }),
    /**
     * "Damage reduction 15/silver": the amount every hit is reduced by, and
     * what gets through it undiminished. The bypass was scraped from every
     * stat block that prints one and then dropped, so a silver bullet was
     * stopped by the werewolf it was bought for.
     */
    damageReduction: new fields.SchemaField({
      value: int(0),
      bypass: new fields.StringField({ initial: "" })
    }),
    // What this actor ignores, by damage type. The SRD prints these on a
    // creature; nothing stops a hero acquiring one.
    resistances: new fields.ArrayField(
      new fields.SchemaField({
        type: new fields.StringField({ required: true, blank: false }),
        value: int(0, { min: 0 })
      }),
      { initial: [] }
    ),
    immunities: new fields.ArrayField(new fields.StringField({ blank: false }), { initial: [] }),
    // "It takes 50% more damage from fire attacks."
    vulnerabilities: new fields.ArrayField(
      new fields.StringField({ blank: false }), { initial: [] }
    ),
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

  /**
   * Damage reduction was a bare number before it could say what bypasses it.
   * An actor stored by an earlier version still holds one, and a schema that
   * expects an object reads it as zero — a werewolf silently losing its 15.
   */
  static migrateData(source) {
    const reduction = source.attributes?.damageReduction;
    if (typeof reduction === "number") {
      source.attributes.damageReduction = { value: reduction, bypass: "" };
    }
    return super.migrateData(source);
  }

  static defineSchema() {
    return {
      abilities: new fields.SchemaField(
        Object.fromEntries(Object.keys(MODERN20.abilities).map((k) => [k, abilityField()]))
      ),

      hp: new fields.SchemaField({
        value: int(6),
        max: int(6),
        temp: int(0),
        // Tracked separately from hit points. The SRD says what deals
        // nonlethal damage and what is immune to it, but never states how it
        // accumulates, so this is recorded and surfaced rather than enforced.
        nonlethal: int(0, { min: 0 }),
        formula: new fields.StringField({ initial: "" })
      }),

      // Defense replaces armor class: a class-granted bonus plus Dex, equipment
      // and size. Equipment bonus is derived from worn armor, never stored.
      defense: new fields.SchemaField({
        classBonus: int(0),
        naturalArmor: int(0),
        misc: int(0),
        // Set by conditions that say a character "loses his or her Dexterity
        // bonus to Defense" — flat-footed, cowering, stunned, pinned.
        loseDex: new fields.BooleanField({ initial: false })
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

      /**
       * Casting, for anyone who does any.
       *
       * The SRD sets caster level from levels in the casting class, which the
       * FX classes are not in the imported set, so this defaults to character
       * level and is overridable — which is also how a creature's "caster
       * level 10th" is recorded.
       */
      spellcasting: new fields.SchemaField({
        casterLevelOverride: new fields.NumberField({
          required: false, nullable: true, integer: true, initial: null, min: 0
        })
      }),

      /**
       * What this turn's actions have been spent on.
       *
       * "A round is an opportunity for each character involved in a combat to
       * take an action." Reset when the turn comes round again, and shown
       * rather than enforced — see module/apps/actions.mjs.
       */
      turn: new fields.SchemaField({
        attack: int(0, { min: 0 }),
        move: int(0, { min: 0 }),
        fiveFootStep: int(0, { min: 0 }),
        stance: new fields.StringField({ initial: "" })
      }),

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

    this.#prepareEncumbrance();

    this.attributes.initiative.value =
      this.abilities.dex.mod + this.attributes.initiative.misc;

    this.attributes.massiveDamage =
      this.attributes.massiveDamageThreshold ?? this.abilities.con.total;

    const grapple = MODERN20.sizes[this.attributes.size]?.grapple ?? 0;
    this.attributes.grapple = this.attributes.baseAttack + this.abilities.str.mod + grapple;

    this.#prepareTurn();

    this.spellcasting.casterLevel =
      this.spellcasting.casterLevelOverride ?? this.defaultCasterLevel;
  }

  /**
   * Caster level when nothing overrides it. Subtypes that know their own level
   * say so; the base is a single level, which is what an unlevelled sheet is.
   */
  get defaultCasterLevel() {
    return this.details?.level ?? 1;
  }

  /**
   * What is left of this turn.
   *
   * A turn buys one attack action and one move action, or one full-round
   * action in place of both, plus a 5-foot step. Free actions cost nothing and
   * are not counted.
   */
  #prepareTurn() {
    const budget = MODERN20.turnBudget;
    this.turn.remaining = Object.fromEntries(
      Object.entries(budget).map(([pool, total]) =>
        [pool, Math.max(0, total - (this.turn[pool] ?? 0))])
    );
    this.turn.used = Object.keys(budget)
      .reduce((total, pool) => total + (this.turn[pool] ?? 0), 0);
    this.turn.any = this.turn.used > 0 || Boolean(this.turn.stance);
  }

  /**
   * Total carried weight, the resulting load, and the speed it allows.
   *
   * The SRD counts "everything a character is wearing or carrying", so this
   * sums all items rather than only equipped ones. Speed is reduced to the
   * value the table gives, never raised, and never below the reduced figure a
   * character is already at for another reason.
   */
  #prepareEncumbrance() {
    const items = this.parent?.items ?? [];
    const carried = items.reduce((total, item) => {
      const weight = item.system?.weight ?? 0;
      const quantity = item.system?.quantity ?? 1;
      return total + weight * quantity;
    }, 0);

    const strength = Math.max(1, this.abilities.str.total);
    const table = MODERN20.carrying.loads;
    // Beyond the table's last entry the SRD's own figures stop; hold there
    // rather than inventing a formula.
    const key = table[strength] ? strength : Math.max(...Object.keys(table).map(Number));
    const limits = table[key];

    let level = "light";
    if (carried > limits.heavy) level = "over";
    else if (carried > limits.medium) level = "heavy";
    else if (carried > limits.light) level = "medium";

    const base = this.attributes.speed;
    let speed = base;
    // The load is always shown; whether it slows the character is the table's
    // call, since carrying capacity is one of the rules groups most often drop.
    if (setting("encumbranceSpeed")) {
      if (level === "medium") speed = MODERN20.carrying.mediumSpeed[base] ?? base;
      else if (level === "heavy") speed = MODERN20.carrying.heavySpeed[base] ?? base;
      else if (level === "over") speed = 0;
    }

    this.attributes.encumbrance = {
      carried: Math.round(carried * 10) / 10,
      limits,
      level,
      label: MODERN20.loadLevels[level],
      speed: Math.min(base, speed)
    };
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
    if (this.defense.loseDex) return 0;
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

  /**
   * Which item made each skill a class skill, keyed by skill id.
   *
   * Kept as names rather than a boolean so the sheet can answer "why is this a
   * class skill" — a character with several classes and an occupation has no
   * other way to tell where a grant came from.
   */
  get classSkillSources() {
    const sources = {};
    const add = (key, name) => {
      sources[key] ??= [];
      if (!sources[key].includes(name)) sources[key].push(name);
    };

    for (const item of this.parent?.items ?? []) {
      if (item.type === "class") {
        for (const grant of item.system.classSkills ?? []) {
          add(this.constructor.skillKey(grant.skill, grant.specialty), item.name);
        }
      } else if (item.type === "occupation") {
        // Stored as "skill" or "skill:Subject".
        for (const entry of item.system.skillsChosen ?? []) add(entry, item.name);
      }
    }
    return sources;
  }

  /** The key a grant is recorded under: "knowledge" or "knowledge:Streetwise". */
  static skillKey(skill, specialty = "") {
    return specialty ? `${skill}:${specialty}` : skill;
  }

  #prepareSkills() {
    const sources = this.classSkillSources;
    for (const [key, cfg] of Object.entries(MODERN20.skills)) {
      const skill = this.skills[key];
      // Derived, so removing a class removes what it granted.
      skill.sources = sources[key] ?? [];
      skill.grantedByClass = skill.sources.length > 0;
      skill.sourceLabel = skill.sources.join(", ");
      skill.classSkill = skill.classSkill || skill.grantedByClass;
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
        // A subject inherits a grant of the whole skill, and can also be
        // granted on its own: Strong Hero grants Knowledge (Tactics) only.
        const own = sources[`${key}:${specialty.name}`] ?? [];
        specialty.sources = [...new Set([...skill.sources, ...own])];
        specialty.grantedByClass = specialty.sources.length > 0;
        specialty.sourceLabel = specialty.sources.join(", ");
        specialty.classSkill = specialty.classSkill || skill.grantedByClass;
        specialty.total = totalOf(specialty);
        specialty.usable = !cfg.trainedOnly || specialty.ranks > 0;
      }
    }
  }
}

export { abilityField, skillField, skillEntryField, attributeFields, int };
