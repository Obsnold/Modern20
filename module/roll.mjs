/**
 * Rolling: a roll from rules/rolls.mjs, made in Foundry and posted to chat
 * with its breakdown.
 *
 * Before a d20 roll the player is asked for a situational modifier and, on a
 * character with action points, whether to spend one. Shift-click skips the
 * question (or asks it, with the "Ask before rolling" setting off). An attack's
 * card carries buttons for its damage, and on a threat for confirming the
 * critical and rolling critical damage.
 */
import { abilityModifier } from "./data/models.mjs";
import * as R from "./rules/rolls.mjs";
import { recordRoll } from "./log.mjs";
import { SYSTEM_ID } from "./config.mjs";
import { identify } from "./rules/identify.mjs";
import { rulesFor } from "./rules/feats.mjs";
import { readAttacks, attackRoll, damageRoll } from "./rules/attacks.mjs";
import { readDefenses } from "./rules/resistance.mjs";
import { bindDamageButtons, bindSaveButtons } from "./damage.mjs";
import { bindLevelCheck } from "./casting.mjs";
import { bindTreatment } from "./treat.mjs";
import { aboardOf, aboardTerms, bindVehicleCheck, crewDamage } from "./vehicles.mjs";
import { spendAmmo, specialLoad, recordedLoad } from "./ammo.mjs";
import { unarmedRules, unarmedWeapon, unarmedTerms } from "./rules/unarmed.mjs";
import { automatic, semiautomatic, AUTOFIRE_REFLEX_DC } from "./rules/ammo.mjs";
import { resolveValue, mechanicsContext } from "./rules/effects.mjs";
import { creatureConditions } from "./rules/conditions.mjs";
import { skillKey, SKILLS } from "./data/skills.mjs";
import { wornOverLimit } from "./rules/fx-items.mjs";
import { abilityAsks, armorAbilities } from "./rules/abilities.mjs";
const signed = (n) => (typeof n === "number" ? (n >= 0 ? `+${n}` : `${n}`) : n);
const escape = (s) => foundry.utils.escapeHTML(String(s));

/** Settings for rolling; called from the init hook. */
export function registerRollSettings() {
  game.settings.register(SYSTEM_ID, "askBeforeRolling", {
    name: "Ask before rolling",
    hint: "Ask for a situational modifier, and whether to spend an action point, before a d20 roll. Shift-click does the opposite.",
    scope: "client", config: true, type: Boolean, default: true,
  });
}

/**
 * Ask for a modifier and an action point, and tick any `options` that apply
 * (`[{ name, label }]`, e.g. Point Blank Shot); null if the player cancels.
 */
async function ask(actor, spec, event, options = [], texts = []) {
  const wanted = game.settings.get(SYSTEM_ID, "askBeforeRolling") !== !!event?.shiftKey;
  if (!wanted) return {};
  const ap = actor.type === "character" ? actor.system.actionPoints.value : 0;
  const die = R.actionPointDie(actor.system.derived?.level ?? 1);
  const content = `
    <div class="form-group"><label>Situational modifier</label><input type="number" name="modifier" value="0" autofocus></div>
    ${options.map((o) => (o.choices
      ? `<div class="form-group"><label>${escape(o.label)}</label><select name="${o.name}">${o.choices.map(([v, l]) => `<option value="${escape(v)}">${escape(l)}</option>`).join("")}</select></div>`
      : o.number ? `<div class="form-group"><label>${escape(o.label)}</label><input type="number" name="${o.name}" min="0" step="5" placeholder="${escape(o.placeholder ?? "")}"></div>`
        : `<div class="form-group"><label>${escape(o.label)}</label><input type="checkbox" name="${o.name}"></div>`)).join("")}
    ${texts.length ? `<ul class="m20-roll-notes">${texts.map((t) => `<li>${escape(t)}</li>`).join("")}</ul>` : ""}
    ${ap > 0 ? `<div class="form-group"><label>Spend an action point (${escape(die.label.replace(/^Action point /, ""))}; ${ap} left)</label><input type="checkbox" name="actionPoint"></div>` : ""}`;
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: spec.title },
    content,
    ok: { label: "Roll", callback: (ev, button) => ({
      modifier: button.form.elements.modifier.valueAsNumber || 0,
      actionPoint: !!button.form.elements.actionPoint?.checked,
      ...Object.fromEntries(options.map((o) => [o.name, o.choices ? button.form.elements[o.name]?.value : o.number ? button.form.elements[o.name]?.valueAsNumber || 0 : !!button.form.elements[o.name]?.checked])),
    }) },
    rejectClose: false,
  });
  if (!result) return null;
  return { ...result, actionPoint: result.actionPoint ? die : null };
}

