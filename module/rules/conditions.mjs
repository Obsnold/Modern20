/**
 * The conditions (Modern/Conditions), as Foundry status effects: the markers a
 * token's HUD toggles. Where a condition's penalty is a plain number, the
 * status effect carries it as changes to the character's bonuses; the rest of
 * what a condition does (can take no actions, +4 Defense against ranged attacks
 * while prone) is its text, shown on the effect, for the table to apply.
 *
 * tools/test/conditions.test.mjs holds this list to the condition pages.
 */

const add = (key, value) => ({ key: `system.bonuses.${key}`, type: "add", value, phase: "initial" });
const allAttacks = (v) => [add("attack.melee", v), add("attack.ranged", v)];
const allSaves = (v) => [add("saves.fort", v), add("saves.ref", v), add("saves.will", v)];
const loseDex = add("loseDexBonus", 1);

/** id -> { name, img, changes, text }. `text` is the condition as the SRD prints it, in short. */
export const CONDITIONS = {
  abilityDamaged: { name: "Ability Damaged", img: "icons/svg/downgrade.svg", text: "Has lost ability score points, regained at 1 per evening of rest." },
  abilityDrained: { name: "Ability Drained", img: "icons/svg/degen.svg", text: "Has lost ability score points permanently." },
  blinded: { name: "Blinded", img: "icons/svg/blind.svg", text: "Everything has total concealment (50% miss chance); effective Dex 3; –4 on Str- and Dex-based skills and Search." },
  cowering: { name: "Cowering", img: "icons/svg/terror.svg", changes: [add("defense", -2), loseDex], text: "Frozen in fear: loses the Dex bonus to Defense, can take no actions, –2 Defense." },
  dazed: { name: "Dazed", img: "icons/svg/daze.svg", text: "Can take no actions, but keeps normal Defense." },
  dead: { name: "Dead", img: "icons/svg/skull.svg", text: "Hit points at –10 or lower, or Constitution 0." },
  deafened: { name: "Deafened", img: "icons/svg/deaf.svg", changes: [add("initiative", -4)], text: "Can't hear: –4 initiative, can't make Listen checks." },
  disabled: { name: "Disabled", img: "icons/svg/cancel.svg", text: "At 0 hit points: a single move or attack action, then 1 point of damage after any action." },
  dying: { name: "Dying", img: "icons/svg/blood.svg", text: "–1 to –9 hit points and unconscious: no actions, loses 1 hit point a round until dead or stable." },
  entangled: { name: "Entangled", img: "icons/svg/net.svg", changes: [...allAttacks(-2), add("abilities.dex", -4)], text: "–2 on attacks, –4 Dex; half speed (or can't move if anchored), can't run or charge." },
  exhausted: { name: "Exhausted", img: "icons/svg/downgrade.svg", changes: [add("abilities.str", -6), add("abilities.dex", -6)], text: "Half speed, can't run or charge, –6 Str and Dex; fatigued after 1 hour of rest." },
  fatigued: { name: "Fatigued", img: "icons/svg/downgrade.svg", changes: [add("abilities.str", -2), add("abilities.dex", -2)], text: "Can't run or charge, –2 Str and Dex; recovered after 8 hours of rest." },
  flatFooted: { name: "Flat-Footed", img: "icons/svg/eye.svg", changes: [loseDex], text: "Has not yet acted: loses the Dex bonus to Defense, can't make attacks of opportunity." },
  grappled: { name: "Grappled", img: "icons/svg/padlock.svg", changes: [loseDex], text: "Only unarmed or light-weapon attacks, or breaking free; loses the Dex bonus to Defense except against the grappler." },
  helpless: { name: "Helpless", img: "icons/svg/sleep.svg", text: "Paralyzed, asleep or unconscious: effective Defense 5 + size modifier; open to a coup de grace." },
  nauseated: { name: "Nauseated", img: "icons/svg/poison.svg", text: "Can't attack or do anything needing attention: a single move action per turn." },
  panicked: { name: "Panicked", img: "icons/svg/hazard.svg", text: "Flees as fast as possible, cowering if cornered; defends normally but can't attack." },
  paralyzed: { name: "Paralyzed", img: "icons/svg/paralysis.svg", text: "Falls, unable to move (effective Str and Dex 0); helpless." },
  pinned: { name: "Pinned", img: "icons/svg/padlock.svg", changes: [loseDex], text: "Held immobile in a grapple: loses the Dex bonus to Defense, –4 Defense against melee attacks." },
  prone: { name: "Prone", img: "icons/svg/falling.svg", changes: [add("attack.melee", -4)], text: "–4 on melee attacks, can't use bows or thrown weapons; +4 Defense against ranged attacks, –4 against melee." },
  shaken: { name: "Shaken", img: "icons/svg/terror.svg", changes: [...allAttacks(-2), ...allSaves(-2), add("allSkills", -2)], text: "–2 on attack rolls, saving throws and skill checks." },
  stable: { name: "Stable", img: "icons/svg/regen.svg", text: "No longer dying, but still unconscious." },
  stunned: { name: "Stunned", img: "icons/svg/daze.svg", changes: [add("defense", -2), loseDex], text: "Loses the Dex bonus, drops what it holds, can take no attack or move actions, –2 Defense." },
  unconscious: { name: "Unconscious", img: "icons/svg/unconscious.svg", text: "Can't defend itself: helpless, and typically falls prone." },
};

