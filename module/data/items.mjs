import { MODERN20 } from "../config.mjs";
import { defaultActivities } from "../apps/activities.mjs";
import { Modern20ItemBase, purchasableFields, prerequisiteField, int } from "./item-base.mjs";

const fields = foundry.data.fields;

/**
 * A basic, advanced or prestige class. Per-level progression lives in `levels`
 * so the class item is the single source of truth for BAB, saves, Defense and
 * Reputation, and the actor just sums what it has.
 */
export class Modern20Class extends Modern20ItemBase {
  static LOCALIZATION_PREFIXES = ["MODERN20.Item.Class"];

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
      /**
       * The action points a character has on taking a level in this class.
       *
       * "Action Points: 6 + one-half character level, rounded down, every
       * time the Techie attains a new level in this class." Five for the six
       * basic classes, six for most advanced ones, seven for the prestige
       * classes — and seven for the Swindler, which is an advanced class and
       * the reason this is a field on the class rather than a number per
       * tier.
       */
      actionPointBase: int(5, { min: 0 }),
      // A grant names a skill and, where the SRD gives one, the subject:
      // "Craft (structural)" makes that one Craft a class skill, not all of them.
      classSkills: new fields.ArrayField(
        new fields.SchemaField({
          skill: new fields.StringField({ required: true, blank: false }),
          specialty: new fields.StringField({ initial: "" })
        }),
        { initial: [] }
      ),
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
      ),

      /**
       * The daily casting resource this class grants, if any.
       *
       * A Mage and an Acolyte prepare a number of spells of each level per
       * day, plus bonus spells from an ability score. A Battle Mind and a
       * Telepath spend power points from a daily pool. Everything else leaves
       * `kind` blank and contributes nothing.
       */
      casting: new fields.SchemaField({
        // `blank: true` is not decoration: a StringField given `choices` sets
        // `blank: false` for you, so a blank one is refused however plainly the
        // choices offer it — and these are blank on 45 of the 52 classes. The
        // class documents load, because construction does not validate; adding
        // one to a character does, so dragging any non-casting class onto a
        // sheet failed with "may not be a blank string" and no class arrived.
        kind: new fields.StringField({
          initial: "", blank: true, choices: ["", "spells", "powers"]
        }),
        tradition: new fields.StringField({
          initial: "", blank: true, choices: ["", "arcane", "divine"]
        }),
        // The ability that grants bonus spells or bonus power points. Blank
        // for a Battle Mind, which the SRD gives neither.
        ability: new fields.StringField({ initial: "" }),
        // Spells per day, one row per class level, each a count per spell level.
        perDay: new fields.ArrayField(
          new fields.ArrayField(int(0, { min: 0 }), { initial: [] }), { initial: [] }
        ),
        // "Int Score 16-17: - 1 1 1 - -": extra spells for a high score.
        bonusByScore: new fields.ArrayField(
          new fields.SchemaField({
            min: int(0, { min: 0 }),
            max: int(0, { min: 0 }),
            bonus: new fields.ArrayField(int(0, { min: 0 }), { initial: [] })
          }),
          { initial: [] }
        ),
        // Power points per day, one per class level.
        pointsPerDay: new fields.ArrayField(int(0, { min: 0 }), { initial: [] }),
        bonusPointsByScore: new fields.ArrayField(
          new fields.SchemaField({
            min: int(0, { min: 0 }),
            max: int(0, { min: 0 }),
            points: int(0, { min: 0 })
          }),
          { initial: [] }
        ),
        // Powers known, one row per class level. Recorded because the SRD
        // prints it; nothing enforces it.
        powersKnown: new fields.ArrayField(
          new fields.ArrayField(int(0, { min: 0 }), { initial: [] }), { initial: [] }
        )
      })
    };
  }

  /**
   * What this class contributes at the number of levels the character has.
   *
   * The row for the class level, not the last row: a 4th-level Mage prepares
   * a 4th-level Mage's spells. Levels past the table's end hold at its last
   * row, the same rule `bonusesAtLevel` uses for the progression table.
   */
  get castingAtLevel() {
    const casting = this.casting;
    if (!casting.kind || this.levels < 1) return null;

    const row = (table) => table[Math.min(this.levels, table.length) - 1] ?? null;
    return {
      kind: casting.kind,
      tradition: casting.tradition,
      ability: casting.ability,
      perDay: row(casting.perDay) ?? [],
      points: casting.pointsPerDay[Math.min(this.levels, casting.pointsPerDay.length) - 1] ?? 0,
      bonusByScore: casting.bonusByScore,
      bonusPointsByScore: casting.bonusPointsByScore
    };
  }

  /**
   * Class skills were a plain list of skill ids before subjects were parsed
   * out of the SRD's sentence. Convert rather than lose them.
   */
  static migrateData(source) {
    const skills = source.classSkills;
    if (Array.isArray(skills) && skills.some((entry) => typeof entry === "string")) {
      source.classSkills = skills.map((entry) =>
        typeof entry === "string" ? { skill: entry, specialty: "" } : entry);
    }
    return super.migrateData(source);
  }

  /**
   * Cumulative bonuses at the number of levels the character actually has.
   *
   * Uses the highest row at or below the class level rather than an exact
   * match: SRD progression tables stop at 10, and requiring equality meant a
   * class taken past the end of its table silently contributed nothing.
   */
  get bonusesAtLevel() {
    const empty = { baseAttack: 0, fort: 0, ref: 0, will: 0, defense: 0, reputation: 0 };
    if (this.levels < 1 || !this.progression.length) return empty;

    const rows = [...this.progression].sort((a, b) => a.level - b.level);
    const row = rows.reduce((best, r) => (r.level <= this.levels ? r : best), null);
    return row ?? empty;
  }

  /** The highest level this class's progression table defines. */
  get maxProgressionLevel() {
    return this.progression.reduce((max, r) => Math.max(max, r.level), 0);
  }
}

