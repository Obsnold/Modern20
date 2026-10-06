/**
 * The mechanics the SRD's feats, talents and species give, as data the build puts on each
 * item: its effects (numbers that always apply) and its notes (numbers or rules that apply in
 * a situation, shown when rolling). Keyed by `<type>:<identifier>`.
 *
 * Code applies effects and shows notes without knowing any feat by name; a rule the code must
 * interpret (proficiency, Weapon Finesse, firing modes, choices) stays in
 * module/rules/feats.mjs.
 *
 * Effects: `[key, value]`, the key under `system.bonuses` (`skills.listen`, a specialty as
 * `skills.craft:pharmaceutical`, `attack.melee`, `saves.fort`, `speed`, `hitPoints`, ...), the
 * value a number or a formula (`@classes.tough-hero.level`, `@level`, `@abilities.con.mod`).
 *
 * Notes: `{ rolls, text, value }`. `rolls` are the rolls it is for:
 *
 *   check                    every ability and skill check
 *   ability, ability.<abl>   ability checks, or one ability's
 *   skill, skill.<key>       skill checks, or one skill's
 *   skill.<abl>              skill checks keyed on an ability (skill.cha: Charisma-based)
 *   save, save.<save>        saving throws, or one save
 *   attack, attack.melee, attack.ranged, attack.unarmed
 *   grapple, casterLevel, defense
 *
 * `value`, if any, is the bonus it gives (a number or formula): the roll offers it as a tick box.
 * Without one, the note is text for the player to judge.
 */

/** Both kinds of attack. */
const attacks = (v) => [["attack.melee", v], ["attack.ranged", v]];
/** All three saves. */
const saves = (v) => [["saves.fort", v], ["saves.ref", v], ["saves.will", v]];
/** A bonus on several skills. */
const skills = (v, ...keys) => keys.map((k) => [`skills.${k}`, v]);

export const EFFECTS = {
  // Feats with a fixed bonus.
  "feat:great-fortitude": [["saves.fort", 2]],
  "feat:iron-will": [["saves.will", 2]],
  "feat:lightning-reflexes": [["saves.ref", 2]],
  "feat:improved-initiative": [["initiative", 4]],
  "feat:renown": [["reputation", 3]],
  "feat:toughness": [["hitPoints", 3]],
  "feat:improved-damage-threshold": [["massiveDamage", 3]],
  "feat:improved-grapple": [["grapple", 4]],
  // +2 on all checks with two skills.
  "feat:acrobatic": skills(2, "jump", "tumble"),
  "feat:alertness": skills(2, "listen", "spot"),
  "feat:animal-affinity": skills(2, "handleAnimal", "ride"),
  "feat:athletic": skills(2, "climb", "swim"),
  "feat:attentive": skills(2, "investigate", "senseMotive"),
  "feat:cautious": skills(2, "demolitions", "disableDevice"),
  "feat:confident": skills(2, "gamble", "intimidate"),
  "feat:deceptive": skills(2, "bluff", "disguise"),
  "feat:focused": skills(2, "balance", "concentration"),
  "feat:gearhead": skills(2, "computerUse", "repair"),
  "feat:guide": skills(2, "navigate", "survival"),
  "feat:magical-affinity": skills(2, "spellcraft", "useMagicDevice"),
  "feat:medical-expert": [["skills.craft:pharmaceutical", 2], ["skills.treatInjury", 2]],
  "feat:meticulous": skills(2, "forgery", "search"),
  "feat:nimble": skills(2, "escapeArtist", "sleightOfHand"),
  "feat:stealthy": skills(2, "hide", "moveSilently"),
  "feat:studious": skills(2, "decipherScript", "research"),
  "feat:trustworthy": skills(2, "diplomacy", "gatherInformation"),
  "feat:vehicle-expert": skills(2, "drive", "pilot"),
  "feat:planetary-adaptation": skills(4, "survival"),
  "feat:windfall": skills(1, "profession"),

  // Talents.
  "talent:healing-knack": skills(2, "treatInjury"),
  "talent:increased-speed": [["speed", 5]],
  "talent:improved-increased-speed": [["speed", 5]],
  "talent:advanced-increased-speed": [["speed", 5]],
  "talent:melee-smash": [["damage.melee", 1]],
  "talent:improved-melee-smash": [["damage.melee", 1]],
  "talent:advanced-melee-smash": [["damage.melee", 1]],
  "talent:robust": [["hitPoints", "@classes.tough-hero.level"]],
  // Tough hero: damage reduction a point a talent, and resistance to an energy of the Con modifier.
  "talent:damage-reduction-1": [["damageReduction", 1]],
  "talent:damage-reduction-2": [["damageReduction", 1]],
  "talent:damage-reduction-3": [["damageReduction", 1]],
  "talent:acid-resistance": [["energyResistance.acid", "@abilities.con.mod"]],
  "talent:cold-resistance": [["energyResistance.cold", "@abilities.con.mod"]],
  "talent:electricity-resistance": [["energyResistance.electricity", "@abilities.con.mod"]],
  "talent:fire-resistance": [["energyResistance.fire", "@abilities.con.mod"]],
  "talent:sonic-concussion-resistance": [["energyResistance.sonic", "@abilities.con.mod"]],

  // Class features that always apply.
  "feature:improved-reaction": [["initiative", 2]],
  "feature:damage-reduction": [["damageReductionMagic", 5]],   // the Thrasher's 5/+1
  "feature:medical-specialist": [["skills.treatInjury", "@rank"]],   // +1, +2 at 5th, +3 at 8th

  // Species: their always-on bonuses (ability adjustments and natural armor are fields of the species).
  "species:aasimar": skills(2, "listen", "spot"),
  "species:bugbear": [...attacks(2), ...skills(4, "moveSilently")],
  "species:dragonblooded-human": skills(2, "intimidate", "spot"),
  "species:drow-dark-elf": skills(2, "listen", "search", "spot"),
  "species:elf": skills(2, "listen", "search", "spot"),
  "species:gnoll": attacks(1),
  "species:gnome": skills(2, "listen"),
  "species:goblin": skills(4, "moveSilently"),
  "species:half-elf": [...skills(1, "listen", "search", "spot"), ...skills(2, "diplomacy", "gatherInformation")],
  "species:half-ogre": attacks(1),
  "species:halfling": [...saves(1), ...skills(2, "climb", "jump", "listen", "moveSilently")],
  "species:ogre": attacks(3),
  "species:shadowkind-human": saves(1),
  "species:tiefling": skills(2, "bluff", "hide"),
};

