/**
 * Static configuration for the Modern20 system.
 *
 * Rules data here is transcribed from the d20 Modern SRD. Where the SRD is the
 * authoritative source, `scripts/scrape.py` writes machine-read copies into
 * `data/` and `scripts/check_config.py` diffs them against this file, so drift
 * shows up as a failing check rather than a silent rules bug.
 */

export const MODERN20 = {};

MODERN20.abilities = {
  str: "MODERN20.Ability.Str.long",
  dex: "MODERN20.Ability.Dex.long",
  con: "MODERN20.Ability.Con.long",
  int: "MODERN20.Ability.Int.long",
  wis: "MODERN20.Ability.Wis.long",
  cha: "MODERN20.Ability.Cha.long"
};

MODERN20.saves = {
  fort: { label: "MODERN20.Save.Fort", ability: "con" },
  ref: { label: "MODERN20.Save.Ref", ability: "dex" },
  will: { label: "MODERN20.Save.Will", ability: "wis" }
};

/**
 * The d20 Modern skill list.
 *
 * `ability: null` means the skill has no key ability (Read/Write Language and
 * Speak Language are acquired, not rolled).
 * `specialties: true` marks skills taken per-subject, e.g. Knowledge (streetwise).
 * Transcribed from the SRD skill table; see scripts/scrape.py.
 */
MODERN20.skills = {
  balance:            { label: "MODERN20.Skill.Balance",            ability: "dex", trainedOnly: false, armorCheck: true },
  bluff:              { label: "MODERN20.Skill.Bluff",              ability: "cha", trainedOnly: false, armorCheck: false },
  climb:              { label: "MODERN20.Skill.Climb",              ability: "str", trainedOnly: false, armorCheck: true },
  computerUse:        { label: "MODERN20.Skill.ComputerUse",        ability: "int", trainedOnly: false,  armorCheck: false },
  concentration:      { label: "MODERN20.Skill.Concentration",      ability: "con", trainedOnly: false, armorCheck: false },
  craft:              { label: "MODERN20.Skill.Craft",              ability: "int", trainedOnly: false,  armorCheck: false, specialties: true },
  decipherScript:     { label: "MODERN20.Skill.DecipherScript",     ability: "int", trainedOnly: true,  armorCheck: false },
  demolitions:        { label: "MODERN20.Skill.Demolitions",        ability: "int", trainedOnly: true,  armorCheck: false },
  diplomacy:          { label: "MODERN20.Skill.Diplomacy",          ability: "cha", trainedOnly: false, armorCheck: false },
  disableDevice:      { label: "MODERN20.Skill.DisableDevice",      ability: "int", trainedOnly: true,  armorCheck: false },
  disguise:           { label: "MODERN20.Skill.Disguise",           ability: "cha", trainedOnly: false, armorCheck: false },
  drive:              { label: "MODERN20.Skill.Drive",              ability: "dex", trainedOnly: false, armorCheck: false },
  escapeArtist:       { label: "MODERN20.Skill.EscapeArtist",       ability: "dex", trainedOnly: false, armorCheck: true },
  forgery:            { label: "MODERN20.Skill.Forgery",            ability: "int", trainedOnly: false, armorCheck: false },
  gamble:             { label: "MODERN20.Skill.Gamble",             ability: "wis", trainedOnly: false, armorCheck: false },
  gatherInformation:  { label: "MODERN20.Skill.GatherInformation",  ability: "cha", trainedOnly: false, armorCheck: false },
  handleAnimal:       { label: "MODERN20.Skill.HandleAnimal",       ability: "cha", trainedOnly: true,  armorCheck: false },
  hide:               { label: "MODERN20.Skill.Hide",               ability: "dex", trainedOnly: false, armorCheck: true },
  intimidate:         { label: "MODERN20.Skill.Intimidate",         ability: "cha", trainedOnly: false, armorCheck: false },
  investigate:        { label: "MODERN20.Skill.Investigate",        ability: "int", trainedOnly: true,  armorCheck: false },
  jump:               { label: "MODERN20.Skill.Jump",               ability: "str", trainedOnly: false, armorCheck: true },
  knowledge:          { label: "MODERN20.Skill.Knowledge",          ability: "int", trainedOnly: true,  armorCheck: false, specialties: true },
  listen:             { label: "MODERN20.Skill.Listen",             ability: "wis", trainedOnly: false, armorCheck: false },
  moveSilently:       { label: "MODERN20.Skill.MoveSilently",       ability: "dex", trainedOnly: false, armorCheck: true },
  navigate:           { label: "MODERN20.Skill.Navigate",           ability: "int", trainedOnly: false, armorCheck: false },
  perform:            { label: "MODERN20.Skill.Perform",            ability: "cha", trainedOnly: false, armorCheck: false, specialties: true },
  pilot:              { label: "MODERN20.Skill.Pilot",              ability: "dex", trainedOnly: true,  armorCheck: false },
  profession:         { label: "MODERN20.Skill.Profession",         ability: "wis", trainedOnly: false, armorCheck: false, specialties: true },
  readWriteLanguage:  { label: "MODERN20.Skill.ReadWriteLanguage",  ability: null,  trainedOnly: true,  armorCheck: false, specialties: true },
  repair:             { label: "MODERN20.Skill.Repair",             ability: "int", trainedOnly: true,  armorCheck: false },
  research:           { label: "MODERN20.Skill.Research",           ability: "int", trainedOnly: false, armorCheck: false },
  ride:               { label: "MODERN20.Skill.Ride",               ability: "dex", trainedOnly: false, armorCheck: false },
  search:             { label: "MODERN20.Skill.Search",             ability: "int", trainedOnly: false, armorCheck: false },
  senseMotive:        { label: "MODERN20.Skill.SenseMotive",        ability: "wis", trainedOnly: false, armorCheck: false },
  sleightOfHand:      { label: "MODERN20.Skill.SleightOfHand",      ability: "dex", trainedOnly: true, armorCheck: true },
  speakLanguage:      { label: "MODERN20.Skill.SpeakLanguage",      ability: null,  trainedOnly: true,  armorCheck: false, specialties: true },
  spot:               { label: "MODERN20.Skill.Spot",               ability: "wis", trainedOnly: false, armorCheck: false },
  survival:           { label: "MODERN20.Skill.Survival",           ability: "wis", trainedOnly: false, armorCheck: false },
  swim:               { label: "MODERN20.Skill.Swim",               ability: "str", trainedOnly: false, armorCheck: true },
  treatInjury:        { label: "MODERN20.Skill.TreatInjury",        ability: "wis", trainedOnly: false,  armorCheck: false },
  tumble:             { label: "MODERN20.Skill.Tumble",             ability: "dex", trainedOnly: true, armorCheck: true }
};

