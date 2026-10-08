import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { footprint, coverIn, topSpeed } from "../build/vehicles.mjs";
import { SPEEDS, reachable, nextSpeeds, atSpeed, vehicleDamage, vehicleState } from "../../module/rules/vehicles.mjs";

const built = PACKS.vehicles();
const vehicles = built.documents.filter((d) => d.system);
const find = (name) => vehicles.find((d) => d.name === name);

test("the vehicles build with every check passing: each table's rows, with their descriptions", () => {
  assert.deepEqual(built.problems, []);
  assert.equal(vehicles.length, 37);
  assert.ok(vehicles.every((v) => v.type === "vehicle" && v.system.description && v.system.hp.max > 0 && v.system.cover));
  const names = vehicles.map((v) => v.name);
  assert.deepEqual(names.filter((n, i) => names.indexOf(n) !== i), []);
});

test("a vehicle's statistics as printed, its footprint its token's, and the cover its page or description gives", () => {
  const acura = find("Acura 3.2 TL (mid-size sedan)");
  assert.deepEqual([acura.system.crew, acura.system.passengers, acura.system.cargo.lb, acura.system.initiative, acura.system.maneuver], [1, 4, 300, -2, -1]);
  assert.deepEqual([acura.system.topSpeed.character, acura.system.topSpeed.chase, acura.system.defense, acura.system.hardness, acura.system.hp.max], [265, 26, 8, 5, 34]);
  assert.deepEqual([acura.system.size, acura.system.purchaseDC.dc, acura.system.restriction.level], ["huge", 29, "lic"]);
  assert.deepEqual([acura.system.squares, acura.prototypeToken.width, acura.prototypeToken.height], [{ wide: 2, long: 4 }, 2, 4]);
  // The page's: "civilian cars provide three-quarters cover"; a description's own: the Abrams's "full cover".
  assert.equal(acura.system.cover, "three-quarters");
  assert.equal(find("M1A2 Abrams (tracked tank)").system.cover, "full");
  assert.equal(find("Armored truck").system.cover, "nine-tenths");
  // The two the book names otherwise in their descriptions: "Jaguar XJS" is the "Jaguar XJ Sedan".
  assert.match(find("Jaguar XJS (luxury sedan)").system.description, /four-door|sedan/i);
  assert.deepEqual(footprint("A Cessna 172 is seven squares wide (including wings; fuselage is one square wide) and six squares long."), { wide: 7, long: 6 });
  assert.equal(coverIn("It provides no cover for its rider."), "none");
  assert.deepEqual(topSpeed("1,100 (110)"), { value: "1,100 (110)", character: 1100, chase: 110 });
});

test("its mounted weapons are its items: the Abrams's tank cannon and M2HB, needing their proficiency", () => {
  const abrams = find("M1A2 Abrams (tracked tank)");
  assert.deepEqual(abrams.items.map((i) => i.name), ["M1A2 Abrams tank cannon", "M2HB (heavy machine gun)"]);
  const cannon = abrams.items[0];
  assert.deepEqual([cannon.type, cannon.system.damage.formula, cannon.system.rangeIncrement.ft, cannon.system.proficiency.value], ["weapon", "10d12", 400, "Exotic Firearms Proficiency (cannons)"]);
  assert.ok(cannon._key.startsWith(`!actors.items!${abrams._id}.`));
  assert.deepEqual(find("Acura 3.2 TL (mid-size sedan)").items, []);
});

test("speed: the categories its top speed reaches, one up or down a round, and Defense and the penalty aboard", () => {
  assert.deepEqual(reachable(70), ["stationary", "alley", "street", "highway"]);
  assert.deepEqual(reachable(165), Object.keys(SPEEDS));
  assert.deepEqual(nextSpeeds("street", 265), ["alley", "street", "highway"]);
  assert.deepEqual(nextSpeeds("highway", 62), ["street", "highway"]);
  assert.deepEqual(atSpeed(8, "allOut"), { defense: 12, check: -4, label: "All-out" });
  assert.deepEqual(atSpeed(8, "stationary").defense, 8);
});

test("damage to a vehicle: hardness off each hit; electricity and fire half, cold a quarter, before it; disabled at 0, destroyed at minus its total", () => {
  assert.deepEqual(vehicleDamage([{ type: "Ballistic", amount: 12 }], 5).total, 7);
  assert.equal(vehicleDamage([{ type: "Ballistic", amount: 3 }], 5).total, 0);
  // 2d6 fire rolled 10: 5, less hardness 5: none.
  assert.equal(vehicleDamage([{ type: "fire", amount: 10 }], 5).total, 0);
  assert.equal(vehicleDamage([{ type: "", amount: 8 }, { type: "cold", amount: 8 }], 5).total, 5);
  assert.deepEqual(vehicleDamage([{ type: "acid", amount: 8 }], 0).stopped, []);
  assert.deepEqual([vehicleState(1, 34), vehicleState(0, 34), vehicleState(-33, 34), vehicleState(-34, 34)], [null, "disabled", "disabled", "destroyed"]);
});
