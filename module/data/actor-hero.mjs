import { MODERN20 } from "../config.mjs";
import { Modern20ActorBase, int } from "./actor-base.mjs";

const fields = foundry.data.fields;

/**
 * The row of an ability-score table that covers a score.
 *
 * The SRD prints these as brackets - "16-17", "18-19" - and stops at 22-23,
 * so a score above the table holds at its last row rather than dropping to
 * nothing.
 */
function bracketFor(table, score) {
  if (!table?.length || !score) return null;
  const match = table.find((row) => score >= row.min && score <= row.max);
  if (match) return match;
  const last = table[table.length - 1];
  return score > last.max ? last : null;
}

/**
 * The skill point budget for a set of class items.
 *
 * A class grants (its per-level points + Intelligence modifier) each level,
 * never less than one. The character's very first class level is worth four
 * times that, which is the SRD's "Skill Points at 1st Level: (x + Int) x 4".
 * Exported as a pure function so the arithmetic can be tested directly.
 *
 * A nonhuman gets one fewer per level. That single subtraction is the whole
 * of the rule: "Shadowkind characters get 4 fewer skill points at 1st level
 * and 1 fewer skill point each level thereafter" — four fewer at first level
 * because the first level is multiplied by four. The packs store the printed
 * human figure, and eleven advanced classes and all six basic ones print both
 * numbers, always exactly one apart.
 *
 * @param {Array<{levels: number, perLevel: number}>} classes  Starting class first.
 * @param {number} intMod
 * @param {object} [options]
 * @param {boolean} [options.nonhuman]  Whether the character is one.
 */
export function skillPointBudget(classes, intMod, { nonhuman = false } = {}) {
  let total = 0;
  const penalty = nonhuman ? 1 : 0;
  classes.forEach((cls, index) => {
    if (cls.levels < 1) return;
    // The floor of one applies after the species penalty, not before: the
    // book prints a nonhuman Strong hero at "2 + Int modifier" and means it.
    const perLevel = Math.max(1, cls.perLevel - penalty + intMod);
    // Only the starting class multiplies its first level.
    total += index === 0 ? perLevel * 4 + perLevel * (cls.levels - 1) : perLevel * cls.levels;
  });
  return total;
}


/** A player hero: talents, action points, Reputation and a Wealth bonus. */
export class Modern20Hero extends Modern20ActorBase {
  /** Field labels and hints come from lang/en.json under these prefixes. */
  static LOCALIZATION_PREFIXES = ["MODERN20.Actor.Hero"];

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
        bonus: int(0)
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

      // An append-only record of what each level added, so a character can be
      // audited long after the screens that built it were closed.
      advancement: new fields.ArrayField(
        new fields.SchemaField({
          characterLevel: int(1, { min: 1 }),
          className: new fields.StringField({ initial: "" }),
          classLevel: int(1, { min: 0 }),
          hitPoints: int(0),
          gained: new fields.ArrayField(new fields.StringField(), { initial: [] }),
          note: new fields.StringField({ initial: "" }),
          at: new fields.StringField({ initial: "" })
        }),
        { initial: [] }
      ),

      // What has been spent today. The pools themselves are derived from the
      // class items, so gaining a level or changing an ability score
      // recomputes them rather than needing the sheet edited.
      casting: new fields.SchemaField({
        slotsUsed: new fields.SchemaField({
          arcane: new fields.ArrayField(int(0, { min: 0 }), { initial: [] }),
          divine: new fields.ArrayField(int(0, { min: 0 }), { initial: [] })
        }),
        powerPointsUsed: int(0, { min: 0 })
      }),