/**
 * Skills taken per subject, and the subjects available.
 *
 * `open` means the subject is chosen freely rather than from the SRD's list —
 * a Profession or a language. `perRank` marks the two language skills, which
 * the SRD says do not work like a standard skill: "Each additional language
 * costs 1 rank" and "a character never makes Speak Language checks", so each
 * rank buys one language rather than raising a total.
 */
MODERN20.skillSpecialties = {
  craft: { open: false, perRank: false, options: ["Chemical", "Electronic", "Mechanical", "Pharmaceutical", "Structural", "Visual Art", "Writing"] },
  knowledge: { open: false, perRank: false, options: ["Arcane Lore", "Art", "Behavioral Sciences", "Business", "Civics", "Current Events", "Earth and Life Sciences", "History", "Physical Sciences", "Popular Culture", "Streetwise", "Tactics", "Technology", "Theology and Philosophy"] },
  perform: { open: false, perRank: false, options: ["Art", "Dance", "Keyboards", "Percussion Instruments", "Sing", "Stand-Up", "Stringed Instruments", "Wind Instruments"] },
  profession: { open: true, perRank: false, options: [] },
  readWriteLanguage: { open: true, perRank: true, options: [] },
  speakLanguage: { open: true, perRank: true, options: [] },
};

/** Skills whose ranks buy subjects rather than raise a check total. */
MODERN20.perRankSkills = Object.entries(MODERN20.skillSpecialties)
  .filter(([, entry]) => entry.perRank)
  .map(([key]) => key);

/** Skills that are taken per-subject rather than as a single ranked skill. */
MODERN20.specialtySkills = Object.entries(MODERN20.skills)
  .filter(([, s]) => s.specialties)
  .map(([k]) => k);

