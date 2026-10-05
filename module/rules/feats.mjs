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
 *   classSkills        skills it makes class skills
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
 */
export const FEAT_RULES = {
  "great-fortitude": { effects: [["system.bonuses.saves.fort", 2]] },
  "iron-will": { effects: [["system.bonuses.saves.will", 2]] },
  "lightning-reflexes": { effects: [["system.bonuses.saves.ref", 2]] },
  "improved-initiative": { effects: [["system.bonuses.initiative", 4]] },
  "renown": { effects: [["system.bonuses.reputation", 3]] },
  "toughness": { effects: [["system.bonuses.hitPoints", 3]] },
  "improved-damage-threshold": { effects: [["system.bonuses.massiveDamage", 3]] },

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
  "exotic-melee-weapon-proficiency": { choice: "weapon", proficiency: "chosen" },
  "exotic-firearms-proficiency": { choice: "weapon group", proficiency: "chosen" },

  "armor-proficiency-light": { armorProficiency: "light" },
  "armor-proficiency-medium": { armorProficiency: "medium" },
  "armor-proficiency-heavy": { armorProficiency: "heavy" },
  "armor-proficiency-powered": { armorProficiency: "powered" },
};

/** The rules for an owned feat or talent `{ identifier }`, or an empty object. */
export const rulesFor = (identifier) => FEAT_RULES[identifier] ?? {};