/** The conditions as Foundry's CONFIG.statusEffects entries. */
export function statusEffects() {
  return Object.entries(CONDITIONS).map(([id, c]) => ({
    id, name: c.name, img: c.img, description: `<p>${c.text}</p>`, system: { changes: c.changes ?? [] },
  }));
}

const ABILITY_OF_SAVE = { fort: "con", ref: "dex", will: "wis" };
const mod = (score) => (score === null || score === undefined ? null : Math.floor((score - 10) / 2));

/**
 * What a creature's conditions change on its printed rolls. A creature's numbers are totals, so the
 * conditions' changes (`changes`: their `system.bonuses.*` adds, as on a character) are worked out
 * as differences from what is printed: a penalty to Strength or Dexterity is the change in its
 * modifier, carried to what that ability adds to (attacks, saves, skills, initiative, Defense).
 * `abilities` are the creature's printed scores; `skillAbility(name)` the key ability of a skill
 * by its printed name. Returns functions giving each roll's adjustment, and Defense's.
 */
export function creatureConditions(changes, abilities, skillAbility = () => null) {
  const b = {};
  for (const c of changes) {
    if ((c.type ?? "add") !== "add" || !c.key?.startsWith("system.bonuses.")) continue;
    const key = c.key.slice("system.bonuses.".length);
    b[key] = (b[key] ?? 0) + Number(c.value || 0);
  }
  const delta = (a) => {
    const before = mod(abilities?.[a]);
    return before === null ? 0 : mod(abilities[a] + (b[`abilities.${a}`] ?? 0)) - before;
  };
  // Defense: the Dexterity modifier it now adds (none of a bonus, when the condition loses it, but any
  // penalty still), in place of the printed one.
  const dexBefore = mod(abilities?.dex) ?? 0, dexAfter = dexBefore + delta("dex");
  const defense = (b.defense ?? 0) + ((b.loseDexBonus ?? 0) > 0 ? Math.min(dexAfter, 0) : dexAfter) - dexBefore;
  return {
    ability: (a) => delta(a),
    save: (s) => (b[`saves.${s}`] ?? 0) + delta(ABILITY_OF_SAVE[s]),
    skill: (name) => {
      const a = skillAbility(name);
      return (b.allSkills ?? 0) + (a ? delta(a) : 0);
    },
    attack: (kind) => (kind === "ranged" ? (b["attack.ranged"] ?? 0) + delta("dex") : (b["attack.melee"] ?? 0) + delta("str")),
    damage: (kind) => (kind === "ranged" ? 0 : delta("str")),
    initiative: () => (b.initiative ?? 0) + delta("dex"),
    grapple: () => (b.grapple ?? 0) + delta("str"),
    defense: () => defense,
  };
}
