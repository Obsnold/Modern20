import { runSelfTest } from "../selftest.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The self-test, and what it found.
 *
 * A window rather than a console dump, because the person who needs to read
 * this is the GM whose tokens look wrong — not somebody with the developer
 * tools open. Every row says what was asked and, where it failed, what was
 * expected and what was there instead: the useful thing to paste back is a
 * failure with both numbers in it.
 */
export class Modern20SelfTest extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "modern20-selftest",
    classes: ["modern20", "selftest"],
    position: { width: 640, height: 680 },
    window: {
      title: "MODERN20.SelfTest.Title",
      icon: "fa-solid fa-stethoscope",
      resizable: true
    },
    actions: {
      run: Modern20SelfTest.#onRun,
      copy: Modern20SelfTest.#onCopy
    }
  };

  static PARTS = {
    body: {
      template: "systems/modern20/templates/apps/selftest.hbs",
      scrollable: [".m20-selftest__scroll"]
    }
  };

  #results = null;
  #running = false;

  static show() {
    const existing = foundry.applications.instances.get("modern20-selftest");
    if (existing) return existing.render({ force: true });
    return new Modern20SelfTest().render({ force: true });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.running = this.#running;
    context.ran = Boolean(this.#results);
    context.passed = this.#results?.passed ?? 0;
    context.failed = this.#results?.failed ?? 0;

    // Grouped in the order they ran, failures first inside each group: a
    // report read top to bottom should reach the bad news early.
    const groups = new Map();
    for (const row of this.#results?.rows ?? []) {
      if (!groups.has(row.group)) groups.set(row.group, []);
      groups.get(row.group).push(row);
    }
    context.groups = [...groups].map(([name, rows]) => ({
      name,
      failed: rows.filter((row) => !row.passed).length,
      rows: [...rows].sort((a, b) => Number(a.passed) - Number(b.passed))
    }));
    return context;
  }

  /** Run it, rendering once to show that it started and once with results. */
  async run() {
    if (this.#running) return;
    this.#running = true;
    this.#results = null;
    await this.render();
    try {
      this.#results = await runSelfTest();
    } finally {
      this.#running = false;
      await this.render();
    }
  }

  static async #onRun() {
    return this.run();
  }

  /** The failures as text, which is the thing worth sending to somebody. */
  static async #onCopy() {
    const failures = (this.#results?.rows ?? []).filter((row) => !row.passed);
    const report = [
      `Modern20 ${game.system.version} self-test: `
        + `${this.#results?.passed ?? 0} passed, ${this.#results?.failed ?? 0} failed`,
      ...failures.map((row) => `[${row.group}] ${row.name}`
        + (row.detail ? ` — ${row.detail}` : ""))
    ].join("\n");

    try {
      await game.clipboard.copyPlainText(report);
      ui.notifications.info(game.i18n.localize("MODERN20.SelfTest.Copied"));
    } catch (error) {
      // A clipboard that refuses is not a failure worth hiding the report
      // behind: the console still has it.
      console.warn("modern20 | could not copy the self-test report", error);
      console.log(report);
      ui.notifications.warn(game.i18n.localize("MODERN20.SelfTest.CopyFailed"));
    }
  }
}

/**
 * The entry in the settings menu, so this is findable without a macro.
 *
 * Foundry opens a registered menu by constructing the class it is given, which
 * is why this is a shim rather than the application itself: the application is
 * a plain window, and the menu wants something that renders on construction.
 */
export class Modern20SelfTestMenu extends foundry.applications.api.ApplicationV2 {
  constructor(...args) {
    super(...args);
    Modern20SelfTest.show();
  }

  async render() { return this; }
}
