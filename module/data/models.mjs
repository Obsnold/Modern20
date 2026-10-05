/**
 * What each item and actor type stores in `system`, in the vocabulary of
 * schema.mjs. These descriptions are the system's data models: Foundry builds
 * its schemas from them (models in foundry.mjs), and `npm test` checks every
 * document the build writes against them.
 *
 * Values the book prints are kept as printed (`value`), with the numbers a sheet
 * computes with beside them (a weight of "3 lb." is also `lb: 3`).
 */
import { str, html, int, num, bool, list, obj } from "./schema.mjs";
import { SKILLS } from "./skills.mjs";

export const SIZES = ["fine", "diminutive", "tiny", "small", "medium", "large", "huge", "gargantuan", "colossal"];
export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
export const SAVES = ["fort", "ref", "will"];

// ---------------------------------------------------------------------------
// Shared parts

/** Where an entry is printed: the book, and its page in the rules journal. */
const source = obj({ book: str(), page: str() });
/** A link to another document by name, as printed ("Weapon Finesse (bite)"). */
const link = obj({ name: str(), specialty: str(), uuid: str() });
/** A link with no specialty. */
const namedLink = obj({ name: str(), uuid: str() });
/** A skill offered by a class or occupation: "Craft (writing) (Int)". */
const skillOption = obj({ name: str(), specialty: str(), ability: str({ choices: ABILITIES }) });
/** A choice among options: "Select one of the following". */
const choice = (of) => obj({ choose: int(), options: list(of) });
/** A spell's or power's class and level: "Mage 3". */
const classLevel = obj({ class: str(), level: int() });
/** What a spell or power affects: the row printed (Target, Area, Effect, ...) and its text. */
const target = obj({ label: str(), value: str() });
/** A trait printed with its own text. */
const trait = obj({ name: str(), description: html() });
/** A value as printed, and the number in it. */
const printed = (number) => obj({ value: str(), ...number });

/** Everything that can be bought and carried. */
const physical = {
  category: str(),
  notes: list(str()),
  size: str({ choices: SIZES }),
  weight: printed({ lb: num({ nullable: true }) }),
  purchaseDC: printed({ dc: int({ nullable: true }) }),
  restriction: obj({ value: str(), level: str({ choices: ["lic", "res", "mil", "illegal"] }), modifier: int() }),
  /** Worn or wielded, on a character: equipped armor counts toward Defense. */
  equipped: bool(),
};

const spellLike = {
  descriptors: list(str()),
  range: str(),
  target,
  duration: str(),
  savingThrow: str(),
  description: html(),
};

// ---------------------------------------------------------------------------
// Items

