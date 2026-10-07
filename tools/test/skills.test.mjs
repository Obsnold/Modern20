import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { listPages, readPage } from "../srd/reader.mjs";
import { SKILLS, skillKey, LANGUAGES } from "../../module/data/skills.mjs";
import { classSkillSections } from "../build/classes.mjs";
import { buildClasses } from "../build/classes.mjs";
import { buildOccupations } from "../build/occupations.mjs";
import { buildCreatures } from "../build/creatures.mjs";

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

test("every specialty a class, occupation or creature names is one the skill lists", () => {
  const docs = [...buildClasses().documents, ...buildOccupations().documents, ...buildCreatures().documents].filter((d) => d.system);
  const unknown = new Set();
  for (const d of docs) {
    for (const s of [...(d.system.classSkills ?? []), ...(d.system.skills?.options ?? []), ...(d._key.startsWith("!actors!") ? d.system.skills : [])]) {
      const def = SKILLS[skillKey(s.name)];
      // "(any one)", "(select one)" and the like leave the choice to the player.
      // A language skill takes any language: the book's list is only suggestions.
      if (!s.specialty || !def?.specialties || def.anySpecialty || /\b(any|select|choose|one|see)\b/i.test(s.specialty)) continue;
      if (!def.specialties.includes(s.specialty)) unknown.add(`${d.name}: ${s.name} (${s.specialty})`);
    }
  }
  assert.deepEqual([...unknown], []);
});

test("the language skills suggest the languages Language Groups names", () => {
  const text = readFileSync(new URL("../../srd/Modern/Skills/LanguageGroups.md", import.meta.url), "utf8");
  const named = [...text.matchAll(/\*\*[^*]+:\*\*\s*([^\n]+(?:\n(?!\*\*)[^\n]+)*)/g)]
    .flatMap((m) => m[1].replace(/\s+/g, " ").replace(/\.\s*$/, "").split(/,\s*(?![^()]*\))/))
    .map((l) => l.replace(/[¹²³]/g, "").replace(/\s*\(aka [^)]*\)/, "").trim()).filter(Boolean);
  assert.deepEqual([...LANGUAGES].sort(), [...new Set(named)].sort());
  assert.ok(SKILLS.speakLanguage.noCheck && SKILLS.readWriteLanguage.anySpecialty);
});
