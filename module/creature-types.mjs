/**
 * The creature types, generated from data/creature_types.json by
 * tools/gen_creature_types.py.
 *
 * A type decides a creature's hit die, which of three base attack columns it
 * uses, which saves are good, and how many skill points and feats it gets —
 * everything needed to build one rather than copy one. Each carries the
 * per-size table the SRD prints with it: ability score ranges and natural
 * attack damage for a creature of that type and size.
 */

/** Keyed by id, so a lookup is a property access rather than a scan. */
export const CREATURE_TYPES = {
  "aberration": {
    "id": "aberration",
    "name": "Aberration",
    "description": "An aberration has a bizarre anatomy, strange abilities, an alien mindset, or any combination of the three. See Table: Aberrations for physical ability scores, recommended minimum Hit Dice, and damage based on size.",
    "hitDie": "d8",
    "baseAttack": "A",
    "baseAttackText": "3/4 of total Hit Dice (see Table: Creature Saves and Base Attack Bonuses).",
    "goodSaves": [
      "will"
    ],
    "skillPoints": "2 x Int score, plus 2 points per Hit Dice beyond 1 HD",
    "feats": "Int modifier (minimum +0), plus 1 feat per 4 Hit Dice beyond 1 HD",
    "traits": [
      {
        "name": "Weapon and Armor Proficiency",
        "text": "Aberrations receive one of the following as a bonus feat: Archaic Weapons Proficiency or Simple Weapons Proficiency. They are proficient with their natural weapons and any weapon mentioned in their entries. Aberrations noted for wearing armor gain the Armor Proficiency bonus feat for whatever type of armor they are accustomed to wearing (light, medium, heavy), as well as all lighter types."
      },
      {
        "name": "Darkvision (Ex)",
        "text": "Most aberrations have darkvision with a range of 60 feet."
      }
    ],
    "sizes": [
      {
        "size": "Colossal",
        "str": "42-43",
        "dex": "10-11",
        "con": "28-28",
        "minimumHD": "32d8",
        "extraHitPoints": 0,
        "slam": "2d6",
        "bite": "4d8",
        "claw": "2d8",
        "gore": "4d6"
      },
      {
        "size": "Gargantuan",
        "str": "34-35",
        "dex": "10-11",
        "con": "24-25",
        "minimumHD": "16d8",
        "extraHitPoints": 0,
        "slam": "1d8",
        "bite": "4d6",
        "claw": "2d6",
        "gore": "2d8"
      },
      {
        "size": "Huge",
        "str": "26-27",
        "dex": "10-11",
        "con": "24-25",
        "minimumHD": "8d8",
        "extraHitPoints": 0,
        "slam": "1d6",
        "bite": "2d8",
        "claw": "2d4",
        "gore": "2d6"
      },
      {
        "size": "Large",
        "str": "18-19",
        "dex": "12-13",
        "con": "16-17",
        "minimumHD": "2d8",
        "extraHitPoints": 0,
        "slam": "1d4",
        "bite": "2d6",
        "claw": "1d6",
        "gore": "1d8"
      },
      {
        "size": "Medium-size",
        "str": "10-11",
        "dex": "14-15",
        "con": "12-13",
        "minimumHD": "1d8",
        "extraHitPoints": 0,
        "slam": "1d3",
        "bite": "2d4",
        "claw": "1d4",
        "gore": "1d6"
      },
      {
        "size": "Small",
        "str": "6-7",
        "dex": "16-17",
        "con": "10-11",
        "minimumHD": "1/2 d8",
        "extraHitPoints": 0,
        "slam": "1d2",
        "bite": "1d6",
        "claw": "1d3",
        "gore": "1d4"
      },
      {
        "size": "Tiny",
        "str": "2-3",
        "dex": "18-19",
        "con": "10-11",
        "minimumHD": "1/4 d8",
        "extraHitPoints": 0,
        "slam": "1",
        "bite": "1d4",
        "claw": "1d2",
        "gore": "1d3"
      },
      {
        "size": "Diminutive",
        "str": "1",
        "dex": "20-21",
        "con": "10-11",
        "minimumHD": "1/8 d8",
        "extraHitPoints": 0,
        "slam": "-",
        "bite": "1d3",
        "claw": "1",
        "gore": "1d2"
      },
      {
        "size": "Fine",
        "str": "1",
        "dex": "22-23",
        "con": "10-11",
        "minimumHD": "1/16 d8",
        "extraHitPoints": 0,
        "slam": "-",
        "bite": "1d2",
        "claw": "-",
        "gore": "1"
      }
    ],
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/creaturetypes.html"
  },
  "animal": {
    "id": "animal",
    "name": "Animal",
    "description": "An animal is a nonhumanoid creature, usually a vertebrate with no magical abilities and no innate capacity for language or culture. See Table: Animals for physical ability scores, recommended minimum Hit Dice, and damage based on size.",
    "hitDie": "d8",
    "baseAttack": "A",
    "baseAttackText": "3/4 of total Hit Dice (see Table: Creature Saves and Base Attack Bonuses).",
    "goodSaves": [
      "fort",
      "ref"
    ],
    "skillPoints": "10–15",
    "feats": "None",
    "traits": [
      {
        "name": "Weapon and Armor Proficiency",
        "text": "Animals are proficient with their natural weapons only. They are not proficient with armor."
      },
      {
        "name": "Ability Scores",
        "text": "Animals have Intelligence scores of 1 or 2 (predatory animals tend to have Intelligence scores of 2). No creature with an Intelligence score of 3 or higher can be an animal."
      },
      {
        "name": "Low-Light Vision (Ex)",
        "text": "Most animals have low-light vision"
      }
    ],
    "sizes": [
      {
        "size": "Colossal",
        "str": "42-43",
        "dex": "10-11",
        "con": "28-29",
        "minimumHD": "32d8",
        "extraHitPoints": 0,
        "slam": "2d6",
        "bite": "4d6",
        "claw": "2d8",
        "gore": "4d6"
      },
      {
        "size": "Gargantuan",
        "str": "34-35",
        "dex": "10-11",
        "con": "24-25",
        "minimumHD": "16d8",
        "extraHitPoints": 0,
        "slam": "1d8",
        "bite": "2d8",
        "claw": "2d6",
        "gore": "2d8"
      },
      {
        "size": "Huge",
        "str": "26-27",
        "dex": "10-11",
        "con": "20-21",
        "minimumHD": "4d8",
        "extraHitPoints": 0,
        "slam": "1d6",
        "bite": "2d6",
        "claw": "2d4",
        "gore": "2d6"
      },
      {
        "size": "Large",
        "str": "18-19",
        "dex": "12-13",
        "con": "16-17",
        "minimumHD": "2d8",
        "extraHitPoints": 0,
        "slam": "1d4",
        "bite": "1d8",
        "claw": "1d6",
        "gore": "1d8"
      },
      {
        "size": "Medium-size",
        "str": "10-11",
        "dex": "14-15",
        "con": "12-13",
        "minimumHD": "1d8",
        "extraHitPoints": 0,
        "slam": "1d3",
        "bite": "1d6",
        "claw": "1d4",
        "gore": "1d6"
      },
      {
        "size": "Small",
        "str": "6-7",
        "dex": "16-17",
        "con": "10-11",
        "minimumHD": "1/2 d8",
        "extraHitPoints": 0,
        "slam": "1d2",
        "bite": "1d4",
        "claw": "1d3",
        "gore": "1d4"
      },
      {
        "size": "Tiny",
        "str": "2-3",
        "dex": "18-19",
        "con": "10-11",
        "minimumHD": "1/4 d8",
        "extraHitPoints": 0,
        "slam": "1",
        "bite": "1d3",
        "claw": "1d2",
        "gore": "1d3"
      },
      {
        "size": "Diminutive",
        "str": "1",
        "dex": "20-21",
        "con": "10-11",
        "minimumHD": "1/8 d8",
        "extraHitPoints": 0,
        "slam": "-",
        "bite": "1d2",
        "claw": "1",
        "gore": "1d2"
      },
      {
        "size": "Fine",
        "str": "1",
        "dex": "22-23",
        "con": "10-11",
        "minimumHD": "1/16 d8",
        "extraHitPoints": 0,
        "slam": "-",
        "bite": "1",
        "claw": "-",
        "gore": "1"
      }
    ],
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/creaturetypes.html"
  },
  "construct": {
    "id": "construct",
    "name": "Construct",
    "description": "A construct is an animated object or artificially constructed creature. See Table: Constructs for physical ability scores, recommended minimum Hit Dice, and damage based on size.",
    "hitDie": "d10",
    "baseAttack": "A",
    "baseAttackText": "3/4 of total Hit Dice (see Table: Creature Saves and Base Attack Bonuses).",
    "goodSaves": [],
    "skillPoints": "None",
    "feats": "None",
    "traits": [
      {
        "name": "Weapon and Armor Proficiency",
        "text": "Constructs are proficient with their natural weapons only. They are not proficient with armor."
      },
      {
        "name": "Ability Scores",
        "text": "Constructs have no Constitution score and usually no Intelligence score."
      },
      {
        "name": "Extra Hit Points",
        "text": "Constructs gain extra hit points according to size, as shown on Table: Constructs"
      },
      {
        "name": "Darkvision (Ex)",
        "text": "Most constructs have darkvision with a range of 60 feet"
      },
      {
        "name": "Immunities",
        "text": "Constructs are immune to mind-influencing effects and to poison, sleep, paralysis, stunning, disease, necromancy effects, and any effect that requires a Fortitude save unless the effect also works on objects or is harmless. They are not subject to critical hits, nonlethal damage, ability damage, ability drain, energy drain, or the effects of massive damage"
      },
      {
        "name": "Repairable",
        "text": "Constructs cannot heal damage on their own but can be repaired using the Repair skill. A successful Repair check (DC 30) heals 1d10 points of damage to a construct, and each check represents 1 hour of work. A construct reduced to 0 hit points is immediately destroyed and cannot be repaired."
      },
      {
        "name": "Special",
        "text": "Constructs cannot be raised from the dead."
      }
    ],
    "sizes": [
      {
        "size": "Colossal",
        "str": "44-47",
        "dex": "6-7",
        "con": "-",
        "minimumHD": "32d10",
        "extraHitPoints": 120,
        "slam": "4d6",
        "bite": "2d6",
        "claw": "2d8",
        "gore": "4d6"
      },
      {
        "size": "Gargantuan",
        "str": "36-39",
        "dex": "6-7",
        "con": "-",
        "minimumHD": "16d10",
        "extraHitPoints": 80,
        "slam": "2d8",
        "bite": "1d8",
        "claw": "2d6",
        "gore": "2d8"
      },
      {
        "size": "Huge",
        "str": "28-31",
        "dex": "6-7",
        "con": "-",
        "minimumHD": "8d10",
        "extraHitPoints": 40,
        "slam": "2d6",
        "bite": "1d6",
        "claw": "2d4",
        "gore": "2d6"
      },
      {
        "size": "Large",
        "str": "20-23",
        "dex": "8-9",
        "con": "-",
        "minimumHD": "2d10",
        "extraHitPoints": 20,
        "slam": "1d8",
        "bite": "1d4",
        "claw": "1d6",
        "gore": "1d8"
      },
      {
        "size": "Medium-size",
        "str": "12-15",
        "dex": "10-11",
        "con": "-",
        "minimumHD": "1d10",
        "extraHitPoints": 10,
        "slam": "1d6",
        "bite": "1d3",
        "claw": "1d4",
        "gore": "1d6"
      },
      {
        "size": "Small",
        "str": "8-11",
        "dex": "12-13",
        "con": "-",
        "minimumHD": "1/2 d10",
        "extraHitPoints": 5,
        "slam": "1d4",
        "bite": "1d2",
        "claw": "1d3",
        "gore": "1d4"
      },
      {
        "size": "Tiny",
        "str": "4-7",
        "dex": "14-15",
        "con": "-",
        "minimumHD": "1/4 d10",
        "extraHitPoints": 0,
        "slam": "1d3",
        "bite": "1",
        "claw": "1d2",
        "gore": "1d3"
      },
      {
        "size": "Diminutive",
        "str": "2-5",
        "dex": "16-17",
        "con": "-",
        "minimumHD": "1/8 d10",
        "extraHitPoints": 0,
        "slam": "1d2",
        "bite": "-",
        "claw": "1",
        "gore": "1d2"
      },
      {
        "size": "Fine",
        "str": "1",
        "dex": "18-19",
        "con": "-",
        "minimumHD": "1/16 d10",
        "extraHitPoints": 0,
        "slam": "1",
        "bite": "-",
        "claw": "-",
        "gore": "1"
      }
    ],
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/creaturetypes.html"
  },
  "dragon": {
    "id": "dragon",
    "name": "Dragon",
    "description": "A dragon is a reptilian creature, usually winged, with magical or unusual abilities. See Table: Dragons for physical ability scores, recommended minimum Hit Dice, and damage based on size.",
    "hitDie": "d12",
    "baseAttack": "B",
    "baseAttackText": "Total Hit Dice (see Table: Creature Saves and Base Attack Bonuses).",
    "goodSaves": [
      "fort",
      "ref",
      "will"
    ],
    "skillPoints": "6 + Int modifier per Hit Dice beyond 1 HD",
    "feats": "1, plus 1 feat per 4 Hit Dice beyond 1 HD",
    "traits": [
      {
        "name": "Weapon and Armor Proficiency",
        "text": "Dragons are proficient with their natural weapons only. They are not proficient with armor."
      },
      {
        "name": "Darkvision (Ex)",
        "text": "Most dragons have darkvision with a range of 60 feet"
      },
      {
        "name": "Immunities",
        "text": "Dragons are immune to sleep, hold, and paralysis effects"
      }
    ],
    "sizes": [
      {
        "size": "Colossal",
        "str": "46-47",
        "dex": "6-7",
        "con": "30-31",
        "minimumHD": "38d12",
        "extraHitPoints": 0,
        "slam": "2d8",
        "bite": "4d8",
        "claw": "4d6",
        "gore": "4d6"
      },
      {
        "size": "Gargantuan",
        "str": "38-39",
        "dex": "6-7",
        "con": "26-27",
        "minimumHD": "27d12",
        "extraHitPoints": 0,
        "slam": "2d6",
        "bite": "4d6",
        "claw": "2d8",
        "gore": "2d8"
      },
      {
        "size": "Huge",
        "str": "30-31",
        "dex": "6-7",
        "con": "22-23",
        "minimumHD": "19d12",
        "extraHitPoints": 0,
        "slam": "1d8",
        "bite": "2d8",
        "claw": "2d6",
        "gore": "2d6"
      },
      {
        "size": "Large",
        "str": "22-23",
        "dex": "8-9",
        "con": "18-19",
        "minimumHD": "10d12",
        "extraHitPoints": 0,
        "slam": "1d6",
        "bite": "2d6",
        "claw": "1d8",
        "gore": "1d8"
      },
      {
        "size": "Medium-size",
        "str": "14-15",
        "dex": "10-11",
        "con": "14-15",
        "minimumHD": "7d12",
        "extraHitPoints": 0,
        "slam": "1d4",
        "bite": "1d8",
        "claw": "1d6",
        "gore": "1d6"
      },
      {
        "size": "Small",
        "str": "10-11",
        "dex": "12-13",
        "con": "12-13",
        "minimumHD": "4d12",
        "extraHitPoints": 0,
        "slam": "-",
        "bite": "1d6",
        "claw": "1d4",
        "gore": "1d4"
      },
      {
        "size": "Tiny",
        "str": "6-7",
        "dex": "14-15",
        "con": "12-13",
        "minimumHD": "3d12",
        "extraHitPoints": 0,
        "slam": "-",
        "bite": "1d4",
        "claw": "1d3",
        "gore": "1d3"
      },
      {
        "size": "Diminutive",
        "str": "4-5",
        "dex": "16-17",
        "con": "12-13",
        "minimumHD": "1d12",
        "extraHitPoints": 0,
        "slam": "-",
        "bite": "1d3",
        "claw": "1d2",
        "gore": "1d2"
      },
      {
        "size": "Fine",
        "str": "4-5",
        "dex": "18-19",
        "con": "12-13",
        "minimumHD": "1/2d12",
        "extraHitPoints": 0,
        "slam": "-",
        "bite": "1d2",
        "claw": "1",
        "gore": "1"
      }
    ],
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/creaturetypes.html"
  },
  "elemental": {
    "id": "elemental",
    "name": "Elemental",
    "description": "An elemental is a being composed of one of the four classical elements: air, earth, fire, or water. See Table: Elementals for physical ability scores, recommended minimum Hit Dice, and damage based on size.",
    "hitDie": "d8",
    "baseAttack": "A",
    "baseAttackText": "3/4 of total Hit Dice (see Table: Creature Saves and Base Attack Bonuses).",
    "goodSaves": [
      "fort",
      "ref"
    ],
    "skillPoints": "2 x Int score, plus 2 points per Hit Dice beyond 1 HD",
    "feats": "Int modifier (minimum 0), plus 1 feat per 4 Hit Dice beyond 1 HD",
    "traits": [
      {
        "name": "Weapon and Armor Proficiency",
        "text": "Elementals are proficient with their natural weapons only. They are not proficient with armor."
      },
      {
        "name": "Darkvision (Ex)",
        "text": "Most elementals have darkvision with a range of 60 feet."
      },
      {
        "name": "Immunities",
        "text": "Elementals are immune to poison, sleep, paralysis, and stunning. They are not subject to critical hits, flanking, or the effects of massive damage."
      },
      {
        "name": "Special",
        "text": "Elementals cannot be raised from the dead."
      }
    ],
    "sizes": [
      {
        "size": "Colossal",
        "str": "44-45",
        "dex": "6-7",
        "con": "28-29",
        "minimumHD": "32d8",
        "extraHitPoints": 0,
        "slam": "4d6",
        "bite": "4d6",
        "claw": "2d8",
        "gore": "2d6"
      },
      {
        "size": "Gargantuan",
        "str": "36-37",
        "dex": "6-7",
        "con": "24-25",
        "minimumHD": "16d8",
        "extraHitPoints": 0,
        "slam": "2d8",
        "bite": "2d8",
        "claw": "2d6",
        "gore": "1d8"
      },
      {
        "size": "Huge",
        "str": "28-29",
        "dex": "6-7",
        "con": "20-21",
        "minimumHD": "8d8",
        "extraHitPoints": 0,
        "slam": "2d6",
        "bite": "2d6",
        "claw": "2d4",
        "gore": "1d6"
      },
      {
        "size": "Large",
        "str": "20-21",
        "dex": "8-9",
        "con": "16-17",
        "minimumHD": "4d8",
        "extraHitPoints": 0,
        "slam": "1d8",
        "bite": "1d8",
        "claw": "1d6",
        "gore": "1d4"
      },
      {
        "size": "Medium-size",
        "str": "12-13",
        "dex": "10-11",
        "con": "12-13",
        "minimumHD": "2d8",
        "extraHitPoints": 0,
        "slam": "1d6",
        "bite": "1d6",
        "claw": "1d4",
        "gore": "1d3"
      },
      {
        "size": "Small",
        "str": "8-9",
        "dex": "12-13",
        "con": "10-11",
        "minimumHD": "1d8",
        "extraHitPoints": 0,
        "slam": "1d4",
        "bite": "1d4",
        "claw": "1d3",
        "gore": "1d2"
      },
      {
        "size": "Tiny",
        "str": "6-7",
        "dex": "14-15",
        "con": "10-11",
        "minimumHD": "1/2 d8",
        "extraHitPoints": 0,
        "slam": "1d3",
        "bite": "1d3",
        "claw": "1d2",
        "gore": "1"
      },
      {
        "size": "Diminutive",
        "str": "4-5",
        "dex": "16-17",
        "con": "10-11",
        "minimumHD": "1/4 d8",
        "extraHitPoints": 0,
        "slam": "1d2",
        "bite": "1d2",
        "claw": "1",
        "gore": "1"
      },
      {
        "size": "Fine",
        "str": "4-5",
        "dex": "18-19",
        "con": "10-11",
        "minimumHD": "1/8 d8",
        "extraHitPoints": 0,
        "slam": "1",
        "bite": "1",
        "claw": "-",
        "gore": "-"
      }
    ],
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/creaturetypes.html"
  },
  "fey": {
    "id": "fey",
    "name": "Fey",
    "description": "A fey is a creature with supernatural abilities and connections to nature or some other force or place. Fey are usually human-shaped. See Table: Fey for physical ability scores, recommended minimum Hit Dice, and damage based on size.",
    "hitDie": "d6",
    "baseAttack": "C",
    "baseAttackText": "1/2 of total Hit Dice (see Table: Creature Saves and Base Attack Bonuses).",
    "goodSaves": [
      "will"
    ],
    "skillPoints": "3 x Int score, plus 2 points per Hit Dice beyond 1 HD",
    "feats": "1 + Int modifier (minimum 0), plus 1 feat per 4 Hit Dice beyond 1 HD",
    "traits": [
      {
        "name": "Weapon and Armor Proficiency",
        "text": "A fey receives either Archaic Weapons Proficiency or Simple Weapons Proficiency as a bonus feat. Fey are proficient with any weapon mentioned in their entries. Fey noted for wearing armor gain the bonus feat Armor Proficiency with whatever type of armor they are accustomed to wearing (light, medium, heavy), as well as all lighter types."
      },
      {
        "name": "Low-Light Vision (Ex)",
        "text": "Most fey have low-light vision."
      }
    ],
    "sizes": [
      {
        "size": "Colossal",
        "str": "42-43",
        "dex": "8-9",
        "con": "26-27",
        "minimumHD": "32d6",
        "extraHitPoints": 0,
        "slam": "2d6",
        "bite": "2d8",
        "claw": "2d8",
        "gore": "4d6"
      },
      {
        "size": "Gargantuan",
        "str": "34-35",
        "dex": "8-9",
        "con": "22-23",
        "minimumHD": "16d6",
        "extraHitPoints": 0,
        "slam": "1d8",
        "bite": "2d6",
        "claw": "2d6",
        "gore": "2d8"
      },
      {
        "size": "Huge",
        "str": "26-27",
        "dex": "8-9",
        "con": "18-19",
        "minimumHD": "8d6",
        "extraHitPoints": 0,
        "slam": "1d6",
        "bite": "1d8",
        "claw": "2d4",
        "gore": "2d6"
      },
      {
        "size": "Large",
        "str": "18-19",
        "dex": "10-11",
        "con": "14-15",
        "minimumHD": "2d6",
        "extraHitPoints": 0,
        "slam": "1d4",
        "bite": "1d6",
        "claw": "1d6",
        "gore": "1d8"
      },
      {
        "size": "Medium-size",
        "str": "10-11",
        "dex": "12-13",
        "con": "10-11",
        "minimumHD": "1d6",
        "extraHitPoints": 0,
        "slam": "1d3",
        "bite": "1d4",
        "claw": "1d4",
        "gore": "1d6"
      },
      {
        "size": "Small",
        "str": "6-7",
        "dex": "14-16",
        "con": "8-9",
        "minimumHD": "1/2 d6",
        "extraHitPoints": 0,
        "slam": "1d2",
        "bite": "1d3",
        "claw": "1d3",
        "gore": "1d4"
      },
      {
        "size": "Tiny",
        "str": "2-3",
        "dex": "16-17",
        "con": "8-9",
        "minimumHD": "1/4 d6",
        "extraHitPoints": 0,
        "slam": "1",
        "bite": "1d2",
        "claw": "1d2",
        "gore": "1d3"
      },
      {
        "size": "Diminutive",
        "str": "1",
        "dex": "18-19",
        "con": "8-9",
        "minimumHD": "1/8 d6",
        "extraHitPoints": 0,
        "slam": "-",
        "bite": "1",
        "claw": "1",
        "gore": "1d2"
      },
      {
        "size": "Fine",
        "str": "1",
        "dex": "20-21",
        "con": "8-9",
        "minimumHD": "1/16 d6",
        "extraHitPoints": 0,
        "slam": "-",
        "bite": "-",
        "claw": "-",
        "gore": "1"
      }
    ],
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/creaturetypes.html"
  },
  "giant": {
    "id": "giant",
    "name": "Giant",
    "description": "A giant is a humanoid creature of Large size or larger. Giants are known for their great strength. See Table: Giants for physical ability scores, recommended minimum Hit Dice, and damage based on size.",
    "hitDie": "d8",
    "baseAttack": "A",
    "baseAttackText": "3/4 of total Hit Dice (see Table: Creature Saves and Base Attack Bonuses).",
    "goodSaves": [
      "fort"
    ],
    "skillPoints": "6 + Int modifier (minimum 1), plus 1 points per Hit Dice beyond 1 HD",
    "feats": "1, plus 1 feat per 4 Hit Dice beyond 1 HD",
    "traits": [
      {
        "name": "Size",
        "text": "Giants must be Large or larger."
      },
      {
        "name": "Weapon and Armor Proficiency",
        "text": "Giants receive either Archaic Weapons Proficiency or Simple Weapons Proficiency as a bonus feat. They are proficient with their natural weapons and any weapon mentioned in their entries. Giants noted for wearing armor gain the bonus feat Armor Proficiency with whatever type of armor they are accustomed to wearing (light, medium, heavy), as well as all lighter types."
      },
      {
        "name": "Low-Light Vision (Ex)",
        "text": "Most giants have low-light vision."
      }
    ],
    "sizes": [
      {
        "size": "Colossal",
        "str": "46-47",
        "dex": "6-7",
        "con": "28-31",
        "minimumHD": "32d8",
        "extraHitPoints": 0,
        "slam": "2d6",
        "bite": "2d8",
        "claw": "2d8",
        "gore": "4d6"
      },
      {
        "size": "Gargantuan",
        "str": "38-39",
        "dex": "6-7",
        "con": "24-27",
        "minimumHD": "16d8",
        "extraHitPoints": 0,
        "slam": "1d8",
        "bite": "2d6",
        "claw": "2d6",
        "gore": "2d8"
      },
      {
        "size": "Huge",
        "str": "30-31",
        "dex": "6-7",
        "con": "20-23",
        "minimumHD": "8d8",
        "extraHitPoints": 0,
        "slam": "1d6",
        "bite": "1d8",
        "claw": "2d4",
        "gore": "2d6"
      },
      {
        "size": "Large",
        "str": "22-23",
        "dex": "8-9",
        "con": "16-19",
        "minimumHD": "2d8",
        "extraHitPoints": 0,
        "slam": "1d4",
        "bite": "1d6",
        "claw": "1d6",
        "gore": "1d8"
      }
    ],
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/creaturetypes.html"
  },
  "humanoid": {
    "id": "humanoid",
    "name": "Humanoid",
    "description": "A humanoid usually has two arms, two legs, and one head, or a humanlike torso, arms, and head. A humanoid has few or no supernatural or extraordinary abilities. See Table: Humanoids for physical ability scores, recommended minimum Hit Dice, and damage based on size.",
    "hitDie": "d8",
    "baseAttack": "A",
    "baseAttackText": "3/4 of total Hit Dice (see Table: Creature Saves and Base Attack Bonuses).",
    "goodSaves": [
      "ref"
    ],
    "skillPoints": "6 + Int modifier, plus 1 point per Hit Dice beyond 1 HD",
    "feats": "1, plus 1 feat per 4 Hit Dice beyond 1 HD",
    "traits": [
      {
        "name": "Size",
        "text": "Humanoids must be Medium-size or smaller"
      },
      {
        "name": "Weapon and Armor Proficiency",
        "text": "Humanoids with more than 1 Hit Die receive one bonus feat selected from the following list: Archaic Weapons Proficiency, Armor Proficiency (light), or Simple Weapons Proficiency."
      },
      {
        "name": "Keen Sight (Ex)",
        "text": "Humanoids accustomed to living underground may have darkvision with a range of 60 feet, low-light vision, or both (as noted in their entries)."
      }
    ],
    "sizes": [
      {
        "size": "Medium-size",
        "str": "10-15",
        "dex": "10-13",
        "con": "10-11",
        "minimumHD": "1d8",
        "extraHitPoints": 0,
        "slam": "1d3",
        "bite": "1d4",
        "claw": "1d4",
        "gore": "1d6"
      },
      {
        "size": "Small",
        "str": "6-11",
        "dex": "12-15",
        "con": "8-9",
        "minimumHD": "1/2 d8",
        "extraHitPoints": 0,
        "slam": "1d2",
        "bite": "1d3",
        "claw": "1d3",
        "gore": "1d4"
      },
      {
        "size": "Tiny",
        "str": "2-7",
        "dex": "14-17",
        "con": "8-9",
        "minimumHD": "1/4 d8",
        "extraHitPoints": 0,
        "slam": "1",
        "bite": "1d2",
        "claw": "1d2",
        "gore": "1d3"
      },
      {
        "size": "Diminutive",
        "str": "1",
        "dex": "16-19",
        "con": "8-9",
        "minimumHD": "1/8 d8",
        "extraHitPoints": 0,
        "slam": "-",
        "bite": "1",
        "claw": "1",
        "gore": "1d2"
      },
      {
        "size": "Fine",
        "str": "1",
        "dex": "18-21",
        "con": "8-9",
        "minimumHD": "1/16 d8",
        "extraHitPoints": 0,
        "slam": "-",
        "bite": "-",
        "claw": "-",
        "gore": "1"
      }
    ],
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/creaturetypes.html"
  },
  "magicalBeast": {
    "id": "magicalBeast",
    "name": "Magical Beast",
    "description": "A magical beast is similar to an animal but can have an Intelligence score higher than 2. A magical beast might possess supernatural or extraordinary abilities, or it might be bizarre in appearance and habits. See Table: Magical Beasts for physical ability scores, recommended minimum Hit Dice, and damage based on size.",
    "hitDie": "d10",
    "baseAttack": "B",
    "baseAttackText": "Total Hit Dice (see Table: Creature Saves and Base Attack Bonuses).",
    "goodSaves": [
      "fort",
      "ref"
    ],
    "skillPoints": "2 x Int score, plus 1 point per Hit Dice beyond 1 HD, or 10–15 points if Int score is 1 or 2.",
    "feats": "1 + Int modifier (minimum 0), plus 1 feat per 4 Hit Dice beyond 1 HD",
    "traits": [
      {
        "name": "Weapon and Armor Proficiency",
        "text": "Magical beasts are proficient with their natural weapons only. They are not proficient with armor."
      },
      {
        "name": "Keen Sight (Ex)",
        "text": "Magical beasts have darkvision with a range of 60 feet and low-light vision (unless noted otherwise)."
      }
    ],
    "sizes": [
      {
        "size": "Colossal",
        "str": "42-43",
        "dex": "10-11",
        "con": "28-29",
        "minimumHD": "32d10",
        "extraHitPoints": 0,
        "slam": "2d6",
        "bite": "4d6",
        "claw": "2d8",
        "gore": "4d6"
      },
      {
        "size": "Gargantuan",
        "str": "34-35",
        "dex": "10-11",
        "con": "24-25",
        "minimumHD": "16d10",
        "extraHitPoints": 0,
        "slam": "1d8",
        "bite": "2d8",
        "claw": "2d6",
        "gore": "2d8"
      },
      {
        "size": "Huge",
        "str": "26-27",
        "dex": "10-11",
        "con": "20-21",
        "minimumHD": "8d10",
        "extraHitPoints": 0,
        "slam": "1d6",
        "bite": "2d6",
        "claw": "2d4",
        "gore": "2d6"
      },
      {
        "size": "Large",
        "str": "18-19",
        "dex": "12-13",
        "con": "16-17",
        "minimumHD": "2d10",
        "extraHitPoints": 0,
        "slam": "1d4",
        "bite": "1d8",
        "claw": "1d6",
        "gore": "1d8"
      },
      {
        "size": "Medium-size",
        "str": "10-11",
        "dex": "14-15",
        "con": "12-13",
        "minimumHD": "1d10",
        "extraHitPoints": 0,
        "slam": "1d3",
        "bite": "1d6",
        "claw": "1d4",
        "gore": "1d6"
      },
      {
        "size": "Small",
        "str": "6-7",
        "dex": "16-17",
        "con": "10-11",
        "minimumHD": "1/2 d10",
        "extraHitPoints": 0,
        "slam": "1d2",
        "bite": "1d4",
        "claw": "1d3",
        "gore": "1d4"
      },
      {
        "size": "Tiny",
        "str": "2-3",
        "dex": "18-19",
        "con": "10-11",
        "minimumHD": "1/4 d10",
        "extraHitPoints": 0,
        "slam": "1",
        "bite": "1d3",
        "claw": "1d2",
        "gore": "1d3"
      },
      {
        "size": "Diminutive",
        "str": "1",
        "dex": "20-21",
        "con": "10-11",
        "minimumHD": "1/8 d10",
        "extraHitPoints": 0,
        "slam": "-",
        "bite": "1d2",
        "claw": "1",
        "gore": "1d2"
      },
      {
        "size": "Fine",
        "str": "1",
        "dex": "22-23",
        "con": "10-11",
        "minimumHD": "1/16 d10",
        "extraHitPoints": 0,
        "slam": "-",
        "bite": "1",
        "claw": "-",
        "gore": "1"
      }
    ],
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/creaturetypes.html"
  },
  "monstrousHumanoid": {
    "id": "monstrousHumanoid",
    "name": "Monstrous Humanoid",
    "description": "",
    "hitDie": "d8",
    "baseAttack": "B",
    "baseAttackText": "Total Hit Dice (see Table: Creature Saves and Base Attack Bonuses).",
    "goodSaves": [
      "ref",
      "will"
    ],
    "skillPoints": "2 x Int score, plus 2 points per Hit Dice beyond 1 HD",
    "feats": "1 + Int modifier (minimum 0), plus 1 feat per 4 Hit Dice beyond 1 HD",
    "traits": [
      {
        "name": "Weapon and Armor Proficiency",
        "text": "Monstrous humanoids receive either Archaic Weapons Proficiency or Simple Weapons Proficiency as a bonus feat. They are proficient with their natural attacks and any weapon mentioned in their entries. Monstrous humanoids noted for wearing armor gain the bonus feat Armor Proficiency with whatever type of armor they are accustomed to wearing (light, medium, heavy), as well as all lighter types."
      },
      {
        "name": "Darkvision (Ex)",
        "text": "Most monstrous humanoids have darkvision with a range of 60 feet."
      }
    ],
    "sizes": [
      {
        "size": "Colossal",
        "str": "42-43",
        "dex": "8-9",
        "con": "26-27",
        "minimumHD": "32d8",
        "extraHitPoints": 0,
        "slam": "2d6",
        "bite": "2d8",
        "claw": "2d8",
        "gore": "4d6"
      },
      {
        "size": "Gargantuan",
        "str": "34-35",
        "dex": "8-9",
        "con": "22-23",
        "minimumHD": "16d8",
        "extraHitPoints": 0,
        "slam": "1d8",
        "bite": "2d6",
        "claw": "2d6",
        "gore": "2d8"
      },
      {
        "size": "Huge",
        "str": "26-27",
        "dex": "8-9",
        "con": "18-19",
        "minimumHD": "8d8",
        "extraHitPoints": 0,
        "slam": "1d6",
        "bite": "1d8",
        "claw": "2d4",
        "gore": "2d6"
      },
      {
        "size": "Large",
        "str": "18-19",
        "dex": "10-11",
        "con": "14-15",
        "minimumHD": "2d8",
        "extraHitPoints": 0,
        "slam": "1d4",
        "bite": "1d6",
        "claw": "1d6",
        "gore": "1d8"
      },
      {
        "size": "Medium-size",
        "str": "10-11",
        "dex": "12-13",
        "con": "10-11",
        "minimumHD": "1d8",
        "extraHitPoints": 0,
        "slam": "1d3",
        "bite": "1d4",
        "claw": "1d4",
        "gore": "1d6"
      },
      {
        "size": "Small",
        "str": "6-7",
        "dex": "14-15",
        "con": "8-9",
        "minimumHD": "1/2 d8",
        "extraHitPoints": 0,
        "slam": "1d2",
        "bite": "1d4",
        "claw": "1d3",
        "gore": "1d4"
      },
      {
        "size": "Tiny",
        "str": "2-3",
        "dex": "16-17",
        "con": "8-9",
        "minimumHD": "1/4 d8",
        "extraHitPoints": 0,
        "slam": "1",
        "bite": "1d2",
        "claw": "1d2",
        "gore": "1d3"
      },
      {
        "size": "Diminutive",
        "str": "1",
        "dex": "18-19",
        "con": "8-9",
        "minimumHD": "1/8 d8",
        "extraHitPoints": 0,
        "slam": "-",
        "bite": "1",
        "claw": "1",
        "gore": "1d2"
      },
      {
        "size": "Fine",
        "str": "1",
        "dex": "20-21",
        "con": "8-9",
        "minimumHD": "1/16 d8",
        "extraHitPoints": 0,
        "slam": "-",
        "bite": "-",
        "claw": "-",
        "gore": "1"
      }
    ],
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/creaturetypes.html"
  },
  "ooze": {
    "id": "ooze",
    "name": "Ooze",
    "description": "An ooze is an amorphous or mutable creature. See Table: Oozes for physical ability scores, recommended minimum Hit Dice, and damage based on size.",
    "hitDie": "d10",
    "baseAttack": "A",
    "baseAttackText": "3/4 of total Hit Dice (see Table: Creature Saves and Base Attack Bonuses).",
    "goodSaves": [],
    "skillPoints": "None",
    "feats": "None",
    "traits": [
      {
        "name": "Weapon and Armor Proficiency",
        "text": "Oozes are proficient with their natural weapons only, but not with armor."
      },
      {
        "name": "Ability Scores",
        "text": "Oozes have no Intelligence score."
      },
      {
        "name": "Extra Hit Points",
        "text": "An ooze has no natural armor rating but is difficult to kill because of its protoplasmic body. It gains extra hit points (in addition to those from its Hit Dice and Constitution score) according to size, as shown on Table: Oozes."
      },
      {
        "name": "Immunities",
        "text": "Oozes are immune to mind-affecting effects, poison, sleep, paralysis, stunning, gaze attacks, visual effects, illusions, and other attack forms that rely on sight. Oozes are not subject to critical hits, flanking, or the effects of massive damage."
      },
      {
        "name": "Blindsight (Ex)",
        "text": "Most oozes have blindsight with a range of 60 feet."
      }
    ],
    "sizes": [
      {
        "size": "Colossal",
        "str": "44-45",
        "dex": "6-7",
        "con": "26-29",
        "minimumHD": "32d10",
        "extraHitPoints": 40,
        "slam": "4d6",
        "bite": "4d6",
        "claw": "2d8",
        "gore": "2d6"
      },
      {
        "size": "Gargantuan",
        "str": "36-37",
        "dex": "6-7",
        "con": "22-25",
        "minimumHD": "16d10",
        "extraHitPoints": 30,
        "slam": "2d8",
        "bite": "2d8",
        "claw": "2d6",
        "gore": "1d8"
      },
      {
        "size": "Huge",
        "str": "28-29",
        "dex": "6-7",
        "con": "18-21",
        "minimumHD": "8d10",
        "extraHitPoints": 20,
        "slam": "2d6",
        "bite": "2d6",
        "claw": "2d4",
        "gore": "1d6"
      },
      {
        "size": "Large",
        "str": "20-21",
        "dex": "8-9",
        "con": "14-17",
        "minimumHD": "2d10",
        "extraHitPoints": 15,
        "slam": "1d8",
        "bite": "1d8",
        "claw": "1d6",
        "gore": "1d4"
      },
      {
        "size": "Medium-size",
        "str": "12-13",
        "dex": "10-11",
        "con": "10-13",
        "minimumHD": "1d10",
        "extraHitPoints": 10,
        "slam": "1d6",
        "bite": "1d6",
        "claw": "1d4",
        "gore": "1d3"
      },
      {
        "size": "Small",
        "str": "8-9",
        "dex": "12-13",
        "con": "8-9",
        "minimumHD": "1/2 d10",
        "extraHitPoints": 5,
        "slam": "1d4",
        "bite": "1d4",
        "claw": "1d3",
        "gore": "1d2"
      },
      {
        "size": "Tiny",
        "str": "4-5",
        "dex": "14-15",
        "con": "8-9",
        "minimumHD": "1/4 d10",
        "extraHitPoints": 0,
        "slam": "1d3",
        "bite": "1d3",
        "claw": "1d2",
        "gore": "1"
      },
      {
        "size": "Diminutive",
        "str": "2-3",
        "dex": "16-17",
        "con": "8-9",
        "minimumHD": "1/8 d10",
        "extraHitPoints": 0,
        "slam": "1d2",
        "bite": "1d2",
        "claw": "1",
        "gore": "-"
      },
      {
        "size": "Fine",
        "str": "2-3",
        "dex": "18-19",
        "con": "8-9",
        "minimumHD": "1/16 d10",
        "extraHitPoints": 0,
        "slam": "1",
        "bite": "1",
        "claw": "-",
        "gore": "-"
      }
    ],
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/creaturetypes.html"
  },
  "outsider": {
    "id": "outsider",
    "name": "Outsider",
    "description": "An outsider is a nonelemental creature originating from some other dimension, reality, or plane. See Table: Outsiders for physical ability scores, recommended minimum Hit Dice, and damage based on size.",
    "hitDie": "d8",
    "baseAttack": "B",
    "baseAttackText": "Total Hit Dice (see Table: Creature Saves and Base Attack Bonuses).",
    "goodSaves": [
      "fort",
      "ref",
      "will"
    ],
    "skillPoints": "8 + Int modifier per Hit Dice",
    "feats": "1, plus 1 feat per 4 Hit Dice beyond 1 HD",
    "traits": [
      {
        "name": "Weapon and Armor Proficiency",
        "text": "Outsiders receive either Archaic Weapons Proficiency or Simple Weapons Proficiency as a bonus feat. They are proficient with their natural weapons and any weapon mentioned in their entries. Outsiders noted for wearing armor gain the bonus feat Armor Proficiency with whatever type of armor they are accustomed to wearing (light, medium, heavy), as well as all lighter types."
      },
      {
        "name": "Darkvision (Ex)",
        "text": "Most outsiders have darkvision with a range of 60 feet."
      },
      {
        "name": "Special",
        "text": "Outsiders cannot be raised from the dead."
      }
    ],
    "sizes": [
      {
        "size": "Colossal",
        "str": "44-47",
        "dex": "6-7",
        "con": "28-29",
        "minimumHD": "32d8",
        "extraHitPoints": 0,
        "slam": "4d6",
        "bite": "4d6",
        "claw": "2d8",
        "gore": "2d6"
      },
      {
        "size": "Gargantuan",
        "str": "36-39",
        "dex": "6-7",
        "con": "24-25",
        "minimumHD": "16d8",
        "extraHitPoints": 0,
        "slam": "2d8",
        "bite": "2d8",
        "claw": "2d6",
        "gore": "1d8"
      },
      {
        "size": "Huge",
        "str": "28-31",
        "dex": "6-7",
        "con": "20-21",
        "minimumHD": "8d8",
        "extraHitPoints": 0,
        "slam": "2d6",
        "bite": "2d6",
        "claw": "2d4",
        "gore": "1d6"
      },
      {
        "size": "Large",
        "str": "20-23",
        "dex": "8-9",
        "con": "16-17",
        "minimumHD": "2d8",
        "extraHitPoints": 0,
        "slam": "1d8",
        "bite": "1d8",
        "claw": "1d6",
        "gore": "1d4"
      },
      {
        "size": "Medium-size",
        "str": "12-15",
        "dex": "10-11",
        "con": "12-13",
        "minimumHD": "1d8",
        "extraHitPoints": 0,
        "slam": "1d6",
        "bite": "1d6",
        "claw": "1d4",
        "gore": "1d3"
      },
      {
        "size": "Small",
        "str": "8-11",
        "dex": "12-13",
        "con": "10-11",
        "minimumHD": "1/2 d8",
        "extraHitPoints": 0,
        "slam": "1d4",
        "bite": "1d4",
        "claw": "1d3",
        "gore": "1d2"
      },
      {
        "size": "Tiny",
        "str": "4-7",
        "dex": "14-15",
        "con": "10-11",
        "minimumHD": "1/4 d8",
        "extraHitPoints": 0,
        "slam": "1d3",
        "bite": "1d3",
        "claw": "1d2",
        "gore": "1"
      },
      {
        "size": "Diminutive",
        "str": "2-3",
        "dex": "16-17",
        "con": "10-11",
        "minimumHD": "1/8 d8",
        "extraHitPoints": 0,
        "slam": "1d2",
        "bite": "1d2",
        "claw": "1",
        "gore": "-"
      },
      {
        "size": "Fine",
        "str": "2-3",
        "dex": "18-19",
        "con": "10-11",
        "minimumHD": "1/16 d8",
        "extraHitPoints": 0,
        "slam": "1",
        "bite": "1",
        "claw": "-",
        "gore": "-"
      }
    ],
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/creaturetypes.html"
  },
  "plant": {
    "id": "plant",
    "name": "Plant",
    "description": "A plant is a vegetable creature. See Table: Plants for physical ability scores, recommended minimum Hit Dice, and damage based on size.",
    "hitDie": "d8",
    "baseAttack": "A",
    "baseAttackText": "3/4 of total Hit Dice (see Table: Creature Saves and Base Attack Bonuses).",
    "goodSaves": [
      "fort"
    ],
    "skillPoints": "None",
    "feats": "None",
    "traits": [
      {
        "name": "Weapon and Armor Proficiency",
        "text": "Plants are proficient with their natural weapons only. They are not proficient with armor."
      },
      {
        "name": "Immunities",
        "text": "Plants are immune to sleep, paralysis, stunning, and mind-affecting effects. They are not subject to critical hits or the effects of massive damage."
      },
      {
        "name": "Low-Light Vision (Ex)",
        "text": "Most plants with visual sensory organs have low-light vision."
      },
      {
        "name": "Blindsight (Ex)",
        "text": "Most plants without visual sensory organs have blindsight with a range of 60 feet."
      }
    ],
    "sizes": [
      {
        "size": "Colossal",
        "str": "44-45",
        "dex": "6-7",
        "con": "28-29",
        "minimumHD": "32d8",
        "extraHitPoints": 0,
        "slam": "4d6",
        "bite": "2d6",
        "claw": "2d8",
        "gore": "4d6"
      },
      {
        "size": "Gargantuan",
        "str": "36-37",
        "dex": "6-7",
        "con": "24-25",
        "minimumHD": "16d8",
        "extraHitPoints": 0,
        "slam": "2d8",
        "bite": "1d8",
        "claw": "2d6",
        "gore": "2d8"
      },
      {
        "size": "Huge",
        "str": "28-29",
        "dex": "6-7",
        "con": "20-21",
        "minimumHD": "4d8",
        "extraHitPoints": 0,
        "slam": "2d6",
        "bite": "1d6",
        "claw": "2d4",
        "gore": "2d6"
      },
      {
        "size": "Large",
        "str": "20-21",
        "dex": "8-9",
        "con": "16-17",
        "minimumHD": "2d8",
        "extraHitPoints": 0,
        "slam": "1d8",
        "bite": "1d4",
        "claw": "1d6",
        "gore": "1d8"
      },
      {
        "size": "Medium-size",
        "str": "12-13",
        "dex": "10-11",
        "con": "12-13",
        "minimumHD": "1d8",
        "extraHitPoints": 0,
        "slam": "1d6",
        "bite": "1d3",
        "claw": "1d4",
        "gore": "1d6"
      },
      {
        "size": "Small",
        "str": "8-9",
        "dex": "12-13",
        "con": "10-11",
        "minimumHD": "1/2 d8",
        "extraHitPoints": 0,
        "slam": "1d4",
        "bite": "1d2",
        "claw": "1d3",
        "gore": "1d4"
      },
      {
        "size": "Tiny",
        "str": "4-5",
        "dex": "14-15",
        "con": "10-11",
        "minimumHD": "1/4 d8",
        "extraHitPoints": 0,
        "slam": "1d3",
        "bite": "1",
        "claw": "1d2",
        "gore": "1d3"
      },
      {
        "size": "Diminutive",
        "str": "2-3",
        "dex": "16-17",
        "con": "10-11",
        "minimumHD": "1/8 d8",
        "extraHitPoints": 0,
        "slam": "1d2",
        "bite": "-",
        "claw": "1",
        "gore": "1d2"
      },
      {
        "size": "Fine",
        "str": "2-3",
        "dex": "18-19",
        "con": "10-11",
        "minimumHD": "1/16 d8",
        "extraHitPoints": 0,
        "slam": "1",
        "bite": "-",
        "claw": "-",
        "gore": "1"
      }
    ],
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/creaturetypes.html"
  },
  "undead": {
    "id": "undead",
    "name": "Undead",
    "description": "An undead is a once-living creature animated by spiritual or supernatural forces. See Table: Undead for physical ability scores, recommended minimum Hit Dice, and damage based on size.",
    "hitDie": "d12",
    "baseAttack": "C",
    "baseAttackText": "1/2 of total Hit Dice (see Table: Creature Saves and Base Attack Bonuses).",
    "goodSaves": [
      "will"
    ],
    "skillPoints": "3 x Int score, plus 2 points per Hit Dice beyond 1 HD",
    "feats": "1 + Int modifier, plus 1 feat per 4 HD beyond 1 HD",
    "traits": [
      {
        "name": "Weapon and Armor Proficiency",
        "text": "Undead receive either Archaic Weapons Proficiency or Simple Weapons Proficiency as a bonus feat. An undead is proficient with its natural weapons and any weapon mentioned in its entry. Undead noted for wearing armor gain the bonus feat Armor Proficiency with whatever type of armor they are accustomed to wearing (light, medium, heavy), as well as all lighter types."
      },
      {
        "name": "Ability Scores",
        "text": "An undead has no Constitution score. It uses its Charisma modifier for Concentration checks."
      },
      {
        "name": "Darkvision (Ex)",
        "text": "Most undead have darkvision with a range of 60 feet."
      },
      {
        "name": "Immunities",
        "text": "Undead are immune to poison, sleep, paralysis, stunning, disease, necromantic effects, and mind-affecting effects. They are not subject to critical hits, nonlethal damage, ability damage, ability drain, energy drain, or effects of massive damage, or any effect requiring a Fortitude save unless the effect also works on objects or is harmless."
      },
      {
        "name": "Healing",
        "text": "Undead cannot heal damage on their own if they have no Intelligence score. Undead can be healed with negative energy (usually only available through the use of magic). Most undead are destroyed immediately if reduced to 0 hit points or less."
      },
      {
        "name": "Special",
        "text": "Undead cannot be raised from the dead."
      }
    ],
    "sizes": [
      {
        "size": "Colossal",
        "str": "44-45",
        "dex": "6-7",
        "con": "-",
        "minimumHD": "32d12",
        "extraHitPoints": 0,
        "slam": "4d6",
        "bite": "4d6",
        "claw": "2d8",
        "gore": "2d6"
      },
      {
        "size": "Gargantuan",
        "str": "36-37",
        "dex": "6-7",
        "con": "-",
        "minimumHD": "21d12",
        "extraHitPoints": 0,
        "slam": "2d8",
        "bite": "2d8",
        "claw": "2d6",
        "gore": "1d8"
      },
      {
        "size": "Huge",
        "str": "28-29",
        "dex": "6-7",
        "con": "-",
        "minimumHD": "10d12",
        "extraHitPoints": 0,
        "slam": "2d6",
        "bite": "2d6",
        "claw": "2d4",
        "gore": "1d6"
      },
      {
        "size": "Large",
        "str": "20-21",
        "dex": "8-9",
        "con": "-",
        "minimumHD": "4d12",
        "extraHitPoints": 0,
        "slam": "1d8",
        "bite": "1d8",
        "claw": "1d6",
        "gore": "1d4"
      },
      {
        "size": "Medium-size",
        "str": "12-13",
        "dex": "10-11",
        "con": "-",
        "minimumHD": "1d12",
        "extraHitPoints": 0,
        "slam": "1d6",
        "bite": "1d6",
        "claw": "1d4",
        "gore": "1d3"
      },
      {
        "size": "Small",
        "str": "8-9",
        "dex": "12-13",
        "con": "-",
        "minimumHD": "1/2 d12",
        "extraHitPoints": 0,
        "slam": "1d4",
        "bite": "1d4",
        "claw": "1d3",
        "gore": "1d2"
      },
      {
        "size": "Tiny",
        "str": "4-5",
        "dex": "14-15",
        "con": "-",
        "minimumHD": "1/4 d12",
        "extraHitPoints": 0,
        "slam": "1d3",
        "bite": "1d3",
        "claw": "1d2",
        "gore": "1"
      },
      {
        "size": "Diminutive",
        "str": "2-3",
        "dex": "16-17",
        "con": "-",
        "minimumHD": "1/8 d12",
        "extraHitPoints": 0,
        "slam": "1d2",
        "bite": "1d2",
        "claw": "1",
        "gore": "-"
      },
      {
        "size": "Fine",
        "str": "2-3",
        "dex": "18-19",
        "con": "-",
        "minimumHD": "1/16 d12",
        "extraHitPoints": 0,
        "slam": "1",
        "bite": "1",
        "claw": "-",
        "gore": "-"
      }
    ],
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/creaturetypes.html"
  },
  "vermin": {
    "id": "vermin",
    "name": "Vermin",
    "description": "This type includes insects, arachnids, other arthropods, worms, and similar invertebrates. See Table: Vermin for physical ability scores, recommended minimum Hit Dice, and damage based on size.",
    "hitDie": "d8",
    "baseAttack": "A",
    "baseAttackText": "3/4 of total Hit Dice (see Table: Creature Saves and Base Attack Bonuses).",
    "goodSaves": [
      "fort"
    ],
    "skillPoints": "10–15",
    "feats": "None",
    "traits": [
      {
        "name": "Weapon and Armor Proficiency",
        "text": "Vermin are proficient with their natural weapons only. They are not proficient with armor."
      },
      {
        "name": "Ability Scores",
        "text": "Vermin have no Intelligence score."
      },
      {
        "name": "Potent Venom",
        "text": "Medium-size or larger poisonous vermin get a bonus to the save DC of their poison based on their size, as follows: Medium-size +2, Large +4, Huge +6, Gargantuan +8, Colossal +10."
      },
      {
        "name": "Darkvision (Ex)",
        "text": "Most vermin with visual sensory organs have darkvision with a range of 60 feet."
      },
      {
        "name": "Blindsight (Ex)",
        "text": "Most vermin without visual sensory organs have blindsight with a range of 60 feet."
      },
      {
        "name": "Immunities",
        "text": "Vermin are immune to mind-affecting effects."
      },
      {
        "name": "Resistance to Massive Damage (Ex)",
        "text": "Vermin gain a +5 species bonus on Fortitude saves to negate the effects of massive damage."
      }
    ],
    "sizes": [
      {
        "size": "Colossal",
        "str": "42-43",
        "dex": "6-7",
        "con": "26-27",
        "minimumHD": "32d8",
        "extraHitPoints": 0,
        "slam": "2d6",
        "bite": "4d6",
        "claw": "2d8",
        "gore": "4d6"
      },
      {
        "size": "Gargantuan",
        "str": "34-35",
        "dex": "6-7",
        "con": "22-23",
        "minimumHD": "16d8",
        "extraHitPoints": 0,
        "slam": "1d8",
        "bite": "2d8",
        "claw": "2d6",
        "gore": "2d8"
      },
      {
        "size": "Huge",
        "str": "26-27",
        "dex": "6-7",
        "con": "18-19",
        "minimumHD": "8d8",
        "extraHitPoints": 0,
        "slam": "1d6",
        "bite": "2d6",
        "claw": "2d4",
        "gore": "2d6"
      },
      {
        "size": "Large",
        "str": "18-19",
        "dex": "8-9",
        "con": "14-15",
        "minimumHD": "2d8",
        "extraHitPoints": 0,
        "slam": "1d4",
        "bite": "1d8",
        "claw": "1d6",
        "gore": "1d8"
      },
      {
        "size": "Medium-size",
        "str": "10-11",
        "dex": "10-11",
        "con": "10-11",
        "minimumHD": "1d8",
        "extraHitPoints": 0,
        "slam": "1d3",
        "bite": "1d6",
        "claw": "1d4",
        "gore": "1d6"
      },
      {
        "size": "Small",
        "str": "6-7",
        "dex": "12-13",
        "con": "8-9",
        "minimumHD": "1/2 d8",
        "extraHitPoints": 0,
        "slam": "1d2",
        "bite": "1d4",
        "claw": "1d3",
        "gore": "1d4"
      },
      {
        "size": "Tiny",
        "str": "2-3",
        "dex": "14-15",
        "con": "8-9",
        "minimumHD": "1/4 d8",
        "extraHitPoints": 0,
        "slam": "1",
        "bite": "1d3",
        "claw": "1d2",
        "gore": "1d3"
      },
      {
        "size": "Diminutive",
        "str": "1",
        "dex": "16-17",
        "con": "8-9",
        "minimumHD": "1/8 d8",
        "extraHitPoints": 0,
        "slam": "-",
        "bite": "1d2",
        "claw": "1",
        "gore": "1d2"
      },
      {
        "size": "Fine",
        "str": "1",
        "dex": "18-19",
        "con": "8-9",
        "minimumHD": "1/16 d8",
        "extraHitPoints": 0,
        "slam": "-",
        "bite": "1",
        "claw": "-",
        "gore": "1"
      }
    ],
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/creaturetypes.html"
  }
};

