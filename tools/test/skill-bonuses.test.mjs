import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { slug } from "../../module/rules/identify.mjs";
import { SKILLS, skillKey } from "../../module/data/skills.mjs";
import { deriveCharacter } from "../../module/rules/character.mjs";
import { notesFor, rollTargets } from "../../module/rules/rolls.mjs";
import { resolveValue, mechanicsContext } from "../../module/rules/effects.mjs";
import { EFFECTS, NOTES } from "../build/mechanics.mjs";
import { requirementMet, classRequirements } from "../../module/rules/requirements.mjs";

const strip = (h) => (h ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const classes = Object.fromEntries(PACKS.classes().documents.filter((d) => d.system).map((d) => [d.name, d]));
const feats = Object.fromEntries(PACKS.feats().documents.filter((d) => d.system).map((d) => [d.name, d]));
const talents = Object.fromEntries(PACKS.talents().documents.filter((d) => d.system).map((d) => [d.name, d]));

test("every feat of '+N bonus on all X checks and Y checks' gives those bonuses, on skills that exist", () => {
  for (const f of Object.values(feats)) {
    const m = strip(f.system.benefit).match(/\+(\d+) bonus on all ([A-Z][\w /()-]+?) checks and ([A-Z][\w /()-]+?) checks/);
    if (!m) continue;
    const key = (name) => `skills.${skillKey(name.replace(/\s*\(.*\)$/, ""))}${/\((.+)\)/.test(name) ? `:${name.match(/\((.+)\)/)[1].toLowerCase()}` : ""}`;
    assert.deepEqual(EFFECTS[`feat:${slug(f.name)}`], [[key(m[2]), Number(m[1])], [key(m[3]), Number(m[1])]], f.name);
  }
  for (const [id, changes] of Object.entries(EFFECTS)) for (const [k] of changes) {
    const skill = k.match(/^skills\.(\w+)/)?.[1];
    if (skill) assert.ok(SKILLS[skill], `${id}: ${k}`);
  }
});

// Endeavour James: Charismatic Hero 3 / Telepath 6.
const jd = () => {
  const abilities = Object.fromEntries(Object.entries({ str: 12, dex: 17, con: 10, int: 14, wis: 5, cha: 18 }).map(([a, v]) => [a, { value: v }]));
  // Each feat and talent with its effects and notes, as a character owns them.
  const own = (type, d) => ({ type, name: d.name, system: d.system, effects: d.effects });
  const items = [
    { type: "class", name: "Charismatic Hero", system: { ...classes["Charismatic Hero"].system, level: 3 } },
    { type: "class", name: "Telepath", system: { ...classes.Telepath.system, level: 6 } },
    ...["Confident", "Deceptive", "Iron Will"].map((n) => own("feat", feats[n])),
    ...["Fast-Talk", "Dazzle"].map((n) => own("talent", talents[n])),
  ];
  const skills = { bluff: { ranks: 10 }, diplomacy: { ranks: 6 }, gatherInformation: { ranks: 1 }, intimidate: { ranks: 10 }, disguise: { ranks: 8 } };
  return { items, d: deriveCharacter({ abilities, skills }, items) };
};

test("skill feats on a character, and a situational talent offered when rolling", () => {
  const { items, d } = jd();
  const row = (k) => d.skills.find((r) => r.key === k && !r.specialty);
  assert.equal(row("bluff").total, 16);       // 10 ranks, Cha +4, Deceptive +2
  assert.equal(row("intimidate").total, 16);  // 10 ranks, Cha +4, Confident +2
  assert.equal(row("disguise").total, 14);
  // Fast-Talk's note: on Bluff, its value the Charismatic level; not on Intimidate.
  const notes = items.flatMap((i) => i.system.notes ?? []);
  const context = mechanicsContext(items.filter((i) => i.type === "class"), d.level, d.modifiers);
  const on = (r) => notesFor(notes, rollTargets.skill(r), (v) => resolveValue(v, context)).ticks.map((t) => [t.term, t.value]);
  assert.deepEqual(on(row("bluff")), [["Fast-Talk", 3]]);
  assert.deepEqual(on(row("intimidate")), []);
});

test("Savant adds the Smart level to the skill chosen; Improved Grapple +4 on grapple checks", () => {
  const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: 10 }]));
  const d = deriveCharacter({ abilities }, [
    { type: "class", name: "Smart Hero", system: { ...classes["Smart Hero"].system, level: 3 } },
    { type: "talent", name: "Savant", system: { ...talents.Savant.system, choice: "Research" } },
    { type: "feat", name: "Improved Grapple", system: feats["Improved Grapple"].system, effects: feats["Improved Grapple"].effects },
  ]);
  assert.equal(d.skills.find((r) => r.key === "research").total, 3);
  assert.equal(d.grapple, d.baseAttackBonus + 4);
});