/**
 * Post a roll to chat as `actor`; returns the Roll. `flags` are kept on the
 * message for its buttons (an attack's weapon and critical); `judge(roll)`
 * adds flags that depend on the result (whether a critical was confirmed).
 */
export async function post(actor, spec, { flags = {}, judge } = {}) {
  if (!spec) return null;
  if (spec.unusable) { ui.notifications.warn(`${spec.title}: ${spec.unusable}`); return null; }
  const Roll = foundry.dice?.Roll ?? globalThis.Roll;
  const roll = await new Roll(spec.formula).evaluate();
  const lines = spec.terms.map((t) => `<li>${escape(t.label)} <strong>${escape(signed(t.value))}</strong></li>`).join("");
  const judged = judge?.(roll) ?? {};
  let note = "", threat = false;
  if (spec.critical && spec.formula.startsWith("1d20")) {
    // A threat is a hit in the weapon's range: a roll judged a miss is not one.
    threat = (roll.dice[0]?.total ?? 0) >= spec.critical.threat && !(judged.hit && !judged.hit.hit);
    if (threat) note = `<p class="m20-crit">Critical threat (×${spec.critical.multiplier}).</p>`;
  } else if (spec.critical) {
    note = `<p class="m20-hint">On a confirmed critical: ×${spec.critical.multiplier}.</p>`;
  }
  const hints = (spec.hints ?? []).map((h) => `<p class="m20-hint">${escape(h)}</p>`).join("");
  // What a judge says of the roll for the card (a caster level check against a target's spell resistance).
  const verdict = judged.verdict ? `<p class="${judged.verdict.good ? "m20-crit" : "m20-hint"}">${escape(judged.verdict.text)}</p>` : "";
  const flavor = `<div class="m20-roll"><h3>${escape(spec.title)}</h3>${lines ? `<ul>${lines}</ul>` : ""}${note}${hints}${verdict}</div>`;
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor, flags: { [SYSTEM_ID]: { ...flags, ...judged, threat, critical: spec.critical ?? flags.critical, formula: spec.formula } } });
  await recordRoll(actor, spec.title, roll.total);
  return roll;
}

/**
 * Ask, spend the action point if one was chosen, and post. `rebuild` makes the
 * roll again from what was ticked (an attack with Point Blank Shot); `notes` are the
 * situational notes that apply (rules/rolls.mjs notesFor).
 */
async function rollD20(actor, spec, event, flags, { options = [], rebuild, before, notes = { ticks: [], texts: [] }, judge } = {}) {
  if (!spec || spec.unusable) return post(actor, spec);
  // The notes that apply (Fast-Talk, a species' save bonus): those with a value as tick boxes, the rest as text.
  options = [...options, ...notes.ticks];
  const build = rebuild;
  rebuild = (ticked) => R.withNotes(build ? build(ticked) : spec, notes.ticks, ticked);
  const added = await ask(actor, spec, event, options, notes.texts);
  if (!added) return null;
  // What was chosen: a tick box's yes or no, a number, a choice's value (or, not asked, its first).
  const ticked = Object.fromEntries(options.map((o) => [o.name, o.choices ? added[o.name] ?? o.choices[0][0] : o.number ? added[o.name] ?? 0 : !!added[o.name]]));
  // An action point is checked first, so a roll it stops has not spent anything else.
  if (added.actionPoint && actor.system.actionPoints.value < 1) { ui.notifications.warn(`${actor.name} has no action points left.`); return null; }
  // Anything the roll costs besides an action point (a weapon's rounds); it can stop the roll.
  if (before && (await before(ticked)) === false) return null;
  if (added.actionPoint) await actor.update({ "system.actionPoints.value": actor.system.actionPoints.value - 1 });
  // A critical is confirmed with the attack's own modifiers, the situational one included, but not an
  // action point's die: a point spent on a roll applies to that roll alone.
  spec = rebuild(ticked);
  const confirm = flags?.attack ? R.withAdditions(spec, { modifier: added.modifier }).formula : undefined;
  return post(actor, R.withAdditions(spec, added), {
    flags: flags?.attack ? { ...flags, confirm, attack: { ...flags.attack, ...ticked } } : flags ?? {},
    // An attack judged against its target's Defense; another roll by its own judge (a Reputation check's DC).
    judge: flags?.attack ? (roll) => (spec.againstDefense ? judgeAgainstArea(roll, spec.againstDefense) : judgeAgainstTarget(roll, { touch: flags.attack.touch })) : judge,
  });
}

