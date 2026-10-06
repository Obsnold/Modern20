import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildCreatures, splitList, TYPE_ICONS, CREATURE_ICONS } from "../build/creatures.mjs";
import { buildFeats } from "../build/feats.mjs";

const { documents, problems } = buildCreatures();
const actors = documents.filter((d) => d._key.startsWith("!actors!"));
const byName = Object.fromEntries(actors.map((d) => [d.name, d]));
const featName = Object.fromEntries(buildFeats().documents.map((d) => [`Compendium.modern20.feats.Item.${d._id}`, d.name]));

test("creatures build with every check passing, one actor per stat block", () => {
  assert.deepEqual(problems, []);
  assert.equal(actors.length, 316);
  assert.ok(actors.every((d) => d.type === "creature" && d.folder));
  assert.equal(byName["Create Crawling Claw"], undefined);   // a spell's stat block on a creature page
});

test("a stat block is read into numbers and text", () => {
  const s = byName.Wolf.system;
  assert.deepEqual(s.cr, { value: "1", number: 1 });
  assert.equal(s.size, "medium");
  assert.equal(s.hitDice, "2d8+4");
  assert.deepEqual(s.hp, { value: 13, max: 13 });
  assert.deepEqual(s.defense, { value: 14, touch: 12, flatFooted: 12, breakdown: "+2 Dex, +2 natural", flameShield: "" });
  assert.deepEqual(s.saves, { fort: 5, ref: 5, will: 1 });
  assert.deepEqual(s.abilities, { str: 13, dex: 15, con: 15, int: 2, wis: 12, cha: 6 });
  assert.deepEqual(s.skills.at(-1), { name: "Survival", specialty: "", bonus: 1, note: "+5 when tracking by scent" });
  assert.match(s.description, /Scent \(Ex\)/);   // the page's species traits
});

test("feats and talents link to their packs; nonabilities are null", () => {
  const troll = byName["Troll Tough Hero 7"].system;
  assert.ok(troll.talents.length >= 4 && troll.talents.every((t) => t.uuid));
  const linked = actors.flatMap((a) => a.system.feats).filter((f) => f.uuid);
  assert.ok(linked.length > 700 && linked.every((f) => featName[f.uuid]));
  const zombie = byName["Human Zombie"].system;
  assert.equal(zombie.abilities.int, null);
});

test("lists split on commas outside parentheses", () => {
  assert.deepEqual(splitList("Hide +3, Survival +1 (+5 when tracking, by scent), Spot +4."), ["Hide +3", "Survival +1 (+5 when tracking, by scent)", "Spot +4"]);
  assert.deepEqual(splitList("darkvision 1,200 ft., scent"), ["darkvision 1,200 ft.", "scent"]);
});

test("pages with several creatures get a folder of their own", () => {
  const folders = documents.filter((d) => d._key.startsWith("!folders!"));
  const vivilor = actors.find((a) => a.name === "1st-level Vivilor");
  const f = folders.find((x) => x._id === vivilor.folder);
  assert.ok(f.folder, "nested under its book");
});

test("tokens are sized by the book and draw their art as main does", () => {
  const wolf = byName.Wolf.prototypeToken;
  assert.equal(wolf.width, 1);
  assert.deepEqual(wolf.texture, { src: "systems/modern20/assets/tokens/lorc/wolf-head.svg", scaleX: 2, scaleY: 2, anchorX: 0.5, anchorY: 0.25 });
  assert.deepEqual(wolf.bar1, { attribute: "hp" });
  const sizes = Object.fromEntries(actors.map((a) => [a.system.size, a.prototypeToken.width]));
  assert.deepEqual([sizes.tiny, sizes.medium, sizes.large, sizes.huge, sizes.gargantuan, sizes.colossal], [0.5, 1, 2, 3, 4, 6]);
  const seeing = actors.filter((a) => a.prototypeToken.sight.enabled);
  assert.ok(seeing.length > 50 && seeing.every((a) => a.prototypeToken.sight.range >= 5));
});

test("each creature is pictured by its type, with art that exists as an icon and a token", () => {
  const ROOT = fileURLToPath(new URL("../../", import.meta.url));
  for (const icon of [...Object.values(TYPE_ICONS), ...Object.values(CREATURE_ICONS)]) {
    assert.ok(existsSync(`${ROOT}assets/icons/${icon}.svg`), `icons/${icon}`);
    assert.ok(existsSync(`${ROOT}assets/tokens/${icon}.svg`), `tokens/${icon}`);
  }
  const pictured = (name) => [byName[name].img.split("/icons/")[1], byName[name].prototypeToken.texture.src.split("/tokens/")[1]];
  assert.deepEqual(pictured("Wolf"), ["lorc/wolf-head.svg", "lorc/wolf-head.svg"]);
  assert.deepEqual(pictured("Ancient Dragon"), ["lorc/dragon-head.svg", "lorc/dragon-head.svg"]);
  assert.deepEqual(pictured("Human Zombie"), ["delapouite/shambling-zombie.svg", "delapouite/shambling-zombie.svg"]);
  assert.deepEqual(pictured("Replacement Scientist (Human Smart Ordinary 5/Charismatic Ordinary 2)")[0], "lorc/vintage-robot.svg");
  assert.ok(byName["Police Assault Drone"], "footnote markers come off names");
});

test("creatures printed outside the creature pages: an FX item's creature, robots, an organization's people", () => {
  const bot = byName.Arcanobot;
  assert.equal(bot.flags.modern20.srd, "Arcana/FXItems/WondrousItems.md");
  assert.equal(bot.system.size, "diminutive");
  assert.equal(bot.prototypeToken.width, 0.5);
  assert.match(bot.system.description, /action figures are durable/);   // the item it is printed under
  assert.equal(byName["APE Police Robot"].system.type.base, "construct");
  assert.equal(byName["Franz Draco"].system.class, "Male Efreeti Smart Hero 3/Charismatic Hero 4");
  const octopus = byName.Octopus.system;
  assert.deepEqual([octopus.cr.value, octopus.hitDice, octopus.hp.value], ["1/6 (1/2 if venomous)", "1/2 d8", 2]);
  assert.ok(byName["Black Feather"].system.talents.some((t) => t.name === "uncanny dodge" && !t.uuid));
});

test("the book's worked examples are marked, link their base, and sit with it in book order", () => {
  const cat = byName["Cat Folk Fast Hero 1/Charismatic Hero 2"];
  assert.equal(cat.system.example.classed, true);
  assert.deepEqual(cat.system.example.base, { name: "Cat Folk", uuid: `Compendium.modern20.creatures.Actor.${byName["Cat Folk"]._id}` });
  assert.equal(byName["Cat Folk"].system.example.classed, false);
  assert.equal(cat.folder, byName["Cat Folk"].folder);
  assert.ok(byName["Cat Folk"].sort < cat.sort, "base first");
  assert.equal(byName["Fleshraker Fast Hero 3"].system.example.base.name, "Fleshraker (Knife Fiend)");
  assert.equal(byName["Black Feather"].system.example.base.name, "");
  assert.equal(byName["Puppeteer Host (Human Charismatic Ordinary 5)"].system.example.base.name, "");      // an organization's person, not a creature's example
  assert.ok(byName["Human Zombie"].system.template && byName["Human Zombie"].system.example.base.name === "");
  const examples = actors.filter((a) => a.system.example.classed || a.system.template);
  assert.equal(examples.length, 61);
});
