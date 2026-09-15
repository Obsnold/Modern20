/**
 * Objects, from data/objects.json, the scraped SRD. Maintained here now.
 *
 * "Each object has hardness—a number that represents how well it resists
 * damage. Whenever an object takes damage, subtract its hardness from the
 * damage." That is damage reduction by another name, and the vehicles have
 * carried a hardness since they were imported with nothing subtracting it.
 */

/**
 * The Defense of an immobile object of each size.
 *
 * The printed figure is 10 + the size modifier - 5, since an object has no
 * Dexterity to add: a Medium-size object is Defense 5, a Colossal one -3.
 * "An object being held, carried, or worn has a Defense equal to the above
 * figure + 5 + the opponent's Dexterity modifier + the opponent's class bonus."
 */
export const OBJECT_DEFENSE = {
  "colossal": {
    "size": "colossal",
    "example": "jetliner",
    "defense": -3
  },
  "gargantuan": {
    "size": "gargantuan",
    "example": "army tank",
    "defense": 1
  },
  "huge": {
    "size": "huge",
    "example": "typical car",
    "defense": 3
  },
  "large": {
    "size": "large",
    "example": "big door",
    "defense": 4
  },
  "medium": {
    "size": "medium",
    "example": "dirt bike",
    "defense": 5
  },
  "small": {
    "size": "small",
    "example": "chair",
    "defense": 6
  },
  "tiny": {
    "size": "tiny",
    "example": "laptop computer",
    "defense": 7
  },
  "diminutive": {
    "size": "diminutive",
    "example": "paperback book",
    "defense": 9
  },
  "fine": {
    "size": "fine",
    "example": "pencil",
    "defense": 13
  }
};

/** Hardness and hit points per inch of thickness, by what a thing is made of. */
export const SUBSTANCES = {
  "paper": {
    "id": "paper",
    "name": "Paper",
    "hardness": 0,
    "hitPointsPerInch": 2
  },
  "rope": {
    "id": "rope",
    "name": "Rope",
    "hardness": 0,
    "hitPointsPerInch": 2
  },
  "plasticSoft": {
    "id": "plasticSoft",
    "name": "Plastic, soft",
    "hardness": 0,
    "hitPointsPerInch": 3
  },
  "glass": {
    "id": "glass",
    "name": "Glass",
    "hardness": 1,
    "hitPointsPerInch": 1
  },
  "ceramic": {
    "id": "ceramic",
    "name": "Ceramic",
    "hardness": 1,
    "hitPointsPerInch": 2
  },
  "ice": {
    "id": "ice",
    "name": "Ice",
    "hardness": 0,
    "hitPointsPerInch": 3
  },
  "plasticHard": {
    "id": "plasticHard",
    "name": "Plastic, hard",
    "hardness": 2,
    "hitPointsPerInch": 5
  },
  "wood": {
    "id": "wood",
    "name": "Wood",
    "hardness": 5,
    "hitPointsPerInch": 10
  },
  "aluminium": {
    "id": "aluminium",
    "name": "Aluminium",
    "hardness": 6,
    "hitPointsPerInch": 10
  },
  "concrete": {
    "id": "concrete",
    "name": "Concrete",
    "hardness": 8,
    "hitPointsPerInch": 15
  },
  "steel": {
    "id": "steel",
    "name": "Steel",
    "hardness": 10,
    "hitPointsPerInch": 10
  }
};

/**
 * "Figures for manufactured objects are minimum values. The GM may adjust
 * these upward to account for objects with more strength and durability."
 *
 * What an object of a given size has when the SRD does not name it.
 */
export const OBJECT_DEFAULTS = {
  "fine": {
    "id": "fine",
    "name": "Fine",
    "group": "",
    "size": "fine",
    "hardness": 0,
    "hitPoints": 1,
    "breakDC": 10,
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatsa.html"
  },
  "diminutive": {
    "id": "diminutive",
    "name": "Diminutive",
    "group": "",
    "size": "diminutive",
    "hardness": 0,
    "hitPoints": 1,
    "breakDC": 10,
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatsa.html"
  },
  "tiny": {
    "id": "tiny",
    "name": "Tiny",
    "group": "",
    "size": "tiny",
    "hardness": 1,
    "hitPoints": 2,
    "breakDC": 10,
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatsa.html"
  },
  "small": {
    "id": "small",
    "name": "Small",
    "group": "",
    "size": "small",
    "hardness": 3,
    "hitPoints": 3,
    "breakDC": 12,
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatsa.html"
  },
  "medium": {
    "id": "mediumSize",
    "name": "Medium-size",
    "group": "",
    "size": "medium",
    "hardness": 5,
    "hitPoints": 5,
    "breakDC": 15,
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatsa.html"
  },
  "large": {
    "id": "large",
    "name": "Large",
    "group": "",
    "size": "large",
    "hardness": 5,
    "hitPoints": 10,
    "breakDC": 15,
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatsa.html"
  },
  "huge": {
    "id": "huge",
    "name": "Huge",
    "group": "",
    "size": "huge",
    "hardness": 8,
    "hitPoints": 10,
    "breakDC": 20,
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatsa.html"
  },
  "gargantuan": {
    "id": "gargantuan",
    "name": "Gargantuan",
    "group": "",
    "size": "gargantuan",
    "hardness": 8,
    "hitPoints": 20,
    "breakDC": 30,
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatsa.html"
  },
  "colossal": {
    "id": "colossal",
    "name": "Colossal",
    "group": "",
    "size": "colossal",
    "hardness": 10,
    "hitPoints": 30,
    "breakDC": 50,
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatsa.html"
  }
};

/**
 * How much of an attack an object actually takes.
 *
 * "Acid and sonic/concussive attacks deal normal damage to most objects.
 * Electricity and fire attacks deal half damage to most objects; divide the
 * damage by 2 before applying the hardness. Cold attacks deal one-quarter
 * damage to most objects."
 */
export const OBJECT_DAMAGE_SHARE = {
  fire: 0.5,
  electricity: 0.5,
  cold: 0.25
};
