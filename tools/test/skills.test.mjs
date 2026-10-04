import { test } from "node:test";
import assert from "node:assert/strict";
import { listPages, readPage } from "../srd/reader.mjs";
import { SKILLS, skillKey } from "../../module/data/skills.mjs";
import { classSkillSections } from "../build/classes.mjs";
import { buildClasses } from "../build/classes.mjs";
import { buildOccupations } from "../build/occupations.mjs";

test("every skill matches its skill page: key ability, trained only, armor penalty", () => {
  const pages = listPages().filter((p) => /^Modern\/Skills\/[A-Z]/.test(p));
  let n = 0;
  for (const p of pages) {
    const top = readPage(p).root.children.find((s) => s.depth === 1);
    const st = top.stats;
    if (!st["Key Ability"]) continue;
    const s = SKILLS[skillKey(top.title)];
    assert.ok(s, `no skill for ${top.title}`);
    assert.equal(s.ability, st["Key Ability"].value === "None" ? "" : st["Key Ability"].value.toLowerCase(), top.title);
    assert.equal(s.trainedOnly, st["Trained Only"].value === "Yes", `${top.title} trained only`);
    assert.equal(s.armorPenalty, st["Armor Penalty"].value === "Yes", `${top.title} armor penalty`);
    n++;
  }
  assert.equal(n, Object.values(SKILLS).filter((s) => !s.fx).length);
});

test("the FX skills match the classes that print them", () => {
  for (const [name, ability] of Object.entries(classSkillSections())) {
    assert.equal(SKILLS[skillKey(name.replace(/ \(.*\)$/, ""))]?.ability, ability.toLowerCase(), name);
  }
});

test("every skill a class or occupation names is a skill", () => {
  const named = [...buildClasses().documents, ...buildOccupations().documents].filter((d) => d.system)
    .flatMap((d) => [...(d.system.classSkills ?? []), ...(d.system.skills?.options ?? [])]);
  for (const s of named) assert.ok(skillKey(s.name), s.name);
});