/**
 * "Table: Creature Saves and Base Attack Bonuses", by Hit Dice.
 *
 * Attack columns: A is three-quarters of Hit Dice, B is the full amount, C is
 * half. Which one a type uses is on the type.
 */
export const CREATURE_PROGRESSION = [
  {
    "hitDice": 1,
    "goodSave": 2,
    "poorSave": 0,
    "attackA": "+0",
    "attackB": "+1",
    "attackC": "+0"
  },
  {
    "hitDice": 2,
    "goodSave": 3,
    "poorSave": 0,
    "attackA": "+1",
    "attackB": "+2",
    "attackC": "+0"
  },
  {
    "hitDice": 3,
    "goodSave": 3,
    "poorSave": 1,
    "attackA": "+2",
    "attackB": "+3",
    "attackC": "+1"
  },
  {
    "hitDice": 4,
    "goodSave": 4,
    "poorSave": 1,
    "attackA": "+3",
    "attackB": "+4",
    "attackC": "+1"
  },
  {
    "hitDice": 5,
    "goodSave": 4,
    "poorSave": 1,
    "attackA": "+3",
    "attackB": "+5",
    "attackC": "+2"
  },
  {
    "hitDice": 6,
    "goodSave": 5,
    "poorSave": 2,
    "attackA": "+4",
    "attackB": "+6/+1",
    "attackC": "+2"
  },
  {
    "hitDice": 7,
    "goodSave": 5,
    "poorSave": 2,
    "attackA": "+5",
    "attackB": "+7/+2",
    "attackC": "+3"
  },
  {
    "hitDice": 8,
    "goodSave": 6,
    "poorSave": 2,
    "attackA": "+6/+1",
    "attackB": "+8/+3",
    "attackC": "+4"
  },
  {
    "hitDice": 9,
    "goodSave": 6,
    "poorSave": 3,
    "attackA": "+6/+1",
    "attackB": "+9/+4",
    "attackC": "+4"
  },
  {
    "hitDice": 10,
    "goodSave": 7,
    "poorSave": 3,
    "attackA": "+7/+2",
    "attackB": "+10/+5",
    "attackC": "+5"
  },
  {
    "hitDice": 11,
    "goodSave": 7,
    "poorSave": 3,
    "attackA": "+8/+3",
    "attackB": "+11/+6/+1",
    "attackC": "+5"
  },
  {
    "hitDice": 12,
    "goodSave": 8,
    "poorSave": 4,
    "attackA": "+9/+4",
    "attackB": "+12/+7/+2",
    "attackC": "+6/+1"
  },
  {
    "hitDice": 13,
    "goodSave": 8,
    "poorSave": 4,
    "attackA": "+9/+4",
    "attackB": "+13/+8/+3",
    "attackC": "+6/+1"
  },
  {
    "hitDice": 14,
    "goodSave": 9,
    "poorSave": 4,
    "attackA": "+10/+5",
    "attackB": "+14/+9/+4",
    "attackC": "+7/+2"
  },
  {
    "hitDice": 15,
    "goodSave": 9,
    "poorSave": 5,
    "attackA": "+11/+6/+1",
    "attackB": "+15/+10/+5",
    "attackC": "+7/+2"
  },
  {
    "hitDice": 16,
    "goodSave": 10,
    "poorSave": 5,
    "attackA": "+12/+7/+2",
    "attackB": "+16/+11/+6/+1",
    "attackC": "+8/+3"
  },
  {
    "hitDice": 17,
    "goodSave": 10,
    "poorSave": 5,
    "attackA": "+12/+7/+2",
    "attackB": "+17/+12/+7/+2",
    "attackC": "+8/+3"
  },
  {
    "hitDice": 18,
    "goodSave": 11,
    "poorSave": 6,
    "attackA": "+13/+8/+3",
    "attackB": "+18/+13/+8/+3",
    "attackC": "+9/+4"
  },
  {
    "hitDice": 19,
    "goodSave": 11,
    "poorSave": 6,
    "attackA": "+14/+9/+4",
    "attackB": "+19/+14/+9/+4",
    "attackC": "+9/+4"
  },
  {
    "hitDice": 20,
    "goodSave": 12,
    "poorSave": 6,
    "attackA": "+15/+10/+5",
    "attackB": "+20/+15/+10/+5",
    "attackC": "+10/+5"
  }
];