/** A starting occupation: skill bonuses, a bonus feat and a Wealth bump. */
export class Modern20Occupation extends Modern20ItemBase {
  static LOCALIZATION_PREFIXES = ["MODERN20.Item.Occupation"];

  static defineSchema() {
    return {
      ...super.defineSchema(),
      prerequisites: prerequisiteField(),
      // An occupation offers a choice from a list, so both the options and the
      // pick are stored. `skillsChosen` holds skill ids and is what the actor
      // reads when deciding which skills are class skills.
      skillChoiceCount: int(0, { min: 0 }),
      skillOptions: new fields.ArrayField(
        new fields.SchemaField({
          skill: new fields.StringField({ required: true, blank: false }),
          label: new fields.StringField({ initial: "" }),
          // Subjects the occupation allows for this skill, where it names any.
          specialties: new fields.ArrayField(new fields.StringField(), { initial: [] })
        }),
        { initial: [] }
      ),
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
  static LOCALIZATION_PREFIXES = ["MODERN20.Item.Talent"];

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
  static LOCALIZATION_PREFIXES = ["MODERN20.Item.Feat"];

  static defineSchema() {
    return {
      ...super.defineSchema(),
      featType: new fields.StringField({
        required: true,
        initial: "general",
        choices: Object.keys(MODERN20.featTypes)
      }),
      // The category the book files the feat under, printed after the name in
      // capitals: "Empower Spell [METAMAGIC]". A different axis from featType,
      // which is how a character came by the feat rather than what it is, so
      // it is free text rather than a second enumeration — the SRD names three
      // and an expansion can name more.
      category: new fields.StringField({ initial: "" }),
      prerequisites: prerequisiteField(),
      benefit: new fields.HTMLField({ initial: "" }),
      normal: new fields.HTMLField({ initial: "" }),
      special: new fields.HTMLField({ initial: "" }),
      repeatable: new fields.BooleanField({ initial: false })
    };
  }
}

/**
 * A playable species: what you are, before what you do.
 *
 * d20 Modern needs none of this — everyone is human and the baseline is the
 * rules — but Urban Arcana prints two chapters of playable species, and both
 * are written to the same shape: a size, a set of ability modifiers, a base
 * speed, and then a list of named qualities. That shape is the schema.
 *
 * Every field here is applied by the hero model on each preparation pass, the
 * way class progression is, so removing the species item removes everything
 * it granted. The one exception is what has to be rolled or chosen — the
 * extra Hit Dice and the bonus feat — which are applied once, when the
 * species is added, because a hit point total that re-rolled itself on every
 * render would be no use to anybody.
 *
 * The qualities live in `traits` rather than as separate documents. A species
 * is then self-contained, like a class carrying its own progression table,
 * and applying it creates one specialAbility item per trait on the actor.
 */
export class Modern20Species extends Modern20ItemBase {
  static LOCALIZATION_PREFIXES = ["MODERN20.Item.Species"];

  static defineSchema() {
    return {
      ...super.defineSchema(),
      size: new fields.StringField({
        required: true,
        initial: "medium",
        choices: Object.keys(MODERN20.sizes)
      }),
      // "These modifiers adjust the ability scores of every member of the
      // species." Applied before totals are derived, never written into the
      // stored score, so the score on the sheet stays the one that was rolled.
      abilityModifiers: new fields.SchemaField(
        Object.fromEntries(Object.keys(MODERN20.abilities).map((key) => [key, int(0)]))
      ),
      baseSpeed: int(30, { min: 0 }),
      /**
       * Whether this counts as nonhuman, which costs a skill point and a feat.
       *
       * d20 Modern's baseline is a human, and two printed rules follow from
       * being one. "In addition to the two feats all characters get at 1st
       * level" appears in all six basic classes, and Advancing Creatures says
       * a nonhuman gains "only one bonus feat at 1st level instead of two".
       * For skill points the Shadowkind chapter is explicit: "Shadowkind
       * characters get 4 fewer skill points at 1st level and 1 fewer skill
       * point each level thereafter" — which is one rule, one fewer per level,
       * since the first level is multiplied by four.
       *
       * True by default, because every species the two chapters print is a
       * nonhuman — the shadowkind human included, being a shadowkind
       * character. Only the baseline human sets it false, and so does having
       * no species at all.
       */
      nonhuman: new fields.BooleanField({ initial: true }),
      /**
       * Racial Hit Dice, before the first class level.
       *
       * "A bugbear gains 3 Hit Dice (3d8 hit points). The bugbear's
       * Constitution modifier applies to each Hit Die." Four of the eighteen
       * species have these; everything else starts at zero and takes its hit
       * points from its class.
       */
      extraHitDice: int(0, { min: 0 }),
      hitDie: new fields.StringField({ initial: "d8" }),
      // What the racial Hit Dice actually came to when they were rolled, so
      // removing the species can take back exactly what it gave rather than
      // leaving a character with hit points it can no longer account for.
      rolledHitPoints: int(0, { min: 0 }),
      naturalArmor: int(0),
      // "Bugbears gain a +2 species bonus on attack rolls."
      attackBonus: int(0),
      reach: int(5, { min: 0 }),
      /**
       * How much more powerful than a baseline species this is.
       *
       * "CR = Character Level + Level Adjustment." It changes what the
       * character is worth and what it needs to level, and explicitly not
       * what it can do: "A character's CR is never used to determine how or
       * when a character gains new skills and feats."
       *
       * Null, not zero, where the SRD prints the label and leaves it blank —
       * which it does for the aasimar. Zero would be a claim the book does
       * not make.
       */
      levelAdjustment: new fields.NumberField({
        required: false, nullable: true, integer: true, initial: 0, min: 0
      }),
      // Feats the species always gets. The orc gets three.
      bonusFeats: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      // ...and feats it picks one of. The shadowkind human picks from 23.
      bonusFeatOptions: new fields.ArrayField(new fields.StringField(), { initial: [] }),
      bonusFeatChosen: new fields.StringField({ initial: "" }),
      // Printed as prose and left as prose: this system does not model
      // languages, and inventing a skill row for each would be inventing
      // rules. They are shown so a player knows what they are owed.
      freeLanguages: new fields.StringField({ initial: "" }),
      otherLanguages: new fields.StringField({ initial: "" }),
      /**
       * The named qualities, as the chapter prints them.
       *
       * Darkvision, Spell Resistance, Light Blindness, Orc Blood. Each becomes
       * a specialAbility item on the actor when the species is applied, which
       * is the item type these already existed for.
       */
      traits: new fields.ArrayField(
        new fields.SchemaField({
          name: new fields.StringField({ required: true, blank: false }),
          description: new fields.HTMLField({ initial: "" }),
          // A way of perceiving, which is what a creature's senses line is
          // made of and what a token's vision is set from.
          sense: new fields.BooleanField({ initial: false }),
          abilityType: new fields.StringField({ initial: "" })
        }),
        { initial: [] }
      )
    };
  }

  /** Every ability modifier this species applies, as [key, amount] pairs. */
  get appliedAbilityModifiers() {
    return Object.entries(this.abilityModifiers).filter(([, amount]) => amount);
  }
}

/**
 * A creature's special quality or special attack: darkvision, improved grab,
 * a breath weapon, the traits its type confers.
 *
 * The SRD prints these twice - once as a comma-separated line in the stat
 * block, once as prose under SPECIES TRAITS - and the import kept only the
 * line, as a single string no part of the sheet could read. One item per
 * printed ability puts the rules where the creature is.
 */
export class Modern20SpecialAbility extends Modern20ItemBase {
  static LOCALIZATION_PREFIXES = ["MODERN20.Item.SpecialAbility"];

  static defineSchema() {
    return {
      ...super.defineSchema(),
      // (Ex), (Su), (Sp) or (Ps), which decides what suppresses it - an
      // antimagic field stops a supernatural ability and not an extraordinary
      // one. Left blank where the SRD prints no category, which is most of the
      // traits a creature's type confers.
      abilityType: new fields.StringField({ initial: "" }),
      // Whether the ability is a way of perceiving - darkvision, scent - which
      // is what the creature's senses line is made of.
      sense: new fields.BooleanField({ initial: false })
    };
  }
}

export class Modern20Weapon extends Modern20ItemBase {
  static LOCALIZATION_PREFIXES = ["MODERN20.Item.Weapon"];

  /**
   * Backfill activities onto a weapon made before they existed, which is what
   * dnd5e does on migration to its own activity system. Without this an older
   * weapon would simply have no way to be fired.
   */
  static migrateData(source) {
    if (foundry.utils.isEmpty(source.activities ?? {})) {
      source.activities = defaultActivities("weapon", source);
    }
    return super.migrateData(source);
  }

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
      // A sap "deals nonlethal damage instead of lethal damage"; so do unarmed
      // strikes and beanbag rounds.
      nonlethal: new fields.BooleanField({ initial: false }),
      critical: new fields.StringField({ initial: "20" }),
      // Firearms use a range increment; melee weapons leave this at 0.
      rangeIncrement: int(0, { min: 0 }),
      rateOfFire: new fields.StringField({ initial: "" }),
      magazine: new fields.StringField({ initial: "" }),
      // What this fires, matched against an ammunition item's own calibre when
      // reloading. Blank means the SRD names no ammunition for it.
      caliber: new fields.StringField({ initial: "" }),
      ammo: new fields.SchemaField({ value: int(0, { min: 0 }), max: int(0, { min: 0 }) }),
      // Which carried ammunition is in the magazine, by item id. Set when
      // reloading, so the loaded type's effects apply to what is fired.
      loadedAmmo: new fields.StringField({ initial: "" }),
      size: new fields.StringField({ initial: "medium" }),
      // Attacks add Dex instead of Str when the weapon is ranged.
      ranged: new fields.BooleanField({ initial: false }),
      attackBonus: int(0),
      damageBonus: int(0),
      // Explosives: "the burst radius is the area affected by the explosive.
      // All creatures or objects within the burst radius take damage."
      // A reach weapon: "A character can strike opponents 10 feet away with
      // it." Zero means the weapon uses the wielder's own reach.
      reach: int(0, { min: 0 }),
      // The spear "can't use it against an adjacent foe"; the chain is the
      // stated exception and can.
      reachOnly: new fields.BooleanField({ initial: false }),
      burstRadius: new fields.StringField({ initial: "" }),
      // "Any creature caught within the burst radius may make a Reflex save
      // against the DC given in this column for half damage."
      reflexDC: new fields.NumberField({
        required: false, nullable: true, integer: true, initial: null
      })
    };
  }

