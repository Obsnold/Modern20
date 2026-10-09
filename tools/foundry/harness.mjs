/**
 * What the Foundry tests share (run.mjs, upgrade.mjs): the test data folder, a world in it, Foundry's
 * server started headless on it, and a browser joining as a user, with the console watched.
 *
 * Needs, each found by default beside this repository or overridden by an environment variable:
 *
 *   FOUNDRY_DIR        the Foundry install (the Linux build): ../FoundryVTT-Linux-14.368
 *   FOUNDRY_TEST_DATA  the test data folder, made if missing: ../foundry-test-data
 *   FOUNDRY_LICENSE    an activated license.json: ~/.local/share/FoundryVTT/Config/license.json
 *   CHROMIUM           the browser: /usr/bin/chromium
 *
 * The server runs on the desktop app's own Node (ELECTRON_RUN_AS_NODE), which meets Foundry's
 * Node version; headless.mjs stops Foundry taking it for the desktop app.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(here, "../..");
export const FOUNDRY = process.env.FOUNDRY_DIR ?? path.resolve(REPO, "../FoundryVTT-Linux-14.368");
export const DATA = process.env.FOUNDRY_TEST_DATA ?? path.resolve(REPO, "../foundry-test-data");
const LICENSE = process.env.FOUNDRY_LICENSE ?? path.join(os.homedir(), ".local/share/FoundryVTT/Config/license.json");
export const BROWSER = process.env.CHROMIUM ?? "/usr/bin/chromium";
/**
 * The browser's flags: the machine's GPU through Vulkan. Headless, Chromium otherwise draws Foundry's canvas in
 * software (SwiftShader), which keeps the page so busy that every reply from the server waits about a second.
 */
export const BROWSER_ARGS = ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=vulkan", "--enable-features=Vulkan"];
export const PORT = Number(process.env.FOUNDRY_TEST_PORT ?? 30123);
export const URL = `http://localhost:${PORT}`;

/** Console messages a headless browser always gives, which say nothing about the system. */
export const HARMLESS = [/hardware acceleration/i, /GL Driver Message/i, /WebGL/i, /GPU stall/i];

export function fail(message) {
  console.error(`test:foundry: ${message}`);
  process.exit(1);
}

/** Time since the run began, for the progress lines. */
const started = Date.now();
export const elapsed = () => `${((Date.now() - started) / 1000).toFixed(0)}s`;

/** The test data folder: its config, a copy of the licence, and `system` (this repository, or another version of it) as the system. */
export function prepare(system = REPO) {
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
  fs.symlinkSync(system, link);
}

/** A new, empty world on the system, replacing any of the same id, so one run's leftovers never decide the next. */
export function freshWorld(id, title) {
  const world = path.join(DATA, "Data/worlds", id);
  fs.rmSync(world, { recursive: true, force: true });
  fs.mkdirSync(world, { recursive: true });
  fs.writeFileSync(path.join(world, "world.json"), JSON.stringify({
    id, title, system: "modern20", coreVersion: "14", compatibility: { minimum: "14", verified: "14" },
    description: "Made by the system's Foundry tests, and remade each run. Safe to delete.",
  }, null, 2));
}

/**
 * Start Foundry's server on `world` and wait until its join page answers. Stopped when the process
 * exits. Its log is server.log in the test data folder: begun afresh, or with `append` added to.
 */
export async function startServer(world, { append = false } = {}) {
  const log = fs.openSync(path.join(DATA, "server.log"), append ? "a" : "w");
  const server = spawn(path.join(FOUNDRY, "foundryvtt"), [
    "--import", path.join(here, "headless.mjs"), path.join(FOUNDRY, "resources/app/main.js"),
    `--dataPath=${DATA}`, `--port=${PORT}`, `--world=${world}`, "--noupnp", "--nobackups",
  ], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: ["ignore", log, log] });
  const stop = () => { try { server.kill(); } catch { /* already gone */ } };
  process.on("exit", stop);
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stop(); process.exit(130); });
  for (let i = 0; i < 90; i++) {
    if (server.exitCode !== null) fail(`Foundry stopped while starting; see ${path.join(DATA, "server.log")}`);
    try {
      if ((await fetch(`${URL}/join`)).ok) return server;
    } catch { /* not listening yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  stop();
  fail("Foundry did not start within 90 seconds");
}

/** Stop the server and wait for it to go, so the world's files are closed. */
export async function stopServer(server) {
  if (server.exitCode !== null) return;
  const gone = new Promise((r) => server.once("exit", r));
  server.kill();
  await gone;
}

/**
 * A new page in `browser`, joined to the game as `user`. Errors and warnings in its console that are
 * not harmless (or `expected`) go into `problems`, each marked with `label`.
 */
export async function join(browser, user, problems, { label = "", expected = null } = {}) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on("console", (m) => {
    if (!["error", "warning"].includes(m.type()) || HARMLESS.some((r) => r.test(m.text())) || expected?.test(m.text())) return;
    problems.push(`${label}${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`${label}uncaught: ${e.message}${process.env.FOUNDRY_STACKS ? `\n${e.stack}` : ""}`));
  await page.goto(`${URL}/join`, { waitUntil: "networkidle" });
  await page.fill("input[name=username]", user);
  await page.click("button[name=join]");
  await page.waitForFunction(() => window.game?.ready === true, null, { timeout: 90000 });
  return page;
}