const ITEM_FIELDS = {
  class: {
    /** The levels a character has in this class (on a character's copy; 1 in the compendium). */
    level: int({ initial: 1 }),
    /** The hit points rolled for each of those levels, in order; a missing roll counts the average. */
    hitPoints: list(int({ nullable: true })),
    classType: str({ choices: ["basic", "advanced", "prestige"] }),
    ability: str({ choices: ABILITIES }),
    hitDie: int({ nullable: true }),
    actionPoints: printed({ base: int({ nullable: true }) }),
    classSkills: list(skillOption),
    skillPoints: obj({ perLevel: int({ nullable: true }), value: str(), firstLevel: str() }),
    startingFeats: list(link),
    requirements: list(obj({ label: str(), value: str(), feats: list(link), talents: list(namedLink) })),
    requiredBaseAttackBonus: int({ nullable: true }),
    levels: list(obj({
      level: int(),
      baseAttackBonus: printed({ bonus: int() }),
      saves: obj({ fort: int(), ref: int(), will: int() }),
      defense: int(),
      reputation: int(),
      features: list(obj({ name: str(), feature: str(), detail: str() })),
    })),
    maxLevel: int(),
    bonusFeats: list(link),
    features: list(obj({ name: str(), levels: list(int()), description: html() })),
    talentTrees: list(obj({ name: str(), description: html(), talents: list(namedLink) })),
    description: html(),
    source,
  },

  talent: {
    /** What was chosen when the talent was taken: Skill Emphasis's skill. */
    choice: str(),
    className: str(),
    tree: str(),
    prerequisites: obj({ value: str(), talents: list(namedLink) }),
    description: html(),
    source,
  },

  feat: {
    /** What was chosen when the feat was taken: Weapon Focus's weapon, Educated's two Knowledge skills. */
    choice: str(),
    featType: str({ choices: ["general", "metamagic", "metapsionic", "initial"] }),
    prerequisites: str(),
    description: html(),
    benefit: html(),
    normal: html(),
    special: html(),
    source,
  },

  spell: {
    school: str(),
    subschool: str(),
    ...spellLike,
    components: obj({
      value: str(), verbal: bool(), somatic: bool(), material: bool(), focus: bool(), divineFocus: bool(),
      text: obj({ material: str(), focus: str(), arcaneMaterial: str(), arcaneFocus: str(), divineFocus: str() }),
    }),
    castingTime: str(),
    spellResistance: str(),
    levels: list(classLevel),
    source,
  },

  power: {
    keyAbility: str({ choices: ABILITIES }),
    levels: list(classLevel),
    ...spellLike,
    display: obj({ value: str(), types: list(str({ choices: ["audible", "material", "mental", "olfactory", "visual"] })) }),
    manifestationTime: str(),
    powerResistance: str(),
    powerPointCost: obj({ value: int(), text: str() }),
    source,
  },

  incantation: {
    school: str(),
    subschool: str(),
    ...spellLike,
    components: obj({
      value: str(), verbal: bool(), somatic: bool(), material: bool(), focus: bool(),
      secondaryCasters: bool(), backlash: bool(), experience: bool(),
      text: obj({ material: str(), focus: str(), secondaryCasters: str(), backlash: str(), experience: str() }),
    }),
    castingTime: str(),
    spellResistance: str(),
    skillCheck: obj({ value: str(), checks: list(obj({ skill: str(), dc: int({ nullable: true }), successes: int() })) }),
    failure: obj({ value: str(), text: str() }),
    options: str(),
    source,
  },

  occupation: {
    /** On a character's copy: the skills chosen from `skills.options` ("Knowledge (history)"). */
    chosenSkills: list(str()),
    prerequisite: str(),
    minimumAge: int({ nullable: true }),
    reputationBonus: int(),
    wealthBonus: int(),
    skills: obj({ choose: int(), options: list(skillOption), languages: str() }),
    feats: choice(link),
    description: html(),
    source,
  },

  species: {
    size: str({ choices: SIZES }),
    abilities: obj(Object.fromEntries(ABILITIES.map((a) => [a, int()]))),
    speed: int(),
    levelAdjustment: int(),
    hitDice: obj({ count: int(), die: int() }),
    naturalArmor: int(),
    bonusFeats: choice(link),
    languages: obj({ free: list(str()), other: list(str()) }),
    specialQualities: list(trait),
    description: html(),
    source,
  },

  weapon: {
    ...physical,
    damage: obj({ value: str(), formula: str() }),
    splashDamage: str(),
    critical: str(),
    damageType: str(),
    rangeIncrement: printed({ ft: int({ nullable: true }) }),
    rateOfFire: str(),
    magazine: str(),
    burstRadius: str(),
    reflexDC: str(),
    proficiency: obj({ value: str(), uuid: str() }),
    melee: bool(),
    description: html(),
    source,
  },

  armor: {
    ...physical,
    armorType: str(),
    weightClass: str({ choices: ["light", "medium", "heavy", "powered", "shield"] }),
    equipmentBonus: int(),
    nonproficientBonus: int(),
    maxDex: int({ nullable: true }),
    armorPenalty: int(),
    arcaneSpellFailure: str(),
    speed: obj({ label: str(), value: str() }),
    description: html(),
    source,
  },

  equipment: {
    ...physical,
    description: html(),
    source,
  },

  ammunition: {
    ...physical,
    quantity: int({ nullable: true }),
    damageType: str(),
    purchaseDCModifier: str(),
    description: html(),
    source,
  },

  creatureType: {
    hitDie: int({ nullable: true }),
    baseAttack: printed({ rate: num({ nullable: true }) }),
    goodSaves: obj({ value: str(), saves: list(str({ choices: SAVES })) }),
    skillPoints: str(),
    feats: str(),
    traits: list(trait),
    sizes: list(obj({
      size: str({ choices: SIZES }), str: str(), dex: str(), con: str(), minimumHitDice: str(), extraHitPoints: str(),
      slam: str(), bite: str(), claw: str(), gore: str(),
    })),
    description: html(),
    source,
  },

  template: {
    kind: str({ choices: ["acquired", "inherited"] }),
    appliesTo: str(),
    challengeRating: printed({ adjustment: int({ nullable: true }) }),
    type: str(),
    abilities: obj({
      value: str(),
      changes: obj(Object.fromEntries(ABILITIES.map((a) => [a, int({ nullable: true })]))),
      lost: list(str({ choices: ABILITIES })),
    }),
    traits: list(trait),
    description: html(),
    source,
  },
};