/** A d20 roll a module builds (a Treat Injury use), asked and posted as any is; `judge(roll)` adds the card's flags. */
export const rollCheck = (actor, spec, event, { judge, options, rebuild, flags } = {}) => rollD20(actor, spec, event, flags ?? {}, { judge, options, rebuild });

/** Autofire: against the square's Defense, not a token's. */
function judgeAgainstArea(roll, defense) {
  const natural = roll.dice[0]?.total;
  return { hit: { name: "the 10-foot square", defense, touch: false, hit: natural === 20 || (natural !== 1 && roll.total >= defense) } };
}

/**
 * An attack against the one token targeted, if one is: whether it hits its Defense (touch
 * Defense for a touch attack). A natural 20 always hits and a natural 1 always misses.
 */
function judgeAgainstTarget(roll, { touch = false } = {}) {
  const targets = [...(game.user.targets ?? [])];
  if (targets.length !== 1) return {};
  const defense = defenseOf(targets[0].actor, { touch });
  if (defense === null || defense === undefined) return {};
  const natural = roll.dice[0]?.total;
  const hit = natural === 20 || (natural !== 1 && roll.total >= defense);
  return { hit: { name: targets[0].name, defense, touch, hit } };
}

/** Every roll a character's sheet offers, by name. Pass the click event so shift works. */
export function characterRolls(actor) {
  const d = actor.system.derived;
  const feats = actor.items.filter((i) => ["feat", "talent", "feature"].includes(i.type)).map((i) => ({ name: i.name, identifier: identify(i), choice: i.system.choice ?? "" }));
  const notes = (targets) => R.notesFor(notesOf(actor), targets, resolverFor(actor));
  return {
    ability: (key, event) => rollD20(actor, R.abilityCheck(d, key), event, undefined, { notes: notes(R.rollTargets.ability(key)) }),
    save: (key, event) => rollD20(actor, R.savingThrow(d, key), event, undefined, { notes: notes(R.rollTargets.save(key)) }),
    skill: (key, specialty, event) => {
      const row = d.skills.find((s) => s.key === key && s.specialty === (specialty ?? ""));
      const n = row ? notes(R.rollTargets.skill(row)) : undefined;
      // Swim: −1 for every 5 pounds of gear carried (Modern/Skills/Swim), offered with the weight of all the
      // character's gear, since the sheet cannot know what was left on the shore.
      const lb = key === "swim" ? gearWeight(actor) : 0;
      if (n && lb >= 5) n.ticks.push({ name: "swimGear", label: `Gear carried: ${lb} lb. of gear (−1 per 5 lb.)`, value: -Math.floor(lb / 5), term: "Gear carried" });
      // Aboard a moving vehicle: its speed's penalty (module/vehicles.mjs).
      const check = R.skillCheck(d, row);
      const spec = check?.unusable ? check : withTerms(check, aboardTerms(actor, "check"));
      return rollD20(actor, spec, event, undefined, { notes: n });
    },
    /** An attack with a weapon: one of the character's, or (`vehicle`) one mounted on the vehicle it fires from, with `extra` terms. */
    attack: (item, event, { vehicle = null, extra = [] } = {}) => {
      // Aboard a moving vehicle: its speed's penalty, and how it is driven; a driver on total defense makes none.
      const aboard = aboardOf(actor);
      if (aboard?.cannotAttack) return ui.notifications.warn(`${actor.name} is driving ${aboard.vehicle.name} on total defense: no attacks.`);
      const extraTerms = [...aboardTerms(actor, "attack"), ...extra];
      // Point Blank Shot is the player's call: the SRD's "within 30 feet" is not something the sheet can see.
      const options = !item.system.melee && feats.some((f) => rulesFor(f.identifier).pointBlank) ? [{ name: "pointBlank", label: "Within 30 feet (Point Blank Shot: +1 attack and damage)" }] : [];
      const modes = firingModes(item, feats);
      if (modes.length > 1) options.unshift({ name: "mode", label: "Firing mode", choices: modes });
      // The special load it fires (Beanbag, Armor Piercing), and its question about the target, asked here for the damage too.
      const ammo = item.system.melee ? null : specialLoad(actor, item);
      if (ammo?.ask) options.push({ name: "ammoAsk", label: ammo.ask.label });
      // A ranged attack's distance (its range penalty, and Point Blank Shot within 30 feet) and a target in a melee.
      if (!item.system.melee && item.system.rangeIncrement?.ft) options.unshift({ name: "distance", number: true, label: `Distance to the target, in feet (range increment ${item.system.rangeIncrement.ft} ft.)`, placeholder: "within the first increment" });
      if (!item.system.melee) options.push({ name: "intoMelee", label: "The target is in a melee with an ally (−4)" });
      // A special ability that works against a kind of target (Holy, Bane): asked here, for the damage too (rules/abilities.mjs).
      options.push(...abilityAsks(item.system));
      options.push(...defensiveOption(actor));
      const hasPointBlank = feats.some((f) => rulesFor(f.identifier).pointBlank);
      // The load fired is kept on the card, so its damage is the load's even if the weapon is reloaded before it is rolled.
      const load = ammo ? { key: ammo.key, name: ammo.name } : null;
      return rollD20(actor, R.attack(d, item, feats, { mode: modes[0]?.[0], ammo, extraTerms }), event, { attack: { actor: actor.uuid, item: item.id, load, ...(vehicle ? { vehicle: vehicle.uuid } : {}) } }, {
        options, notes: notes(R.rollTargets.attack(!!item.system.melee)),
        rebuild: (ticked) => {
          // Point Blank Shot by the distance, when one is given (its damage is rolled from what is kept here).
          if (ticked.distance > 0) ticked.pointBlank = hasPointBlank && ticked.distance <= 30;
          return R.attack(d, item, feats, { ...ticked, ammo, extraTerms });
        },
        // A firearm spends its rounds as it fires: none left, no attack. Fighting defensively starts with the attack.
        before: async (ticked) => {
          if (!item.system.melee && !(await spendAmmo(actor, item, ticked.mode ?? modes[0]?.[0] ?? "single"))) return false;
          await startDefensively(actor, ticked);
        },
      });
    },
    /**
     * An unarmed strike: nonlethal, or lethal (−4 without Combat Martial Arts), with the
     * unarmed feats' die, bonus and critical (rules/unarmed.mjs).
     */
    unarmed: (event) => {
      const u = unarmedRules(feats.map((f) => rulesFor(f.identifier)));
      const options = [{ name: "lethal", label: u.lethalAllowed ? "Lethal damage (Combat Martial Arts)" : "Lethal damage (−4 on the attack)" }];
      if (u.streetfighting) options.push({ name: "streetfighting", label: `Streetfighting: +${u.streetfighting} damage (once a round)` });
      options.push(...defensiveOption(actor));
      const build = (ticked = {}) => withTerms(R.attack(d, unarmedWeapon(u, ticked), feats, { defensively: ticked.defensively }), unarmedTerms(u, ticked));
      return rollD20(actor, build(), event, { attack: { actor: actor.uuid, item: "unarmed" } }, { options, rebuild: build, notes: notes(R.rollTargets.attack(true, true)), before: (ticked) => startDefensively(actor, ticked) });
    },
    /**
     * A Reputation check (Modern/reputation), made by the GM for a GM character who might recognize the hero: their
     * Int modifier (the one token targeted's, as asked), and the situation. Recognized, the card offers famous or
     * infamous, the hero's +4 or −4 with them (rules/conditions.mjs RECOGNIZED).
     */
    reputation: (event) => {
      const targets = [...(game.user.targets ?? [])];
      const them = targets.length === 1 ? targets[0].actor : null;
      const int = them ? (them.type === "character" ? them.system.derived?.modifiers?.int : abilityModifier(them.system.abilities?.int)) ?? 0 : 0;
      const options = [{ name: "int", number: true, label: `Their Int modifier${them ? ` (${them.name}: ${int >= 0 ? "+" : ""}${int})` : ""}, or a Knowledge skill's where the hero is known in its field`, placeholder: String(int) }, ...R.REPUTATION_SITUATIONS.map((x) => ({ name: x.name, label: x.label }))];
      const build = (ticked = {}) => R.reputationCheck(d, { int: ticked.int || int, ticked });
      const judge = (roll) => ({ reputation: { actor: actor.uuid, recognized: roll.total >= R.REPUTATION_DC, by: them?.name ?? "" } });
      return rollD20(actor, build(), event, {}, { options, rebuild: build, judge });
    },
    /** Starting a grapple: a melee touch attack to grab, judged against the target's touch Defense. */
    grab: (event) => {
      const spec = R.d20("Grab: melee touch attack (to start a grapple)", [
        { label: "Base attack", value: d.baseAttackBonus }, { label: "Strength", value: d.modifiers.str ?? 0 },
        { label: "Size", value: R.SIZE_ATTACK[d.size] ?? 0 }, { label: "Effects", value: d.attackBonus?.melee ?? 0 },
        { label: `Load (${d.load?.level ?? ""})`, value: d.load?.penalty ?? 0 },
      ]);
      return rollD20(actor, spec, event, { attack: { actor: actor.uuid, item: "grab", touch: true } }, { notes: notes([...R.rollTargets.attack(true), ...R.rollTargets.grapple()]) });
    },
    /** A grapple check: base attack + Str + the size's grapple modifier, opposed by the target's. */
    grapple: (event) => rollD20(actor, R.d20("Grapple check (opposed)", [
      { label: "Base attack", value: d.baseAttackBonus }, { label: "Strength", value: d.modifiers.str ?? 0 },
      { label: "Size and effects", value: d.grapple - d.baseAttackBonus - (d.modifiers.str ?? 0) },
    ]), event, undefined, { notes: notes(R.rollTargets.grapple()) }),
    damage: (item, { multiplier = 1, pointBlank = false, mode, lethal = false, streetfighting = false, ammoAsk = false, load, ticked = {} } = {}) => {
      // The unarmed strike is not an item: rebuilt from the feats, as it was attacked with.
      const u = item === "unarmed" ? unarmedRules(feats.map((f) => rulesFor(f.identifier))) : null;
      if (u) item = unarmedWeapon(u, { lethal });
      // The load the attack fired (`load`, from its card), or without one the weapon's now.
      const ammo = u || item.system.melee ? null : load !== undefined ? recordedLoad(load) : specialLoad(actor, item);
      const spec = R.damage(d, item, { pointBlank, mode, feats, ammo, ammoAsk, ticked });
      if (!spec) return ui.notifications.info(`${item.name}: its damage is not a roll (${item.system.damage.value || "see its description"}).`);
      // Nonlethal by its type (an unarmed strike's), or by its printed damage ("4d6 nonlethal", a concussion grenade).
      const nonlethal = /nonlethal/i.test(item.system.damageType ?? "") || /nonlethal/i.test(item.system.damage?.value ?? "") || spec.nonlethal;
      if (mode === "autofire") spec.title += ` — everyone in the square: Reflex DC ${AUTOFIRE_REFLEX_DC} or take it`;
      let rolled = multiplier > 1 ? R.criticalDamage(spec, multiplier) : spec;
      // Streetfighting's extra die, once a round, is not multiplied on a critical.
      if (u?.streetfighting && streetfighting) rolled = { ...rolled, formula: `${rolled.formula} + ${u.streetfighting}`, terms: [...rolled.terms, { label: "Streetfighting", value: u.streetfighting }] };
      // The weapon's damage type, for damage reduction and resistance when it is applied (an unarmed strike's is bludgeoning).
      // The load's: the damage reduction it gets past (silver) in the type, and half of it another kind (plasma: fire).
      return post(actor, rolled, { flags: { damage: { nonlethal, type: u ? "bludgeoning" : spec.type ?? item.system.damageType ?? "", half: spec.half ?? null } } });
    },
  };
}