test("Telepath's requirements: Endeavour James lacks Gather Information 6 ranks and Wild Talent", () => {
  const { items, d } = jd();
  const has = { d, feats: items.filter((i) => i.type === "feat"), talents: items.filter((i) => i.type === "talent"), occupation: null };
  const rows = classRequirements(classes.Telepath, has);
  assert.deepEqual(rows.map((r) => [r.label, r.met, r.missing]), [
    ["Skills", false, ["Gather Information 6 ranks"]],
    ["Feats", false, ["Wild Talent"]],
  ]);
  const fixed = deriveCharacter({ abilities: { cha: { value: 18 } }, skills: { bluff: { ranks: 6 }, diplomacy: { ranks: 6 }, gatherInformation: { ranks: 6 } } }, []);
  assert.equal(classRequirements(classes.Telepath, { ...has, d: fixed, feats: [{ name: "Wild Talent" }] }).every((r) => r.met), true);
});

test("every class requirement is read, but for allegiances and holy symbols", () => {
  const none = { d: { baseAttackBonus: 0, baseSaves: { ref: 0 }, skills: [], casters: [] }, feats: [], talents: [], occupation: null };
  const unread = Object.values(classes).flatMap((c) => c.system.requirements.filter((r) => requirementMet(r, none).met === null).map((r) => `${c.name}: ${r.label}`));
  assert.deepEqual(unread.sort(), ["Acolyte: Allegiance", "Acolyte: Holy Symbol", "Ambassador: Allegiance", "Holy/Unholy Knight: Other", "Mystic: Allegiance", "Street Warrior: Other"]);
  // Nothing is met by a character with nothing.
  const met = Object.values(classes).flatMap((c) => c.system.requirements.filter((r) => requirementMet(r, none).met === true).map((r) => `${c.name}: ${r.label}`));
  assert.deepEqual(met, []);
});

test("formulas in effects and notes: Robust's Tough level, worked out", () => {
  assert.equal(resolveValue("@classes.tough-hero.level", { classes: { "tough-hero": { level: 4 } } }), 4);
  assert.equal(resolveValue("floor(@level / 2) + 1", { level: 7 }), 4);
  assert.equal(resolveValue("@missing", {}), 0);
  assert.equal(resolveValue("alert(1)", {}), 0);
  const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: 10 }]));
  const robust = talents.Robust;
  const base = deriveCharacter({ abilities }, [{ type: "class", name: "Tough Hero", system: { ...classes["Tough Hero"].system, level: 4 } }]);
  const tough = deriveCharacter({ abilities }, [{ type: "class", name: "Tough Hero", system: { ...classes["Tough Hero"].system, level: 4 } }, { type: "talent", name: "Robust", system: robust.system, effects: robust.effects }]);
  assert.equal(tough.hitPoints.max - base.hitPoints.max, 4);
});

test("species: always-on bonuses as effects, situational ones as notes", () => {
  const species = Object.fromEntries(PACKS.species().documents.filter((d) => d.system).map((d) => [d.name, d]));
  const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: 10 }]));
  const elf = deriveCharacter({ abilities }, [{ type: "species", name: "Elf", system: species.Elf.system, effects: species.Elf.effects }]);
  assert.equal(elf.skills.find((r) => r.key === "spot").total, 2);
  const dwarf = species.Dwarf.system.notes;
  assert.ok(notesFor(dwarf, rollTargets.save("fort")).ticks.some((t) => /poison/.test(t.label)));
  assert.ok(notesFor(dwarf, ["defense"]).texts.some((t) => /giants/.test(t)));
  // Every note is for rolls the system makes, or Defense.
  const known = /^(check|ability(\.\w+)?|skill(\.\w+)?|save(\.(fort|ref|will))?|attack(\.(melee|ranged|unarmed))?|grapple|casterLevel|defense)$/;
  for (const [id, list] of Object.entries(NOTES)) for (const n of list) for (const r of n.rolls) assert.match(r, known, id);
});
