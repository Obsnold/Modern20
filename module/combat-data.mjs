/**
 * The combat tables, generated from data/combat_actions.json and
 * data/combat_tables.json by tools/gen_combat_data.py.
 *
 * "Table: Actions in Combat" is the whole action economy: every action the
 * SRD names, what it costs, and whether it provokes an attack of opportunity.
 * The modifier tables are the numbers a circumstance adds to an attack or to
 * Defense. Both are transcribed rather than interpreted — a "maybe" in the
 * provokes column stays a "maybe", because the SRD means it.
 */

/** Every action the SRD names, keyed by id. */
export const COMBAT_ACTIONS = {
  "attackMelee": {
    "id": "attackMelee",
    "name": "Attack (melee)",
    "action": "attack",
    "provokes": "no",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "attackRanged": {
    "id": "attackRanged",
    "name": "Attack (ranged)",
    "action": "attack",
    "provokes": "yes",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "attackUnarmed": {
    "id": "attackUnarmed",
    "name": "Attack (unarmed)",
    "action": "attack",
    "provokes": "yes",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "attackAidAnother": {
    "id": "attackAidAnother",
    "name": "Attack (aid another)",
    "action": "attack",
    "provokes": "no",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "bullRushAttack": {
    "id": "bullRushAttack",
    "name": "Bull rush (attack)",
    "action": "attack",
    "provokes": "no",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "escapeAGrapple": {
    "id": "escapeAGrapple",
    "name": "Escape a grapple",
    "action": "attack",
    "provokes": "no",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "feintSeeTheBluffSkill": {
    "id": "feintSeeTheBluffSkill",
    "name": "Feint (see the Bluff skill)",
    "action": "attack",
    "provokes": "no",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "readyTriggersAnAttackAction": {
    "id": "readyTriggersAnAttackAction",
    "name": "Ready (triggers an attack action)",
    "action": "attack",
    "provokes": "no",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "makeADyingCharacterStable": {
    "id": "makeADyingCharacterStable",
    "name": "Make a dying character stable",
    "action": "attack",
    "provokes": "yes",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "attackAWeapon": {
    "id": "attackAWeapon",
    "name": "Attack a weapon",
    "action": "attack",
    "provokes": "yes",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "attackAnObject": {
    "id": "attackAnObject",
    "name": "Attack an object",
    "action": "attack",
    "provokes": "maybe",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "totalDefense": {
    "id": "totalDefense",
    "name": "Total defense",
    "action": "attack",
    "provokes": "no",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "useASkillThatTakesAnAttackAction": {
    "id": "useASkillThatTakesAnAttackAction",
    "name": "Use a skill that takes an attack action",
    "action": "attack",
    "provokes": "usually",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "startCompleteFullRoundAction": {
    "id": "startCompleteFullRoundAction",
    "name": "Start/complete full-round action",
    "action": "attack",
    "provokes": "varies",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "moveYourSpeed": {
    "id": "moveYourSpeed",
    "name": "Move your speed",
    "action": "move",
    "provokes": "yes",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "useAPieceOfEquipment": {
    "id": "useAPieceOfEquipment",
    "name": "Use a piece of equipment",
    "action": "move",
    "provokes": "no",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "climbOneQuarterSpeed": {
    "id": "climbOneQuarterSpeed",
    "name": "Climb (one-quarter speed)",
    "action": "move",
    "provokes": "no",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "climbAcceleratedOneHalfSpeed": {
    "id": "climbAcceleratedOneHalfSpeed",
    "name": "Climb, accelerated (one-half speed)",
    "action": "move",
    "provokes": "no",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "crawl": {
    "id": "crawl",
    "name": "Crawl",
    "action": "move",
    "provokes": "no",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "drawAWeapon": {
    "id": "drawAWeapon",
    "name": "Draw a weapon",
    "action": "move",
    "provokes": "no",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "holsterAWeapon": {
    "id": "holsterAWeapon",
    "name": "Holster a weapon",
    "action": "move",
    "provokes": "yes",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "moveAHeavyObject": {
    "id": "moveAHeavyObject",
    "name": "Move a heavy object",
    "action": "move",
    "provokes": "yes",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "openADoor": {
    "id": "openADoor",
    "name": "Open a door",
    "action": "move",
    "provokes": "no",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "pickUpAnObject": {
    "id": "pickUpAnObject",
    "name": "Pick up an object",
    "action": "move",
    "provokes": "yes",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "reloadAFirearmWithABoxMagazineOrSpeedLoader": {
    "id": "reloadAFirearmWithABoxMagazineOrSpeedLoader",
    "name": "Reload a firearm with a box magazine or speed loader",
    "action": "move",
    "provokes": "yes",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "retrieveAStoredObject": {
    "id": "retrieveAStoredObject",
    "name": "Retrieve a stored object",
    "action": "move",
    "provokes": "yes",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "standUpFromProneSittingOrKneeling": {
    "id": "standUpFromProneSittingOrKneeling",
    "name": "Stand up from prone, sitting, or kneeling",
    "action": "move",
    "provokes": "yes",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "swim": {
    "id": "swim",
    "name": "Swim",
    "action": "move",
    "provokes": "no",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "useASkillThatTakesAMoveAction": {
    "id": "useASkillThatTakesAMoveAction",
    "name": "Use a skill that takes a move action",
    "action": "move",
    "provokes": "usually",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "bullRushCharge": {
    "id": "bullRushCharge",
    "name": "Bull rush (charge)",
    "action": "fullRound",
    "provokes": "no",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "charge": {
    "id": "charge",
    "name": "Charge",
    "action": "fullRound",
    "provokes": "no",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "coupDeGrace": {
    "id": "coupDeGrace",
    "name": "Coup de grace",
    "action": "fullRound",
    "provokes": "yes",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "fullAttack": {
    "id": "fullAttack",
    "name": "Full attack",
    "action": "fullRound",
    "provokes": "no",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "overrunCharge": {
    "id": "overrunCharge",
    "name": "Overrun (charge)",
    "action": "fullRound",
    "provokes": "no",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "run": {
    "id": "run",
    "name": "Run",
    "action": "fullRound",
    "provokes": "yes",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "withdraw": {
    "id": "withdraw",
    "name": "Withdraw",
    "action": "fullRound",
    "provokes": "no",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "extinguishFlames": {
    "id": "extinguishFlames",
    "name": "Extinguish flames",
    "action": "fullRound",
    "provokes": "no",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "useASkillThatTakesAFullRound": {
    "id": "useASkillThatTakesAFullRound",
    "name": "Use a skill that takes a full round",
    "action": "fullRound",
    "provokes": "usually",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "reloadAFirearmWithAnInternalMagazine": {
    "id": "reloadAFirearmWithAnInternalMagazine",
    "name": "Reload a firearm with an internal magazine",
    "action": "fullRound",
    "provokes": "yes",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "dropAnObject": {
    "id": "dropAnObject",
    "name": "Drop an object",
    "action": "free",
    "provokes": "no",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "dropToProneSittingOrKneeling": {
    "id": "dropToProneSittingOrKneeling",
    "name": "Drop to prone, sitting, or kneeling",
    "action": "free",
    "provokes": "no",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "speak": {
    "id": "speak",
    "name": "Speak",
    "action": "free",
    "provokes": "no",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "disarm": {
    "id": "disarm",
    "name": "Disarm",
    "action": "varies",
    "provokes": "yes",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "grapple": {
    "id": "grapple",
    "name": "Grapple",
    "action": "varies",
    "provokes": "yes",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "loadAWeapon": {
    "id": "loadAWeapon",
    "name": "Load a weapon",
    "action": "varies",
    "provokes": "yes",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "tripAnOpponent": {
    "id": "tripAnOpponent",
    "name": "Trip an opponent",
    "action": "varies",
    "provokes": "no (yes if unarmed)",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "useAFeat": {
    "id": "useAFeat",
    "name": "Use a feat",
    "action": "varies",
    "provokes": "varies",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "delay": {
    "id": "delay",
    "name": "Delay",
    "action": "none",
    "provokes": "no",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  },
  "5FootStep": {
    "id": "5FootStep",
    "name": "5-foot step",
    "action": "none",
    "provokes": "no",
    "srdUrl": "https://spellbooksoftware.com/d20mrsd/combatactions.html"
  }
};

/**
 * "Attacker flanking defender +2", "Defender prone -4 melee / +4 ranged".
 *
 * Offered as choices rather than detected: working out flanking or cover from
 * token positions means guessing at what the GM can see, and every system that
 * tries it ends up arguing with the table.
 */
export const ATTACK_MODIFIERS = [
  {
    "id": "attackerFlankingDefender",
    "circumstance": "Attacker flanking defender",
    "applies": "attack",
    "melee": 2,
    "ranged": 0,
    "losesDex": false
  },
  {
    "id": "attackerOnHigherGround",
    "circumstance": "Attacker on higher ground",
    "applies": "attack",
    "melee": 1,
    "ranged": 0,
    "losesDex": false
  },
  {
    "id": "attackerProne",
    "circumstance": "Attacker prone",
    "applies": "attack",
    "melee": -4,
    "ranged": -2,
    "losesDex": false
  },
  {
    "id": "attackerInvisible",
    "circumstance": "Attacker invisible",
    "applies": "attack",
    "melee": 2,
    "ranged": 2,
    "losesDex": true
  }
];

export const DEFENSE_MODIFIERS = [
  {
    "id": "defenderSittingOrKneeling",
    "circumstance": "Defender sitting or kneeling",
    "applies": "defense",
    "melee": -2,
    "ranged": 2,
    "losesDex": false
  },
  {
    "id": "defenderProne",
    "circumstance": "Defender prone",
    "applies": "defense",
    "melee": -4,
    "ranged": 4,
    "losesDex": false
  },
  {
    "id": "defenderStunnedOrCowering",
    "circumstance": "Defender stunned or cowering",
    "applies": "defense",
    "melee": -2,
    "ranged": -2,
    "losesDex": true
  },
  {
    "id": "defenderClimbing",
    "circumstance": "Defender climbing",
    "applies": "defense",
    "melee": -2,
    "ranged": -2,
    "losesDex": true
  },
  {
    "id": "defenderFlatFooted",
    "circumstance": "Defender flat-footed",
    "applies": "defense",
    "melee": 0,
    "ranged": 0,
    "losesDex": true
  },
  {
    "id": "defenderRunning",
    "circumstance": "Defender running",
    "applies": "defense",
    "melee": 0,
    "ranged": 2,
    "losesDex": true
  },
  {
    "id": "defenderGrapplingAttackerNot",
    "circumstance": "Defender grappling (attacker not)",
    "applies": "defense",
    "melee": 0,
    "ranged": 0,
    "losesDex": true
  },
  {
    "id": "defenderPinned",
    "circumstance": "Defender pinned",
    "applies": "defense",
    "melee": -4,
    "ranged": 0,
    "losesDex": false
  },
  {
    "id": "defenderHelplessSuchAsParalyzedSleepingOrBound",
    "circumstance": "Defender helpless (such as paralyzed, sleeping, or bound)",
    "applies": "defense",
    "melee": 0,
    "ranged": 0,
    "losesDex": true
  }
];

export const COVER = [
  {
    "id": "oneQuarter",
    "degree": "One-quarter",
    "example": "standing behind a 3-ft. high wall",
    "defense": 2,
    "reflex": 1
  },
  {
    "id": "oneHalf",
    "degree": "One-half",
    "example": "fighting from around a corner or a tree; standing at an open window; behind a creature of same size",
    "defense": 4,
    "reflex": 2
  },
  {
    "id": "threeQuarters",
    "degree": "Three-quarters",
    "example": "peering around a corner or a big tree",
    "defense": 7,
    "reflex": 3
  },
  {
    "id": "nineTenths",
    "degree": "Nine-tenths",
    "example": "standing at an arrow slit; behind a door that’s slightly ajar",
    "defense": 10,
    "reflex": 4
  },
  {
    "id": "total",
    "degree": "Total",
    "example": "on the other side of a solid wall",
    "defense": 0,
    "reflex": 0
  }
];

export const CONCEALMENT = [
  {
    "id": "oneQuarter",
    "degree": "One-quarter",
    "missChance": 10
  },
  {
    "id": "oneHalf",
    "degree": "One-half",
    "missChance": 20
  },
  {
    "id": "threeQuarters",
    "degree": "Three-quarters",
    "missChance": 30
  },
  {
    "id": "nineTenths",
    "degree": "Nine-tenths",
    "missChance": 40
  },
  {
    "id": "total",
    "degree": "Total",
    "missChance": 50
  }
];

/**
 * "A resulting value of +6 or higher provides the hero with multiple attacks."
 * Each row lists the extra attacks, not the first one.
 */
export const EXTRA_ATTACKS = [
  {
    "baseAttack": 6,
    "extra": [
      1
    ]
  },
  {
    "baseAttack": 7,
    "extra": [
      2
    ]
  },
  {
    "baseAttack": 8,
    "extra": [
      3
    ]
  },
  {
    "baseAttack": 9,
    "extra": [
      4
    ]
  },
  {
    "baseAttack": 10,
    "extra": [
      5
    ]
  },
  {
    "baseAttack": 11,
    "extra": [
      6,
      1
    ]
  },
  {
    "baseAttack": 12,
    "extra": [
      7,
      2
    ]
  },
  {
    "baseAttack": 13,
    "extra": [
      8,
      3
    ]
  },
  {
    "baseAttack": 14,
    "extra": [
      9,
      4
    ]
  },
  {
    "baseAttack": 15,
    "extra": [
      10,
      5
    ]
  },
  {
    "baseAttack": 16,
    "extra": [
      11,
      6,
      1
    ]
  },
  {
    "baseAttack": 17,
    "extra": [
      12,
      7,
      2
    ]
  },
  {
    "baseAttack": 18,
    "extra": [
      13,
      8,
      3
    ]
  },
  {
    "baseAttack": 19,
    "extra": [
      14,
      9,
      4
    ]
  },
  {
    "baseAttack": 20,
    "extra": [
      15,
      10,
      5
    ]
  }
];

/** The penalties for fighting with two weapons, by circumstance. */
export const TWO_WEAPON = [
  {
    "id": "normalPenalties",
    "circumstance": "Normal penalties",
    "primary": -6,
    "offHand": -10
  },
  {
    "id": "offHandWeaponIsLight",
    "circumstance": "Off-hand weapon is light",
    "primary": -4,
    "offHand": -8
  },
  {
    "id": "twoWeaponFightingFeat",
    "circumstance": "Two-Weapon Fighting feat",
    "primary": -4,
    "offHand": -4
  },
  {
    "id": "offHandWeaponIsLightAndTwoWeaponFightingFeat",
    "circumstance": "Off-hand weapon is light and Two-Weapon Fighting feat",
    "primary": -2,
    "offHand": -2
  }
];