/** The weight of what a character carries, in pounds: everything but what is kept elsewhere (rules/load.mjs). */
export function gearWeight(actor) {
  return actor.system.derived?.load?.weight ?? 0;
}

/**
 * Fighting defensively, offered on an attack unless the actor already is (rules/conditions.mjs ACTIONS): −4 on
 * this attack, then the condition carries the −4 and its +2 Defense to the start of its next turn.
 */
function defensiveOption(actor) {
  return actor.statuses.has("fightingDefensively") ? [] : [{ name: "defensively", label: "Fight defensively (−4 on attacks, +2 Defense until your next turn)" }];
}

/** Put the actor in the fighting-defensively condition, if it chose to fight defensively. */
async function startDefensively(actor, ticked) {
  if (ticked.defensively && !actor.statuses.has("fightingDefensively")) await actor.toggleStatusEffect("fightingDefensively", { active: true });
}

/** Every note the actor's feats, talents, species and FX items carry (tools/build/mechanics.mjs), each with its source. */
export function notesOf(actor) {
  // Gear's notes (an FX item's) while it is in use, as its effects: equipped and not kept elsewhere.
  const over = new Set(wornOverLimit(actor.items.contents).flatMap((w) => w.over));
  const inUse = (i) => (!("equipped" in i.system) || (i.system.equipped && !i.system.stored)) && !over.has(i.id);
  return actor.items.filter((i) => ["feat", "talent", "species", "feature", "equipment", "armor", "weapon"].includes(i.type) && inUse(i))
    .flatMap((i) => [
      ...(i.system.rollNotes ?? []),
      // Armor's special abilities that are the table's (Fortification, Spell Resistance): on Defense.
      ...(i.type === "armor" ? armorAbilities(i.system).notes.map((text) => ({ rolls: ["defense"], text, value: "" })) : []),
    ].map((n) => ({ ...n, source: i.name, rank: i.system.rank || 1 })));
}