  /**
   * How many rounds the magazine holds, from the magazine the SRD printed.
   *
   * The equipment tables give this as prose — "30 box", "6 cyl.", "1 int." —
   * and `ammo.max` is the number the rest of the system reads: it is what
   * offers the Reload activity, what spends a round on a shot, and what the
   * gear tab shows as 8/8. Deriving it here rather than storing it in the
   * packs means the printed string stays the one place the answer lives, and
   * a weapon whose magazine is corrected gets the right capacity with it.
   *
   * Only when unset, so a GM who types a capacity on the sheet keeps it.
   */
  prepareDerivedData() {
    super.prepareDerivedData();
    if (this.ammo.max) return;
    const printed = String(this.magazine ?? "").match(/\d+/);
    this.ammo.max = printed ? Number(printed[0]) : 0;
  }
}

export class Modern20Armor extends Modern20ItemBase {
  static LOCALIZATION_PREFIXES = ["MODERN20.Item.Armor"];

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

/** A bag, case or box. Holds other items, up to a stated weight. */
export class Modern20Container extends Modern20ItemBase {
  static LOCALIZATION_PREFIXES = ["MODERN20.Item.Container"];

  static defineSchema() {
    return {
      ...super.defineSchema(),
      ...purchasableFields(),
      // Zero means the SRD states no capacity for it.
      capacity: new fields.NumberField({ required: true, initial: 0, min: 0 }),
      category: new fields.StringField({ initial: "Bags and Boxes" })
    };
  }
}

export class Modern20Gear extends Modern20ItemBase {
  static LOCALIZATION_PREFIXES = ["MODERN20.Item.Gear"];