/** The six basic classes, each keyed to one ability score. */
MODERN20.basicClasses = {
  strong:      { label: "MODERN20.Class.Strong",      keyAbility: "str" },
  fast:        { label: "MODERN20.Class.Fast",        keyAbility: "dex" },
  tough:       { label: "MODERN20.Class.Tough",       keyAbility: "con" },
  smart:       { label: "MODERN20.Class.Smart",       keyAbility: "int" },
  dedicated:   { label: "MODERN20.Class.Dedicated",   keyAbility: "wis" },
  charismatic: { label: "MODERN20.Class.Charismatic", keyAbility: "cha" }
};

MODERN20.classTiers = {
  basic: "MODERN20.ClassTier.Basic",
  advanced: "MODERN20.ClassTier.Advanced",
  prestige: "MODERN20.ClassTier.Prestige"
};

/** Size modifiers applied to Defense and to attack rolls (grapple differs). */
MODERN20.sizes = {
  fine:       { label: "MODERN20.Size.Fine",       mod:  8, grapple: -16 },
  diminutive: { label: "MODERN20.Size.Diminutive", mod:  4, grapple: -12 },
  tiny:       { label: "MODERN20.Size.Tiny",       mod:  2, grapple:  -8 },
  small:      { label: "MODERN20.Size.Small",      mod:  1, grapple:  -4 },
  medium:     { label: "MODERN20.Size.Medium",     mod:  0, grapple:   0 },
  large:      { label: "MODERN20.Size.Large",      mod: -1, grapple:   4 },
  huge:       { label: "MODERN20.Size.Huge",       mod: -2, grapple:   8 },
  gargantuan: { label: "MODERN20.Size.Gargantuan", mod: -4, grapple:  12 },
  colossal:   { label: "MODERN20.Size.Colossal",   mod: -8, grapple:  16 }
};

MODERN20.allegianceStrength = {
  none: "MODERN20.Allegiance.None",
  minor: "MODERN20.Allegiance.Minor",
  major: "MODERN20.Allegiance.Major"
};

MODERN20.armorTypes = {
  light: "MODERN20.ArmorType.Light",
  medium: "MODERN20.ArmorType.Medium",
  heavy: "MODERN20.ArmorType.Heavy",
  shield: "MODERN20.ArmorType.Shield"
};

/** Gear availability restriction ratings, and the Black Market purchase DC bump. */
MODERN20.restrictions = {
  none: { label: "MODERN20.Restriction.None", blackMarketDC: 0 },
  lic:  { label: "MODERN20.Restriction.Licensed", blackMarketDC: 1 },
  res:  { label: "MODERN20.Restriction.Restricted", blackMarketDC: 2 },
  mil:  { label: "MODERN20.Restriction.Military", blackMarketDC: 3 },
  ill:  { label: "MODERN20.Restriction.Illegal", blackMarketDC: 4 }
};

MODERN20.featTypes = {
  general: "MODERN20.FeatType.General",
  bonus: "MODERN20.FeatType.Bonus",
  class: "MODERN20.FeatType.Class"
};

MODERN20.weaponCategories = {
  simple: "MODERN20.WeaponCategory.Simple",
  archaic: "MODERN20.WeaponCategory.Archaic",
  handgun: "MODERN20.WeaponCategory.Handgun",
  longarm: "MODERN20.WeaponCategory.Longarm",
  heavy: "MODERN20.WeaponCategory.Heavy",
  exotic: "MODERN20.WeaponCategory.Exotic",
  explosive: "MODERN20.WeaponCategory.Explosive",
  unarmed: "MODERN20.WeaponCategory.Unarmed"
};

/**
 * Wealth bonus loss on a successful purchase, from the SRD Wealth rules:
 * the bonus drops when the purchase DC exceeds the current Wealth bonus, by an
 * amount that scales with the gap, plus a flat extra point for any purchase DC
 * of 15 or higher.
 */
MODERN20.wealth = {
  extraLossThreshold: 15,
  extraLossFormula: "1",
  lossBrackets: [
    { maxGap: 10, formula: "1" },
    { maxGap: 15, formula: "1d6" },
    { maxGap: Infinity, formula: "2d6" }
  ]
};

/** Action points: a starting hero has 5, and gains more as they level. */
MODERN20.actionPoints = {
  startingBase: 5,
  perLevel: 0.5,
  die: "1d6"
};

/** Massive damage: exceed the threshold and make a Fortitude save or drop. */
MODERN20.massiveDamage = {
  defaultSaveDC: 15,
  reducedHitPoints: -1
};