/** A note's value worked out for the actor: a number, or a formula of its class levels, level and ability modifiers. */
export function resolverFor(actor) {
  const d = actor.system.derived ?? {};
  const classes = actor.items.filter((i) => i.type === "class");
  const context = mechanicsContext(classes, d.level ?? 0, d.modifiers ?? {});
  return (value, note) => resolveValue(value, { ...context, rank: note?.rank ?? 1 });
}

/** A roll with more named terms, its formula rebuilt (an unarmed strike's Brawl bonus). */
function withTerms(spec, terms) {
  return R.d20(spec.title, [...spec.terms, ...terms], { critical: spec.critical });
}

/**
 * The firing modes a ranged weapon offers, as `[value, label]`: single shots, a double tap
 * (a semiautomatic, with Double Tap), a burst (an automatic, with Burst Fire) and autofire.
 * A weapon that fires only on automatic (a machine gun) offers autofire first.
 */
function firingModes(item, feats) {
  if (item.system.melee) return [];
  const has = (mode) => feats.some((f) => rulesFor(f.identifier).fireMode === mode);
  const modes = [];
  const semi = semiautomatic(item), auto = automatic(item);
  if (semi || !auto) modes.push(["single", "Single shot"]);
  if (semi && has("doubleTap")) modes.push(["doubleTap", "Double tap (2 rounds: −2 attack, +1 die)"]);
  if (auto && has("burst")) modes.push(["burst", "Burst fire (5 rounds: −4 attack, +2 dice)"]);
  if (auto) modes.push(["autofire", `Autofire (10 rounds: a 10-ft. square, Defense 10; Reflex DC ${AUTOFIRE_REFLEX_DC})`]);
  if (!semi && auto) modes.push(["single", "Single shot"]);
  return modes;
}

