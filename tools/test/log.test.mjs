import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../../module/rules/log.mjs";

const meta = { id: "x", time: 0, user: "u", userName: "Terry" };
const before = {
  name: "Ace",
  system: { abilities: { str: { value: 14 } }, hp: { value: 13, temp: 0 }, skills: { moveSilently: { ranks: 2 } }, details: { biography: "<p>Old</p>" } },
};

test("a change to the character is build, unless it is hit points or action points", () => {
  assert.equal(L.kindOfActorField("system.abilities.str.value"), "build");
  assert.equal(L.kindOfActorField("system.hp.value"), "play");
  assert.equal(L.kindOfActorField("system.actionPoints.value"), "play");
  assert.equal(L.kindOfActorField("system.wealth.value"), "build");
  assert.equal(L.kindOfActorField("system.something.new"), "build");   // anything not listed is kept
  assert.equal(L.kindOfItemField("system.equipped"), "play");
  assert.equal(L.kindOfItemField("system.level"), "build");
});

test("an update touching both kinds makes a build entry and a play entry, worded as a person would say it", () => {
  const entries = L.actorEntries(before, { "system.abilities.str.value": 16, "system.hp.value": 7, "system.skills.moveSilently.ranks": 3 }, meta);
  assert.deepEqual(entries.map((e) => e.kind), ["build", "play"]);
  assert.deepEqual(entries[0].changes, [{ label: "Strength", from: "14", to: "16" }, { label: "Move Silently ranks", from: "2", to: "3" }]);
  assert.deepEqual(entries[1].changes, [{ label: "Current HP", from: "13", to: "7" }]);
  assert.equal(entries[1].userName, "Terry");
});

test("unchanged values, the log itself and Foundry's bookkeeping are not recorded; long text is summarised", () => {
  assert.deepEqual(L.actorEntries(before, { "system.hp.value": 13, "flags.modern20.log": [], "_stats.modifiedTime": 1 }, meta), []);
  const [bio] = L.actorEntries(before, { "system.details.biography": "<p>New</p>" }, meta);
  assert.deepEqual(bio.changes, [{ label: "Biography", from: "(text changed)", to: "(text changed)" }]);
});

test("items: levels and choices are build; equipping is play; adding and removing are build", () => {
  const cls = { name: "Fast Hero", type: "class" };
  assert.deepEqual(L.itemEntries(cls, { system: { level: 2 } }, { "system.level": 3 }, meta).map((e) => [e.kind, e.text]), [["build", "Fast Hero level 2 → 3"]]);
  const vest = { name: "Concealable vest", type: "armor" };
  assert.deepEqual(L.itemEntries(vest, { system: { equipped: false } }, { "system.equipped": true }, meta).map((e) => [e.kind, e.text]), [["play", "Concealable vest not equipped → equipped"]]);
  assert.equal(L.itemAdded({ name: "Iron Will", type: "feat" }, meta).text, "Added feat Iron Will");
  assert.equal(L.itemRemoved({ name: "Glock 17", type: "weapon" }, meta).kind, "build");
});

test("effects: a condition or switching an effect is play; an effect of the character's own made or deleted is build", () => {
  assert.deepEqual([L.effectEntry({ name: "Shaken", statuses: ["shaken"] }, "create", meta).kind, L.effectEntry({ name: "Shaken", statuses: ["shaken"] }, "create", meta).text], ["play", "Now shaken"]);
  assert.equal(L.effectEntry({ name: "Shaken", statuses: new Set(["shaken"]) }, "delete", meta).text, "No longer shaken");
  assert.deepEqual([L.effectEntry({ name: "Blessed", statuses: [] }, "create", meta).kind], ["build"]);
  assert.equal(L.effectEntry({ name: "Iron Will", disabled: true }, "toggle", meta).text, "Switched off Iron Will");
  assert.equal(L.rollEntry("Will save", 17, meta).kind, "play");
});

test("the log is written a chunk at a time: an entry sends only the chunk it joins", () => {
  const e = (kind, n) => ({ kind, n, time: n });
  let { update, log } = L.append(undefined, [e("build", 1), e("play", 2)]);
  assert.deepEqual(Object.keys(update).sort(), ["flags.modern20.log.build.0", "flags.modern20.log.play.0"]);
  ({ update, log } = L.append(log, [e("play", 3)]));
  assert.deepEqual(Object.keys(update), ["flags.modern20.log.play.0"]);   // the build chunk is not sent again
  assert.deepEqual(L.entries(log).map((x) => x.n), [1, 2, 3]);
});

test("the session log is pruned a chunk at a time and build entries are never pruned", () => {
  let log;
  for (let i = 0; i < 700; i++) log = L.append(log, [{ kind: "play", n: i, time: i }, ...(i % 100 ? [] : [{ kind: "build", n: i, time: i }])]).log;
  const play = L.entries(log).filter((x) => x.kind === "play");
  assert.ok(play.length >= L.PLAY_LIMIT && play.length < L.PLAY_LIMIT + L.CHUNK, `${play.length} kept`);
  assert.equal(play.at(-1).n, 699);
  assert.equal(L.entries(log).filter((x) => x.kind === "build").length, 7);
  // Pruning shows in the update as Foundry's deletion key, not as a rewritten chunk.
  const full = Object.fromEntries(Array.from({ length: 11 }, (_, k) => [k, Array.from({ length: L.CHUNK }, (_, i) => ({ kind: "play", time: k * 100 + i }))]));
  const { update } = L.append({ play: full }, [{ kind: "play", time: 99999 }]);
  assert.ok("flags.modern20.log.play.-=0" in update);
});