      skillPoints: new fields.SchemaField({
        spentOverride: new fields.NumberField({
          required: false, nullable: true, integer: true, initial: null
        })
      })
    };
  }

  /** The species item, or null for a character who is simply human. */
  get species() {
    return this.parent?.items?.find((item) => item.type === "species") ?? null;
  }

  /**
   * Everything the species contributes, before anything else reads it.
   *
   * All of it runs in prepareBaseData, which matters for two separate
   * reasons. Ability modifiers have to land before the base model works out
   * a total, or the total is of the wrong score. And everything else has to
   * land before Foundry applies Active Effects, which it does between
   * prepareBaseData and prepareDerivedData: a value written in
   * prepareDerivedData silently overwrites whatever an effect put there, and
   * speed and reach have no `misc` companion to target instead, so an effect
   * on them is the only way a GM has. A species is what you are; an effect is
   * something happening to you, and it goes on top.
   *
   * This is earlier than items have been prepared, which is safe because
   * everything read here is a stored number the species item was imported
   * with and never a derived one.
   */
  prepareSpeciesModifiers() {
    super.prepareSpeciesModifiers();

    const species = this.species;
    if (!species) return;
    const system = species.system;

    for (const [key, amount] of Object.entries(system.abilityModifiers ?? {})) {
      if (this.abilities[key]) this.abilities[key].speciesMod += amount;
    }

    // Set rather than added: the species decides what you are. Where there is
    // no species the character keeps whatever is on the sheet, which is what
    // an imported or hand-built human wants.
    this.attributes.size = system.size;
    this.attributes.speed = system.baseSpeed;
    this.attributes.reach = system.reach;

    // Additive: a species' hide is one source of natural armor and a spell
    // or a mutation could be another.
    this.defense.naturalArmor += system.naturalArmor;
    this.attributes.attackMisc += system.attackBonus;
  }

  prepareDerivedData() {
    // Class progression must land before the base model derives Defense,
    // saves and attack, so this runs ahead of super.prepareDerivedData().
    // Items are already prepared by this point in the document lifecycle.
    // The species is not here: it goes in prepareBaseData, so that an Active
    // Effect applied between the two can modify what it set.
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

    // "CR = Character Level + Level Adjustment." What the character is worth,
    // and what it needs to level — explicitly not what it can do. Null where
    // the SRD leaves the adjustment blank, so the sheet can say so rather
    // than print a number the book does not give.
    // No species at all is a human, which is what d20 Modern is played by.
    this.details.nonhuman = Boolean(this.species?.system.nonhuman);
    this.details.startingFeats = this.details.nonhuman
      ? MODERN20.startingFeats.nonhuman
      : MODERN20.startingFeats.human;

    const adjustment = this.species?.system.levelAdjustment ?? 0;
    this.details.levelAdjustment = adjustment;
    this.details.challengeRating =
      adjustment === null ? null : this.details.level + adjustment;

    // Character level is only known now, and caster level follows it.
    this.spellcasting.casterLevel =
      this.spellcasting.casterLevelOverride ?? this.details.level;

    this.#prepareCasting(classes);

    this.actionPoints.max =
      this.actionPoints.maxOverride ??
      MODERN20.actionPoints.startingBase +
        Math.floor(this.details.level * MODERN20.actionPoints.perLevel);

    // An occupation's Reputation bonus is a permanent character trait, so it
    // is derived. Its Wealth bonus is a one-time increase to starting Wealth
    // and is applied when the occupation is added, not re-added every pass.
    const occupationReputation = (this.parent?.items ?? [])
      .filter((i) => i.type === "occupation")
      .reduce((total, i) => total + (i.system.reputationBonus ?? 0), 0);

    this.reputation.value = this.reputation.base + this.reputation.misc + occupationReputation;

    // Max ranks: level + 3 for a class skill, half that for cross-class.
    this.skillPoints.maxRanks = this.details.level + 3;
    this.skillPoints.maxCrossClassRanks = this.skillPoints.maxRanks / 2;
    this.skillPoints.spent =
      this.skillPoints.spentOverride ?? this.#countSpentSkillPoints();
    this.skillPoints.available = this.#countAvailableSkillPoints(classes);
    this.skillPoints.remaining = this.skillPoints.available - this.skillPoints.spent;

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

  /**
   * The daily casting pools, summed from every class that grants one.
   *
   * "Determine the Mage's total number of spells per day by consulting the two
   * tables below" - the class level's row plus the bonus spells the ability
   * score grants. Arcane and divine are separate pools, since a character with
   * levels in both prepares from two lists.
   */
  #prepareCasting(classes) {
    const slots = { arcane: [], divine: [] };
    let points = 0;
    const casters = [];

    for (const cls of classes) {
      const casting = cls.system.castingAtLevel;
      if (!casting) continue;
      casters.push({ name: cls.name, ...casting });

      const score = casting.ability ? this.abilities[casting.ability]?.total ?? 0 : 0;

      if (casting.kind === "spells") {
        const bonus = bracketFor(casting.bonusByScore, score)?.bonus ?? [];
        const pool = slots[casting.tradition] ?? slots.arcane;
        casting.perDay.forEach((count, level) => {
          // "A 0-level spell gains no bonus spells": the SRD's bonus table
          // prints a dash in that column, which reads back as a zero.
          pool[level] = (pool[level] ?? 0) + count + (bonus[level] ?? 0);
        });
      } else if (casting.kind === "powers") {
        points += casting.points + (bracketFor(casting.bonusPointsByScore, score)?.points ?? 0);
      }
    }

    const used = this.casting.slotsUsed;
    this.casting.slots = Object.fromEntries(
      Object.entries(slots).map(([tradition, pool]) => [
        tradition,
        pool.map((max, level) => {
          const spent = used[tradition]?.[level] ?? 0;
          return { level, max, used: spent, available: Math.max(0, max - spent) };
        })
      ])
    );

    this.casting.powerPoints = {
      max: points,
      used: this.casting.powerPointsUsed,
      value: Math.max(0, points - this.casting.powerPointsUsed)
    };
    this.casting.casters = casters;
    this.casting.any = casters.length > 0;
  }

  /** The starting class is the first class item in sort order. */
  #countAvailableSkillPoints(classes) {
    const ordered = [...classes]
      .sort((a, b) => a.sort - b.sort)
      .map((c) => ({ levels: c.system.levels, perLevel: c.system.skillPointsPerLevel }));
    return skillPointBudget(ordered, this.abilities.int.mod, {
      nonhuman: this.details.nonhuman
    });
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