/**
 * What a creature's conditions change on its printed rolls (rules/conditions.mjs): from the changes of
 * the effects on it, the token HUD's conditions among them.
 */
export function conditionsOf(actor) {
  const changes = [...(actor.effects ?? [])].filter((e) => e.active ?? !e.disabled).flatMap((e) => e.changes ?? []);
  return creatureConditions(changes, actor.system.abilities, (name) => SKILLS[skillKey(name) ?? ""]?.ability || null);
}

/** A creature's rolls, from its printed bonuses and what its conditions change. */
export function creatureRolls(actor) {
  const s = actor.system;
  const c = conditionsOf(actor);
  return {
    ability: (key, event) => rollD20(actor, R.printed(`${key.toUpperCase()} check`, abilityModifier(s.abilities[key]), c.ability(key)), event),
    save: (key, event) => rollD20(actor, R.printed(`${{ fort: "Fortitude", ref: "Reflex", will: "Will" }[key]} save`, s.saves[key], c.save(key)), event),
    skill: (index, event) => {
      const k = s.skills[index];
      return rollD20(actor, R.printed(`${k.name}${k.specialty ? ` (${k.specialty})` : ""} check`, k.bonus, c.skill(k.name)), event);
    },
    grapple: (event) => rollD20(actor, R.printed("Grapple check (opposed)", s.grapple, c.grapple()), event),
    // An attack from the printed Attack or Full Attack line (rules/attacks.mjs): its choice, its place in that
    // choice, and which of its iterative bonuses.
    attack: (line, choice, index, bonus, event) => {
      const a = readAttacks(s[line])[choice]?.[index];
      if (!a) return null;
      const build = (ticked = {}) => withTerms(attackRoll(a, bonus), [{ label: "Conditions", value: c.attack(a.kind) }, { label: "Fighting defensively", value: ticked.defensively ? -4 : 0 }]);
      return rollD20(actor, build(), event, { attack: { actor: actor.uuid, line, choice, index, touch: a.touch } }, { options: defensiveOption(actor), rebuild: build, before: (ticked) => startDefensively(actor, ticked) });
    },
    damage: (line, choice, index, multiplier = 1) => {
      const printedAttack = readAttacks(s[line])[choice]?.[index];
      if (!printedAttack) return null;
      // A Strength penalty (fatigued) is less Strength in a melee attack's damage, multiplied with it on a critical.
      const fix = printedAttack.damage && printedAttack.kind === "melee" ? c.damage("melee") : 0;
      const a = fix ? { ...printedAttack, damage: `${printedAttack.damage}${fix < 0 ? "-" : "+"}${Math.abs(fix)}` } : printedAttack;
      const spec = damageRoll(a, multiplier);
      if (!spec) return ui.notifications.info(`${a.name}: its damage is not a roll (${a.note || "see the creature's description"}).`);
      // A natural or weapon attack's damage: physical, any energy it adds labelled on its dice ("1d6[fire]").
      return post(actor, spec, { flags: { damage: { nonlethal: spec.nonlethal, type: "" } } });
    },
  };
}

