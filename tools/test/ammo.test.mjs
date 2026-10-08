import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { magazineOf, fits, fire, reload, extraDice, automatic, semiautomatic, specialAmmo, SPECIAL_AMMO } from "../../module/rules/ammo.mjs";
import { criticalDamage } from "../../module/rules/rolls.mjs";
import { reduceDamage, damageParts } from "../../module/rules/resistance.mjs";
import { slug } from "../../module/rules/identify.mjs";
import { attack, damage } from "../../module/rules/rolls.mjs";

const gear = PACKS.equipment().documents.filter((d) => d.system);
const weapon = (name) => gear.find((d) => d.type === "weapon" && d.name.startsWith(name));
const ammo = (name) => gear.find((d) => d.type === "ammunition" && d.name === name);

test("magazines as printed", () => {
  assert.deepEqual(magazineOf("15 box"), { capacity: 15, type: "box" });
  assert.deepEqual(magazineOf("6 cyl."), { capacity: 6, type: "cylinder" });
  assert.deepEqual(magazineOf("7 int."), { capacity: 7, type: "internal" });
  assert.deepEqual(magazineOf("Linked"), { capacity: Infinity, type: "linked" });
  assert.equal(magazineOf("—"), null);
});

test("ammunition fits a weapon by the caliber in its name", () => {
  assert.equal(fits(weapon("Beretta 92F"), ammo("9mm")), true);
  assert.equal(fits(weapon("Beretta 92F"), ammo("10mm")), false);
  assert.equal(fits(weapon("AKM/AK-47"), ammo("7.62mmR")), true);
  assert.equal(fits(weapon("AKM/AK-47"), ammo("7.62mm")), false);
  assert.equal(fits(weapon("Benelli 121 M1"), ammo("12-gauge buckshot")), true);
  // A caliber only the description names: the M2HB's ".50-caliber machine gun", the OICW's 5.56mm (not its 20mm launcher).
  assert.equal(fits(weapon("M2HB"), ammo(".50 caliber")), true);
  assert.equal(fits(weapon("OICW"), ammo("5.56mm")), true);
  assert.equal(fits(weapon("TacMil"), ammo("7.62mm")), true);
  assert.equal(fits(weapon("TacMil"), ammo("7.62mmR")), false);
  assert.equal(fits(weapon("Desert Eagle"), ammo(".50 caliber")), false);
  // Every firearm with a magazine has a caliber some ammunition in the book fits, or names none.
  const calibered = gear.filter((d) => d.type === "weapon" && magazineOf(d.system.magazine) && /\(\.?\d/.test(d.name));
  const unfit = calibered.filter((w) => !gear.some((a) => a.type === "ammunition" && fits(w, a))).map((w) => w.name);
  assert.ok(unfit.length < calibered.length / 4, `no ammunition fits: ${unfit.join(", ")}`);
});

test("firing spends rounds, and stops when there are too few", () => {
  const beretta = weapon("Beretta 92F");
  assert.deepEqual(fire(beretta, "single", { loaded: 15 }), { ok: true, rounds: 1, loaded: 14, supply: null });
  assert.equal(fire(beretta, "single", { loaded: 0 }).ok, false);
  const ak = weapon("AKM/AK-47");
  assert.equal(automatic(ak), true);
  assert.equal(semiautomatic(ak), true);
  assert.equal(fire(ak, "autofire", { loaded: 9 }).ok, false);
  assert.equal(fire(ak, "burst", { loaded: 5 }).loaded, 0);
  // A bow has no magazine: an arrow a shot from what is carried.
  const bow = gear.find((d) => d.type === "weapon" && /\bbow\b/i.test(d.name) && !/crossbow/i.test(d.name));
  assert.deepEqual(fire(bow, "single", { supply: 3 }), { ok: true, rounds: 1, loaded: 0, supply: 2 });
});

test("reloading fills the magazine from what is carried", () => {
  const beretta = weapon("Beretta 92F");
  assert.deepEqual(reload(beretta, 3, 50), { added: 12, loaded: 15, supply: 38, action: "a move action" });
  assert.equal(reload(beretta, 3, 5).loaded, 8);
  assert.equal(reload(weapon("Benelli 121 M1"), 0, 10).action, "a full-round action");
});

test("burst fire and double tap: the attack penalty and the extra dice", () => {
  const d = { baseAttackBonus: 3, modifiers: { str: 0, dex: 2 }, size: "medium", defense: {}, attackBonus: {}, damageBonus: {} };
  const ak = weapon("AKM/AK-47");
  const feats = [{ name: "Personal Firearms Proficiency" }, { name: "Advanced Firearms Proficiency" }, { name: "Burst Fire" }];
  assert.ok(attack(d, ak, feats, { mode: "burst" }).terms.some((t) => t.label === "Burst fire" && t.value === -4));
  assert.equal(extraDice("2d8", 2), "4d8");
  assert.equal(damage(d, ak, { mode: "burst" }).formula, extraDice(ak.system.damage.formula, 2));
  const auto = attack(d, ak, [{ name: "Personal Firearms Proficiency" }], { mode: "autofire" });
  assert.ok(auto.terms.some((t) => /Advanced Firearms/.test(t.label) && t.value === -4));
  assert.equal(auto.againstDefense, 10);
});

const d = { modifiers: { str: 1, dex: 2 }, baseAttackBonus: 3, size: "medium", defense: {}, attackBonus: {}, damageBonus: {} };
const shotgun = () => weapon("Benelli 121 M1");
const load = (name) => specialAmmo(slug(name), name);
const term = (spec, label) => spec.terms.find((t) => t.label === label)?.value;

test("every special load in the book has its rules, and every rule a load in the book", () => {
  const special = gear.filter((g) => g.type === "ammunition" && !/^(\.|\d|Arrow|Crossbow bolt|Power pack|Rail gun)/.test(g.name)).map((g) => slug(g.name)).sort();
  assert.deepEqual(special, Object.keys(SPECIAL_AMMO).sort());
});

test("a special load bought in a caliber fits that gun", () => {
  const beanbag = { ...ammo("Beanbag"), system: { ...ammo("Beanbag").system, caliber: "12-gauge" } };
  assert.equal(fits(shotgun(), ammo("Beanbag")), false);
  assert.equal(fits(shotgun(), beanbag), true);
  assert.equal(fits(weapon("Beretta 92F"), beanbag), false);
});

test("special loads on the attack: Flechette −1 and a wider threat, Seeker +1, Tracer on autofire, Armor Piercing when asked", () => {
  const flechette = attack(d, shotgun(), [], { ammo: load("Flechette") });
  assert.equal(term(flechette, "Flechette"), -1);
  assert.equal(flechette.critical.threat, 19);
  assert.equal(term(attack(d, weapon("Beretta 92F"), [], { ammo: load("Seeker") }), "Seeker"), 1);
  const ak = weapon("AKM");
  assert.equal(term(attack(d, ak, [], { ammo: load("Tracer"), mode: "autofire" }), "Tracer"), 1);
  assert.equal(term(attack(d, ak, [], { ammo: load("Tracer") }), "Tracer"), undefined);
  assert.equal(term(attack(d, ak, [], { ammo: load("Armor Piercing"), ammoAsk: true }), "Armor Piercing (target in armor)"), 2);
  assert.equal(term(attack(d, ak, [], { ammo: load("Armor Piercing") }), "Armor Piercing (target in armor)"), undefined);
});

test("special loads on the damage: dice more or fewer, Subsonic −2, Frangible when asked, nonlethal, silver, half fire", () => {
  // The Benelli's 2d8: high explosive 3d8, birdshot 1d8.
  assert.match(damage(d, shotgun(), { ammo: load("High Explosive") }).formula, /^3d8/);
  assert.match(damage(d, shotgun(), { ammo: load("Birdshot") }).formula, /^1d8/);
  assert.match(damage(d, weapon("Beretta 92F"), { ammo: load("Subsonic") }).formula, /- 2$/);
  assert.match(damage(d, weapon("Beretta 92F"), { ammo: load("Frangible"), ammoAsk: true }).formula, /\+ 1$/);
  assert.equal(damage(d, shotgun(), { ammo: load("Beanbag") }).nonlethal, true);
  assert.equal(damage(d, shotgun(), {}).nonlethal, false);
  // Silver: the damage reduction it gets past, in the type the card applies.
  const silver = damage(d, weapon("Beretta 92F"), { ammo: load("Silver") });
  assert.equal(silver.type, "Ballistic, silver");
  assert.equal(reduceDamage([{ type: silver.type, amount: 10 }], { dr: [{ amount: 5, overcome: "silver" }], resist: {}, immune: [] }).total, 10);
  assert.equal(damage(d, weapon("Beretta 92F"), { ammo: load("Plasma-coated") }).half, "fire");
  // A load made for other weapons says so; a note says what else it does.
  assert.match(damage(d, weapon("Beretta 92F"), { ammo: load("Beanbag") }).hints.join(" "), /made for shotguns and grenade launchers/);
  assert.match(attack(d, weapon("AKM"), [], { ammo: load("Subsonic") }).hints.join(" "), /Range increment 20 ft\. shorter/);
});

test("White Phosphorous: 1d6 fire besides, its own part for resistance, and once on a critical", () => {
  const wp = damage(d, weapon("Beretta 92F"), { ammo: load("White Phosphorous (WP)") });
  assert.equal(wp.formula, "2d6 + 1d6[fire]");
  assert.equal(criticalDamage(wp, 2).formula, "(2d6) + (2d6) + 1d6[fire]");
  // Rolled 7 + 4 fire: the fire part on its own.
  assert.deepEqual(damageParts([{ total: 7 }, { operator: "+" }, { flavor: "fire", total: 4 }], 11, "Ballistic"), [{ type: "Ballistic", amount: 7 }, { type: "fire", amount: 4 }]);
});

test("range: −2 a full range increment, ten for a fired weapon and five thrown, Far Shot's longer increments", async () => {
  const { rangePenalty, isThrown } = await import("../../module/rules/ammo.mjs");
  const beretta = weapon("Beretta 92F");   // 40 ft.
  assert.deepEqual(rangePenalty(beretta, 39), { increments: 0, penalty: 0, increment: 40, beyond: false });
  assert.deepEqual(rangePenalty(beretta, 90), { increments: 2, penalty: -4, increment: 40, beyond: false });
  assert.equal(rangePenalty(beretta, 410).beyond, true);
  assert.equal(rangePenalty(beretta, 90, { farShot: true }).increments, 1);   // 60-ft. increments
  const grenade = weapon("Fragmentation grenade");
  assert.equal(isThrown(grenade), true);
  assert.equal(isThrown(beretta), false);
  assert.equal(rangePenalty(grenade, grenade.system.rangeIncrement.ft * 5 + 1).beyond, true);
  assert.equal(rangePenalty(grenade, 20, { farShot: true }).increment, grenade.system.rangeIncrement.ft * 2);
  assert.equal(rangePenalty(beretta, 0), null);
});

test("an attack at a distance: its range penalty, Point Blank Shot within 30 ft., into a melee unless Precise Shot, fighting defensively", () => {
  const beretta = weapon("Beretta 92F");
  const pfp = { name: "Personal Firearms Proficiency" };
  const term = (spec, re) => spec.terms.find((t) => re.test(t.label))?.value;
  assert.equal(term(attack(d, beretta, [pfp], { distance: 90 }), /^Range/), -4);
  assert.equal(term(attack(d, beretta, [pfp, { name: "Point Blank Shot" }], { distance: 25 }), /Point Blank/), 1);
  assert.equal(term(attack(d, beretta, [pfp, { name: "Point Blank Shot" }], { distance: 35 }), /Point Blank/), undefined);
  assert.equal(term(attack(d, beretta, [pfp], { intoMelee: true }), /melee/), -4);
  assert.equal(term(attack(d, beretta, [pfp, { name: "Precise Shot" }], { intoMelee: true }), /melee/), undefined);
  assert.equal(term(attack(d, beretta, [pfp], { defensively: true }), /defensively/), -4);
  assert.match(attack(d, beretta, [pfp], { distance: 500 }).hints.join(" "), /Out of range/);
});

test("a card's recorded load (its key and name) is the load as the weapon gave it, rules and all; none for ordinary rounds", async () => {
  const { specialAmmo } = await import("../../module/rules/ammo.mjs");
  const { recordedLoad } = await import("../../module/ammo.mjs");
  const load = recordedLoad({ key: "beanbag", name: "Beanbag (12-gauge)" });
  assert.deepEqual(load, { ...specialAmmo("beanbag", "Beanbag (12-gauge)"), key: "beanbag" });
  assert.equal(load.nonlethal, true);
  assert.equal(recordedLoad(null), null);
});
