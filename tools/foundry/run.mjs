/**
 * Tests in Foundry itself: `npm run test:foundry`.
 *
 * Starts Foundry's server from a local install, headless, on a test data folder of its own (never
 * your real worlds), launches a fresh test world on this system, joins it as the Gamemaster in
 * Chromium, runs the checks in checks.mjs inside the game, and shuts everything down. It fails on
 * a check that fails, and on any error or warning in the browser's console that is not one of the
 * known harmless ones (a headless browser has no graphics card).
 *
 * Needs, each found by default beside this repository or overridden by an environment variable:
 *
 *   FOUNDRY_DIR        the Foundry install (the Linux build): ../FoundryVTT-Linux-14.368
 *   FOUNDRY_TEST_DATA  the test data folder, made if missing: ../foundry-test-data
 *   FOUNDRY_LICENSE    an activated license.json: ~/.local/share/FoundryVTT/Config/license.json
 *   CHROMIUM           the browser: /usr/bin/chromium
 *   FOUNDRY_CHECK      run only the checks whose names contain this (and take no screenshots)
 *   FOUNDRY_SCREENSHOTS  0 to take no screenshots of the sheets (screenshots.mjs); 1 to take them
 *                      even with FOUNDRY_CHECK (FOUNDRY_CHECK=none FOUNDRY_SCREENSHOTS=1: only them)
 *
 * The server runs on the desktop app's own Node (ELECTRON_RUN_AS_NODE), which meets Foundry's
 * Node version; headless.mjs stops Foundry taking it for the desktop app.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { CHECKS, PRELUDE } from "./checks.mjs";
import { SETUP, SHOW } from "./screenshots.mjs";
import * as PLAYERS from "./players.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const FOUNDRY = process.env.FOUNDRY_DIR ?? path.resolve(repo, "../FoundryVTT-Linux-14.368");
const DATA = process.env.FOUNDRY_TEST_DATA ?? path.resolve(repo, "../foundry-test-data");
const LICENSE = process.env.FOUNDRY_LICENSE ?? path.join(os.homedir(), ".local/share/FoundryVTT/Config/license.json");
const BROWSER = process.env.CHROMIUM ?? "/usr/bin/chromium";
const PORT = Number(process.env.FOUNDRY_TEST_PORT ?? 30123);
const WORLD = "modern20-test";
const URL = `http://localhost:${PORT}`;

/** Console messages a headless browser always gives, which say nothing about the system. */
const HARMLESS = [/hardware acceleration/i, /GL Driver Message/i, /WebGL/i, /GPU stall/i];

function fail(message) {
  console.error(`test:foundry: ${message}`);
  process.exit(1);
}

/** The test data folder: its config, a copy of the licence, this repository as the system, and a fresh test world. */
function prepare() {
  if (!fs.existsSync(path.join(FOUNDRY, "foundryvtt"))) fail(`no Foundry install at ${FOUNDRY} (set FOUNDRY_DIR)`);
  if (!fs.existsSync(LICENSE)) fail(`no activated license.json at ${LICENSE} (set FOUNDRY_LICENSE)`);
  if (!fs.existsSync(BROWSER)) fail(`no Chromium at ${BROWSER} (set CHROMIUM)`);
  for (const dir of ["Config", "Data/systems", "Data/worlds"]) fs.mkdirSync(path.join(DATA, dir), { recursive: true });
  fs.copyFileSync(LICENSE, path.join(DATA, "Config/license.json"));
  fs.writeFileSync(path.join(DATA, "Config/options.json"), JSON.stringify({
    dataPath: DATA, port: PORT, upnp: false, telemetry: false, noBackups: true, language: "en.core", updateChannel: "stable", world: null,
  }, null, 2));
  const link = path.join(DATA, "Data/systems/modern20");
  fs.rmSync(link, { recursive: true, force: true });
  fs.symlinkSync(repo, link);
  // A fresh world each run, so one run's leftovers never decide the next.
  const world = path.join(DATA, "Data/worlds", WORLD);
  fs.rmSync(world, { recursive: true, force: true });
  fs.mkdirSync(world, { recursive: true });
  fs.writeFileSync(path.join(world, "world.json"), JSON.stringify({
    id: WORLD, title: "Modern20 Test", system: "modern20", coreVersion: "14", compatibility: { minimum: "14", verified: "14" },
    description: "Made by npm run test:foundry, and remade each run. Safe to delete.",
  }, null, 2));
}

