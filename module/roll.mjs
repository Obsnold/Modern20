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

export const SYSTEM_ID = "modern20";
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
async function ask(actor, spec, event, options = []) {
  const wanted = game.settings.get(SYSTEM_ID, "askBeforeRolling") !== !!event?.shiftKey;
  if (!wanted) return {};
  const ap = actor.type === "character" ? actor.system.actionPoints.value : 0;
  const die = R.actionPointDie(actor.system.derived?.level ?? 1);
  const content = `
    <div class="form-group"><label>Situational modifier</label><input type="number" name="modifier" value="0" autofocus></div>
    ${options.map((o) => `<div class="form-group"><label>${escape(o.label)}</label><input type="checkbox" name="${o.name}"></div>`).join("")}
    ${ap > 0 ? `<div class="form-group"><label>Spend an action point (${escape(die.label.replace(/^Action point /, ""))}; ${ap} left)</label><input type="checkbox" name="actionPoint"></div>` : ""}`;
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: spec.title },
    content,
    ok: { label: "Roll", callback: (ev, button) => ({
      modifier: button.form.elements.modifier.valueAsNumber || 0,
      actionPoint: !!button.form.elements.actionPoint?.checked,
      ...Object.fromEntries(options.map((o) => [o.name, !!button.form.elements[o.name]?.checked])),
    }) },
    rejectClose: false,
  });
  if (!result) return null;
  return { ...result, actionPoint: result.actionPoint ? die : null };
}

/**
 * Post a roll to chat as `actor`; returns the Roll. `flags` are kept on the
 * message for its buttons (an attack's weapon and critical).
 */
export async function post(actor, spec, { flags = {} } = {}) {
  if (!spec) return null;
  if (spec.unusable) { ui.notifications.warn(`${spec.title}: ${spec.unusable}`); return null; }
  const Roll = foundry.dice?.Roll ?? globalThis.Roll;
  const roll = await new Roll(spec.formula).evaluate();
  const lines = spec.terms.map((t) => `<li>${escape(t.label)} <strong>${escape(signed(t.value))}</strong></li>`).join("");
  let note = "", threat = false;
  if (spec.critical && spec.formula.startsWith("1d20")) {
    threat = (roll.dice[0]?.total ?? 0) >= spec.critical.threat;
    if (threat) note = `<p class="m20-crit">Critical threat (×${spec.critical.multiplier}).</p>`;
  } else if (spec.critical) {
    note = `<p class="m20-hint">On a confirmed critical: ×${spec.critical.multiplier}.</p>`;
  }
  const flavor = `<div class="m20-roll"><h3>${escape(spec.title)}</h3>${lines ? `<ul>${lines}</ul>` : ""}${note}</div>`;
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor, flags: { [SYSTEM_ID]: { ...flags, threat, critical: spec.critical, formula: spec.formula } } });
  return roll;
}

/**
 * Ask, spend the action point if one was chosen, and post. `rebuild` makes the
 * roll again from what was ticked (an attack with Point Blank Shot).
 */
async function rollD20(actor, spec, event, flags, { options = [], rebuild } = {}) {
  if (!spec || spec.unusable) return post(actor, spec);
  const added = await ask(actor, spec, event, options);
  if (!added) return null;
  if (added.actionPoint) {
    const left = actor.system.actionPoints.value;
    if (left < 1) { ui.notifications.warn(`${actor.name} has no action points left.`); return null; }
    await actor.update({ "system.actionPoints.value": left - 1 });
  }
  // A critical is confirmed with the attack's own modifiers, the situational one included, but not an
  // action point's die: a point spent on a roll applies to that roll alone.
  const ticked = Object.fromEntries(options.map((o) => [o.name, !!added[o.name]]));
  if (rebuild) spec = rebuild(ticked);
  const confirm = flags?.attack ? R.withAdditions(spec, { modifier: added.modifier }).formula : undefined;
  return post(actor, R.withAdditions(spec, added), { flags: flags ? { ...flags, confirm, attack: { ...flags.attack, ...ticked } } : {} });
}

