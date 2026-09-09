/**
 * Default activities by item type, generated from data/activity_defaults.json
 * by scripts/gen_activity_defaults.py.
 *
 * The same data drives the compendium build, so a weapon from a pack and one
 * created by hand end up with identical activities.
 */
export const ACTIVITY_DEFAULTS = {
  "weapon": {
    "always": [
      {
        "id": "shot",
        "type": "attack",
        "name": "MODERN20.Attack.Single",
        "consume": {
          "ammo": 1
        }
      }
    ],
    "automatic": [
      {
        "id": "autofire",
        "type": "attack",
        "name": "MODERN20.Attack.Autofire",
        "attack": {
          "defenseOverride": 10
        },
        "area": {
          "shape": "square",
          "size": 10
        },
        "consume": {
          "ammo": 10
        },
        "requiresAmmo": 10,
        "note": "MODERN20.Attack.AutofireArea"
      },
      {
        "id": "burst",
        "type": "attack",
        "name": "MODERN20.Attack.Burst",
        "attack": {
          "bonus": -4
        },
        "damage": {
          "extraDice": 2
        },
        "consume": {
          "ammo": 5
        },
        "requiresAmmo": 5,
        "requiresFeat": "Burst Fire"
      }
    ]
  }
};