const note = (rolls, text, value = "") => ({ rolls, text, value: String(value) });

export const NOTES = {
  // Feats.
  "feat:combat-throw": [note(["grapple"], "Combat Throw: +2 on opposed checks to trip or grapple, or to avoid them", 2)],
  "feat:defensive-martial-arts": [note(["defense"], "Defensive Martial Arts: +1 dodge bonus to Defense against melee attacks")],
  "feat:dodge": [note(["defense"], "Dodge: +1 dodge bonus to Defense against one designated opponent")],
  "feat:mobility": [note(["defense"], "Mobility: +4 dodge bonus to Defense against attacks of opportunity when moving")],
  "feat:endurance": [note(["save.fort", "ability.con", "skill.swim"], "Endurance: +4 against fatigue, holding breath, starvation, thirst, and hot or cold environments", 4)],
  "feat:improved-feint": [note(["skill.bluff"], "Improved Feint: +2 on Bluff to feint in melee", 2)],
  "feat:run": [note(["skill.jump"], "Run: +2 on Jump for a running long jump", 2)],
  "feat:spell-penetration": [note(["casterLevel"], "Spell Penetration: +2 to beat spell resistance", 2)],
  "feat:greater-spell-penetration": [note(["casterLevel"], "Greater Spell Penetration: +4 to beat spell resistance", 4)],
  "feat:sunder": [note(["attack.melee"], "Sunder: +4 to attack an object held or carried", 4)],
  "feat:ultra-immune-system": [note(["save.fort"], "Ultra Immune System: +2 against poison, disease and radiation sickness", 2)],

  // Talents.
  "talent:fast-talk": [note(["skill.bluff", "skill.diplomacy", "skill.gamble"], "Fast-Talk: lying, cheating or bending the truth", "@classes.charismatic-hero.level")],
  "talent:charm": [note(["skill.cha"], "Charm: influencing your chosen gender (indifferent or better)", "@classes.charismatic-hero.level")],
  "talent:empathy": [note(["skill.bluff", "skill.diplomacy", "skill.handleAnimal", "skill.intimidate", "skill.perform", "skill.senseMotive"], "Empathy: after a minute observing the target", "@classes.dedicated-hero.level")],
  "talent:extreme-effort": [note(["ability.str", "skill.str"], "Extreme Effort: a full round's effort on a Strength check", 2)],
  "talent:improved-extreme-effort": [note(["ability.str", "skill.str"], "Improved Extreme Effort: stacks with Extreme Effort", 2)],
  "talent:advanced-extreme-effort": [note(["ability.str", "skill.str"], "Advanced Extreme Effort: stacks with the others", 2)],

  // Class features.
  "feature:combat-casting": [note(["skill.concentration"], "Combat Casting: Concentration to cast on the defensive", 4)],
  "feature:combat-manifestation": [note(["skill.concentration"], "Combat Manifestation: Concentration to manifest on the defensive", 4)],
  "feature:urban-survival": [note(["skill.survival"], "Urban Survival: in urban areas", 4)],
  "feature:resist-venom": [note(["save"], "Resist Venom: against natural poisons", 4)],
  "feature:machine-empathy": [note(["skill"], "Machine Empathy: with an electronic or mechanical device", 2)],
  "feature:fearless": [note(["save.will"], "Fearless: against fear (a Dreadnought is immune)", 4)],
  "feature:stability": [note(["ability", "grapple"], "Stability: to resist a trip, overrun, being knocked prone or a bull rush", 4)],
  "feature:trap-sense": [note(["save.ref"], "Trap Sense: to avoid a trap", "@rank"), note(["defense"], "Trap Sense: dodge bonus to Defense against traps (+1 a rank)")],
  "feature:combat-sense": [note(["attack"], "Combat Sense: against the opponent designated", "@rank")],
  "feature:restricted-access": [note(["skill.computerUse"], "Restricted Access: to defeat computer security", 5), note(["skill.research"], "Restricted Access", 5)],
  "feature:false-allegiance": [note(["skill.cha"], "False Allegiance: with someone of the same allegiance", 2)],
  "feature:jury-rig": [note(["skill.repair"], "Jury-Rig: a temporary or jury-rigged repair", 2)],
  "feature:read-write-code": [note(["skill.computerUse"], "Read/Write Code: degrading a program, its weak points found", 2)],
  "feature:sweep": [note(["skill.spot"], "Sweep: sweeping an area for surveillance", 4)],
  "feature:profile": [note(["skill"], "Profile: uncovering evidence on, or locating, the suspect", 2)],
  "feature:know-location": [note(["skill.navigate", "skill.survival"], "Know Location: to avoid becoming lost", 2)],
  "feature:super-cybersurgeon": [note(["skill.treatInjury"], "Super Cybersurgeon: cybernetic surgery", 4)],
  "feature:smite-allegiance": [note(["attack.melee"], "Smite Allegiance: against the opposing allegiance (an action point)", "@abilities.cha.mod")],
  "feature:target-species": [note(["skill.bluff", "skill.intimidate", "skill.listen", "skill.senseMotive", "skill.spot", "skill.survival"], "Target Species: against the target species", 2)],
  "feature:shadow-enemy": [note(["skill.bluff", "skill.listen", "skill.search", "skill.senseMotive", "skill.spot"], "Shadow Enemy: against the chosen Shadow creatures", "@rank")],
  "feature:xenoresistance": [note(["save"], "Xenoresistance: against another species' extraordinary, spell-like or supernatural attacks", 1)],
  "feature:xenodefense": [note(["defense"], "Xenodefense: +1 insight bonus to Defense against the opponent designated")],
  "feature:monkeys-unite": [note(["attack"], "Monkeys Unite: adjacent to another Space Monkey", 1)],

  // Species.
  "species:dragonblooded-human": [note(["save"], "Dragonblooded: +4 against sleep and paralysis", 4)],
  "species:drow-dark-elf": [
    note(["save"], "Drow: +2 against enchantments", 2),
    note(["save.will"], "Drow: +2 Will against spells and spell-like abilities", 2),
    note(["check", "attack", "save"], "Light blindness: −1 in bright light", -1),
  ],
  "species:dwarf": [
    note(["save"], "Dwarf: +2 against poison, spells and spell-like abilities", 2),
    note(["attack"], "Dwarf: +1 against goblinoids", 1),
    note(["defense"], "Dwarf: +4 dodge bonus to Defense against giants"),
    note(["ability"], "Dwarf stability: +4 to resist bull rush and trip, standing on the ground", 4),
    note(["skill.search"], "Dwarf: +2 to notice unusual stonework", 2),
  ],
  "species:elf": [note(["save"], "Elf: +2 against enchantments", 2)],
  "species:half-elf": [note(["save"], "Half-elf: +2 against enchantments", 2)],
  "species:gnome": [
    note(["save"], "Gnome: +2 against illusions", 2),
    note(["attack"], "Gnome: +1 against goblinoids and kobolds", 1),
    note(["defense"], "Gnome: +4 dodge bonus to Defense against giants"),
    note(["skill.craft"], "Gnome: +2 on Craft (pharmaceutical) with a rank in it", 2),
  ],
  "species:halfling": [
    note(["attack.ranged"], "Halfling: +1 with thrown weapons and slings", 1),
    note(["save"], "Halfling: +2 morale against fear", 2),
  ],
  "species:orc": [note(["attack"], "Orc light sensitivity: −1 in bright sunlight", -1)],
};

/**
 * Effects a character switches on when they apply (on the Effects tab), built switched off:
 * `{ name, changes }`, as EFFECTS: a shield manifested, a surge, a defensive stance. The Thrasher's
 * Ability Surge: +4 Strength and Dexterity, −2 on every save, while it lasts.
 */
export const TOGGLES = {
  "feature:psychic-shield": { name: "Psychic Shield (switch on while manifested)", changes: [["defense", 3]] },
  "feature:improved-psychic-shield": { name: "Improved Psychic Shield (switch on in place of Psychic Shield)", changes: [["defense", 6]] },
  "feature:fortunes-favor": { name: "Fortune's Favor (switch on for the round)", changes: [["defense", 2]] },
  "feature:defensive-position": { name: "Defensive Position (switch on with cover)", changes: [["defense", 2], ["saves.ref", 2]] },
  "feature:master-defender": { name: "Master Defender (switch on fighting defensively, in medium or heavier armor)", changes: [["defense", "2 * @rank"]] },
  "feature:ability-surge": { name: "Ability Surge (switch on while surging)", changes: [["abilities.str", 4], ["abilities.dex", 4], ["saves.fort", -2], ["saves.ref", -2], ["saves.will", -2]] },
};
