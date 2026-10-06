/**
 * Every compendium entry through the rules code: every creature's attack lines and defenses,
 * every weapon's damage, every class at every level, every printed hero's classes. The other
 * tests hold particular entries to the book; these find the entry whose printing the code was
 * never shown.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { readAttacks, damageRoll, attackRoll } from "../../module/rules/attacks.mjs";
import { readDefenses, ENERGY } from "../../module/rules/resistance.mjs";
import * as R from "../../module/rules/rolls.mjs";
import { deriveCharacter } from "../../module/rules/character.mjs";
import { creatureParts } from "../../module/rules/creature.mjs";
import { initial, obj } from "../../module/data/schema.mjs";
import { ACTOR_MODELS } from "../../module/data/models.mjs";

const creatures = PACKS.creatures().documents.filter((d) => d.type === "creature");
const weapons = PACKS.equipment().documents.filter((d) => d.type === "weapon");
const classes = PACKS.classes().documents.filter((d) => d.type === "class");

/** A damage formula as a Roll takes it: dice and numbers added, a part labelled by its kind ("1d6[fire]"). */
const FORMULA = /^\(?\d+(d\d+)?([+-]\d+)?\)?( \+ \(?\d+(d\d+)?([+-]\d+)?\)?(\[[\w /]+\])?)*$/;

test("every creature's attack lines read as attacks, each with damage that rolls", () => {
  const problems = [];
  for (const c of creatures) {
    for (const line of ["attack", "fullAttack"]) {
      const text = c.system[line];
      if (!text || /^(—|none)/i.test(text.trim())) continue;
      const choices = readAttacks(text);
      if (!choices.length) problems.push(`${c.name}: nothing read from "${text}"`);
      for (const a of choices.flat()) {
        if (a.bonuses.some(Number.isNaN)) problems.push(`${c.name}: a bonus in "${a.text}"`);
        if (a.bonuses.length) assert.match(attackRoll(a, 0).formula, /^1d20( [+-] \d+)?$/, a.text);
        const d = damageRoll(a, 2);
        if (d && !FORMULA.test(d.formula.replace(/^\((.*)\) \+ \(\1\)/, "$1"))) problems.push(`${c.name}: damage "${d.formula}" from "${a.text}"`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test("every creature's damage reduction and energy resistance is read from its special qualities", () => {
  const problems = [];
  for (const c of creatures) {
    for (const q of c.system.specialQualities ?? []) {
      const t = q.toLowerCase(), r = readDefenses([q]);
      if (/damage reduction \d/.test(t) && !r.dr.length) problems.push(`${c.name}: "${q}"`);
      if (new RegExp(`\\b(${ENERGY.join("|")})\\b.*resistance \\d`).test(t) && !Object.keys(r.resist).length) problems.push(`${c.name}: "${q}"`);
    }
  }
  assert.deepEqual(problems, []);
});

test("every weapon's damage rolls, unless the book prints none (special, varies, see text)", () => {
  const d = { modifiers: { str: 2, dex: 1 }, baseAttackBonus: 3, size: "medium", defense: {}, attackBonus: {}, damageBonus: {} };
  const problems = [];
  for (const w of weapons) {
    const printed = w.system.damage.value.replace(/[¹²³⁴⁵⁶⁷⁸⁹]/g, "").trim();
    if (!w.system.damage.formula) {
      // Not a roll: no damage of its own (a net, a smoke grenade), or brass knuckles, which add to an unarmed strike.
      if (!/^(|—|special|varies|see text)$/i.test(printed) && !(w.name === "Brass knuckles" && printed === "1")) problems.push(`${w.name}: "${printed}"`);
      continue;
    }
    for (const mode of [undefined, "doubleTap", "burst"]) {
      const r = R.damage(d, w, { mode });
      if (!/^\d+(d\d+)?( [+-] \d+)*$/.test(r.formula)) problems.push(`${w.name}: "${r.formula}"`);
    }
  }
  assert.deepEqual(problems, []);
});

test("every class, alone, at every level: its numbers are numbers", () => {
  const base = initial(obj(ACTOR_MODELS.character));
  const notNumbers = (v, path = "") => {
    if (typeof v === "number") return Number.isFinite(v) ? [] : [path];
    if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => notNumbers(x, `${path}.${k}`));
    return [];
  };
  const problems = [];
  for (const c of classes) {
    for (let level = 1; level <= (c.system.maxLevel || 10); level++) {
      const out = deriveCharacter(base, [{ type: "class", name: c.name, system: { ...c.system, level } }]);
      if (out.level !== level) problems.push(`${c.name} ${level}: level ${out.level}`);
      problems.push(...notNumbers(out).map((p) => `${c.name} ${level}: ${p}`));
    }
  }
  assert.deepEqual(problems, []);
});

test("every printed hero and worked example names classes the compendium has", () => {
  const classNames = classes.map((c) => c.name);
  const problems = creatures.filter((c) => c.system.class || c.system.example?.classed)
    .filter((c) => !Object.keys(creatureParts(c, { classNames, species: [] }).classes).length)
    .map((c) => `${c.name}: ${c.system.class || "(its name)"}`);
  assert.deepEqual(problems, []);
});
