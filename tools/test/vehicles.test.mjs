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

test("driving: each stunt's DC (a jump's by speed, a sideswipe's by size and speed), and losing control", async () => {
  const { stuntDC, lostControl, STUNTS } = await import("../../module/rules/vehicles.mjs");
  assert.equal(stuntDC("dash"), 15);
  assert.equal(stuntDC("bootleg", { option: 3 }), 20);
  assert.equal(stuntDC("avoid", { option: 2 }), 5);
  // A 4–8 ft. culvert, DC 20: +10 at alley speed, −5 all-out.
  assert.deepEqual([stuntDC("jump", { option: 1, speed: "alley" }), stuntDC("jump", { option: 1, speed: "allOut" })], [30, 15]);
  // A sideswipe on a target one size larger, two speed categories apart: 15 − 5 − 4.
  assert.equal(stuntDC("sideswipe", { larger: 1, speedsApart: 2 }), 6);
  assert.equal(stuntDC("check", { dc: 22 }), 22);
  assert.deepEqual([lostControl(16, 15), lostControl(12, 15), lostControl(5, 15)], [null, "spins", "rolls"]);
  assert.equal(STUNTS.brake.keep, 15);
});

test("aboard: the speed's penalty on checks and attacks, driving defensively's on attacks; a driver on total defense makes none", async () => {
  const { aboard, atSpeed, operationPenalty, CREW } = await import("../../module/rules/vehicles.mjs");
  assert.deepEqual(aboard({ speed: "highway", driving: "normal" }, "passenger"), { check: -2, attack: -2, speedLabel: "Highway speed", drivingLabel: "Normally", cannotAttack: false });
  assert.equal(aboard({ speed: "street", driving: "defensively" }, "gunner").attack, -5);
  assert.equal(aboard({ speed: "alley", driving: "total" }, "driver").cannotAttack, true);
  assert.equal(atSpeed(8, "street", "defensively").defense, 11);
  // The Abrams is tracked: −4 without Surface Vehicle Operation (tracked).
  assert.equal(operationPenalty({ skill: "drive", class: "tracked" }, []), -4);
  assert.equal(operationPenalty({ skill: "drive", class: "tracked" }, [{ name: "Surface Vehicle Operation", choice: "tracked" }]), 0);
  assert.equal(operationPenalty({ skill: "pilot", class: "helicopters" }, [{ name: "Aircraft Operation", choice: "helicopters" }]), 0);
  assert.equal(operationPenalty({ skill: "drive", class: "" }, []), 0);
  assert.deepEqual([CREW.skilled.check, CREW.ace.attack], [4, 8]);
  // Each vehicle's crew, operation and loaded weapons from the book.
  const abrams = find("M1A2 Abrams (tracked tank)");
  assert.deepEqual([abrams.system.crewQuality, abrams.system.operation], ["skilled", { skill: "drive", class: "tracked" }]);
  assert.equal(abrams.items[0].system.loaded, 1);
  assert.deepEqual(find("Bell Jet Ranger (helicopter)").system.operation, { skill: "pilot", class: "helicopters" });
  assert.deepEqual(find("Acura 3.2 TL (mid-size sedan)").system.operation, { skill: "drive", class: "" });
});

test("collisions: the higher speed's die, the smaller size's dice, × how it struck; a Bumper of the Ram a step either way", async () => {
  const { collisionDamage, occupantShare, slowerBy, explodes } = await import("../../module/rules/vehicles.mjs");
  // A Huge car at highway speed into a stationary Large object: 8d8, ×1.
  assert.deepEqual(collisionDamage({ speeds: ["highway", "stationary"], sizes: ["huge", "large"], strike: "object" }), { formula: "8d8", multiplier: 1, speed: "highway", size: "large" });
  // Head-on with another moving vehicle: ×2; a sideswipe ×¼.
  assert.equal(collisionDamage({ speeds: ["street", "allOut"], sizes: ["huge", "gargantuan"], strike: "headOn" }).formula, "12d12");
  assert.equal(collisionDamage({ speeds: ["street"], sizes: ["huge"], strike: "sideswipe" }).multiplier, 0.25);
  // A Bumper of the Ram: one speed and size worse for what it strikes, one better for itself.
  assert.equal(collisionDamage({ speeds: ["street"], sizes: ["large"], steps: 1 }).formula, "12d8");
  assert.equal(collisionDamage({ speeds: ["street"], sizes: ["large"], steps: -1 }).formula, "4d2");
  assert.deepEqual([occupantShare("none"), occupantShare("one-quarter"), occupantShare("one-half"), occupantShare("three-quarters"), occupantShare("none", { seatsOfSafety: true })], [1, 0.5, 0.25, 0, 0]);
  assert.deepEqual([slowerBy("allOut"), slowerBy("street"), slowerBy("alley")], ["street", "stationary", "stationary"]);
  // Disabled by a hit of half its hit points or more: it explodes.
  assert.deepEqual([explodes(10, -8, 18, 34), explodes(30, -1, 31, 34), explodes(0, -5, 20, 34)], [true, true, false]);
  assert.equal(explodes(20, 0, 20, 64), false);
});

test("vehicular FX items: each a kind, so many at once; the paint job's hardness, the figurine's by its kind, the seats", async () => {
  const { vehicleSlot, vehicleOverLimit, vehicleFx, VEHICLE_SLOTS } = await import("../../module/rules/vehicles.mjs");
  const fx = PACKS["fx-items"]().documents.filter((d) => d.system?.fx?.power === "vehicular");
  assert.equal(fx.length, 22);
  for (const d of fx) assert.ok(VEHICLE_SLOTS[d.system.fx.slot], d.name);
  assert.deepEqual([vehicleSlot("Ablative Paint Job"), vehicleSlot("Fuzzy Dice of Luck"), vehicleSlot("Paralytic Alarm"), vehicleSlot("Seat of Hold Monster")], ["paint", "accessory", "electronics", "seats"]);
  const item = (name, extra = {}) => ({ id: name, name, system: { identifier: name.toLowerCase().replace(/ /g, "-"), fx: { slot: vehicleSlot(name), power: "vehicular", choice: "", ...extra } } });
  // Two coats of paint: the second does not work; two alarms both do.
  assert.deepEqual(vehicleOverLimit([item("Ablative Paint Job"), item("Flame Job")]), ["Flame Job"]);
  assert.deepEqual(vehicleOverLimit([item("Paralytic Alarm"), item("Silent Warning Alarm")]), []);
  assert.equal(vehicleFx([item("Ablative Paint Job")], 5).hardness, 5);
  assert.equal(vehicleFx([item("Ablative Paint Job")], 10).hardness, 0);
  assert.equal(vehicleFx([item("Dashboard Figurine", { choice: "religious" })]).defense, 2);
  assert.equal(vehicleFx([item("Dashboard Figurine", { choice: "monstrous" })]).attack, 1);
  assert.equal(vehicleFx([item("Dashboard Figurine", { choice: "humorous" })]).driverSaves, 1);
  assert.deepEqual([vehicleFx([item("Seats of Safety")]).seatsOfSafety, vehicleFx([item("Seats of Safety")]).reflex], [true, 3]);
});
