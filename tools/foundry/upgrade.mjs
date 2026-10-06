/**
 * The upgrade test: `npm run test:foundry:upgrade [release-tag]` (harness.mjs has what it needs).
 *
 * A world made on a released version, opened on this one: what a table's world goes through when
 * the system updates. It unpacks the release (by default the latest release tag) beside the
 * test data, builds its compendiums, makes characters and a creature in a world on it, and notes
 * their numbers. It then takes away what the startup update should restore (a feat's effect, a
 * class feature), as an older version would have left them, and marks the world as updated by an
 * older version. Foundry is restarted on this repository, and the same characters must come back
 * with the same numbers, every sheet must draw cleanly, and nothing may go wrong in the console.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { PRELUDE } from "./checks.mjs";
import { REPO, DATA, BROWSER, prepare, freshWorld, startServer, stopServer, join, elapsed, fail } from "./harness.mjs";

const WORLD = "modern20-upgrade";
const git = (...args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();

/** The release, unpacked and built beside the test data, with the SRD it was made with. Kept for the next run. */
function checkout(tag) {
  const dir = path.join(DATA, "releases", tag);
  if (fs.existsSync(path.join(dir, "packs/classes"))) return dir;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "srd"), { recursive: true });
  // An export of each, not a checkout: nothing is registered in either repository.
  const unpack = (repo, rev, into) => execFileSync("sh", ["-c", `git archive ${rev} | tar -x -C "${into}"`], { cwd: repo });
  unpack(REPO, tag, dir);
  unpack(path.join(REPO, "srd"), git("ls-tree", tag, "srd").split(/\s+/)[2], path.join(dir, "srd"));
  fs.symlinkSync(path.join(REPO, "node_modules"), path.join(dir, "node_modules"));
  execFileSync("node", ["tools/build.mjs"], { cwd: dir, stdio: "ignore" });
  return dir;
}

/** On the release: the world's characters and creature, their numbers noted, then aged. */
async function MAKE() {
  const { take, doc, wait } = window.m20test;
  const abilities = (v) => Object.fromEntries(Object.entries(v).map(([a, value]) => [a, { value }]));
  const numbers = (a) => {
    const d = a.system.derived;
    return {
      level: d.level, hp: d.hitPoints.max, bab: d.baseAttackBonus, saves: d.saves, defense: d.defense.value, initiative: d.initiative,
      skills: Object.fromEntries(d.skills.map((s) => [`${s.key}${s.specialty ? `:${s.specialty}` : ""}`, s.total])),
      features: a.items.filter((i) => i.type === "feature").map((i) => i.name).sort(),
    };
  };
  const hero = await Actor.implementation.create({ name: "Upgraded hero", type: "character", system: { abilities: abilities({ str: 14, dex: 13, con: 12, int: 10, wis: 15, cha: 8 }) } });
  await hero.createEmbeddedDocuments("Item", [
    await take("classes", "Strong Hero", { level: 3 }), await take("classes", "Soldier", { level: 2 }),
    await take("species", "Elf"), await take("occupations", "Criminal"),
    await take("feats", "Alertness"), await take("feats", "Personal Firearms Proficiency"), await take("talents", "Melee Smash"),
    await take("equipment", "Colt Python (.357 revolver)"), await take("equipment", "Leather jacket", { equipped: true }),
  ]);
  const caster = await Actor.implementation.create({ name: "Upgraded mage", type: "character", system: { abilities: abilities({ str: 8, dex: 12, con: 10, int: 16, wis: 12, cha: 14 }) } });
  await caster.createEmbeddedDocuments("Item", [await take("classes", "Smart Hero", { level: 3 }), await take("classes", "Mage", { level: 1 }), await take("feats", "Iron Will")]);
  await wait(() => hero.items.some((i) => i.type === "feature") && caster.items.some((i) => i.type === "feature"), "class features", 20000);
  const wolf = await Actor.implementation.create((await doc("creatures", "Wolf")).toObject());
  await wolf.update({ "system.hp.value": 4 });
  await new Promise((r) => setTimeout(r, 500));
  const before = { hero: numbers(hero), caster: numbers(caster), wolf: wolf.system.hp.value };
  // As an older version left them: a feat without its effect, a character without one of its class features.
  const alertness = hero.items.find((i) => i.name === "Alertness");
  await alertness.deleteEmbeddedDocuments("ActiveEffect", alertness.effects.map((e) => e.id));
  const feature = caster.items.find((i) => i.type === "feature");
  await feature.delete();
  await game.settings.set("modern20", "syncedVersion", "an older version");
  return before;
}