/**
 * Every item type, each with its identifier first: the slug of the name the SRD
 * prints, which the rules know it by (rules/identify.mjs).
 */
export const ITEM_MODELS = Object.fromEntries(Object.entries(ITEM_FIELDS).map(([type, fields]) => [type, { identifier: str(), ...fields }]));

// ---------------------------------------------------------------------------
// Actors

export const ACTOR_MODELS = {
  /** A hero or ordinary: everything else is worked out from the items it owns (rules/character.mjs). */
  character: {
    abilities: obj(Object.fromEntries(ABILITIES.map((a) => [a, obj({ value: int({ nullable: true, initial: 10 }) })]))),
    hp: obj({ value: int(), temp: int() }),
    actionPoints: obj({ value: int() }),
    wealth: obj({ value: int() }),
    defense: obj({ misc: int() }),
    /**
     * Ranks in each skill (half ranks for cross-class skills), any other bonus, and `classSkill` for a
     * skill made a class skill by hand: a Personality's Bonus Class Skill, a GM's ruling.
     */
    skills: obj(Object.fromEntries(Object.entries(SKILLS).filter(([, s]) => !s.specialties).map(([k]) => [k, obj({ ranks: num(), misc: int(), classSkill: bool() })]))),
    /** Skills taken with a specialty: Craft (chemical), Knowledge (history), Perform (sing). */
    specialtySkills: list(obj({ skill: str({ choices: Object.keys(SKILLS).filter((k) => SKILLS[k].specialties) }), specialty: str(), ranks: num(), misc: int(), classSkill: bool() })),
    /**
     * Bonuses from active effects, on the character or carried by its items
     * (a feat, a piece of gear, a condition). Never typed in: an effect adds to
     * these (`system.bonuses.saves.will`, mode Add), and the totals include them.
     */
    bonuses: obj({
      abilities: obj(Object.fromEntries(ABILITIES.map((a) => [a, int()]))),
      attack: obj({ melee: int(), ranged: int() }),
      damage: obj({ melee: int(), ranged: int() }),
      saves: obj(Object.fromEntries(SAVES.map((k) => [k, int()]))),
      skills: obj(Object.fromEntries(Object.keys(SKILLS).map((k) => [k, int()]))),
      allSkills: int(),
      defense: int(),
      initiative: int(),
      hitPoints: int(),
      reputation: int(),
      massiveDamage: int(),
      /** Above 0, the character loses its Dexterity bonus to Defense (flat-footed, stunned, pinned). */
      loseDexBonus: int(),
    }),
    details: obj({ allegiances: str(), age: str(), gender: str(), height: str(), weight: str(), biography: html() }),
  },

  creature: {
    class: str(),
    cr: printed({ number: num({ nullable: true }) }),
    size: str({ choices: SIZES }),
    type: obj({ value: str(), base: str(), subtypes: list(str()), uuid: str() }),
    template: str(),
    /** One of the book's worked examples: a creature with class levels, built on `base`. */
    example: obj({ classed: bool(), base: namedLink }),
    hitDice: str(),
    hp: obj({ value: int({ nullable: true }), max: int({ nullable: true }) }),
    massiveDamage: int({ nullable: true }),
    initiative: int({ nullable: true }),
    speed: printed({ ft: int({ nullable: true }) }),
    defense: obj({ value: int({ nullable: true }), touch: int({ nullable: true }), flatFooted: int({ nullable: true }), breakdown: str(), flameShield: str() }),
    baseAttackBonus: printed({ bonus: int({ nullable: true }) }),
    grapple: int({ nullable: true }),
    attack: str(),
    fullAttack: str(),
    space: str(),
    reach: str(),
    specialAttacks: str(),
    specialQualities: list(str()),
    allegiances: str(),
    saves: obj(Object.fromEntries(SAVES.map((s) => [s, int({ nullable: true })]))),
    actionPoints: int({ nullable: true }),
    reputation: int({ nullable: true }),
    abilities: obj(Object.fromEntries(ABILITIES.map((a) => [a, int({ nullable: true })]))),
    skills: list(obj({ name: str(), specialty: str(), bonus: int(), note: str() })),
    languages: list(str()),
    feats: list(link),
    talents: list(obj({ className: str(), name: str(), detail: str(), uuid: str() })),
    occupation: str(),
    advancement: str(),
    possessions: str(),
    description: html(),
    source,
  },
};

/** An ability score's modifier: (score − 10) / 2, rounded down; none for a nonability (—). */
export const abilityModifier = (score) => (score === null || score === undefined ? null : Math.floor((score - 10) / 2));