/** The initiative bonus Foundry's combat tracker rolls with: `1d20 + @init`. */
export function initiativeBonus(actor) {
  if (actor.type === "character") return actor.system.derived?.initiative ?? 0;
  // A vehicle: its driver's initiative and its own modifier (Modern/VehicleCombat/GettingStarted); without one, its own.
  if (actor.type === "vehicle") {
    const driver = fromUuidSync(actor.system.occupants.find((o) => o.role === "driver")?.uuid ?? "");
    return (actor.system.initiative ?? 0) + (driver && driver.documentName === "Actor" ? initiativeBonus(driver) : 0);
  }
  return (actor.system.initiative ?? 0) + conditionsOf(actor).initiative();
}

/** A token's spell resistance: a character's worked out (rules/character.mjs), a creature's as printed in its qualities. */
export function spellResistanceOf(actor) {
  if (!actor) return 0;
  if (actor.type === "character") return actor.system.derived?.spellResistance ?? 0;
  return readDefenses(actor.system.specialQualities).spellResistance ?? 0;
}

/** A token's Defense, or its touch Defense: a character's worked out, a creature's as printed. */
function defenseOf(actor, { touch = false } = {}) {
  if (actor?.type === "character") return touch ? actor.system.derived?.defense?.touch : actor.system.derived?.defense?.value;
  // A vehicle's Defense at its speed (rules/vehicles.mjs).
  if (actor?.type === "vehicle") return actor.system.derived?.defense ?? actor.system.defense;
  const printed = touch ? actor?.system.defense?.touch : actor?.system.defense?.value;
  return printed === null || printed === undefined ? printed : printed + conditionsOf(actor).defense();
}

/**
 * Confirm a critical: the attack rolled again with the same modifiers. With
 * one token targeted, the card compares the roll with its Defense.
 */
async function confirmCritical(actor, name, flags) {
  const targets = [...(game.user.targets ?? [])];
  const target = targets.length === 1 ? targets[0] : null;
  const defense = target ? defenseOf(target.actor, { touch: flags.attack.touch }) : null;
  return post(actor, { title: `${name}: confirming the critical`, terms: [], formula: flags.confirm ?? flags.formula }, {
    flags: { attack: flags.attack, confirming: true, critical: flags.critical },
    judge: (roll) => (defense === null || defense === undefined ? {} : { against: { name: target.name, defense, confirmed: roll.total >= defense } }),
  });
}

/**
 * Buttons on an attack's chat card. Bound on renderChatMessageHTML, which
 * since v13 passes an HTMLElement.
 *
 *   an attack with no threat:   Damage
 *   an attack with a threat:    Confirm critical (and nothing else until it is resolved)
 *   the confirmation:           against a targeted token's Defense, Critical damage or Damage;
 *                               without a target, both, for the table to choose
 */
