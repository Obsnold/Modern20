/**
 * The rules of feats and talents that code must interpret, keyed by identifier
 * (rules/identify.mjs): what a weapon, a choice or a skill list does. Their
 * numbers (Alertness's +2s, Robust's hit points) and situational bonuses are
 * data on the items, from tools/build/mechanics.mjs, and need nothing here.
 *
 *   choice             what is chosen when it is taken ("weapon", "skill", ...)
 *   skillBonus         a bonus to the skills chosen: a number, or { classLevel } for a class's level
 *   classSkills        skills it makes class skills
 *   weaponFocus        a bonus to attacks with the weapon chosen
 *   weaponSpecialization  a bonus to damage with the weapon chosen (a class feature)
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
 *   wealth             added to a starting Wealth bonus (Windfall's +3)
 */
export const FEAT_RULES = {
  "windfall": { wealth: 3 },

  // Skill bonuses on what was chosen: Builder and Creative two skills each, Savant the Smart level on one.
  "builder": { choice: "two Craft skills", skillBonus: 2 },
  "creative": { choice: "two skills", skillBonus: 2 },
  "savant": { choice: "skill", skillBonus: { classLevel: "Smart Hero" } },
  "charm": { choice: "gender" },

  "arcane-skills": { classSkills: ["Concentration", "Craft (chemical)", "Spellcraft", "Use Magic Device"] },
  "psionic-skills": { classSkills: ["Autohypnosis", "Concentration", "Psicraft"] },
  "educated": { choice: "two Knowledge skills", skillBonus: 2 },
  "skill-emphasis": { choice: "skill", skillBonus: 3 },   // a Dedicated hero talent

  "weapon-focus": { choice: "weapon", weaponFocus: 1 },   // a feat, and a Soldier's 1st-level feature
  // Class features: +2 damage with a chosen weapon, and the Greater form's +2 more with the same one.
  "weapon-specialization": { choice: "weapon", weaponSpecialization: 2 },
  "greater-weapon-specialization": { choice: "weapon", weaponSpecialization: 2 },
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

  "exotic-melee-weapon-proficiency": { choice: "weapon", proficiency: "chosen" },
  "exotic-firearms-proficiency": { choice: "weapon group", proficiency: "chosen" },

  "armor-proficiency-light": { armorProficiency: "light" },
  "armor-proficiency-medium": { armorProficiency: "medium" },
  "armor-proficiency-heavy": { armorProficiency: "heavy" },
  "armor-proficiency-powered": { armorProficiency: "powered" },
};

/** The rules for an owned feat or talent `{ identifier }`, or an empty object. */
export const rulesFor = (identifier) => FEAT_RULES[identifier] ?? {};
