/**
 * Advancing a creature, generated from data/advancement.json by
 * tools/gen_advancement.py.
 *
 * "The GM can improve a creature by increasing its Hit Dice. The Advancement
 * entry indicates the increased Hit Dice (and often size) of the creature."
 * The Hit Dice themselves drive base attack and saves through
 * CREATURE_PROGRESSION; this is what the size does.
 */

/**
 * "Table: Adjustments to Physical Abilities and Natural Armor", keyed by the
 * size being advanced from.
 *
 * "Repeat the adjustment if the creature moves up more than one size
 * category" — so this is one step, applied once per category climbed.
 */
export const SIZE_ADVANCEMENT = {
  "fine": {
    "from": "fine",
    "to": "diminutive",
    "str": 0,
    "dex": -2,
    "con": 0,
    "naturalArmor": 0
  },
  "diminutive": {
    "from": "diminutive",
    "to": "tiny",
    "str": 2,
    "dex": -2,
    "con": 0,
    "naturalArmor": 0
  },
  "tiny": {
    "from": "tiny",
    "to": "small",
    "str": 4,
    "dex": -2,
    "con": 0,
    "naturalArmor": 0
  },
  "small": {
    "from": "small",
    "to": "medium",
    "str": 4,
    "dex": -2,
    "con": 2,
    "naturalArmor": 0
  },
  "medium": {
    "from": "medium",
    "to": "large",
    "str": 8,
    "dex": -2,
    "con": 4,
    "naturalArmor": 2
  },
  "large": {
    "from": "large",
    "to": "huge",
    "str": 8,
    "dex": -2,
    "con": 4,
    "naturalArmor": 3
  },
  "huge": {
    "from": "huge",
    "to": "gargantuan",
    "str": 8,
    "dex": 0,
    "con": 4,
    "naturalArmor": 4
  },
  "gargantuan": {
    "from": "gargantuan",
    "to": "colossal",
    "str": 8,
    "dex": 0,
    "con": 4,
    "naturalArmor": 5
  }
};

/**
 * What each type gains per extra Hit Die, in the SRD's own words.
 *
 * Kept as text rather than as numbers: two of the fifteen depend on the
 * creature's Intelligence modifier, and five gain nothing at all. A GM
 * reading "+1 per 4 extra HD" needs no help; a number invented for
 * "8 + Int modifier per extra HD" would be wrong for most creatures.
 */
export const ADVANCEMENT_BY_TYPE = {
  "aberration": {
    "id": "aberration",
    "name": "Aberration",
    "skillPoints": "+2 per extra HD",
    "feats": "+1 per 4 extra HD"
  },
  "animal": {
    "id": "animal",
    "name": "Animal",
    "skillPoints": "-",
    "feats": "-"
  },
  "construct": {
    "id": "construct",
    "name": "Construct",
    "skillPoints": "-",
    "feats": "-"
  },
  "dragon": {
    "id": "dragon",
    "name": "Dragon",
    "skillPoints": "6 + Int modifier per extra HD",
    "feats": "+1 per 4 extra HD"
  },
  "elemental": {
    "id": "elemental",
    "name": "Elemental",
    "skillPoints": "+2 per extra HD",
    "feats": "+1 per 4 extra HD"
  },
  "fey": {
    "id": "fey",
    "name": "Fey",
    "skillPoints": "+2 per extra HD",
    "feats": "+1 per 4 extra HD"
  },
  "giant": {
    "id": "giant",
    "name": "Giant",
    "skillPoints": "+2 per extra HD",
    "feats": "+1 per 4 extra HD"
  },
  "humanoid": {
    "id": "humanoid",
    "name": "Humanoid",
    "skillPoints": "+1 per extra HD",
    "feats": "+1 per 4 extra HD"
  },
  "magicalBeast": {
    "id": "magicalBeast",
    "name": "Magical beast",
    "skillPoints": "+1 per extra HD",
    "feats": "+1 per 4 extra HD"
  },
  "monstrousHumanoid": {
    "id": "monstrousHumanoid",
    "name": "Monstrous humanoid",
    "skillPoints": "+2 per extra HD",
    "feats": "+1 per 4 extra HD"
  },
  "ooze": {
    "id": "ooze",
    "name": "Ooze",
    "skillPoints": "-",
    "feats": "-"
  },
  "outsider": {
    "id": "outsider",
    "name": "Outsider",
    "skillPoints": "8 + Int modifier per extra HD",
    "feats": "+1 per extra HD"
  },
  "plant": {
    "id": "plant",
    "name": "Plant",
    "skillPoints": "-",
    "feats": "-"
  },
  "undead": {
    "id": "undead",
    "name": "Undead",
    "skillPoints": "+2 per extra HD",
    "feats": "+1 per 4 extra HD"
  },
  "vermin": {
    "id": "vermin",
    "name": "Vermin",
    "skillPoints": "-",
    "feats": "-"
  }
};