export function bindAttackButtons(message, html) {
  const flags = message.flags?.[SYSTEM_ID];
  if (flags?.damage) return bindDamageButtons(message, html, flags);
  if (flags?.save) return bindSaveButtons(message, html, flags);
  if (flags?.levelCheck) return bindLevelCheck(message, html, flags);
  if (flags?.reputation) return bindReputation(message, html, flags.reputation);
  if (flags?.treatment) return bindTreatment(message, html, flags.treatment);
  if (flags?.vehicleCheck) return bindVehicleCheck(message, html, flags.vehicleCheck);
  if (!flags?.attack) return;
  const actor = fromUuidSync(flags.attack.actor);
  // Only those who can roll for the actor get its buttons: a player cannot roll another's damage.
  if (!actor || !actor.isOwner) return;
  const multiplier = flags.critical?.multiplier ?? 2;
  let name, normal, critical;
  if (flags.attack.item === "grab") {
    // A grab that hits goes on to the opposed grapple check to hold.
    if (flags.hit && !flags.hit.hit) return;
    name = "Grab";
    normal = () => characterRolls(actor).grapple();
  } else if (flags.attack.item === "unarmed") {
    const lethal = !!flags.attack.lethal, streetfighting = !!flags.attack.streetfighting;
    name = "Unarmed strike";
    normal = () => characterRolls(actor).damage("unarmed", { lethal, streetfighting });
    critical = () => characterRolls(actor).damage("unarmed", { lethal, streetfighting, multiplier });
  } else if (actor.type === "vehicle" && flags.attack.crew) {
    // A mounted weapon fired by the GM's crew (module/vehicles.mjs).
    const item = actor.items.get(flags.attack.item);
    if (!item) return;
    name = item.name;
    normal = () => crewDamage(actor, item);
    critical = () => crewDamage(actor, item, multiplier);
  } else if (flags.attack.item) {
    // A character's weapon, or one mounted on the vehicle it was fired from.
    const holder = flags.attack.vehicle ? fromUuidSync(flags.attack.vehicle) : actor;
    const item = holder?.items?.get(flags.attack.item);
    if (!item) return;
    const pointBlank = !!flags.attack.pointBlank, ammoAsk = !!flags.attack.ammoAsk;
    const mode = flags.attack.mode, load = flags.attack.load;
    name = item.name;
    // What the attack ticked (a Holy weapon's evil target) carries to its damage.
    const ticked = flags.attack;
    normal = () => characterRolls(actor).damage(item, { pointBlank, mode, ammoAsk, load, ticked });
    critical = () => characterRolls(actor).damage(item, { multiplier, pointBlank, mode, ammoAsk, load, ticked });
  } else {
    // A creature's printed attack.
    const { line, choice, index } = flags.attack;
    const a = readAttacks(actor.system[line])[choice]?.[index];
    if (!a) return;
    name = a.name;
    normal = () => creatureRolls(actor).damage(line, choice, index);
    critical = () => creatureRolls(actor).damage(line, choice, index, multiplier);
  }

  const buttons = document.createElement("div");
  buttons.className = "m20-card-buttons";
  const add = (label, handler) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", handler);
    buttons.append(b);
  };

  if (flags.hit && !flags.confirming) {
    const verdict = document.createElement("p");
    verdict.className = flags.hit.hit ? "m20-crit" : "m20-hint";
    verdict.textContent = `${flags.hit.hit ? "Hits" : "Misses"} ${flags.hit.name} (${flags.hit.touch ? "touch " : ""}Defense ${flags.hit.defense}).`;
    buttons.append(verdict);
  }
  if (flags.confirming && flags.against) {
    const verdict = document.createElement("p");
    verdict.className = flags.against.confirmed ? "m20-crit" : "m20-hint";
    verdict.textContent = flags.against.confirmed
      ? `Confirmed against ${flags.against.name} (Defense ${flags.against.defense}).`
      : `Not confirmed against ${flags.against.name} (Defense ${flags.against.defense}): a normal hit.`;
    buttons.append(verdict);
  }
  const handlers = { damage: normal, critical, confirm: () => confirmCritical(actor, name, flags) };
  if (flags.attack.item === "grab") add("Grapple check to hold", normal);
  else for (const b of R.cardButtons(flags)) add(b.label, handlers[b.kind]);
  (html.querySelector(".message-content") ?? html).append(buttons);
}

/** A Wealth check against `dc`, asked and posted like any d20 roll; returns the Roll, or null if cancelled. */
export function wealthCheck(actor, dc, title, event) {
  const wealth = actor.system.wealth.value ?? 0;
  return rollD20(actor, R.d20(`${title} (purchase DC ${dc})`, [{ label: "Wealth bonus", value: wealth }]), event);
}

/**
 * A Reputation check's card: recognized or not and, recognized, buttons to mark the hero famous or infamous to
 * them for the encounter (rules/conditions.mjs RECOGNIZED), for whoever can change the hero.
 */
function bindReputation(message, html, { actor: uuid, recognized, by }) {
  const actor = fromUuidSync(uuid);
  const box = document.createElement("div");
  box.className = "m20-card-buttons";
  const verdict = document.createElement("p");
  verdict.className = recognized ? "m20-crit" : "m20-hint";
  verdict.textContent = recognized ? `${by || "They"} recognize${by ? "s" : ""} ${actor?.name ?? "the hero"}: +4 (famous to them) or −4 (infamous) on Bluff, Diplomacy, Gather Information, Intimidate and Perform with them, this encounter.` : `${by || "They"} do${by ? "es" : ""} not recognize ${actor?.name ?? "the hero"}.`;
  box.append(verdict);
  if (recognized && actor?.isOwner) {
    for (const [id, label] of [["famous", "Famous to them (+4)"], ["infamous", "Infamous to them (−4)"]]) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", async () => {
        for (const other of ["famous", "infamous"]) if (other !== id && actor.statuses.has(other)) await actor.toggleStatusEffect(other, { active: false });
        if (!actor.statuses.has(id)) await actor.toggleStatusEffect(id, { active: true });
      });
      box.append(b);
    }
  }
  (html.querySelector(".message-content") ?? html).append(box);
}