/** On this version: the same world after the startup update. */
async function CHECK(before) {
  const { wait, readable } = window.m20test;
  const errors = [];
  try {
    await wait(() => game.settings.get("modern20", "syncedVersion") === game.system.version, "the startup update", 30000);
  } catch (e) { errors.push(e.message); }
  const same = (what, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) errors.push(`${what}: ${JSON.stringify(a)} before, ${JSON.stringify(b)} after`); };
  for (const key of ["hero", "caster"]) {
    const actor = game.actors.getName(key === "hero" ? "Upgraded hero" : "Upgraded mage");
    if (!actor) { errors.push(`the ${key} is missing`); continue; }
    try {
      await wait(() => actor.items.filter((i) => i.type === "feature").length === before[key].features.length, `the ${key}'s class features restored`, 15000);
    } catch (e) { errors.push(e.message); }
    const d = actor.system.derived;
    const now = {
      level: d.level, hp: d.hitPoints.max, bab: d.baseAttackBonus, saves: d.saves, defense: d.defense.value, initiative: d.initiative,
      skills: Object.fromEntries(d.skills.map((s) => [`${s.key}${s.specialty ? `:${s.specialty}` : ""}`, s.total])),
      features: actor.items.filter((i) => i.type === "feature").map((i) => i.name).sort(),
    };
    for (const k of Object.keys(before[key])) same(`${actor.name}'s ${k}`, before[key][k], now[k]);
    // Every tab of its sheet draws, with nothing a reader would see as broken.
    await actor.sheet.render({ force: true });
    await wait(() => actor.sheet.rendered, `${actor.name}'s sheet`);
    for (const tab of ["main", "skills", "feats", "gear", "magic", "effects", "details", "log"]) {
      actor.sheet.changeTab(tab, "primary");
      await new Promise((r) => setTimeout(r, 200));
      const shown = actor.sheet.element.querySelector(`section.tab[data-tab="${tab}"]`);
      if (!shown) errors.push(`${actor.name}: no ${tab} tab`);
      else for (const bad of readable(shown)) errors.push(`${actor.name}'s ${tab} tab shows ${bad}`);
    }
    await actor.sheet.close();
  }
  const wolf = game.actors.getName("Wolf");
  if (wolf?.system.hp.value !== before.wolf) errors.push(`the wolf's hit points: ${wolf?.system.hp.value}, not ${before.wolf}`);
  await wolf?.sheet.render({ force: true });
  await wait(() => wolf?.sheet.rendered, "the wolf's sheet");
  for (const bad of readable(wolf.sheet.element)) errors.push(`the wolf's sheet shows ${bad}`);
  await wolf?.sheet.close();
  return errors;
}

async function main() {
  const tag = process.argv[2] ?? git("tag", "--list", "release-*", "--sort=-v:refname").split("\n")[0];
  if (!tag) fail("no release tag to upgrade from");
  console.log(`checking out and building ${tag}...`);
  const release = checkout(tag);
  const problems = [];
  let errors = [];
  const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
  try {
    // The world on the release.
    prepare(release);
    freshWorld(WORLD, "Modern20 Upgrade Test");
    let server = await startServer(WORLD);
    let page = await join(browser, "Gamemaster", problems, { label: `${tag}: ` });
    await page.evaluate(`(${PRELUDE.toString()})()`);
    console.log(`[${elapsed()}] making the world on ${tag}...`);
    const before = await page.evaluate(`(${MAKE.toString()})()`);
    await page.close();
    await stopServer(server);
    // The same world on this version.
    prepare(REPO);
    server = await startServer(WORLD, { append: true });
    console.log(`[${elapsed()}] opening it on this version...`);
    page = await join(browser, "Gamemaster", problems, { label: "this version: " });
    await page.evaluate(`(${PRELUDE.toString()})()`);
    errors = await page.evaluate(`(${CHECK.toString()})(${JSON.stringify(before)})`);
    await page.close();
    await stopServer(server);
  } catch (e) {
    errors.push(`threw: ${e.message.split("\n")[0]}`);
  } finally {
    await browser.close();
    prepare(REPO);
  }
  const all = [...errors, ...problems];
  console.log(all.length ? `\n✖ upgrading from ${tag}\n${all.map((e) => `    ${e}`).join("\n")}` : `\n✔ upgrading from ${tag}: the world comes back the same [${elapsed()}]`);
  process.exit(all.length ? 1 : 0);
}

main().catch((e) => fail(e.stack ?? e.message));
