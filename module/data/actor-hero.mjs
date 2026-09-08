import { MODERN20 } from "../config.mjs";
import { Modern20ActorBase, int } from "./actor-base.mjs";

const fields = foundry.data.fields;

/** A player hero: talents, action points, Reputation and a Wealth bonus. */
export class Modern20Hero extends Modern20ActorBase {
  static defineSchema() {
    return {
      ...super.defineSchema(),

      details: new fields.SchemaField({
        xp: int(0, { min: 0 }),
        // Character level is derived from class items; this is the manual
        // override for imported or hand-built sheets.
        levelOverride: new fields.NumberField({
          required: false, nullable: true, integer: true, initial: null, min: 1
        }),
        age: new fields.StringField({ initial: "" }),
        height: new fields.StringField({ initial: "" }),
        weight: new fields.StringField({ initial: "" }),
        occupation: new fields.StringField({ initial: "" })
      }),

      // The Wealth economy: no currency, just a bonus that erodes as you buy.
      wealth: new fields.SchemaField({
        bonus: int(0),
        // Purchases the GM has granted but not yet charged against Wealth.
        pendingPurchases: new fields.NumberField({ required: true, initial: 0, min: 0 })
      }),

      reputation: new fields.SchemaField({
        base: int(0),
        misc: int(0)
      }),

      actionPoints: new fields.SchemaField({
        value: int(5, { min: 0 }),
        // Blank means "compute from character level" per the standard rule.
        maxOverride: new fields.NumberField({
          required: false, nullable: true, integer: true, initial: null
        })
      }),

      skillPoints: new fields.SchemaField({
        spentOverride: new fields.NumberField({
          required: false, nullable: true, integer: true, initial: null
        })
      })
    };
  }

  prepareDerivedData() {
    // Class contributions must land before the base model derives Defense,
    // saves and attack, so this runs ahead of super.prepareDerivedData().
    // Items are already prepared by this point in the document lifecycle.
    const classes = this.parent?.items?.filter((i) => i.type === "class") ?? [];
    this.#applyClassProgression(classes);

    super.prepareDerivedData();

    this.details.classLevels = classes.map((c) => ({
      id: c.id,
      name: c.name,
      tier: c.system.tier,
      levels: c.system.levels
    }));

    const summed = classes.reduce((total, c) => total + c.system.levels, 0);
    this.details.level = this.details.levelOverride ?? Math.max(summed, 1);

    this.actionPoints.max =
      this.actionPoints.maxOverride ??
      MODERN20.actionPoints.startingBase +
        Math.floor(this.details.level * MODERN20.actionPoints.perLevel);

    this.reputation.value = this.reputation.base + this.reputation.misc;

    // Max ranks: level + 3 for a class skill, half that for cross-class.
    this.skillPoints.maxRanks = this.details.level + 3;
    this.skillPoints.maxCrossClassRanks = this.skillPoints.maxRanks / 2;
    this.skillPoints.spent =
      this.skillPoints.spentOverride ?? this.#countSpentSkillPoints();

    this.#flagOverspentSkills();
  }

  /**
   * Fold every class item's progression row into the actor's base numbers.
   * The stored fields stay the character's manual adjustments; class bonuses
   * are re-added from the class items on every data preparation pass, so
   * deleting a class item cleanly removes what it granted.
   */
  #applyClassProgression(classes) {
    let attack = 0;
    let fort = 0;
    let ref = 0;
    let will = 0;
    let defense = 0;
    let reputation = 0;

    for (const cls of classes) {
      const row = cls.system.bonusesAtLevel;
      attack += row.baseAttack;
      fort += row.fort;
      ref += row.ref;
      will += row.will;
      defense += row.defense;
      reputation += row.reputation;
    }

    this.attributes.baseAttack += attack;
    this.saves.fort.base += fort;
    this.saves.ref.base += ref;
    this.saves.will.base += will;
    this.defense.classBonus += defense;
    this.reputation.base += reputation;
  }

  #countSpentSkillPoints() {
    let spent = 0;
    for (const skill of Object.values(this.skills)) {
      const cost = (entry) => (entry.classSkill ? entry.ranks : entry.ranks * 2);
      spent += cost(skill);
      for (const specialty of skill.specialties) spent += cost(specialty);
    }
    return spent;
  }

  /**
   * Prerequisites and rank caps are surfaced as warnings, never enforced.
   * GMs override these constantly and a hard block just makes the sheet unusable.
   */
  #flagOverspentSkills() {
    const { maxRanks, maxCrossClassRanks } = this.skillPoints;
    for (const skill of Object.values(this.skills)) {
      const over = (entry) =>
        entry.ranks > (entry.classSkill ? maxRanks : maxCrossClassRanks);
      skill.overMaxRanks = over(skill);
      for (const specialty of skill.specialties) specialty.overMaxRanks = over(specialty);
    }
  }
}
