/**
 * Rolling: a roll from rules/rolls.mjs, made in Foundry and posted to chat
 * with its breakdown.
 */
import { abilityModifier } from "./data/models.mjs";
import * as R from "./rules/rolls.mjs";

const signed = (n) => (typeof n === "number" ? (n >= 0 ? `+${n}` : `${n}`) : n);

/** Post a roll to chat as `actor`; returns the Roll. */
export async function post(actor, spec) {
  if (!spec) return null;
  if (spec.unusable) { ui.notifications.warn(`${spec.title}: ${spec.unusable}`); return null; }
  const Roll = foundry.dice?.Roll ?? globalThis.Roll;
  const roll = await new Roll(spec.formula).evaluate();
  const lines = spec.terms.map((t) => `<li>${foundry.utils.escapeHTML(t.label)} <strong>${signed(t.value)}</strong></li>`).join("");
  let note = "";
  if (spec.critical && spec.formula.startsWith("1d20")) {
    const natural = roll.dice[0]?.total;
    if (natural >= spec.critical.threat) note = `<p class="m20-crit">Critical threat (×${spec.critical.multiplier}): roll again to confirm.</p>`;
  } else if (spec.critical) {
    note = `<p class="m20-hint">On a confirmed critical: ×${spec.critical.multiplier}.</p>`;
  }
  const flavor = `<div class="m20-roll"><h3>${foundry.utils.escapeHTML(spec.title)}</h3>${lines ? `<ul>${lines}</ul>` : ""}${note}</div>`;
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor });
  return roll;
}

/** Every roll a character's sheet offers, by name. */
export function characterRolls(actor) {
  const d = actor.system.derived;
  const feats = actor.items.filter((i) => i.type === "feat").map((i) => i.name);
  return {
    ability: (key) => post(actor, R.abilityCheck(d, key)),
    save: (key) => post(actor, R.savingThrow(d, key)),
    skill: (key, specialty) => post(actor, R.skillCheck(d, d.skills.find((s) => s.key === key && s.specialty === (specialty ?? "")))),
    attack: (item) => post(actor, R.attack(d, item, feats)),
    damage: (item) => {
      const spec = R.damage(d, item);
      if (!spec) return ui.notifications.info(`${item.name}: its damage is not a roll (${item.system.damage.value || "see its description"}).`);
      return post(actor, spec);
    },
  };
}

/** A creature's rolls, from its printed bonuses. */
export function creatureRolls(actor) {
  const s = actor.system;
  return {
    ability: (key) => post(actor, R.printed(`${key.toUpperCase()} check`, abilityModifier(s.abilities[key]))),
    save: (key) => post(actor, R.printed(`${{ fort: "Fortitude", ref: "Reflex", will: "Will" }[key]} save`, s.saves[key])),
    skill: (index) => {
      const k = s.skills[index];
      return post(actor, R.printed(`${k.name}${k.specialty ? ` (${k.specialty})` : ""} check`, k.bonus));
    },
  };
}

/** The initiative bonus Foundry's combat tracker rolls with: `1d20 + @init`. */
export function initiativeBonus(actor) {
  if (actor.type === "character") return actor.system.derived?.initiative ?? 0;
  return actor.system.initiative ?? 0;
}