/** Start Foundry's server and wait until its join page answers. */
async function startServer() {
  const log = fs.openSync(path.join(DATA, "server.log"), "w");
  const server = spawn(path.join(FOUNDRY, "foundryvtt"), [
    "--import", path.join(here, "headless.mjs"), path.join(FOUNDRY, "resources/app/main.js"),
    `--dataPath=${DATA}`, `--port=${PORT}`, `--world=${WORLD}`, "--noupnp", "--nobackups",
  ], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: ["ignore", log, log] });
  for (let i = 0; i < 90; i++) {
    if (server.exitCode !== null) fail(`Foundry stopped while starting; see ${path.join(DATA, "server.log")}`);
    try {
      if ((await fetch(`${URL}/join`)).ok) return server;
    } catch { /* not listening yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  server.kill();
  fail("Foundry did not start within 90 seconds");
}

/** Time since the run began, for the progress lines. */
const started = Date.now();
const elapsed = () => `${((Date.now() - started) / 1000).toFixed(0)}s`;

async function main() {
  // FOUNDRY_CHECK="sheet" runs only the checks whose names contain it.
  const only = process.env.FOUNDRY_CHECK?.toLowerCase();
  prepare();
  console.log(`starting Foundry (${FOUNDRY}) on port ${PORT}...`);
  const server = await startServer();
  // Foundry is stopped however the run ends, an interruption included.
  const stop = () => { try { server.kill(); } catch { /* already gone */ } };
  process.on("exit", stop);
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stop(); process.exit(130); });
  console.log(`[${elapsed()}] joining the test world as the Gamemaster...`);
  const browser = await chromium.launch({ executablePath: BROWSER, headless: true });
  const problems = [];
  let failed = 0, ran = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on("console", (m) => {
      if (!["error", "warning"].includes(m.type())) return;
      if (!HARMLESS.some((r) => r.test(m.text()))) problems.push(`${m.type()}: ${m.text()}`);
    });
    page.on("pageerror", (e) => problems.push(`uncaught: ${e.message}`));
    await page.goto(`${URL}/join`, { waitUntil: "networkidle" });
    await page.fill("input[name=username]", "Gamemaster");
    await page.click("button[name=join]");
    await page.waitForFunction(() => window.game?.ready === true, null, { timeout: 90000 });
    // Rolls go straight to chat, without asking for a modifier.
    await page.evaluate(() => game.settings.set("modern20", "askBeforeRolling", false));
    await page.evaluate(`(${PRELUDE.toString()})()`);
    console.log(`[${elapsed()}] in the game\n`);

    const chosen = Object.entries(CHECKS).filter(([n]) => !only || n.toLowerCase().includes(only));
    ran = chosen.length;
    for (const [name, check] of chosen) {
      const before = problems.length;
      let errors;
      try {
        // A check written as a named method (`async "name"() {}`) is sent as a plain function.
        const source = check.toString().replace(/^async\s+"[^"]*"\s*\(/, "async function (");
        // Each check gets five minutes (one run alone loads the compendiums cold): one that hangs (a dialog
        // left open) fails rather than stalling the run.
        errors = await Promise.race([
          page.evaluate(`(${source})()`),
          new Promise((_, reject) => setTimeout(() => reject(new Error("took longer than 5 minutes")), 300000)),
        ]);
      } catch (e) {
        errors = [`threw: ${e.message.split("\n")[0]}`];
      }
      const logged = problems.slice(before);
      if (errors.length || logged.length) {
        failed++;
        console.log(`✖ ${name}`);
        for (const e of [...errors, ...logged]) console.log(`    ${e}`);
      } else console.log(`✔ ${name} [${elapsed()}]`);
    }
    // A second player in a browser of their own (players.mjs), unless the checks run are chosen otherwise.
    const playerCheck = "a player in their own browser: their character works, the GM's and others' do not, and the logs record them once";
    if (!only || playerCheck.toLowerCase().includes(only)) {
      ran++;
      const before = problems.length;
      let errors = [];
      try {
        const ids = await page.evaluate(`(${PLAYERS.SETUP.toString()})()`);
        const player = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
        // The refusal the check provokes (damage to a creature the player does not own) is expected.
        const expected = /can change its hit points/;
        player.on("console", (m) => {
          if (["error", "warning"].includes(m.type()) && !HARMLESS.some((r) => r.test(m.text())) && !expected.test(m.text())) problems.push(`player's ${m.type()}: ${m.text()}`);
        });
        player.on("pageerror", (e) => problems.push(`player's uncaught: ${e.message}`));
        await player.goto(`${URL}/join`, { waitUntil: "networkidle" });
        await player.fill("input[name=username]", "Player");
        await player.click("button[name=join]");
        await player.waitForFunction(() => window.game?.ready === true, null, { timeout: 90000 });
        errors.push(...await player.evaluate(`(${PLAYERS.AS_PLAYER.toString()})(${JSON.stringify(ids)})`));
        errors.push(...await page.evaluate(`(${PLAYERS.AFTER.toString()})(${JSON.stringify(ids)})`));
        await player.close();
      } catch (e) {
        errors.push(`threw: ${e.message.split("\n")[0]}`);
      }
      const logged = problems.slice(before);
      if (errors.length || logged.length) {
        failed++;
        console.log(`✖ ${playerCheck}`);
        for (const e of [...errors, ...logged]) console.log(`    ${e}`);
      } else console.log(`✔ ${playerCheck} [${elapsed()}]`);
    }

    // Pictures of the sheets, for a person to look over (screenshots.mjs).
    if (process.env.FOUNDRY_SCREENSHOTS === "1" || (process.env.FOUNDRY_SCREENSHOTS !== "0" && !only)) {
      const dir = path.join(DATA, "screenshots");
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const sheets = await page.evaluate(`(${SETUP.toString()})()`);
      for (const { name, uuid, tabs } of sheets) {
        for (const tab of tabs.length ? tabs : [null]) {
          const id = await page.evaluate(`(${SHOW.toString()})(${JSON.stringify([uuid, tab])})`);
          await page.waitForTimeout(400);
          await page.locator(`[id="${id}"]`).screenshot({ path: path.join(dir, `${name}${tab ? `-${tab}` : ""}.png`), animations: "disabled", timeout: 30000 });
        }
      }
      await page.locator("#chat").screenshot({ path: path.join(dir, "chat.png") }).catch(() => {});
      console.log(`\nscreenshots: ${dir}`);
    }
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(failed ? `\n${failed} of ${ran} checks failed` : `\nall ${ran} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => fail(e.stack ?? e.message));