  static defineSchema() {
    return {
      ...super.defineSchema(),
      ...purchasableFields(),
      // Set on ammunition, so a weapon of the same calibre can draw on it.
      caliber: new fields.StringField({ initial: "" }),
      // An exotic type, keyed to MODERN20.specialAmmunition. Blank is ordinary
      // ammunition. The SRD prices these as a modifier on a normal purchase,
      // so this marks a variant of a calibre rather than a separate product.
      special: new fields.StringField({ initial: "" }),
      category: new fields.StringField({ initial: "general" })
    };
  }
}

export class Modern20VehicleMod extends Modern20ItemBase {
  static LOCALIZATION_PREFIXES = ["MODERN20.Item.VehicleMod"];

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
/**
 * What a spell or power does, read from the SRD's own wording.
 *
 * These drive the activity an item starts with, so a spell typed in by hand
 * and one imported from the compendium end up with the same activity from the
 * same fields — the weapon rule, applied to casting.
 */
function castingFields() {
  return {
    // "1d6", "1d4+1". Blank for a spell that deals none.
    damage: new fields.StringField({ initial: "" }),
    damageType: new fields.StringField({ initial: "" }),
    // "1d6 points of fire damage per caster level (maximum 10d6)".
    scaling: new fields.SchemaField({
      per: int(0, { min: 0 }),
      max: int(0, { min: 0 })
    }),
    // The save the SRD's "Saving Throw" line allows, structured. Blank means
    // none, which is also what the line says for most spells.
    saveAbility: new fields.StringField({ initial: "" }),
    saveEffect: new fields.StringField({ initial: "" }),
    // The prose "Area" line as something the canvas can draw. Only the areas
    // the SRD states as a radius are here; the rest are described rather than
    // measured ("Quarter-circle emanating from you"), and a wrong shape on the
    // map is worse than none.
    areaShape: new fields.SchemaField({
      shape: new fields.StringField({ initial: "" }),
      size: int(0, { min: 0 })
    })
  };
}


export class Modern20Spell extends Modern20ItemBase {
  static LOCALIZATION_PREFIXES = ["MODERN20.Item.Spell"];

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
      ...castingFields(),
      prepared: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),

