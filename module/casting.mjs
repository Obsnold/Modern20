/**
 * Casting from a character's sheet: a spell cast from a prepared one or a slot, a
 * power manifested for its points, an incantation's skill checks, and a new day's
 * spells and power points. The numbers are rules/casting.mjs; this spends what a
 * cast costs, and posts a card with the DC and a caster (or manifester) level check
 * for spell or power resistance.
 */
import * as C from "./rules/casting.mjs";
import { characterRolls, post, notesOf, resolverFor, spellResistanceOf } from "./roll.mjs";
import { notesFor, rollTargets } from "./rules/rolls.mjs";
import { SYSTEM_ID } from "./config.mjs";
import { skillKey } from "./data/skills.mjs";
const escape = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const ABILITY_NAMES = { str: "Str", dex: "Dex", con: "Con", int: "Int", wis: "Wis", cha: "Cha" };

/** The caster a spell or power is cast as, and its level for that caster; warns and returns null if none. */
function caster(actor, item) {
  const found = C.casterFor(item, actor.system.derived?.casters ?? []);
  if (!found) ui.notifications.warn(`${item.name} is not on the spell or power list of any of ${actor.name}'s classes.`);
  return found;
}

/** The chat card for a spell or power: its level, DC, range, duration and text, with a level check button. */
async function card(actor, item, found, how) {
  const s = item.system;
  const c = C.castingOf(item, found.caster, found.level, actor.system.derived.scores);
  const resist = item.type === "power" ? s.powerResistance : s.spellResistance;
  const rows = [
    ["Level", `${found.caster.name} ${found.level}`],
    c.hasSave ? ["Saving throw", `${s.savingThrow} (DC ${c.dc})`] : null,
    ["Range", s.range], [s.target?.label || "Target", s.target?.value], ["Duration", s.duration],
    [item.type === "power" ? "Power resistance" : "Spell resistance", resist],
  ].filter((r) => r && r[1]);
  const description = await foundry.applications.ux.TextEditor.implementation.enrichHTML(s.description, { relativeTo: item });
  const content = `<div class="m20-roll m20-cast"><h3>${escape(item.name)}</h3><p class="m20-hint">${escape(how)}</p>
    <dl>${rows.map(([k, v]) => `<dt>${escape(k)}</dt><dd>${escape(v)}</dd>`).join("")}</dl>
    <details><summary>Description</summary>${description}</details></div>`;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), content,
    flags: { [SYSTEM_ID]: { levelCheck: { actor: actor.uuid, bonus: found.caster.casterLevel, label: item.type === "power" ? "Manifester level check" : "Caster level check" } } },
  });
  if (!c.meets) ui.notifications.warn(`${actor.name} needs ${ABILITY_NAMES[c.ability] ?? c.ability} ${c.needs} to ${item.type === "power" ? "manifest" : "cast"} a level ${found.level} ${item.type}.`);
}

/** Cast a spell: a prepared caster uses one it prepared, a spontaneous one a slot of its level or higher. */
export async function castSpell(actor, item) {
  const found = caster(actor, item);
  if (!found) return;
  const c = found.caster;
  if (c.prepared) {
    if ((item.system.cast ?? 0) >= (item.system.prepared ?? 0)) return ui.notifications.warn(`${item.name} is not prepared${item.system.prepared ? " any more today" : ""}. Prepare it on the Magic tab.`);
    await item.update({ "system.cast": (item.system.cast ?? 0) + 1 });
    return card(actor, item, found, `Cast from a prepared spell (${item.system.prepared - item.system.cast} left)`);
  }
  const used = usedSlots(actor, c.name);
  const slot = C.slotFor(c, found.level, used);
  if (slot === null) return ui.notifications.warn(`${actor.name} has no ${c.name} spell slots of level ${found.level} or higher left today.`);
  await setSlot(actor, c.name, slot, (used[slot] ?? 0) + 1);
  return card(actor, item, found, `Cast with a level ${slot} slot`);
}

/** Manifest a power: its points, or a free 0-level manifestation. */
export async function manifest(actor, item) {
  const found = caster(actor, item);
  if (!found) return;
  const pp = actor.system.powerPoints;
  const c = C.castingOf(item, found.caster, found.level, actor.system.derived.scores);
  const free = (actor.system.derived?.casters ?? []).reduce((n, x) => Math.max(n, x.freeManifestations), 0);
  const pay = C.payFor(c.cost, found.level, { points: pp.value, freeUsed: pp.freeUsed, freeManifestations: free });
  if (!pay) return ui.notifications.warn(`${actor.name} has ${pp.value} power points; ${item.name} costs ${found.level === 0 ? 1 : c.cost}.`);
  await actor.update(pay.free ? { "system.powerPoints.freeUsed": pp.freeUsed + 1 } : { "system.powerPoints.value": pp.value - pay.points });
  return card(actor, item, found, pay.free ? `Manifested free (${free - pp.freeUsed - 1} free 0-level left today)` : `Manifested for ${pay.points} power point${pay.points === 1 ? "" : "s"} (${pp.value - pay.points} left)`);
}

/** Slots used today by a class, as `{ level: used }`. */
function usedSlots(actor, className) {
  return Object.fromEntries(actor.system.slotsUsed.filter((s) => s.class === className).map((s) => [s.level, s.used]));
}

