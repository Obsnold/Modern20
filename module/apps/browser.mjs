import { MODERN20 } from "../config.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * One window over every compendium the system ships.
 *
 * The packs hold 1,590 documents, and Foundry's own compendium browser is one
 * pack at a time with a name search. That is enough for a bestiary and not for
 * an equipment list: what a d20 Modern table asks is "what can this character
 * afford", "what is legal to carry", "what exists at this progress level" —
 * three questions about fields every purchasable document already stores and
 * nothing could sort on.
 *
 * The index is what is searched, never the documents: a pack's index is a
 * handful of fields per entry and is already in memory, where getDocuments on
 * thirteen packs is 1,590 documents built to read a purchase DC off each.
 */
export class Modern20Browser extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "modern20-browser",
    classes: ["modern20", "browser"],
    position: { width: 780, height: 680 },
    window: {
      title: "MODERN20.Browser.Title",
      icon: "fa-solid fa-magnifying-glass",
      resizable: true
    },
    actions: {
      clearFilters: Modern20Browser.#onClearFilters,
      openEntry: Modern20Browser.#onOpenEntry
    }
  };

  static PARTS = {
    body: {
      template: "systems/modern20/templates/apps/browser.hbs",
      scrollable: [".m20-browser__scroll"]
    }
  };

  /** The packs this searches, in the order a reader thinks about them. */
  static PACKS = [
    "weapons", "armor", "gear", "fx", "vehicles", "objects",
    "feats", "talents", "classes", "occupations", "spells", "psionics", "creatures"
  ];

  /**
   * The index fields the filters need. `getIndex` returns names and images
   * without being asked; everything else has to be named.
   */
  static FIELDS = [
    "system.purchaseDC", "system.restriction", "system.progressLevel",
    "system.source", "system.category"
  ];

  /** At most this many rows are drawn, because a table nobody scrolls is cost. */
  static LIMIT = 300;

  #filters = { text: "", pack: "", book: "", wealth: "", restriction: "", progress: "" };
  #rows = null;

  /** One window, reopened rather than stacked up. */
  static show() {
    const existing = foundry.applications.instances.get("modern20-browser");
    if (existing) return existing.render({ force: true });
    return new Modern20Browser().render({ force: true });
  }

  /**
   * Every entry of every system pack, flattened once per open.
   *
   * A pack the world has removed is skipped rather than thrown over: a module
   * may unregister one, and a browser that dies on a missing pack is worse
   * than one that shows the rest.
   */
  async #index() {
    if (this.#rows) return this.#rows;

    const rows = [];
    for (const name of Modern20Browser.PACKS) {
      const pack = game.packs.get(`modern20.${name}`);
      if (!pack) continue;

      const index = await pack.getIndex({ fields: Modern20Browser.FIELDS });
      for (const entry of index) {
        const system = entry.system ?? {};
        rows.push({
          uuid: entry.uuid,
          name: entry.name,
          img: entry.img,
          pack: name,
          packLabel: pack.title,
          documentName: pack.documentName,
          type: entry.type ?? "",
          book: system.source ?? "",
          category: system.category ?? "",
          purchaseDC: Number.isFinite(system.purchaseDC) ? system.purchaseDC : null,
          restriction: system.restriction ?? "",
          progressLevel: system.progressLevel ?? 0
        });
      }
    }

    rows.sort((one, other) => one.name.localeCompare(other.name));
    this.#rows = rows;
    return rows;
  }

  /** What the filters leave. */
  #matching(rows) {
    const { text, pack, book, wealth, restriction, progress } = this.#filters;
    const wanted = text.trim().toLowerCase();
    const affordable = wealth === "" ? null : Number(wealth);

    return rows.filter((row) => {
      if (wanted && !row.name.toLowerCase().includes(wanted)) return false;
      if (pack && row.pack !== pack) return false;
      // The core book is spelled two ways — "d20 Modern SRD" on the equipment
      // and "d20 Modern" on the magic items — so a book matches on either.
      if (book && !row.book.startsWith(book)) return false;
      if (restriction && row.restriction !== restriction) return false;
      if (progress !== "" && String(row.progressLevel) !== progress) return false;
      // "If the character's Wealth bonus is equal to or greater than the
      // purchase DC, the character can purchase the object automatically."
      // Something with no purchase DC is not something a Wealth bonus buys.
      if (affordable !== null && (row.purchaseDC === null || row.purchaseDC > affordable)) {
        return false;
      }
      return true;
    });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const rows = await this.#index();
    const matching = this.#matching(rows);

    context.filters = this.#filters;
    context.rows = matching.slice(0, Modern20Browser.LIMIT);
    context.total = rows.length;
    context.found = matching.length;
    context.truncated = matching.length > Modern20Browser.LIMIT;
    context.limit = Modern20Browser.LIMIT;
    context.restrictions = MODERN20.restrictions;
    context.packs = Modern20Browser.PACKS
      .filter((name) => game.packs.get(`modern20.${name}`))
      .map((name) => ({ name, label: game.packs.get(`modern20.${name}`).title }));
    // The books as the documents name them, rather than a list written here:
    // a world that adds a pack of its own shows up in the filter.
    context.books = [...new Set(rows.map((row) => row.book).filter(Boolean))]
      .sort((one, other) => one.localeCompare(other));
    // Progress levels, which only d20 Future states: zero is the modern day.
    context.progressLevels = [...new Set(rows.map((row) => row.progressLevel))]
      .filter((level) => level)
      .sort((one, other) => one - other)
      // As strings, because the filter they are compared against is the value
      // of a select and a select's value is a string.
      .map(String);
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);

    for (const field of this.element.querySelectorAll("[data-filter]")) {
      const event = field.tagName === "INPUT" && field.type !== "number" ? "input" : "change";
      field.addEventListener(event, () => {
        this.#filters[field.dataset.filter] = field.value;
        this.render();
      });
    }

    // Dragged onto a sheet or the canvas, which is what a browser is for.
    // Foundry's own drop handlers read a type and a uuid and fetch the rest.
    for (const row of this.element.querySelectorAll("[data-uuid][draggable]")) {
      row.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("text/plain", JSON.stringify({
          type: row.dataset.documentName,
          uuid: row.dataset.uuid
        }));
      });
    }
  }

  static async #onClearFilters() {
    for (const key of Object.keys(this.#filters)) this.#filters[key] = "";
    await this.render();
  }

  static async #onOpenEntry(event, target) {
    const entry = await foundry.utils.fromUuid(target.dataset.uuid);
    entry?.sheet?.render({ force: true });
  }
}
