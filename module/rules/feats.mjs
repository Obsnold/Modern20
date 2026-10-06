/**
 * What feats and talents do: every one the system gives mechanics, in one
 * place, keyed by its identifier (rules/identify.mjs). The importer gives the
 * fixed bonuses their active effects, the character's numbers read the class
 * skills, skill bonuses and armor proficiencies, and attacks read the weapon
 * entries; nothing else knows a feat by name.
 *
 * A feat not listed here has no mechanics yet: its text is still on its item.
 *
 *   effects            fixed bonuses, as [key, value] active effect changes (Add)
 *   choice             what is chosen when it is taken ("weapon", "skill", ...)
 *   skillBonuses       bonuses on named skills, always: { "Listen": 2, "Craft (pharmaceutical)": 2 };
 *                      a skill named without a specialty covers all of its specialties
 *   situational        bonuses on skills in a situation, offered as a tick box when rolling:
 *                      [{ label, skills: [...] or "cha" (every Charisma-based skill), bonus }]
 *   skillBonus         a bonus to the skills chosen: a number, or { classLevel } for a class's level
 *   classSkills        skills it makes class skills
 *   grapple            a bonus on grapple checks
 *   skillBonus         a bonus to the skills chosen
 *   weaponFocus        a bonus to attacks with the weapon chosen
 *   finesse            Dexterity for attacks with the melee weapon chosen
 *   pointBlank         +1 to ranged attacks and damage within 30 feet (asked when attacking)
 *   proficiency        weapons it makes a character proficient with: "chosen" for the
 *                      exotic proficiencies, which name a weapon or group when taken
 *   armorProficiency   the weight of armor it lets a character wear without penalty
 *   fireMode           a firing mode it allows: "doubleTap" (a semiautomatic), "burst" (an
 *                      automatic); autofire needs no feat, but takes −4 without the one
 *                      with `autofire`
 *   autofire           no −4 on autofire (Advanced Firearms Proficiency)
 *   unarmed            what it does for an unarmed strike: `die` (nonlethal, or with `lethal`
 *                      either), `attack` bonus, `threat`, critical `multiplier` (rules/unarmed.mjs)
 *   streetfighting     extra damage once a round with an unarmed strike or light weapon
 *   speed              feet added to base speed
 *   wealth             added to a starting Wealth bonus (Windfall's +3)
 */
