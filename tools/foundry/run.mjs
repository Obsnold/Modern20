/**
 * Tests in Foundry itself: `npm run test:foundry`.
 *
 * Starts Foundry's server from a local install, headless, on a test data folder of its own (never
 * your real worlds), launches a fresh test world on this system, joins it as the Gamemaster in
 * Chromium, runs the checks in checks.mjs inside the game, and shuts everything down. It fails on
 * a check that fails, and on any error or warning in the browser's console that is not one of the
 * known harmless ones (a headless browser has no graphics card). What it needs is in harness.mjs.
 *
 *   FOUNDRY_CHECK      run only the checks whose names contain this, or any of several separated by
 *                      "|" (and take no screenshots)
 *   FOUNDRY_SCREENSHOTS  0 to take no screenshots of the sheets (screenshots.mjs); 1 to take them
 *                      even with FOUNDRY_CHECK (FOUNDRY_CHECK=none FOUNDRY_SCREENSHOTS=1: only them)
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { CHECKS, PRELUDE } from "./checks.mjs";
import { SETUP, SHOW } from "./screenshots.mjs";
import * as PLAYERS from "./players.mjs";
import { FOUNDRY, DATA, BROWSER, BROWSER_ARGS, PORT, prepare, freshWorld, startServer, stopServer, join, elapsed, fail } from "./harness.mjs";

const WORLD = "modern20-test";

async function main() {
  // FOUNDRY_CHECK="sheet" runs only the checks whose names contain it.
  const only = process.env.FOUNDRY_CHECK?.toLowerCase();
  const chosenBy = (name) => !only || only.split("|").some((o) => name.toLowerCase().includes(o.trim()));
  prepare();
  freshWorld(WORLD, "Modern20 Test");
  console.log(`starting Foundry (${FOUNDRY}) on port ${PORT}...`);
  const server = await startServer(WORLD);
  console.log(`[${elapsed()}] joining the test world as the Gamemaster...`);
  const browser = await chromium.launch({ executablePath: BROWSER, headless: true, args: BROWSER_ARGS });
  const problems = [];
  let failed = 0, ran = 0;
  try {
    // What checks provoke on purpose is expected: the write one refuses ("refused (test)") and the error the system
    // then reports, and a caster level above the maker's own refused.
    const page = await join(browser, "Gamemaster", problems, { expected: /refused \(test\)|a caster level no higher than/ });
    // Rolls go straight to chat, without asking for a modifier.
    await page.evaluate(() => game.settings.set("modern20", "askBeforeRolling", false));
    await page.evaluate(`(${PRELUDE.toString()})()`);
    console.log(`[${elapsed()}] in the game\n`);

    const chosen = Object.entries(CHECKS).filter(([n]) => chosenBy(n));
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
    const playerCheck = "a player in their own browser: their character works, the GM's and others' do not, the logs record them once, rolls made at once by both are all logged, and a dying save card comes once";
    if (chosenBy(playerCheck)) {
      ran++;
      const before = problems.length;
      let errors = [];
      try {
        const ids = await page.evaluate(`(${PLAYERS.SETUP.toString()})()`);
        // The refusal the check provokes (damage to a creature the player does not own) is expected.
        const player = await join(browser, "Player", problems, { label: "player's ", expected: /can change its hit points/ });
        errors.push(...await player.evaluate(`(${PLAYERS.AS_PLAYER.toString()})(${JSON.stringify(ids)})`));
        // Both rolling for the same character at once.
        const together = `(${PLAYERS.TOGETHER.toString()})(${JSON.stringify(ids)})`;
        for (const e of await Promise.all([page.evaluate(together), player.evaluate(together)])) errors.push(...e);
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
    // Stopped, and waited for: a run straight after (the upgrade test) must not find it still shutting down.
    await stopServer(server);
  }
  console.log(failed ? `\n${failed} of ${ran} checks failed` : `\nall ${ran} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => fail(e.stack ?? e.message));
