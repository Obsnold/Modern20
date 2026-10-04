/**
 * The skills, as the skill pages print them: key ability, whether a character
 * needs ranks to use the skill at all, and whether armor hinders it. Skills
 * with specialties list the ones the SRD names; a character can take others.
 *
 * tools/test/skills.test.mjs holds this list to the skill pages, so it cannot
 * drift from the book.
 */
export const SKILLS = {
  balance: { name: "Balance", ability: "dex", trainedOnly: false, armorPenalty: true },
  bluff: { name: "Bluff", ability: "cha", trainedOnly: false, armorPenalty: false },
  climb: { name: "Climb", ability: "str", trainedOnly: false, armorPenalty: true },
  computerUse: { name: "Computer Use", ability: "int", trainedOnly: false, armorPenalty: false },
  concentration: { name: "Concentration", ability: "con", trainedOnly: false, armorPenalty: false },
  craft: {
    name: "Craft", ability: "int", trainedOnly: false, armorPenalty: false,
    // "electrical" is d20 Future's: its classes, feats, starships, mecha and robots print Craft (electrical)
    // throughout, beside d20 Modern's Craft (electronic).
    specialties: ["chemical", "electrical", "electronic", "mechanical", "pharmaceutical", "structural", "visual art", "writing"],
  },
  decipherScript: { name: "Decipher Script", ability: "int", trainedOnly: true, armorPenalty: false },
  demolitions: { name: "Demolitions", ability: "int", trainedOnly: true, armorPenalty: false },
  diplomacy: { name: "Diplomacy", ability: "cha", trainedOnly: false, armorPenalty: false },
  disableDevice: { name: "Disable Device", ability: "int", trainedOnly: true, armorPenalty: false },
  disguise: { name: "Disguise", ability: "cha", trainedOnly: false, armorPenalty: false },
  drive: { name: "Drive", ability: "dex", trainedOnly: false, armorPenalty: false },
  escapeArtist: { name: "Escape Artist", ability: "dex", trainedOnly: false, armorPenalty: true },
  forgery: { name: "Forgery", ability: "int", trainedOnly: false, armorPenalty: false },
  gamble: { name: "Gamble", ability: "wis", trainedOnly: false, armorPenalty: false },
  gatherInformation: { name: "Gather Information", ability: "cha", trainedOnly: false, armorPenalty: false },
  handleAnimal: { name: "Handle Animal", ability: "cha", trainedOnly: true, armorPenalty: false },
  hide: { name: "Hide", ability: "dex", trainedOnly: false, armorPenalty: true },
  intimidate: { name: "Intimidate", ability: "cha", trainedOnly: false, armorPenalty: false },
  investigate: { name: "Investigate", ability: "int", trainedOnly: true, armorPenalty: false },
  jump: { name: "Jump", ability: "str", trainedOnly: false, armorPenalty: true },
  knowledge: {
    name: "Knowledge", ability: "int", trainedOnly: true, armorPenalty: false,
    specialties: ["arcane lore", "art", "behavioral sciences", "business", "civics", "current events", "earth and life sciences",
      "history", "physical sciences", "popular culture", "streetwise", "tactics", "technology", "theology and philosophy"],
  },
  listen: { name: "Listen", ability: "wis", trainedOnly: false, armorPenalty: false },
  moveSilently: { name: "Move Silently", ability: "dex", trainedOnly: false, armorPenalty: true },
  navigate: { name: "Navigate", ability: "int", trainedOnly: false, armorPenalty: false },
  perform: {
    name: "Perform", ability: "cha", trainedOnly: false, armorPenalty: false,
    specialties: ["act", "dance", "keyboards", "percussion instruments", "sing", "stand-up", "stringed instruments", "wind instruments"],
  },
  pilot: { name: "Pilot", ability: "dex", trainedOnly: true, armorPenalty: false },
  profession: { name: "Profession", ability: "wis", trainedOnly: false, armorPenalty: false },
  readWriteLanguage: { name: "Read/Write Language", ability: "", trainedOnly: true, armorPenalty: false },
  repair: { name: "Repair", ability: "int", trainedOnly: true, armorPenalty: false },
  research: { name: "Research", ability: "int", trainedOnly: false, armorPenalty: false },
  ride: { name: "Ride", ability: "dex", trainedOnly: false, armorPenalty: false },
  search: { name: "Search", ability: "int", trainedOnly: false, armorPenalty: false },
  senseMotive: { name: "Sense Motive", ability: "wis", trainedOnly: false, armorPenalty: false },
  sleightOfHand: { name: "Sleight of Hand", ability: "dex", trainedOnly: true, armorPenalty: true },
  speakLanguage: { name: "Speak Language", ability: "", trainedOnly: true, armorPenalty: false },
  spot: { name: "Spot", ability: "wis", trainedOnly: false, armorPenalty: false },
  survival: { name: "Survival", ability: "wis", trainedOnly: false, armorPenalty: false },
  swim: { name: "Swim", ability: "str", trainedOnly: false, armorPenalty: true },
  treatInjury: { name: "Treat Injury", ability: "wis", trainedOnly: false, armorPenalty: false },
  tumble: { name: "Tumble", ability: "dex", trainedOnly: true, armorPenalty: true },

  // FX skills: printed in the classes that grant them (Acolyte, Mage, Telepath, Occultist), not as skill pages.
  autohypnosis: { name: "Autohypnosis", ability: "wis", trainedOnly: true, armorPenalty: false, fx: true },
  psicraft: { name: "Psicraft", ability: "int", trainedOnly: true, armorPenalty: false, fx: true },
  spellcraft: { name: "Spellcraft", ability: "int", trainedOnly: true, armorPenalty: false, fx: true },
  useMagicDevice: { name: "Use Magic Device", ability: "cha", trainedOnly: true, armorPenalty: false, fx: true },
};

/** A skill's key in SKILLS from its printed name ("Move Silently" -> "moveSilently"), or undefined. */
export const skillKey = (name) => Object.keys(SKILLS).find((k) => SKILLS[k].name.toLowerCase() === name.toLowerCase());