export const FEAT_RULES = {
  "great-fortitude": { effects: [["system.bonuses.saves.fort", 2]] },
  "iron-will": { effects: [["system.bonuses.saves.will", 2]] },
  "lightning-reflexes": { effects: [["system.bonuses.saves.ref", 2]] },
  "improved-initiative": { effects: [["system.bonuses.initiative", 4]] },
  "renown": { effects: [["system.bonuses.reputation", 3]] },
  "windfall": { wealth: 3, skillBonuses: { "Profession": 1 } },
  "toughness": { effects: [["system.bonuses.hitPoints", 3]] },
  "improved-damage-threshold": { effects: [["system.bonuses.massiveDamage", 3]] },

  // +2 on all checks with two skills (the d20 Modern "skill feats").
  "acrobatic": { skillBonuses: { "Jump": 2, "Tumble": 2 } },
  "alertness": { skillBonuses: { "Listen": 2, "Spot": 2 } },
  "animal-affinity": { skillBonuses: { "Handle Animal": 2, "Ride": 2 } },
  "athletic": { skillBonuses: { "Climb": 2, "Swim": 2 } },
  "attentive": { skillBonuses: { "Investigate": 2, "Sense Motive": 2 } },
  "cautious": { skillBonuses: { "Demolitions": 2, "Disable Device": 2 } },
  "confident": { skillBonuses: { "Gamble": 2, "Intimidate": 2 } },
  "deceptive": { skillBonuses: { "Bluff": 2, "Disguise": 2 } },
  "focused": { skillBonuses: { "Balance": 2, "Concentration": 2 } },
  "gearhead": { skillBonuses: { "Computer Use": 2, "Repair": 2 } },
  "guide": { skillBonuses: { "Navigate": 2, "Survival": 2 } },
  "magical-affinity": { skillBonuses: { "Spellcraft": 2, "Use Magic Device": 2 } },
  "medical-expert": { skillBonuses: { "Craft (pharmaceutical)": 2, "Treat Injury": 2 } },
  "meticulous": { skillBonuses: { "Forgery": 2, "Search": 2 } },
  "nimble": { skillBonuses: { "Escape Artist": 2, "Sleight of Hand": 2 } },
  "stealthy": { skillBonuses: { "Hide": 2, "Move Silently": 2 } },
  "studious": { skillBonuses: { "Decipher Script": 2, "Research": 2 } },
  "trustworthy": { skillBonuses: { "Diplomacy": 2, "Gather Information": 2 } },
  "vehicle-expert": { skillBonuses: { "Drive": 2, "Pilot": 2 } },
  "planetary-adaptation": { skillBonuses: { "Survival": 4 } },
  "builder": { choice: "two Craft skills", skillBonus: 2 },
  "creative": { choice: "two skills", skillBonus: 2 },
  "improved-grapple": { grapple: 4 },

  // Talents with skill bonuses: Healing Knack's always; Savant's the Smart level with the skill chosen;
  // the rest only in a situation, so asked when rolling.
  "healing-knack": { skillBonuses: { "Treat Injury": 2 } },
  "savant": { choice: "skill", skillBonus: { classLevel: "Smart Hero" } },
  "fast-talk": { situational: [{ label: "Fast-Talk: lying, cheating or bending the truth", skills: ["Bluff", "Diplomacy", "Gamble"], bonus: { classLevel: "Charismatic Hero" } }] },
  "charm": { choice: "gender", situational: [{ label: "Charm: influencing your chosen gender (indifferent or better)", skills: "cha", bonus: { classLevel: "Charismatic Hero" } }] },
  "empathy": { situational: [{ label: "Empathy: after a minute observing the target", skills: ["Bluff", "Diplomacy", "Handle Animal", "Intimidate", "Perform", "Sense Motive"], bonus: { classLevel: "Dedicated Hero" } }] },

  "arcane-skills": { classSkills: ["Concentration", "Craft (chemical)", "Spellcraft", "Use Magic Device"] },
  "psionic-skills": { classSkills: ["Autohypnosis", "Concentration", "Psicraft"] },
  "educated": { choice: "two Knowledge skills", skillBonus: 2 },
  "skill-emphasis": { choice: "skill", skillBonus: 3 },   // a Dedicated hero talent

  "weapon-focus": { choice: "weapon", weaponFocus: 1 },
  "weapon-finesse": { choice: "weapon", finesse: true },
  "point-blank-shot": { pointBlank: 1 },
  "double-tap": { fireMode: "doubleTap" },
  "burst-fire": { fireMode: "burst" },
  "advanced-firearms-proficiency": { autofire: true },

  "brawl": { unarmed: { die: "1d6", attack: 1 } },
  "improved-brawl": { unarmed: { die: "1d8", attack: 2 } },
  "combat-martial-arts": { unarmed: { die: "1d4", lethal: true } },
  "improved-combat-martial-arts": { unarmed: { threat: 19 } },
  "advanced-combat-martial-arts": { unarmed: { multiplier: 3 } },
  "streetfighting": { streetfighting: "1d4" },

  // Fast hero talents.
  "increased-speed": { speed: 5 },
  "improved-increased-speed": { speed: 5 },
  "advanced-increased-speed": { speed: 5 },
  "exotic-melee-weapon-proficiency": { choice: "weapon", proficiency: "chosen" },
  "exotic-firearms-proficiency": { choice: "weapon group", proficiency: "chosen" },

  "armor-proficiency-light": { armorProficiency: "light" },
  "armor-proficiency-medium": { armorProficiency: "medium" },
  "armor-proficiency-heavy": { armorProficiency: "heavy" },
  "armor-proficiency-powered": { armorProficiency: "powered" },
};

/** The rules for an owned feat or talent `{ identifier }`, or an empty object. */
export const rulesFor = (identifier) => FEAT_RULES[identifier] ?? {};