/** Every roll a character's sheet offers, by name. Pass the click event so shift works. */
export function characterRolls(actor) {
  const d = actor.system.derived;
  const feats = actor.items.filter((i) => i.type === "feat" || i.type === "talent").map((i) => ({ name: i.name, choice: i.system.choice ?? "" }));
  return {
    ability: (key, event) => rollD20(actor, R.abilityCheck(d, key), event),
    save: (key, event) => rollD20(actor, R.savingThrow(d, key), event),
    skill: (key, specialty, event) => rollD20(actor, R.skillCheck(d, d.skills.find((s) => s.key === key && s.specialty === (specialty ?? ""))), event),
    attack: (item, event) => {
      // Point Blank Shot is the player's call: the SRD's "within 30 feet" is not something the sheet can see.
      const options = !item.system.melee && feats.some((f) => f.name === "Point Blank Shot") ? [{ name: "pointBlank", label: "Within 30 feet (Point Blank Shot: +1 attack and damage)" }] : [];
      return rollD20(actor, R.attack(d, item, feats), event, { attack: { actor: actor.uuid, item: item.id } }, { options, rebuild: (ticked) => R.attack(d, item, feats, ticked) });
    },
    damage: (item, { multiplier = 1, pointBlank = false } = {}) => {
      const spec = R.damage(d, item, { pointBlank });
      if (!spec) return ui.notifications.info(`${item.name}: its damage is not a roll (${item.system.damage.value || "see its description"}).`);
      return post(actor, multiplier > 1 ? R.criticalDamage(spec, multiplier) : spec);
    },
  };
}

/** A creature's rolls, from its printed bonuses. */
export function creatureRolls(actor) {
  const s = actor.system;
  return {
    ability: (key, event) => rollD20(actor, R.printed(`${key.toUpperCase()} check`, abilityModifier(s.abilities[key])), event),
    save: (key, event) => rollD20(actor, R.printed(`${{ fort: "Fortitude", ref: "Reflex", will: "Will" }[key]} save`, s.saves[key]), event),
    skill: (index, event) => {
      const k = s.skills[index];
      return rollD20(actor, R.printed(`${k.name}${k.specialty ? ` (${k.specialty})` : ""} check`, k.bonus), event);
    },
  };
}

/** The initiative bonus Foundry's combat tracker rolls with: `1d20 + @init`. */
export function initiativeBonus(actor) {
  if (actor.type === "character") return actor.system.derived?.initiative ?? 0;
  return actor.system.initiative ?? 0;
}

/**
 * Buttons on an attack's chat card: Damage always; on a threat, Confirm
 * (the same attack again) and Critical damage. Bound on renderChatMessageHTML,
 * which since v13 passes an HTMLElement.
 */
export function bindAttackButtons(message, html) {
  const flags = message.getFlag(SYSTEM_ID, "attack") && message.flags[SYSTEM_ID];
  if (!flags) return;
  const actor = fromUuidSync(flags.attack.actor);
  const item = actor?.items?.get(flags.attack.item);
  if (!actor || !item) return;
  const buttons = document.createElement("div");
  buttons.className = "m20-card-buttons";
  const add = (label, handler) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", handler);
    buttons.append(b);
  };
  const pointBlank = !!flags.attack.pointBlank;
  add("Damage", () => characterRolls(actor).damage(item, { pointBlank }));
  if (flags.threat && flags.critical) {
    add("Confirm critical", () => post(actor, { title: `${item.name}: confirming the critical`, terms: [], formula: flags.confirm ?? flags.formula }));
    add(`Critical damage (×${flags.critical.multiplier})`, () => characterRolls(actor).damage(item, { multiplier: flags.critical.multiplier, pointBlank }));
  }
  (html.querySelector(".message-content") ?? html).append(buttons);
}