      // The level this spell sits at on each list. A spell can be on both and
      // at different levels - animate dead is Acolyte 3 and Mage 4 - and the
      // save DC counts the level of the list it was cast from, so both are
      // kept and `tradition` picks between them.
      lists: new fields.SchemaField({
        arcane: new fields.NumberField({
          required: false, nullable: true, integer: true, initial: null, min: 0
        }),
        divine: new fields.NumberField({
          required: false, nullable: true, integer: true, initial: null, min: 0
        })
      }),
      // Which list this caster learned it from. Arcane spellcasting keys off
      // Intelligence, divine off Wisdom, which is what sets the save DC.
      tradition: new fields.StringField({
        initial: "arcane", choices: ["arcane", "divine"]
      })
    };
  }

  /**
   * Fill in the list levels for spells stored before they were split out.
   *
   * Older documents carry only the lowest level printed, which is the level on
   * one of the two lists; without knowing which, the same number is the best
   * available answer for both.
   */
  static migrateData(source) {
    if (source.lists === undefined && source.level !== undefined) {
      source.lists = { arcane: source.level, divine: source.level };
    }
    // A spell stored before spells could be cast has no activity, and without
    // one there is no button to cast it.
    if (foundry.utils.isEmpty(source.activities ?? {})) {
      source.activities = defaultActivities("spell", source);
    }
    return super.migrateData(source);
  }
}

/** Psionic powers, kept separate from spells so a non-FX game can ignore both. */
export class Modern20PsiPower extends Modern20ItemBase {
  static LOCALIZATION_PREFIXES = ["MODERN20.Item.PsiPower"];

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
      savingThrow: new fields.StringField({ initial: "" }),
      // "Each psionic power is tied to a specific ability, which is the key
      // ability for that psionic power." It sets the save DC, so unlike a
      // spell's it is a property of the power rather than of the manifester.
      keyAbility: new fields.StringField({ initial: "cha" }),
      ...castingFields()
    };
  }

  static migrateData(source) {
    if (foundry.utils.isEmpty(source.activities ?? {})) {
      source.activities = defaultActivities("psiPower", source);
    }
    return super.migrateData(source);
  }
}
