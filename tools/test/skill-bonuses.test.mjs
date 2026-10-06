import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { FEAT_RULES, rulesFor } from "../../module/rules/feats.mjs";
import { slug } from "../../module/rules/identify.mjs";
import { skillKey } from "../../module/data/skills.mjs";
import { deriveCharacter } from "../../module/rules/character.mjs";
import { situationalBonuses } from "../../module/rules/rolls.mjs";
import { requirementMet, classRequirements } from "../../module/rules/requirements.mjs";

const strip = (h) => (h ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const classes = Object.fromEntries(PACKS.classes().documents.filter((d) => d.system).map((d) => [d.name, d]));
const feats = Object.fromEntries(PACKS.feats().documents.filter((d) => d.system).map((d) => [d.name, d]));
const talents = Object.fromEntries(PACKS.talents().documents.filter((d) => d.system).map((d) => [d.name, d]));

test("every feat of '+N bonus on all X checks and Y checks' gives those bonuses, on skills that exist", () => {
  for (const f of Object.values(feats)) {
    const m = strip(f.system.benefit).match(/\+(\d+) bonus on all ([A-Z][\w /()-]+?) checks and ([A-Z][\w /()-]+?) checks/);
    if (!m) continue;
    const rules = rulesFor(slug(f.name)).skillBonuses ?? {};
    assert.deepEqual(rules, { [m[2]]: Number(m[1]), [m[3]]: Number(m[1]) }, f.name);
  }
  for (const [id, r] of Object.entries(FEAT_RULES)) {
    for (const name of Object.keys(r.skillBonuses ?? {})) assert.ok(skillKey(name.replace(/\s*\(.*\)$/, "")), `${id}: "${name}" is not a skill`);
  }
});

// Endeavour James: Charismatic Hero 3 / Telepath 6.
const jd = () => {
  const abilities = Object.fromEntries(Object.entries({ str: 12, dex: 17, con: 10, int: 14, wis: 5, cha: 18 }).map(([a, v]) => [a, { value: v }]));
  const items = [
    { type: "class", name: "Charismatic Hero", system: { ...classes["Charismatic Hero"].system, level: 3 } },
    { type: "class", name: "Telepath", system: { ...classes.Telepath.system, level: 6 } },
    ...["Confident", "Deceptive", "Iron Will"].map((n) => ({ type: "feat", name: n, system: feats[n].system })),
    ...["Fast-Talk", "Dazzle"].map((n) => ({ type: "talent", name: n, system: talents[n].system })),
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
  const rules = items.filter((i) => i.type !== "class").map((i) => rulesFor(slug(i.name)));
  assert.deepEqual(situationalBonuses(row("bluff"), rules, { "Charismatic Hero": 3 }).map((b) => [b.term, b.value]), [["Fast-Talk", 3]]);
  assert.deepEqual(situationalBonuses(row("intimidate"), rules, { "Charismatic Hero": 3 }), []);
});

test("Savant adds the Smart level to the skill chosen; Improved Grapple +4 on grapple checks", () => {
  const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: 10 }]));
  const d = deriveCharacter({ abilities }, [
    { type: "class", name: "Smart Hero", system: { ...classes["Smart Hero"].system, level: 3 } },
    { type: "talent", name: "Savant", system: { ...talents.Savant.system, choice: "Research" } },
    { type: "feat", name: "Improved Grapple", system: feats["Improved Grapple"].system },
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