async function setSlot(actor, className, level, used) {
  const list = actor.system.toObject().slotsUsed.filter((s) => !(s.class === className && s.level === level));
  if (used > 0) list.push({ class: className, level, used });
  await actor.update({ "system.slotsUsed": list });
}

/** Change a spontaneous caster's slots used by hand (the sheet's − and + buttons). */
export async function adjustSlot(actor, className, level, delta) {
  const used = usedSlots(actor, className)[level] ?? 0;
  const max = actor.system.derived?.casters?.find((c) => c.name === className)?.perDay?.[level] ?? 0;
  await setSlot(actor, className, level, Math.max(0, Math.min(max, used + delta)));
}

/**
 * A new day: every slot and prepared spell back, power points to full, free 0-level
 * manifestations reset. Preparations stay as they were, to be changed on the sheet.
 */
export async function newDay(actor) {
  const max = (actor.system.derived?.casters ?? []).reduce((n, c) => n + c.powerPoints, 0);
  await actor.update({ "system.slotsUsed": [], "system.powerPoints.value": max, "system.powerPoints.freeUsed": 0 });
  const spells = actor.items.filter((i) => i.type === "spell" && i.system.cast).map((i) => ({ _id: i.id, "system.cast": 0 }));
  if (spells.length) await actor.updateEmbeddedDocuments("Item", spells);
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="m20-roll"><p>${escape(actor.name)} regains spells${max ? ` and ${max} power points` : ""} for a new day.</p></div>` });
}

/**
 * One skill check of an incantation: the `index`th check its Skill Check line names. A
 * success adds to that check's count; a failure counts toward the failures in a row its
 * Failure line allows (two, as the incantations print it).
 */
export async function incantationCheck(actor, item, index, event) {
  const checks = item.system.skillCheck.checks;
  const check = checks[index];
  if (!check) return;
  // A check printed without a DC ("and Knowledge (earth and life sciences), 1 success") shares the one before.
  const dc = check.dc ?? checks.slice(0, index).reverse().find((c) => c.dc !== null)?.dc ?? 0;
  const [, skill, specialty] = check.skill.match(/^(.+?)(?: \((.+)\))?$/) ?? [];
  const key = skillKey(skill ?? check.skill);
  if (!key) return ui.notifications.warn(`${item.name}: "${check.skill}" is not a skill.`);
  if (!actor.system.derived.skills.some((r) => r.key === key && r.specialty === (specialty ?? ""))) {
    return ui.notifications.warn(`${actor.name} has no ${check.skill} skill yet: add the specialty on the Skills tab.`);
  }
  const roll = await characterRolls(actor).skill(key, specialty ?? "", event);
  if (!roll) return;
  const successes = checks.map((_, i) => item.system.progress.successes[i] ?? 0);
  let failures = item.system.progress.failures;
  if (roll.total >= dc) { successes[index] += 1; failures = 0; } else failures += 1;
  await item.update({ "system.progress.successes": successes, "system.progress.failures": failures });
  const done = checks.every((c, i) => successes[i] >= c.successes);
  const failed = failures >= 2 && /two consecutive/i.test(item.system.failure.value);
  const status = done ? "Complete: the incantation takes effect."
    : failed ? `Failed: ${item.system.failure.text || item.system.failure.value}`
    : `${check.skill}: ${successes[index]} of ${check.successes} (DC ${dc}).${failures ? ` ${failures} failure${failures === 1 ? "" : "s"} in a row.` : ""}`;
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="m20-roll"><h3>${escape(item.name)}</h3><p class="${failed ? "m20-warning" : done ? "m20-crit" : ""}">${escape(status)}</p></div>` });
}

/** The level check button on a spell or power card: 1d20 + caster level, against spell or power resistance. */
export function bindLevelCheck(message, html, flags) {
  const { actor: uuid, bonus, label } = flags.levelCheck;
  const actor = fromUuidSync(uuid);
  if (!actor?.isOwner) return;
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = `${label} (+${bonus})`;
  // A level check is made to beat spell or power resistance, so what adds to that (Spell Penetration) is added.
  b.addEventListener("click", () => {
    const { ticks } = actor.type === "character" ? notesFor(notesOf(actor), rollTargets.casterLevel(), resolverFor(actor)) : { ticks: [] };
    const terms = [{ label: "Level", value: bonus }, ...ticks.map((t) => ({ label: t.term, value: t.value }))];
    // With one token targeted that has spell resistance, the card says whether the check overcomes it.
    const targets = [...(game.user.targets ?? [])];
    const target = targets.length === 1 ? targets[0] : null;
    const sr = target ? spellResistanceOf(target.actor) : 0;
    const judge = sr ? (roll) => ({ verdict: roll.total >= sr ? { good: true, text: `Overcomes ${target.name}'s spell resistance ${sr}.` } : { good: false, text: `Fails against ${target.name}'s spell resistance ${sr}: no effect on it.` } }) : undefined;
    post(actor, { title: label, terms, formula: ["1d20", ...terms.map((t) => (t.value < 0 ? `- ${-t.value}` : `+ ${t.value}`))].join(" ") }, { judge });
  });
  const div = document.createElement("div");
  div.className = "m20-card-buttons";
  div.append(b);
  (html.querySelector(".message-content") ?? html).append(div);
}
