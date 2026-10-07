/**
 * The checks `npm run test:foundry` runs inside the game (run.mjs). Each runs in the browser as
 * the Gamemaster and returns a list of what went wrong (empty when all is well). They are sent
 * to the page on their own, so each must be self-contained: no outside variables, and the
 * system's modules imported from the server where needed. PRELUDE runs first, and gives them
 * `window.m20test.take(pack, name, system)`: an item's data from a compendium, ready to add to
 * an actor (with its system data changed by `system`), found through the index so only that
 * document is loaded.
 *
 * They check what the Node tests cannot: that Foundry loads the data, applies the effects, draws
 * every sheet, and rolls and applies damage as the system expects.
 */
export async function PRELUDE() {
  window.m20test = {
    async doc(pack, name) {
      const p = game.packs.get(`modern20.${pack}`);
      const entry = (await p.getIndex()).find((e) => e.name === name);
      if (!entry) throw new Error(`${name} is not in ${pack}`);
      return p.getDocument(entry._id);
    },
    /** Wait until `test()` gives something truthy (polling), and return it; throw after `ms`. */
    async wait(test, what = "it", ms = 8000) {
      const until = Date.now() + ms;
      while (Date.now() < until) {
        const v = await test();
        if (v) return v;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error(`waited ${ms / 1000}s for ${what}`);
    },
    /** Click the element `selector` finds in `root` (a sheet's element), as a player would. */
    click(root, selector) {
      const el = root.querySelector(selector);
      if (!el) throw new Error(`nothing matches ${selector}`);
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      return el;
    },
    /**
     * What a reader would see wrong in `root`'s text: "undefined", "NaN", "[object Object]", a "null",
     * as visible text or in a box's value. Returns them, with a little of the text around each.
     */
    readable(root) {
      const bad = /\b(undefined|NaN|null)\b|\[object Object\]/g;
      const found = [];
      const text = root.innerText ?? "";
      for (const m of text.matchAll(bad)) found.push(`"${text.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g, " ").trim()}"`);
      for (const input of root.querySelectorAll("input, textarea")) if (bad.test(String(input.value))) found.push(`${input.name || input.dataset.itemField || "a box"} = ${input.value}`);
      return [...new Set(found)];
    },
    /**
     * Answer the dialog that opens (a roll's question): set its fields (`{ name: value }`, a tick box
     * by true or false), then press `button` ("ok", Roll). Returns the fields' labels, as shown.
     */
    async dialog(fields = {}, button = "ok") {
      const app = await window.m20test.wait(() => [...foundry.applications.instances.values()].find((a) => a instanceof foundry.applications.api.DialogV2 && a.rendered), "a dialog");
      const form = app.element.querySelector("form") ?? app.element;
      const labels = [...app.element.querySelectorAll("label")].map((l) => l.innerText.trim());
      const notes = [...app.element.querySelectorAll(".m20-roll-notes li")].map((l) => l.innerText.trim());
      for (const [name, value] of Object.entries(fields)) {
        const input = form.querySelector(`[name="${name}"]`);
        if (!input) throw new Error(`the dialog has no "${name}" (it has: ${labels.join("; ")})`);
        if (input.type === "checkbox") input.checked = !!value;
        else input.value = String(value);
      }
      app.element.querySelector(`button[data-action="${button}"]`).click();
      return { labels, notes };
    },
    /** Set a box on a sheet and let it save, as typing and leaving it would. */
    type(root, selector, value) {
      const input = root.querySelector(selector);
      if (!input) throw new Error(`nothing matches ${selector}`);
      input.value = String(value);
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return input;
    },
    /** The chat messages posted since `count` (game.messages.size before). */
    since(count) {
      return game.messages.contents.slice(count);
    },
    /**
     * Each pack's items (`packs`, by name) added at once to a character of their own: its numbers must be
     * numbers, every tab must draw with nothing a reader would see as broken, and every weapon's attack and damage must roll.
     */
    async everything(packs) {
      const errors = [];
      const { wait, readable } = window.m20test;
      const R = await import("/systems/modern20/module/rules/rolls.mjs");
      const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: 14 }]));
      for (const name of packs) {
        const pack = game.packs.get(`modern20.${name}`);
        const actor = await Actor.implementation.create({ name: `Everything: ${pack.metadata.label}`, type: "character", system: { abilities } });
        try {
          const items = (await pack.getDocuments()).map((d) => {
            const o = d.toObject();
            delete o._id;
            foundry.utils.setProperty(o, "_stats.compendiumSource", d.uuid);
            return o;
          });
          await actor.createEmbeddedDocuments("Item", items);
          const d = actor.system.derived;
          if (![d.level, d.baseAttackBonus, d.defense.value, d.hitPoints.max, ...Object.values(d.saves)].every(Number.isFinite)) errors.push(`${pack.metadata.label}: the character's numbers are not numbers`);
          await actor.sheet.render({ force: true });
          await wait(() => actor.sheet.rendered, `${pack.metadata.label}'s sheet`, 60000);
          for (const tab of ["main", "skills", "feats", "gear", "magic", "effects", "details", "log"]) {
            actor.sheet.changeTab(tab, "primary");
            await new Promise((r) => setTimeout(r, 100));
            for (const bad of readable(actor.sheet.element.querySelector(`section.tab[data-tab="${tab}"]`)).slice(0, 5)) errors.push(`${pack.metadata.label}, ${tab} tab: ${bad}`);
          }
          await actor.sheet.close();
          // Every weapon's attack and damage, as its buttons make them, rolled by Foundry (not posted: one card each would take minutes).
          for (const w of actor.items.filter((i) => i.type === "weapon")) {
            for (const spec of [R.attack(d, w, []), R.damage(d, w, {})].filter(Boolean)) {
              const roll = await new Roll(spec.formula).evaluate();
              if (!Number.isFinite(roll.total)) errors.push(`${w.name}: "${spec.formula}" did not roll`);
            }
          }
        } catch (e) {
          errors.push(`${pack.metadata.label}: ${e.message}`);
        }
        await actor.delete();
      }
      return errors;
    },
    async take(pack, name, system = {}) {
      const source = await window.m20test.doc(pack, name);
      const o = source.toObject();
      delete o._id;
      foundry.utils.mergeObject(o.system, system);
      // As dragging from a compendium records it: where the copy came from.
      foundry.utils.setProperty(o, "_stats.compendiumSource", source.uuid);
      return o;
    },
  };
}

export const CHECKS = {
  async "the compendiums load, and every document in them is valid"() {
    const errors = [];
    const packs = game.packs.filter((p) => p.metadata.packageName === "modern20");
    if (packs.length !== 14) errors.push(`${packs.length} compendiums, not 14`);
    for (const pack of packs) {
      const docs = await pack.getDocuments();
      if (!docs.length) errors.push(`${pack.collection} is empty`);
      if (pack.invalidDocumentIds?.size) errors.push(`${pack.collection}: ${pack.invalidDocumentIds.size} invalid documents`);
    }
    return errors;
  },

  async "the world's items were brought up to date for this version"() {
    const synced = game.settings.get("modern20", "syncedVersion");
    return synced === game.system.version ? [] : [`synced for "${synced}", not ${game.system.version}`];
  },

  async "Endeavour James: saves, skill bonuses, feats and Telepath's requirements"() {
    const errors = [];
    const { take } = window.m20test;
    const abilities = Object.fromEntries(Object.entries({ str: 12, dex: 17, con: 10, int: 14, wis: 5, cha: 18 }).map(([a, v]) => [a, { value: v }]));
    const actor = await Actor.implementation.create({
      name: "Endeavour James (test)", type: "character",
      system: { abilities, skills: { bluff: { ranks: 10 }, diplomacy: { ranks: 6 }, intimidate: { ranks: 10 }, disguise: { ranks: 8 }, gatherInformation: { ranks: 1 } } },
    });
    const items = [
      await take("classes", "Charismatic Hero", { level: 3 }), await take("classes", "Telepath", { level: 6 }),
      ...await Promise.all(["Archaic Weapons Proficiency", "Confident", "Deceptive", "Frightful Presence", "Heroic Surge", "Iron Will", "Lightning Reflexes", "Personal Firearms Proficiency", "Simple Weapons Proficiency", "Weapon Finesse"].map((n) => take("feats", n))),
      ...await Promise.all(["Fast-Talk", "Dazzle"].map((n) => take("talents", n))),
      await take("occupations", "Criminal"),
    ];
    await actor.createEmbeddedDocuments("Item", items);
    const d = actor.system.derived;
    const expect = (what, got, want) => { if (got !== want) errors.push(`${what}: ${got}, expected ${want}`); };
    expect("base attack", d.baseAttackBonus, 4);
    expect("Fortitude", d.saves.fort, 4);
    expect("Reflex", d.saves.ref, 9);
    expect("Will", d.saves.will, 5);
    expect("Defense", d.defense.value, 16);   // no armor: 10 + class 3 + Dex 3
    expect("Bluff", d.skills.find((r) => r.key === "bluff").total, 16);
    expect("Intimidate", d.skills.find((r) => r.key === "intimidate").total, 16);
    expect("feats allowed", d.advancement.feats.allowed, 10);
    const { classRequirements } = await import("/systems/modern20/module/rules/requirements.mjs");
    const telepath = actor.items.find((i) => i.name === "Telepath");
    const unmet = classRequirements(telepath, { d, feats: actor.items.filter((i) => i.type === "feat"), talents: actor.items.filter((i) => i.type === "talent"), occupation: null }).filter((r) => r.met === false).flatMap((r) => r.missing);
    expect("Telepath's unmet requirements", unmet.join("; "), "Gather Information 6 ranks; Wild Talent");
    // Fast-Talk is offered on Bluff, as a note worth his Charismatic level.
    const { notesOf, resolverFor } = await import("/systems/modern20/module/roll.mjs");
    const { notesFor, rollTargets } = await import("/systems/modern20/module/rules/rolls.mjs");
    const ticks = notesFor(notesOf(actor), rollTargets.skill(d.skills.find((r) => r.key === "bluff")), resolverFor(actor)).ticks;
    expect("Fast-Talk on Bluff", ticks.map((t) => `${t.term} ${t.value}`).join(), "Fast-Talk 3");
    await actor.delete();
    return errors;
  },

  async "species, talents and effects: the system's own change type, formulas, damage reduction"() {
    const errors = [];
    const { take, doc } = window.m20test;
    const elf = await doc("species", "Elf");
    const change = elf.effects.contents[0]?.changes?.[0];
    if (change?.type !== "modern20") errors.push(`the Elf's effect change is of type ${change?.type}, not modern20`);
    const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: a === "con" ? 16 : 10 }]));
    const actor = await Actor.implementation.create({ name: "Tough Elf (test)", type: "character", system: { abilities } });
    await actor.createEmbeddedDocuments("Item", [
      await take("species", "Elf"), await take("classes", "Tough Hero", { level: 6 }),
      ...await Promise.all(["Robust", "Damage Reduction 1/—", "Damage Reduction 2/—", "Fire Resistance"].map((n) => take("talents", n))),
    ]);
    const d = actor.system.derived;
    // The elf's Con 16 − 2 = 14: +2.
    if (d.skills.find((r) => r.key === "spot").total !== 2) errors.push(`Spot ${d.skills.find((r) => r.key === "spot").total}, expected 2 (Elf +2)`);
    if (d.defenses.dr[0]?.amount !== 2) errors.push(`damage reduction ${JSON.stringify(d.defenses.dr)}, expected 2/—`);
    if (d.defenses.resist.fire !== 2) errors.push(`fire resistance ${d.defenses.resist.fire}, expected 2 (Con +2)`);
    if (actor.system.bonuses.damageReduction !== 0) errors.push(`Foundry changed the damage reduction bonus itself (${actor.system.bonuses.damageReduction}); the system's type should be left to it`);
    // Robust: + Tough level (6) to hit points, worked out from its formula.
    const robust = actor.items.find((i) => i.name === "Robust");
    const before = d.hitPoints.max;
    await robust.delete();
    const without = actor.system.derived.hitPoints.max;
    if (before - without !== 6) errors.push(`Robust adds ${before - without} hit points, expected 6`);
    await actor.delete();
    return errors;
  },

  async "every sheet opens without error"() {
    const errors = [];
    const open = async (doc, label) => {
      try {
        await doc.sheet.render({ force: true });
        await new Promise((r) => setTimeout(r, 300));
        if (!doc.sheet.rendered) errors.push(`${label}: did not render`);
        await doc.sheet.close();
      } catch (e) {
        // The system's own lines of the stack, to say where it failed.
        const where = (e.stack ?? "").split("\n").filter((l) => l.includes("/systems/modern20/")).slice(0, 3).map((l) => l.trim().replace(/^at /, "")).join(" < ");
        errors.push(`${label}: ${e.message.split("\n").pop()}${where ? ` (${where})` : ""}`);
        try { await doc.sheet.close(); } catch { /* not open */ }
      }
    };
    // One item of each type, from the compendiums, found through their indexes.
    const seen = new Set();
    for (const pack of game.packs.filter((p) => p.metadata.packageName === "modern20" && p.documentName === "Item")) {
      for (const entry of await pack.getIndex({ fields: ["type"] })) {
        if (seen.has(entry.type)) continue;
        seen.add(entry.type);
        await open(await pack.getDocument(entry._id), `${entry.type} sheet (${entry.name})`);
      }
    }
    // A printed creature, a world copy of it in its edit view, and a character with something in every tab.
    const creature = await window.m20test.doc("creatures", "Bodak");
    await open(creature, "creature sheet (compendium)");
    const world = await Actor.implementation.create(creature.toObject());
    await open(world, "creature sheet (world)");
    world.sheet.editing = true;
    await open(world, "creature edit view");
    await world.delete();
    // A world item (a weapon with footnotes) in its edit view.
    const weapon = await Item.implementation.create(await window.m20test.take("equipment", "Colt Python (.357 revolver)"));
    await open(weapon, "weapon sheet (world)");
    weapon.sheet.editing = true;
    await open(weapon, "item edit view");
    await weapon.delete();
    const actor = await Actor.implementation.create({ name: "Sheet test", type: "character" });
    const { take } = window.m20test;
    await actor.createEmbeddedDocuments("Item", [
      await take("classes", "Telepath", { level: 2 }), await take("species", "Dwarf"), await take("occupations", "Criminal"),
      await take("equipment", "Beretta 92F (9mm autoloader)"), await take("equipment", "9mm"),
      await take("powers", "Daze"), await take("incantations", "Bibliolalia"),
    ]);
    for (const tab of ["main", "skills", "feats", "gear", "magic", "effects", "details", "log"]) {
      try {
        await actor.sheet.render({ force: true, tab });
        await new Promise((r) => setTimeout(r, 200));
        actor.sheet.changeTab(tab, "primary");
      } catch (e) {
        errors.push(`character sheet, ${tab} tab: ${e.message}`);
      }
    }
    if (!actor.sheet.rendered) errors.push("character sheet did not render");
    await actor.sheet.close();
    await actor.delete();
    return errors;
  },

  async "rolls post to chat, and damage applies through damage reduction"() {
    const errors = [];
    const { characterRolls } = await import("/systems/modern20/module/roll.mjs");
    const { applyToActor } = await import("/systems/modern20/module/damage.mjs");
    const actor = await Actor.implementation.create({ name: "Roller", type: "character" });
    const count = game.messages.size;
    await characterRolls(actor).skill("spot", "");
    await characterRolls(actor).save("fort");
    await characterRolls(actor).unarmed();
    if (game.messages.size - count !== 3) errors.push(`${game.messages.size - count} chat messages from 3 rolls`);
    // A Bodak: damage reduction 15/silver, fire resistance 20.
    const bodak = await window.m20test.doc("creatures", "Bodak");
    const target = await Actor.implementation.create(bodak.toObject());
    const hp = target.system.hp.value ?? target.system.hp.max;
    await applyToActor(target, 24, { parts: [{ type: "Slashing", amount: 20 }, { type: "fire", amount: 4 }] });
    if ((target.system.hp.value) !== hp - 5) errors.push(`Bodak at ${target.system.hp.value} after 20 slashing and 4 fire, expected ${hp - 5}`);
    await applyToActor(target, 10, { parts: [{ type: "Slashing", amount: 10 }], ignoreDR: true });
    if (target.system.hp.value !== hp - 15) errors.push(`Bodak at ${target.system.hp.value} after Ignore DR, expected ${hp - 15}`);
    await target.delete();
    await actor.delete();
    return errors;
  },

  async "casting and manifesting spend slots and power points"() {
    const errors = [];
    const { manifest, newDay } = await import("/systems/modern20/module/casting.mjs");
    const { take } = window.m20test;
    const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: a === "cha" ? 14 : 10 }]));
    const actor = await Actor.implementation.create({ name: "Telepath (test)", type: "character", system: { abilities } });
    await actor.createEmbeddedDocuments("Item", [await take("classes", "Telepath", { level: 4 }), await take("powers", "Brain Lock"), await take("powers", "Daze")]);
    await newDay(actor);
    if (actor.system.powerPoints.value !== 10) errors.push(`${actor.system.powerPoints.value} power points after a new day, expected 10 (7 + 3 for Cha 14)`);
    await manifest(actor, actor.items.find((i) => i.name === "Brain Lock"));
    if (actor.system.powerPoints.value !== 7) errors.push(`${actor.system.powerPoints.value} power points after Brain Lock (3), expected 7`);
    await manifest(actor, actor.items.find((i) => i.name === "Daze"));
    if (actor.system.powerPoints.freeUsed !== 1) errors.push(`${actor.system.powerPoints.freeUsed} free 0-level manifestations used, expected 1`);
    await actor.delete();
    return errors;
  },

  async "the book's heroes, built with the creature sheet's button, match their stat blocks"() {
    const errors = [];
    const { doc, wait, click } = window.m20test;
    // Where the book's own numbers do not add up (tools/test/character.test.mjs): Dr. Kolgrim's Reflex
    // (+5 class, Dex +0, Lightning Reflexes +2 is +7, printed +8) and Anastasia's Will (+15, printed +17).
    for (const [name, off] of [["Dr. Astrid Kolgrim", { ref: -1 }], ["Anastasia Markova", { will: -2 }], ["Black Feather", null]]) {
      const c = await doc("creatures", name);
      await c.sheet.render({ force: true });
      await wait(() => c.sheet.element?.querySelector("[data-action=buildCharacter]"), `${name}'s Build button`);
      const before = new Set(game.actors.map((a) => a.id));
      click(c.sheet.element, "[data-action=buildCharacter]");
      const actor = await wait(() => game.actors.find((a) => !before.has(a.id) && a.type === "character"), `${name} to be built`, 30000);
      await c.sheet.close();
      await wait(() => actor.sheet.rendered, `${name}'s new sheet`, 30000);
      const d = actor.system.derived, p = c.system;
      const expect = (what, got, want) => { if (got !== want) errors.push(`${name}: ${what} ${got}, the book ${want}`); };
      expect("base attack", d.baseAttackBonus, p.baseAttackBonus.bonus);
      expect("grapple", d.grapple, p.grapple);
      expect("initiative", d.initiative, p.initiative);
      // Black Feather's printed saves do not add up at all (the book's own error), so only her attacks are held to it.
      if (off) for (const k of ["fort", "ref", "will"]) expect(`${k} save`, d.saves[k], p.saves[k] + (off[k] ?? 0));
      for (const [a, v] of Object.entries(p.abilities)) if (v !== null) expect(a, d.scores[a], v);
      await actor.sheet.close();
      await actor.delete();
    }
    return errors;
  },

  async "advanced characters' sheets read cleanly on every tab, and say their requirements are met"() {
    const errors = [];
    const { take, wait, readable } = window.m20test;
    const characters = [
      ["Gunslinger", { str: 12, dex: 16, con: 12, int: 10, wis: 10, cha: 10 }, { sleightOfHand: { ranks: 6 }, tumble: { ranks: 6 } }, [], [
        await take("classes", "Fast Hero", { level: 4 }), await take("classes", "Gunslinger", { level: 2 }), await take("species", "Half-Elf"),
        await take("occupations", "Military"), await take("feats", "Personal Firearms Proficiency"), await take("feats", "Point Blank Shot"),
        await take("equipment", "Beretta 92F (9mm autoloader)"), await take("equipment", "9mm"), await take("equipment", "Leather jacket", { equipped: true }),
      ]],
      ["Mage", { str: 8, dex: 12, con: 10, int: 17, wis: 12, cha: 10 }, { decipherScript: { ranks: 6 }, research: { ranks: 6 } },
        [{ skill: "craft", specialty: "chemical", ranks: 6 }, { skill: "knowledge", specialty: "arcane lore", ranks: 6 }], [
        await take("classes", "Smart Hero", { level: 4 }), await take("classes", "Mage", { level: 2 }), await take("occupations", "Academic"),
        await take("spells", "Daze"), await take("spells", "Burning Hands", { prepared: 1 }), await take("incantations", "Bibliolalia"),
      ]],
    ];
    for (const [name, scores, skills, specialtySkills, items] of characters) {
      const abilities = Object.fromEntries(Object.entries(scores).map(([a, v]) => [a, { value: v }]));
      const actor = await Actor.implementation.create({ name: `${name} (test)`, type: "character", system: { abilities, skills, specialtySkills } });
      await actor.createEmbeddedDocuments("Item", items);
      await actor.sheet.render({ force: true });
      await wait(() => actor.sheet.rendered, `${name}'s sheet`);
      for (const tab of ["main", "skills", "feats", "gear", "magic", "effects", "details", "log"]) {
        actor.sheet.changeTab(tab, "primary");
        await new Promise((r) => setTimeout(r, 150));
        const section = actor.sheet.element.querySelector(`section.tab[data-tab="${tab}"]`);
        if (!section) { errors.push(`${name}: no ${tab} tab`); continue; }
        for (const bad of readable(section)) errors.push(`${name}, ${tab} tab: ${bad}`);
      }
      for (const bad of readable(actor.sheet.element.querySelector(".m20-top") ?? actor.sheet.element)) errors.push(`${name}, header: ${bad}`);
      const requirements = [...actor.sheet.element.querySelectorAll(".m20-requirements")].map((e) => e.innerText.trim());
      if (!requirements.length || requirements.some((r) => !/Requirements met/.test(r))) errors.push(`${name}: requirements ${JSON.stringify(requirements)}`);
      await actor.sheet.close();
      await actor.delete();
    }
    return errors;
  },

  async "a character's buttons roll to chat: checks, saves, skills, unarmed, grapple, reloading, attack and damage"() {
    const errors = [];
    const { take, wait, click } = window.m20test;
    const abilities = Object.fromEntries(Object.entries({ str: 14, dex: 14, con: 12, int: 10, wis: 10, cha: 10 }).map(([a, v]) => [a, { value: v }]));
    const actor = await Actor.implementation.create({ name: "Button presser (test)", type: "character", system: { abilities } });
    await actor.createEmbeddedDocuments("Item", [
      await take("classes", "Fast Hero", { level: 3 }), await take("feats", "Personal Firearms Proficiency"), await take("feats", "Brawl"),
      await take("equipment", "Beretta 92F (9mm autoloader)"), await take("equipment", "9mm"),
    ]);
    const beretta = actor.items.find((i) => i.type === "weapon");
    await actor.sheet.render({ force: true });
    await wait(() => actor.sheet.rendered, "the sheet");
    const press = async (tab, selector, what) => {
      actor.sheet.changeTab(tab, "primary");
      const n = game.messages.size;
      try {
        click(actor.sheet.element, selector);
        await wait(() => game.messages.size > n, `a chat message from ${what}`);
        const m = game.messages.contents.at(-1);
        if (m.rolls.length && !Number.isFinite(m.rolls[0].total)) errors.push(`${what}: the roll has no total`);
        return m;
      } catch (e) {
        errors.push(`${what}: ${e.message}`);
        return null;
      }
    };
    await press("main", "[data-action=rollAbility][data-ability=str]", "a Strength check");
    await press("main", "[data-action=rollSave][data-save=ref]", "a Reflex save");
    await press("skills", "[data-action=rollSkill][data-skill=spot]", "a Spot check");
    await press("main", "[data-action=rollUnarmed]", "an unarmed strike");
    await press("main", "[data-action=rollGrab]", "a grab");
    await press("main", "[data-action=rollGrapple]", "a grapple check");
    // Reloading fills the magazine from the 9mm carried; firing spends a round.
    await press("gear", `[data-item-id="${beretta.id}"] [data-action=reload]`, "reloading");
    if (actor.items.get(beretta.id).system.loaded !== 15) errors.push(`the Beretta holds ${actor.items.get(beretta.id).system.loaded} after reloading, not 15`);
    const attack = await press("gear", `[data-item-id="${beretta.id}"] [data-action=rollAttack]`, "an attack");
    if (actor.items.get(beretta.id).system.loaded !== 14) errors.push(`the Beretta holds ${actor.items.get(beretta.id).system.loaded} after a shot, not 14`);
    if (attack && !/Beretta/.test(attack.flavor)) errors.push(`the attack's card does not name the weapon`);
    const damage = await press("gear", `[data-item-id="${beretta.id}"] [data-action=rollDamage]`, "damage");
    if (damage && !(damage.rolls[0]?.total >= 2 && damage.rolls[0]?.total <= 12)) errors.push(`2d6 damage came to ${damage.rolls[0]?.total}`);
    await actor.sheet.close();
    await actor.delete();
    return errors;
  },

  async "an attack's chat card leads, button by button, to damage applied to a targeted token"() {
    const errors = [];
    const { take, doc, wait } = window.m20test;
    // Creating a world's first scene activates it, and Foundry then switches to it; it warns if the canvas is still
    // loading (as it may be soon after the game starts), so wait for that first.
    await wait(() => !canvas.loading, "the canvas to finish loading", 15000);
    const scene = await Scene.implementation.create({ name: "Test scene", width: 2000, height: 2000, grid: { size: 100 } });
    // Foundry shows it itself; switch only if it does not.
    const shown = () => canvas.ready && !canvas.loading && canvas.scene?.id === scene.id;
    try {
      await wait(shown, "Foundry to show the scene", 6000);
    } catch {
      await wait(() => !canvas.loading, "the canvas to finish loading", 15000);
      await scene.view();
      await wait(shown, "the scene", 15000);
    }
    const bodak = await Actor.implementation.create((await doc("creatures", "Bodak")).toObject());
    const [token] = await scene.createEmbeddedDocuments("Token", [(await bodak.getTokenDocument({ x: 500, y: 500 })).toObject()]);
    const target = await wait(() => canvas.tokens.get(token.id), "the Bodak's token");
    const abilities = Object.fromEntries(Object.entries({ str: 16, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }).map(([a, v]) => [a, { value: v }]));
    const hero = await Actor.implementation.create({ name: "Attacker (test)", type: "character", system: { abilities } });
    await hero.createEmbeddedDocuments("Item", [await take("classes", "Strong Hero", { level: 3 }), await take("feats", "Simple Weapons Proficiency"), await take("equipment", "Club")]);
    const { characterRolls } = await import("/systems/modern20/module/roll.mjs");
    // A card's buttons, as the chat log draws them.
    const card = (m) => wait(() => ui.chat.element?.querySelector(`li[data-message-id="${m.id}"] .m20-card-buttons`), "the card's buttons");
    const button = async (m, label) => {
      const b = [...(await card(m)).querySelectorAll("button")].find((x) => label.test(x.textContent));
      if (!b) throw new Error(`no ${label} button on "${m.flavor?.replace(/<[^>]+>/g, " ").trim().slice(0, 60)}"`);
      const n = game.messages.size;
      b.click();
      await wait(() => game.messages.size > n, `a message after ${label}`);
      return game.messages.contents.at(-1);
    };
    try {
      // A club (lethal: an unarmed strike's nonlethal damage never lowers hit points), untargeted, so the
      // card offers damage whatever the roll; then its damage from the card.
      const attack = await characterRolls(hero).attack(hero.items.find((i) => i.name === "Club"));
      const attackMessage = game.messages.contents.at(-1);
      let damage;
      if (attackMessage.getFlag("modern20", "threat")) {
        const confirm = await button(attackMessage, /Confirm critical/);
        damage = await button(confirm, /damage/i);
      } else damage = await button(attackMessage, /^Damage$/);
      if (!damage.getFlag("modern20", "damage")) errors.push("the damage card carries no damage");
      if (!attack) errors.push("the attack rolled nothing");
      // Apply to the targeted Bodak: its DR 15/silver stops a club's damage.
      target.setTarget(true, { releaseOthers: true });
      // A placed creature's token is its own copy (unlinked): the damage goes to the token's actor.
      const hit = target.actor;
      const hp = hit.system.hp.value ?? hit.system.hp.max;
      const applied = await button(damage, /^Apply/);
      if (!/Stopped/.test(applied.content)) errors.push(`applying to the Bodak did not report its damage reduction: ${applied.content.replace(/<[^>]+>/g, " ").trim()}`);
      // Ignore DR: the whole roll gets through (from where the first Apply left it: a critical may have got past DR).
      const before = hit.system.hp.value ?? hp;
      await button(damage, /Ignore DR/);
      const after = hit.system.hp.value;
      if (after !== before - damage.rolls[0].total) errors.push(`after Ignore DR the Bodak has ${after} hit points, expected ${before - damage.rolls[0].total}`);
    } catch (e) {
      errors.push(e.message);
    }
    target.setTarget(false);
    await hero.delete();
    await bodak.delete();
    // The scene stays: deleting the scene being viewed makes Foundry switch scenes, and the test world is made afresh each run.
    return errors;
  },

  async "the Magic tab: preparing, casting, a new day, and the cast card's level check"() {
    const errors = [];
    const { take, wait, click } = window.m20test;
    const abilities = Object.fromEntries(Object.entries({ str: 10, dex: 10, con: 10, int: 16, wis: 10, cha: 10 }).map(([a, v]) => [a, { value: v }]));
    const actor = await Actor.implementation.create({ name: "Caster (test)", type: "character", system: { abilities } });
    await actor.createEmbeddedDocuments("Item", [await take("classes", "Mage", { level: 2 }), await take("spells", "Burning Hands")]);
    const spell = actor.items.find((i) => i.name === "Burning Hands");
    await actor.sheet.render({ force: true });
    await wait(() => actor.sheet.rendered, "the sheet");
    actor.sheet.changeTab("magic", "primary");
    try {
      // Prepare it once, in the box on its row.
      const box = await wait(() => actor.sheet.element.querySelector(`[data-item-id="${spell.id}"] input[data-item-field=prepared]`), "the Prepared box");
      box.value = "1";
      box.dispatchEvent(new Event("change", { bubbles: true }));
      await wait(() => actor.items.get(spell.id).system.prepared === 1, "the spell to be prepared");
      const n = game.messages.size;
      click(actor.sheet.element, `[data-item-id="${spell.id}"] [data-action=castSpell]`);
      await wait(() => game.messages.size > n, "the cast card");
      if (actor.items.get(spell.id).system.cast !== 1) errors.push("casting did not use the prepared spell");
      const cardText = game.messages.contents.at(-1).content.replace(/<[^>]+>/g, " ");
      if (!/DC 14/.test(cardText)) errors.push(`the card does not give DC 14 (10 + 1 + Int +3): ${cardText.replace(/\s+/g, " ").slice(0, 120)}`);
      click(actor.sheet.element, "[data-action=newDay]");
      await wait(() => actor.items.get(spell.id).system.cast === 0, "a new day to restore it");
    } catch (e) {
      errors.push(e.message);
    }
    await actor.sheet.close();
    await actor.delete();
    return errors;
  },

  async "levelling up on the sheet: levels, hit points, action points, ability increases, ranks, feats and talents"() {
    const errors = [];
    const { take, wait, click, type, readable } = window.m20test;
    const abilities = Object.fromEntries(Object.entries({ str: 10, dex: 14, con: 12, int: 12, wis: 10, cha: 10 }).map(([a, v]) => [a, { value: v }]));
    const actor = await Actor.implementation.create({ name: "Leveller (test)", type: "character", system: { abilities } });
    await actor.createEmbeddedDocuments("Item", [await take("classes", "Fast Hero", { level: 1 }), await take("occupations", "Criminal"), await take("species", "Dwarf")]);
    const cls = actor.items.find((i) => i.type === "class");
    const occupation = actor.items.find((i) => i.type === "occupation");
    const dwarf = actor.items.find((i) => i.type === "species");
    // Editing by hand, as for a correction or a GM's ruling (the Build tab's "Allow editing on every tab").
    actor.sheet.freeEdit = true;
    await actor.sheet.render({ force: true });
    await wait(() => actor.sheet.rendered, "the sheet");
    const el = () => actor.sheet.element;
    const step = async (what, act, done) => {
      try {
        await act();
        await wait(done, what);
      } catch (e) {
        errors.push(`${what}: ${e.message}`);
      }
    };
    await step("raising Fast Hero to 3rd level", () => type(el(), `[data-item-id="${cls.id}"] input[data-item-field=level]`, 3), () => actor.items.get(cls.id).system.level === 3);
    const rolls = el().querySelectorAll(`[data-item-id="${cls.id}"] input[data-item-field=hitPoints]`).length;
    if (rolls !== 3) errors.push(`${rolls} hit point boxes at 3rd level`);
    await step("rolling 5 for 2nd level's hit points", () => type(el(), `[data-item-id="${cls.id}"] input[data-item-field=hitPoints][data-index="1"]`, 5), () => actor.items.get(cls.id).system.hitPoints[1] === 5);
    await step("the action points for levels 1-3 (5 + 6 + 6)", () => click(el(), "[data-action=grantActionPoints]"), () => actor.system.actionPoints.value === 17 && actor.system.actionPoints.granted === 3);
    if (el().querySelector("[data-action=grantActionPoints]")) errors.push("the action points button is still there after granting");
    await step("raising Fast Hero to 4th level", () => type(el(), `[data-item-id="${cls.id}"] input[data-item-field=level]`, 4), () => actor.items.get(cls.id).system.level === 4);
    const dex = actor.system.derived.scores.dex;
    await step("4th level's ability increase to Dexterity", () => type(el(), "[data-increase=\"0\"]", "dex"), () => actor.system.abilityIncreases[0] === "dex");
    if (actor.system.derived.scores.dex !== dex + 1) errors.push(`Dexterity ${actor.system.derived.scores.dex} after its +1, expected ${dex + 1}`);
    // Skill ranks, bought as a Fast hero: Hide is a class skill (1 point a rank), Diplomacy not (2).
    actor.sheet.changeTab("skills", "primary");
    await step("4 ranks of Hide", () => type(el(), "input[name=\"system.skills.hide.ranks\"]", 4), () => actor.system.skills.hide.ranks === 4);
    if (actor.system.skills.hide.points !== 4) errors.push(`Hide's 4 ranks cost ${actor.system.skills.hide.points} points, expected 4`);
    await step("2 ranks of Diplomacy", () => type(el(), "input[name=\"system.skills.diplomacy.ranks\"]", 2), () => actor.system.skills.diplomacy.ranks === 2);
    if (actor.system.skills.diplomacy.points !== 4) errors.push(`Diplomacy's 2 cross-class ranks cost ${actor.system.skills.diplomacy.points} points, expected 4`);
    // A specialty skill keeps its name when its ranks are set (the bug fixed in 0.4.2).
    await step("adding Knowledge (history)", () => {
      type(el(), "tr[data-skill=knowledge] .m20-new-specialty", "history");
      click(el(), "tr[data-skill=knowledge] [data-action=addSpecialty]");
    }, () => actor.system.specialtySkills.some((x) => x.skill === "knowledge" && x.specialty === "history"));
    const index = actor.system.specialtySkills.findIndex((x) => x.specialty === "history");
    await step("2 ranks of Knowledge (history)", () => type(el(), `input[name="system.specialtySkills.${index}.ranks"]`, 2), () => actor.system.specialtySkills[index]?.ranks === 2);
    if (actor.system.specialtySkills[index]?.specialty !== "history") errors.push(`Knowledge (history) lost its name when its ranks were set: ${JSON.stringify(actor.system.specialtySkills[index])}`);
    // Feats: the occupation's and species' given feats, a talent, and a bonus feat.
    actor.sheet.changeTab("feats", "primary");
    await step("taking Brawl from the Criminal occupation", () => click(el(), `input[data-action=toggleGrant][data-source="${occupation.id}"][data-index="0"]`), () => actor.items.some((i) => i.name === "Brawl"));
    await step("taking the Dwarf's Archaic Weapons Proficiency", () => click(el(), `input[data-action=toggleGrant][data-source="${dwarf.id}"][data-index="0"]`), () => actor.items.some((i) => i.name === "Archaic Weapons Proficiency"));
    await step("taking the Evasion talent", () => click(el(), "input[data-action=toggleTalent][data-name=\"Evasion\"]"), () => actor.items.some((i) => i.type === "talent" && i.name === "Evasion"));
    const unmet = el().querySelector("input[data-action=toggleTalent][data-name=\"Uncanny Dodge 2\"]")?.closest("label");
    if (!unmet?.classList.contains("m20-unmet")) errors.push("Uncanny Dodge 2 is not marked unmet (it needs Uncanny Dodge 1)");
    await step("taking a Fast Hero bonus feat", () => click(el(), `input[data-action=toggleBonusFeat][data-class="${cls.id}"][data-index="0"]`), () => actor.items.some((i) => i.getFlag("modern20", "bonusFor") === cls.id));
    for (const tab of ["main", "skills", "feats"]) {
      actor.sheet.changeTab(tab, "primary");
      await new Promise((r) => setTimeout(r, 150));
      for (const bad of readable(el().querySelector(`section.tab[data-tab="${tab}"]`))) errors.push(`${tab} tab: ${bad}`);
    }
    await actor.sheet.close();
    await actor.delete();
    return errors;
  },

  async "the roll dialog: a modifier, an action point, firing modes, Point Blank Shot, a talent's note and Swim's gear"() {
    const errors = [];
    const { take, wait, click, dialog } = window.m20test;
    await game.settings.set("modern20", "askBeforeRolling", true);
    const abilities = Object.fromEntries(Object.entries({ str: 10, dex: 14, con: 10, int: 10, wis: 10, cha: 14 }).map(([a, v]) => [a, { value: v }]));
    const actor = await Actor.implementation.create({ name: "Dialog (test)", type: "character", system: { abilities, actionPoints: { value: 3, granted: 7 }, skills: { bluff: { ranks: 4 } } } });
    await actor.createEmbeddedDocuments("Item", [
      await take("classes", "Fast Hero", { level: 4 }), await take("classes", "Charismatic Hero", { level: 3 }),
      ...await Promise.all(["Personal Firearms Proficiency", "Advanced Firearms Proficiency", "Burst Fire", "Point Blank Shot"].map((n) => take("feats", n))),
      await take("talents", "Fast-Talk"), await take("equipment", "AKM/AK-47 (7.62mmR assault rifle)", { loaded: 30 }), await take("equipment", "7.62mmR"),
    ]);
    const ak = actor.items.find((i) => i.type === "weapon");
    await actor.sheet.render({ force: true });
    await wait(() => actor.sheet.rendered, "the sheet");
    const roll = async (tab, selector, fields, what) => {
      actor.sheet.changeTab(tab, "primary");
      const n = game.messages.size;
      click(actor.sheet.element, selector);
      const shown = await dialog(fields);
      await wait(() => game.messages.size > n, `the ${what} to post`);
      return { message: game.messages.contents.at(-1), ...shown };
    };
    const termsOf = (m) => [...new DOMParser().parseFromString(m.flavor, "text/html").querySelectorAll("li")].map((l) => l.innerText.replace(/\s+/g, " ").trim());
    try {
      // A burst at a target within 30 feet, +2 for cover lost, spending an action point.
      const burst = await roll("gear", `[data-item-id="${ak.id}"] [data-action=rollAttack]`, { mode: "burst", pointBlank: true, modifier: 2, actionPoint: true }, "burst");
      const terms = termsOf(burst.message);
      for (const want of [/^Burst fire -4$/, /^Point Blank Shot \+1$/, /^Situational \+2$/, /^Action point/]) if (!terms.some((t) => want.test(t))) errors.push(`the burst's card has no term like ${want}: ${terms.join("; ")}`);
      if (actor.items.get(ak.id).system.loaded !== 25) errors.push(`${actor.items.get(ak.id).system.loaded} rounds after a burst, expected 25`);
      if (actor.system.actionPoints.value !== 2) errors.push(`${actor.system.actionPoints.value} action points after spending one, expected 2`);
      if (!/\d+d6/.test(burst.message.rolls[0].formula)) errors.push(`the action point's die is not in the roll: ${burst.message.rolls[0].formula}`);
      // Autofire: 10 rounds, against the square's Defense 10.
      const auto = await roll("gear", `[data-item-id="${ak.id}"] [data-action=rollAttack]`, { mode: "autofire" }, "autofire");
      if (actor.items.get(ak.id).system.loaded !== 15) errors.push(`${actor.items.get(ak.id).system.loaded} rounds after autofire, expected 15`);
      if (!/autofire/i.test(auto.message.flavor)) errors.push("the autofire card does not say so");
      // Bluff offers Fast-Talk (his Charismatic level, +3); ticked, it is on the card.
      const bluff = await roll("skills", "[data-action=rollSkill][data-skill=bluff]", {}, "Bluff check (unticked)");
      const fastTalk = bluff.labels.find((l) => /Fast-Talk/.test(l));
      if (!fastTalk || !/\+3/.test(fastTalk)) errors.push(`the Bluff dialog offers no Fast-Talk +3: ${bluff.labels.join("; ")}`);
      const name = await (async () => {
        actor.sheet.changeTab("skills", "primary");
        click(actor.sheet.element, "[data-action=rollSkill][data-skill=bluff]");
        const app = await wait(() => [...foundry.applications.instances.values()].find((a) => a instanceof foundry.applications.api.DialogV2 && a.rendered), "the Bluff dialog");
        const box = [...app.element.querySelectorAll("label")].find((l) => /Fast-Talk/.test(l.innerText))?.closest(".form-group")?.querySelector("input[type=checkbox]");
        return box?.name;
      })();
      const n = game.messages.size;
      await dialog({ [name]: true });
      await wait(() => game.messages.size > n, "the Bluff with Fast-Talk");
      if (!termsOf(game.messages.contents.at(-1)).some((t) => /^Fast-Talk \+3$/.test(t))) errors.push(`Fast-Talk ticked is not on the card: ${termsOf(game.messages.contents.at(-1)).join("; ")}`);
      // Swim offers −1 for every 5 pounds of gear: the rifle and its rounds.
      const { gearWeight } = await import("/systems/modern20/module/roll.mjs");
      const penalty = -Math.floor(gearWeight(actor) / 5);
      const swim = await roll("skills", "[data-action=rollSkill][data-skill=swim]", { swimGear: true }, "Swim check");
      if (!swim.labels.some((l) => /Gear carried/.test(l))) errors.push(`the Swim dialog offers no gear penalty: ${swim.labels.join("; ")}`);
      if (!termsOf(swim.message).includes(`Gear carried ${penalty}`)) errors.push(`the Swim card has no "Gear carried ${penalty}": ${termsOf(swim.message).join("; ")}`);
    } catch (e) {
      errors.push(e.message);
    }
    await game.settings.set("modern20", "askBeforeRolling", false);
    await actor.sheet.close();
    await actor.delete();
    return errors;
  },

  async "dying and conditions: disabled, dying, the save card on its turn, stable, massive damage, Shaken, initiative"() {
    const errors = [];
    const { take, wait, click } = window.m20test;
    const { applyToActor } = await import("/systems/modern20/module/damage.mjs");
    const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: 10 }]));
    const actor = await Actor.implementation.create({ name: "Dying (test)", type: "character", system: { abilities, hp: { value: 5 } } });
    await actor.createEmbeddedDocuments("Item", [await take("classes", "Strong Hero", { level: 2 })]);
    try {
      await applyToActor(actor, 5);
      if (actor.system.hp.value !== 0 || !actor.statuses.has("disabled")) errors.push(`at ${actor.system.hp.value} hit points: ${[...actor.statuses].join(", ")}, expected disabled`);
      await applyToActor(actor, 3);
      if (!actor.statuses.has("dying") || !actor.statuses.has("unconscious")) errors.push(`at ${actor.system.hp.value}: ${[...actor.statuses].join(", ")}, expected dying and unconscious`);
      // In combat, the dying character's turn posts its save; the save stabilises or costs a hit point.
      await wait(() => !canvas.loading, "the canvas", 15000);
      const scene = game.scenes.find((x) => x.name === "Test scene") ?? await Scene.implementation.create({ name: "Test scene", width: 2000, height: 2000, grid: { size: 100 } });
      if (canvas.scene?.id !== scene.id) { await scene.view(); await wait(() => canvas.ready && !canvas.loading && canvas.scene?.id === scene.id, "the scene", 15000); }
      const [token] = await scene.createEmbeddedDocuments("Token", [(await actor.getTokenDocument({ x: 800, y: 800 })).toObject()]);
      const combat = await Combat.implementation.create({ scene: scene.id });
      await combat.createEmbeddedDocuments("Combatant", [{ tokenId: token.id, sceneId: scene.id, actorId: actor.id }]);
      await combat.rollAll();
      const init = combat.combatants.contents[0].initiative;
      if (!Number.isFinite(init)) errors.push(`initiative rolled ${init}`);
      const n = game.messages.size;
      await combat.startCombat();
      await combat.nextRound();
      const card = await wait(() => game.messages.contents.slice(n).find((m) => m.getFlag("modern20", "save")?.kind === "dying"), "the dying save card");
      const buttons = await wait(() => ui.chat.element?.querySelector(`li[data-message-id="${card.id}"] .m20-card-buttons button`), "its save button");
      // Starting combat and the next round both begin its turn: a card each. The first card's save decides it.
      const before = actor.system.hp.value;
      buttons.click();
      try {
        await wait(() => (actor.statuses.has("stable") && !actor.statuses.has("dying")) || actor.system.hp.value === before - 1, "the save to stabilise or cost a hit point");
      } catch {
        errors.push(`after the dying save: ${actor.system.hp.value} hit points, ${[...actor.statuses].join(", ")}; expected stable, or ${before - 1}`);
      }
      await combat.delete();
      // Massive damage: one hit over the threshold (Con 10) that leaves the character standing asks for a save.
      await actor.update({ "system.hp.value": 30 });
      for (const s of ["dying", "unconscious", "stable", "disabled"]) if (actor.statuses.has(s)) await actor.toggleStatusEffect(s, { active: false });
      const k = game.messages.size;
      await applyToActor(actor, 12);
      if (!game.messages.contents.slice(k).some((x) => x.getFlag("modern20", "save")?.kind === "massive")) errors.push("12 damage over a threshold of 10 asked for no massive damage save");
      // Shaken from the condition row: −2 on saves.
      await actor.sheet.render({ force: true });
      await wait(() => actor.sheet.rendered, "the sheet");
      const will = actor.system.derived.saves.will;
      click(actor.sheet.element, "[data-action=toggleCondition][data-condition=shaken]");
      await wait(() => actor.statuses.has("shaken"), "Shaken");
      if (actor.system.derived.saves.will !== will - 2) errors.push(`Will ${actor.system.derived.saves.will} while shaken, expected ${will - 2}`);
      await actor.sheet.close();
    } catch (e) {
      errors.push(e.message);
    }
    await actor.delete();
    return errors;
  },

  async "current hit points follow the maximum while at full: a new character, a level gained, but not when hurt"() {
    const errors = [];
    const { take, wait } = window.m20test;
    const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: a === "con" ? 14 : 10 }]));
    const actor = await Actor.implementation.create({ name: "Hit points (test)", type: "character", system: { abilities } });
    await actor.createEmbeddedDocuments("Item", [await take("classes", "Tough Hero", { level: 1 })]);
    const cls = actor.items.find((i) => i.type === "class");
    try {
      // A new Tough hero: 1st level's d10 at its maximum, Con +2.
      await wait(() => actor.system.hp.value === 12, `a new character at full (12), not ${actor.system.hp.value}`);
      await cls.update({ "system.level": 2 });
      await wait(() => actor.system.hp.value === actor.system.hp.max && actor.system.hp.max > 12, `full health to follow a level gained (now ${actor.system.hp.value} of ${actor.system.hp.max})`);
      await actor.update({ "system.hp.value": 5 });
      const max = actor.system.hp.max;
      await cls.update({ "system.level": 3 });
      await wait(() => actor.system.hp.max > max, "the maximum to rise");
      await new Promise((r) => setTimeout(r, 500));
      if (actor.system.hp.value !== 5) errors.push(`a hurt character's hit points moved with the maximum: ${actor.system.hp.value}, expected 5`);
    } catch (e) {
      errors.push(e.message);
    }
    await actor.delete();
    return errors;
  },

  async "class features come and go with class levels, and Weapon Specialization adds to damage"() {
    const errors = [];
    const { take, wait, doc, click } = window.m20test;
    const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: 12 }]));
    const actor = await Actor.implementation.create({ name: "Soldier (test)", type: "character", system: { abilities } });
    await actor.createEmbeddedDocuments("Item", [
      await take("classes", "Strong Hero", { level: 3 }), await take("classes", "Soldier", { level: 1 }),
      await take("feats", "Simple Weapons Proficiency"), await take("equipment", "Club"),
    ]);
    const soldier = actor.items.find((i) => i.name === "Soldier");
    const names = () => actor.items.filter((i) => i.type === "feature").map((i) => i.name).sort().join(", ");
    try {
      await wait(() => names() === "Weapon Focus", `Weapon Focus at Soldier 1 (have: ${names()})`);
      await soldier.update({ "system.level": 2 });
      await wait(() => names() === "Weapon Focus, Weapon Specialization", `Weapon Specialization at Soldier 2 (have: ${names()})`);
      // Weapon Specialization for the club: +2 on its damage.
      const special = actor.items.find((i) => i.name === "Weapon Specialization");
      await special.update({ "system.choice": "club" });
      const { characterRolls } = await import("/systems/modern20/module/roll.mjs");
      await characterRolls(actor).damage(actor.items.find((i) => i.name === "Club"));
      if (!/Weapon Specialization/.test(game.messages.contents.at(-1).flavor)) errors.push("the club's damage card has no Weapon Specialization");
      await soldier.update({ "system.level": 1 });
      await wait(() => names() === "Weapon Focus", `Weapon Specialization taken away at Soldier 1 again (have: ${names()})`);
      await soldier.delete();
      await wait(() => names() === "", `the Soldier's features gone with the class (have: ${names()})`);
      // A character built from a printed hero is given its classes' features.
      const c = await doc("creatures", "Dr. Astrid Kolgrim");
      await c.sheet.render({ force: true });
      await wait(() => c.sheet.element?.querySelector("[data-action=buildCharacter]"), "the Build button");
      const before = new Set(game.actors.map((a) => a.id));
      click(c.sheet.element, "[data-action=buildCharacter]");
      const built = await wait(() => game.actors.find((a) => !before.has(a.id) && a.type === "character"), "Dr. Kolgrim to be built", 30000);
      await c.sheet.close();
      await wait(() => built.items.some((i) => i.type === "feature" && i.system.className === "Field Scientist"), "her Field Scientist features", 20000);
      await built.sheet.close();
      await built.delete();
    } catch (e) {
      errors.push(e.message);
    }
    await actor.delete();
    return errors;
  },

  async "Wealth, resting and languages from the sheet: buy, sell, starting Wealth, a night's rest, species languages"() {
    const errors = [];
    const { take, wait, click, dialog } = window.m20test;
    const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: 10 }]));
    const actor = await Actor.implementation.create({ name: "Shopper (test)", type: "character", system: { abilities, wealth: { value: 12, regainedLevel: 3 } } });
    await actor.createEmbeddedDocuments("Item", [
      await take("classes", "Fast Hero", { level: 3 }), await take("species", "Elf"), await take("occupations", "Criminal"),
      await take("equipment", "Knife"), await take("equipment", "Colt Python (.357 revolver)"),
    ]);
    await actor.sheet.render({ force: true });
    await wait(() => actor.sheet.rendered, "the sheet");
    const el = () => actor.sheet.element;
    const step = async (what, act) => { try { await act(); } catch (e) { errors.push(`${what}: ${e.message}`); } };
    await step("buying a knife (within means: no roll)", async () => {
      actor.sheet.changeTab("gear", "primary");
      const knife = actor.items.find((i) => i.name === "Knife");
      const n = game.messages.size;
      click(el(), `[data-item-id="${knife.id}"] [data-action=buyItem]`);
      await wait(() => game.messages.size > n, "the purchase card");
      if (!/Bought Knife/.test(game.messages.contents.at(-1).content)) errors.push("the purchase card does not say what was bought");
    });
    await step("selling the Colt Python", async () => {
      const colt = actor.items.find((i) => i.name.startsWith("Colt Python"));
      const wealth = actor.system.wealth.value;
      const n = game.messages.size;
      click(el(), `[data-item-id="${colt.id}"] [data-action=sellItem]`);
      await dialog({}, "legal");
      await wait(() => !actor.items.get(colt.id) && game.messages.contents.slice(n).some((m) => /Sold/.test(m.content)), "the revolver to be sold, and its card");
      if (actor.system.wealth.value < wealth) errors.push(`Wealth fell selling: ${wealth} → ${actor.system.wealth.value}`);
    });
    await step("rolling starting Wealth", async () => {
      actor.sheet.changeTab("main", "primary");
      const n = game.messages.size;
      click(el(), "[data-action=startingWealth]");
      await dialog({}, "yes");
      await wait(() => game.messages.contents.slice(n).some((m) => /Starting Wealth/.test(m.flavor ?? "")), "the starting Wealth roll");
      const w = actor.system.wealth.value;
      // 2d4 + Criminal's +1: 3 to 9.
      if (w < 3 || w > 9) errors.push(`starting Wealth ${w}, not 2d4 + 1`);
    });
    await step("a night's rest", async () => {
      await actor.update({ "system.hp.value": 2 });
      click(el(), "[data-action=rest]");
      await dialog({}, "night");
      await wait(() => actor.system.hp.value === 5, `a night's rest to heal 3 (now ${actor.system.hp.value})`);
    });
    await step("the Elf's languages", async () => {
      actor.sheet.changeTab("details", "primary");
      click(el(), "[data-action=addSpeciesLanguages]");
      await wait(() => actor.system.languages.some((l) => l.name === "Elven" && l.speak && l.readWrite), "Elven to be known");
      click(el(), "[data-action=addLanguage]");
      await wait(() => actor.system.languages.length === 3, "a language to be added");
    });
    await step("the log recording the changes", async () => {
      actor.sheet.changeTab("log", "primary");
      await new Promise((r) => setTimeout(r, 300));
      const text = el().querySelector("section.tab[data-tab=log]")?.innerText ?? "";
      for (const want of [/Wealth/, /Current HP/, /Languages/]) if (!want.test(text)) errors.push(`the Log tab has nothing about ${want.source}`);
    });
    await actor.sheet.close();
    await actor.delete();
    return errors;
  },

  async "a creature's attack and damage buttons, a condition on its rolls, and the edit view saving a field and a list entry"() {
    const errors = [];
    const { doc, wait, click, type } = window.m20test;
    const wolf = await Actor.implementation.create((await doc("creatures", "Wolf")).toObject());
    try {
      await wolf.sheet.render({ force: true });
      await wait(() => wolf.sheet.element?.querySelector("[data-action=rollCreatureAttack]"), "the wolf's attack buttons");
      let n = game.messages.size;
      click(wolf.sheet.element, "[data-action=rollCreatureAttack]");
      await wait(() => game.messages.size > n, "the bite's attack");
      if (!/Bite/i.test(game.messages.contents.at(-1).flavor)) errors.push("the attack card does not name the bite");
      n = game.messages.size;
      click(wolf.sheet.element, "[data-action=rollCreatureDamage]");
      await wait(() => game.messages.size > n, "the bite's damage");
      if (!game.messages.contents.at(-1).getFlag("modern20", "damage")) errors.push("the damage card cannot be applied");
      // Shaken from its condition strip: −2 on its printed Will save.
      click(wolf.sheet.element, "[data-action=toggleCondition][data-condition=shaken]");
      await wait(() => wolf.statuses.has("shaken"), "the wolf to be shaken");
      const { creatureRolls } = await import("/systems/modern20/module/roll.mjs");
      await creatureRolls(wolf).save("will");
      const will = game.messages.contents.at(-1);
      if (!/Conditions/.test(will.flavor) || !/- 2$/.test(will.rolls[0]?.formula ?? "")) errors.push(`a shaken wolf's Will save: "${will.rolls[0]?.formula}", without −2 for its conditions`);
      // The edit view: a field changed and saved, a list entry added and removed, the rest left as it was.
      const hd = wolf.system.hitDice;
      wolf.sheet.editing = true;
      await wolf.sheet.render({ force: true });
      await wait(() => wolf.sheet.element?.querySelector("input[name=\"system.allegiances\"]"), "the edit view");
      type(wolf.sheet.element, "input[name=\"system.allegiances\"]", "the pack");
      await wait(() => wolf.system.allegiances === "the pack", "the allegiance to save");
      if (wolf.system.hitDice !== hd) errors.push(`saving one field changed the Hit Dice: ${hd} → ${wolf.system.hitDice}`);
      const skills = wolf.system.skills.length;
      click(wolf.sheet.element, "[data-action=addEntry][data-path=\"system.skills\"]");
      await wait(() => wolf.system.skills.length === skills + 1, "a skill entry to be added");
      await wait(() => wolf.sheet.element?.querySelector(`[data-action=removeEntry][data-path="system.skills"][data-index="${skills}"]`), "the new entry's remove button");
      click(wolf.sheet.element, `[data-action=removeEntry][data-path="system.skills"][data-index="${skills}"]`);
      await wait(() => wolf.system.skills.length === skills, "the entry to be removed");
      await wolf.sheet.close();
    } catch (e) {
      errors.push(e.message);
    }
    await wolf.delete();
    return errors;
  },

  async "the startup update: an item with an out-of-date effect is refreshed from its compendium, once"() {
    const errors = [];
    const { take } = window.m20test;
    const { syncWorldItems } = await import("/systems/modern20/module/sync.mjs");
    const item = await Item.implementation.create(await take("feats", "Alertness"));
    const effect = item.effects.contents[0];
    // Out of date: a different bonus than the compendium's +2.
    await effect.update({ "system.changes": effect.changes.map((c) => ({ ...c, value: 9 })) });
    await game.settings.set("modern20", "syncedVersion", "");
    await syncWorldItems();
    const values = item.effects.contents.flatMap((e) => e.changes.map((c) => Number(c.value)));
    if (values.some((v) => v !== 2)) errors.push(`after the update its effect gives ${values.join(", ")}, not the compendium's 2`);
    if (game.settings.get("modern20", "syncedVersion") !== game.system.version) errors.push("the update did not record the version");
    // Run again for the same version: nothing to do.
    await item.effects.contents[0].update({ "system.changes": item.effects.contents[0].changes.map((c) => ({ ...c, value: 9 })) });
    await syncWorldItems();
    if (Number(item.effects.contents[0].changes[0].value) !== 9) errors.push("the update ran again for the same version");
    await item.delete();
    return errors;
  },

  async "the book's odd weapons and swarms: a quarterstaff's and a concussion grenade's damage, a taser reloaded, a swarm's automatic damage"() {
    const errors = [];
    const { take, doc, wait, click } = window.m20test;
    const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: 12 }]));
    const actor = await Actor.implementation.create({ name: "Odd weapons (test)", type: "character", system: { abilities } });
    await actor.createEmbeddedDocuments("Item", [await take("equipment", "Quarterstaff"), await take("equipment", "Grenade, concussion"), await take("equipment", "Taser")]);
    const { characterRolls } = await import("/systems/modern20/module/roll.mjs");
    try {
      // A double weapon rolls its first end's dice; a nonlethal grenade's card applies nonlethal damage.
      await characterRolls(actor).damage(actor.items.find((i) => i.name === "Quarterstaff"));
      const staff = game.messages.contents.at(-1);
      if (!/1d6/.test(staff.rolls[0]?.formula ?? "")) errors.push(`the quarterstaff rolled "${staff.rolls[0]?.formula}", not 1d6`);
      await characterRolls(actor).damage(actor.items.find((i) => i.name === "Grenade, concussion"));
      const grenade = game.messages.contents.at(-1);
      if (!/4d6/.test(grenade.rolls[0]?.formula ?? "")) errors.push(`the concussion grenade rolled "${grenade.rolls[0]?.formula}", not 4d6`);
      if (!grenade.getFlag("modern20", "damage")?.nonlethal) errors.push("the concussion grenade's damage is not nonlethal");
      // A taser: no ammunition in the book, so reloading refills it, and then it fires.
      const { reloadWeapon } = await import("/systems/modern20/module/ammo.mjs");
      const taser = actor.items.find((i) => i.name === "Taser");
      await reloadWeapon(actor, taser);
      if (taser.system.loaded !== 1) errors.push(`the taser holds ${taser.system.loaded} after reloading, not 1`);
      const n = game.messages.size;
      await characterRolls(actor).attack(taser);
      if (game.messages.size === n) errors.push("the reloaded taser did not fire");
      else if (taser.system.loaded !== 0) errors.push(`the taser holds ${taser.system.loaded} after firing, not 0`);
    } catch (e) {
      errors.push(e.message);
    }
    await actor.delete();
    // A swarm: no attack roll, a damage button.
    const swarm = await Actor.implementation.create((await doc("creatures", "Piranha Swarm")).toObject());
    try {
      await swarm.sheet.render({ force: true });
      await wait(() => swarm.sheet.element?.querySelector("[data-action=rollCreatureDamage]"), "the swarm's damage button");
      if (swarm.sheet.element.querySelector("[data-action=rollCreatureAttack]")) errors.push("the swarm has an attack roll button");
      const n = game.messages.size;
      click(swarm.sheet.element, "[data-action=rollCreatureDamage]");
      await wait(() => game.messages.size > n, "the swarm's damage");
      if (!/2d6/.test(game.messages.contents.at(-1).rolls[0]?.formula ?? "")) errors.push("the swarm's damage is not its 2d6");
      await swarm.sheet.close();
    } catch (e) {
      errors.push(e.message);
    }
    await swarm.delete();
    return errors;
  },

  async "stabilised with Treat Injury: stable, unconscious, and healing by rest while below 0"() {
    const errors = [];
    const { take, wait, click, dialog } = window.m20test;
    const { applyToActor } = await import("/systems/modern20/module/damage.mjs");
    const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: 10 }]));
    const actor = await Actor.implementation.create({ name: "Tended (test)", type: "character", system: { abilities, hp: { value: 4 } } });
    await actor.createEmbeddedDocuments("Item", [await take("classes", "Tough Hero", { level: 3 })]);
    try {
      await actor.update({ "system.hp.value": 4 });
      await applyToActor(actor, 8);
      await wait(() => actor.statuses.has("dying"), "dying at -4");
      await actor.sheet.render({ force: true });
      await wait(() => actor.sheet.element?.querySelector("[data-action=stabilisedByHelp]"), "the Treat Injury button");
      click(actor.sheet.element, "[data-action=stabilisedByHelp]");
      await wait(() => actor.statuses.has("stable") && !actor.statuses.has("dying"), "stable");
      if (!actor.statuses.has("unconscious")) errors.push("stabilised, but not unconscious");
      if (!actor.system.hp.recovering) errors.push("a tended character is not healing naturally");
      // Tended: a night's rest heals 3 (level 3), still below 0.
      click(actor.sheet.element, "[data-action=rest]");
      await dialog({}, "night");
      await wait(() => actor.system.hp.value === -1, `a night's rest to heal 3 from -4 (now ${actor.system.hp.value})`);
      await actor.sheet.close();
    } catch (e) {
      errors.push(e.message);
    }
    await actor.delete();
    return errors;
  },

  async "the log at its limit: 600 session entries keep the last 500 or so, pruned without a warning"() {
    const errors = [];
    const { record } = await import("/systems/modern20/module/log.mjs");
    const { rollEntry, entries, PLAY_LIMIT } = await import("/systems/modern20/module/rules/log.mjs");
    // Written 50 at a time: each write a chunk, pruned whole, so 500 to 549 are kept.
    const CHUNK = 50;
    const actor = await Actor.implementation.create({ name: "Long log (test)", type: "character" });
    try {
      let n = 0;
      for (let batch = 0; batch < 12; batch++) {
        await record(actor, Array.from({ length: 50 }, () => rollEntry("a test roll", n, { id: foundry.utils.randomID(), time: Date.now(), seq: n++, user: game.user.id, userName: game.user.name })));
      }
      const play = entries(actor.getFlag("modern20", "log")).filter((e) => e.kind === "play");
      if (play.length < PLAY_LIMIT || play.length >= PLAY_LIMIT + CHUNK) errors.push(`${play.length} session entries kept of 600, expected ${PLAY_LIMIT} to ${PLAY_LIMIT + CHUNK - 1}`);
      if (play.at(-1)?.text !== "Rolled a test roll: 599") errors.push(`the newest entry is "${play.at(-1)?.text}"`);
      const chunks = Object.keys(actor.getFlag("modern20", "log").play);
      if (chunks.length !== Math.ceil(play.length / CHUNK)) errors.push(`${chunks.length} session chunks for ${play.length} entries: the oldest were not deleted`);
    } catch (e) {
      errors.push(e.message);
    }
    await actor.delete();
    return errors;
  },

  async "an ordinary: the book's Puppeteer Host built as one, with no talents, action points or advanced classes"() {
    const errors = [];
    const { doc, wait, click, take } = window.m20test;
    const name = "Puppeteer Host (Human Charismatic Ordinary 5)";
    const c = await doc("creatures", name);
    await c.sheet.render({ force: true });
    await wait(() => c.sheet.element?.querySelector("[data-action=buildCharacter]"), "the Build button");
    const before = new Set(game.actors.map((a) => a.id));
    click(c.sheet.element, "[data-action=buildCharacter]");
    const actor = await wait(() => game.actors.find((a) => !before.has(a.id) && a.type === "character"), "the host to be built", 30000);
    await c.sheet.close();
    try {
      await wait(() => actor.sheet.rendered, "its sheet", 30000);
      // Editing by hand (the Build tab's "Allow editing on every tab"), so the Feats tab shows its pickers.
      actor.sheet.freeEdit = true;
      await actor.sheet.render({ force: true });
      const d = actor.system.derived, p = c.system;
      if (!actor.system.ordinary) errors.push("built as a hero, not an ordinary");
      if (d.level !== 5 || d.classes[0]?.name !== "Charismatic Hero") errors.push(`level ${d.level} (${d.classes.map((x) => `${x.name} ${x.level}`).join(", ")}), not Charismatic 5`);
      const expect = (what, got, want) => { if (got !== want) errors.push(`${what} ${got}, the book ${want}`); };
      expect("base attack", d.baseAttackBonus, p.baseAttackBonus.bonus);
      for (const k of ["fort", "ref", "will"]) expect(`${k} save`, d.saves[k], p.saves[k]);
      for (const [a, v] of Object.entries(p.abilities)) if (v !== null) expect(a, d.scores[a], v);
      if (d.advancement.actionPoints.points) errors.push(`${d.advancement.actionPoints.points} action points owed to an ordinary`);
      if (!actor.sheet.element.querySelector(".m20-tag")?.parentElement.innerText.includes("Ordinary")) errors.push("the header has no Ordinary tag");
      // No talent trees or bonus feat lists on the Feats tab.
      actor.sheet.changeTab("feats", "primary");
      if (actor.sheet.element.querySelector("[data-action=toggleTalent], [data-action=toggleBonusFeat]")) errors.push("the Feats tab offers talents or bonus feats");
      // An advanced class is flagged.
      actor.sheet.changeTab("main", "primary");
      await actor.createEmbeddedDocuments("Item", [await take("classes", "Personality", { level: 1 })]);
      await wait(() => /only the six basic classes/.test(actor.sheet.element?.innerText ?? ""), "the advanced class to be flagged");
      // Unticked, it is a hero again: talents offered.
      const box = actor.sheet.element.querySelector("input[name=\"system.ordinary\"]");
      box.checked = false;
      box.dispatchEvent(new Event("change", { bubbles: true }));
      await wait(() => actor.system.ordinary === false, "the Ordinary box to save");
      actor.sheet.changeTab("feats", "primary");
      await wait(() => actor.sheet.element?.querySelector("[data-action=toggleTalent]"), "talents offered to a hero", 30000);
      await actor.sheet.close();
    } catch (e) {
      errors.push(e.message);
    }
    await actor.delete();
    return errors;
  },

  async "everything in the compendiums, part 1: every class, talent, class feature, feat, spell and power on a character"() {
    return window.m20test.everything(["classes", "talents", "features", "feats", "spells", "powers"]);
  },

  async "everything in the compendiums, part 2: every incantation, occupation, species, piece of equipment, creature type and template"() {
    return window.m20test.everything(["incantations", "occupations", "species", "equipment", "creature-types", "templates"]);
  },

  async "the Skills tab ticks the class skills of the class ranks are being bought as, and follows the choice"() {
    const errors = [];
    const { take, wait } = window.m20test;
    const actor = await Actor.implementation.create({ name: "Two classes (test)", type: "character" });
    await actor.createEmbeddedDocuments("Item", [await take("classes", "Fast Hero", { level: 2 }), await take("classes", "Smart Hero", { level: 1 })]);
    try {
      await actor.update({ "system.levellingAs": "Fast Hero" });
      // Editing by hand, as for a correction or a GM's ruling (the Build tab's "Allow editing on every tab").
      actor.sheet.freeEdit = true;
      await actor.sheet.render({ force: true });
      await wait(() => actor.sheet.rendered, "the sheet");
      actor.sheet.changeTab("skills", "primary");
      // The Class cell of a skill's row: a tick, or the box to mark it by hand.
      const ticked = (key) => !!actor.sheet.element.querySelector(`[data-action=rollSkill][data-skill=${key}]`)?.closest("tr").querySelector("td:nth-child(2) .fa-check");
      const expect = (as, yes, no) => {
        for (const k of yes) if (!ticked(k)) errors.push(`buying as ${as}: ${k} is not ticked`);
        for (const k of no) if (ticked(k)) errors.push(`buying as ${as}: ${k} is ticked`);
      };
      expect("Fast Hero", ["hide", "tumble"], ["research", "computerUse"]);
      // Chosen in the drop-down, the ticks follow.
      const select = actor.sheet.element.querySelector("select[name=\"system.levellingAs\"]");
      select.value = "Smart Hero";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await wait(() => actor.system.levellingAs === "Smart Hero" && ticked("research"), "the ticks to follow Smart Hero");
      expect("Smart Hero", ["research", "computerUse"], ["hide", "tumble"]);
      await actor.sheet.close();
    } catch (e) {
      errors.push(e.message);
    }
    await actor.delete();
    return errors;
  },

  async "languages bought on the Skills tab: a language a specialty of Speak Language, never rolled, and known on the Details tab"() {
    const errors = [];
    const { take, wait, click, type } = window.m20test;
    const actor = await Actor.implementation.create({ name: "Linguist (test)", type: "character" });
    await actor.createEmbeddedDocuments("Item", [await take("classes", "Smart Hero", { level: 2 })]);
    try {
      // Editing by hand, as for a correction or a GM's ruling (the Build tab's "Allow editing on every tab").
      actor.sheet.freeEdit = true;
      await actor.sheet.render({ force: true });
      await wait(() => actor.sheet.rendered, "the sheet");
      actor.sheet.changeTab("skills", "primary");
      // Any language: one the book suggests, and one it does not.
      for (const language of ["French", "Klingon"]) {
        const group = actor.sheet.element.querySelector("tr.m20-skill-group[data-skill=speakLanguage]");
        group.querySelector(".m20-new-specialty").value = language;
        click(group, "[data-action=addSpecialty]");
        await wait(() => actor.system.specialtySkills.some((s) => s.skill === "speakLanguage" && s.specialty === language), `Speak Language (${language}) to be added`);
      }
      const index = actor.system.specialtySkills.findIndex((s) => s.specialty === "French");
      type(actor.sheet.element, `input[name="system.specialtySkills.${index}.ranks"]`, 1);
      await wait(() => actor.system.specialtySkills[index].ranks === 1, "a rank in French");
      const row = actor.sheet.element.querySelector(`input[name="system.specialtySkills.${index}.ranks"]`).closest("tr");
      if (row.querySelector("[data-action=rollSkill]")) errors.push("a language has a roll button");
      if (!row.innerText.includes("French")) errors.push("the language's row does not name it");
      if (!actor.sheet.element.querySelector("datalist#m20-specialties-speakLanguage option[value=Russian]")) errors.push("the book's languages are not suggested");
      actor.sheet.changeTab("details", "primary");
      await wait(() => /speaks French/.test(actor.sheet.element.querySelector("section.tab[data-tab=details]")?.innerText ?? ""), "the Details tab to say French is spoken");
      if (/Klingon/.test(actor.sheet.element.querySelector("section.tab[data-tab=details]").innerText)) errors.push("Klingon, with no rank, is listed as known");
      await actor.sheet.close();
    } catch (e) {
      errors.push(e.message);
    }
    await actor.delete();
    return errors;
  },

  async "special ammunition: a box of beanbags given its caliber, loaded in place of buckshot, and its shots nonlethal"() {
    const errors = [];
    const { take, wait, type } = window.m20test;
    const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: 12 }]));
    const actor = await Actor.implementation.create({ name: "Riot cop (test)", type: "character", system: { abilities } });
    await actor.createEmbeddedDocuments("Item", [
      await take("feats", "Personal Firearms Proficiency"), await take("equipment", "Benelli 121 M1 (12-gauge shotgun)"),
      await take("equipment", "12-gauge buckshot"), await take("equipment", "Beanbag", { quantity: 10 }),
    ]);
    const gun = actor.items.find((i) => i.type === "weapon");
    const buckshot = actor.items.find((i) => i.name === "12-gauge buckshot");
    const beanbag = actor.items.find((i) => i.name === "Beanbag");
    const { reloadWeapon } = await import("/systems/modern20/module/ammo.mjs");
    const { characterRolls } = await import("/systems/modern20/module/roll.mjs");
    try {
      await reloadWeapon(actor, gun);
      // The Benelli holds 7.
      if (gun.system.loaded !== 7 || gun.system.loadedWith !== "") errors.push(`loaded ${gun.system.loaded} with "${gun.system.loadedWith}", not 7 buckshot`);
      // The beanbags' caliber, typed on the Gear tab: they now fit the shotgun.
      await actor.sheet.render({ force: true });
      await wait(() => actor.sheet.rendered, "the sheet");
      actor.sheet.changeTab("gear", "primary");
      type(actor.sheet.element, `[data-item-id="${beanbag.id}"] input[data-item-field=caliber]`, "12-gauge");
      await wait(() => beanbag.system.caliber === "12-gauge", "the caliber to save");
      // Chosen for the shotgun and reloaded: the buckshot comes out, back to its box, and beanbags go in.
      await gun.update({ "system.ammunition": beanbag.id });
      await reloadWeapon(actor, gun);
      if (gun.system.loadedWith !== "beanbag" || gun.system.loaded !== 7) errors.push(`after the swap: ${gun.system.loaded} loaded with "${gun.system.loadedWith}"`);
      if (buckshot.system.quantity !== 10) errors.push(`the buckshot box holds ${buckshot.system.quantity}, not its 10 again`);
      if (beanbag.system.quantity !== 3) errors.push(`the beanbag box holds ${beanbag.system.quantity}, not 3`);
      await wait(() => /Beanbag/.test(actor.sheet.element.querySelector(`[data-item-id="${gun.id}"] .m20-ammo`)?.innerText ?? ""), "the gun's row to say it is loaded with beanbags");
      // Its damage card is nonlethal.
      await characterRolls(actor).attack(gun);
      await characterRolls(actor).damage(gun);
      const card = game.messages.contents.at(-1);
      if (!card.getFlag("modern20", "damage")?.nonlethal) errors.push("a beanbag's damage is not nonlethal");
      if (!/nonlethal/.test(card.flavor)) errors.push("the damage card does not say nonlethal");
      if (gun.system.loaded !== 6) errors.push(`${gun.system.loaded} beanbags left after a shot, not 6`);
      await actor.sheet.close();
    } catch (e) {
      errors.push(e.message);
    }
    await actor.delete();
    return errors;
  },

  async "where things came from: a feature's and a feat's origins on hover, a skill's and a save's parts, and Weapon Focus counted once"() {
    const errors = [];
    const { take, wait } = window.m20test;
    const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: 12 }]));
    const actor = await Actor.implementation.create({ name: "Soldier twice (test)", type: "character", system: { abilities } });
    await actor.createEmbeddedDocuments("Item", [
      await take("classes", "Strong Hero", { level: 3 }), await take("classes", "Soldier", { level: 1 }),
      await take("feats", "Simple Weapons Proficiency"), await take("equipment", "Club"),
    ]);
    try {
      const feature = await wait(() => actor.items.find((i) => i.type === "feature" && i.name === "Weapon Focus"), "the Soldier's Weapon Focus", 20000);
      await feature.update({ "system.choice": "club" });
      // Taken now, at level 4: the feat for the same weapon, and Alertness and Iron Will for the breakdowns.
      await actor.createEmbeddedDocuments("Item", [await take("feats", "Weapon Focus", { choice: "Club" }), await take("feats", "Alertness"), await take("feats", "Iron Will")]);
      const feat = actor.items.find((i) => i.type === "feat" && i.name === "Weapon Focus");
      if (feat.getFlag("modern20", "takenAt") !== 4) errors.push(`the feat records level ${feat.getFlag("modern20", "takenAt")}, not 4`);
      await actor.sheet.render({ force: true });
      await wait(() => actor.sheet.rendered, "the sheet");
      actor.sheet.changeTab("feats", "primary");
      const tip = (item) => actor.sheet.element.querySelector(`[data-item-id="${item.id}"] .m20-item-name`)?.dataset.tooltip ?? "";
      if (!/Class feature of Soldier \(1st level\)/.test(tip(feature))) errors.push(`the feature's tooltip: "${tip(feature)}"`);
      if (!/Taken at level 4/.test(tip(feat))) errors.push(`the feat's tooltip: "${tip(feat)}"`);
      if (!actor.sheet.element.querySelector(`[data-item-id="${feat.id}"] .fa-triangle-exclamation`)) errors.push("the feat taken twice for the club is not flagged");
      // Counted once on the attack.
      const { characterRolls } = await import("/systems/modern20/module/roll.mjs");
      await characterRolls(actor).attack(actor.items.find((i) => i.name === "Club"));
      const focus = [...new DOMParser().parseFromString(game.messages.contents.at(-1).flavor, "text/html").querySelectorAll("li")].map((l) => l.innerText.trim()).filter((t) => /Focus/.test(t));
      if (focus.join("; ") !== "Weapon Focus +1") errors.push(`the club's attack: ${focus.join("; ") || "no Weapon Focus"}, not Weapon Focus +1 once`);
      // A skill's and a save's parts, by name.
      actor.sheet.changeTab("skills", "primary");
      const listen = actor.sheet.element.querySelector("[data-action=rollSkill][data-skill=listen]").closest("tr").querySelector("td.m20-strong")?.dataset.tooltip ?? "";
      if (!/Alertness \+2/.test(listen)) errors.push(`Listen's tooltip: "${listen}"`);
      actor.sheet.changeTab("main", "primary");
      const will = [...actor.sheet.element.querySelectorAll("[data-action=rollSave][data-save=will]")].map((a) => a.closest("dt").nextElementSibling?.dataset.tooltip)[0] ?? "";
      if (!/Iron Will \+2/.test(will)) errors.push(`Will's tooltip: "${will}"`);
      // A class feature giving a feat meets a requirement for it: Holy/Unholy Knight's "Weapon Focus in a melee weapon".
      await actor.createEmbeddedDocuments("Item", [await take("classes", "Holy/Unholy Knight", { level: 1 })]);
      await feat.delete();
      await wait(() => actor.sheet.rendered && /Holy\/Unholy Knight/.test(actor.sheet.element.innerText), "the advanced class on the sheet");
      const reqs = [...actor.sheet.element.querySelectorAll(".m20-requirements")].map((p) => p.innerText).join(" ");
      if (/Weapon Focus/.test(reqs)) errors.push(`the Soldier's Weapon Focus does not meet the knight's requirement: ${reqs}`);
      await actor.sheet.close();
    } catch (e) {
      errors.push(e.message);
    }
    await actor.delete();
    return errors;
  },

  async "levelling up on the Build tab: a new character's 1st level and 2nd, through the level window, and the 2nd undone"() {
    const errors = [];
    const { take, wait, click, doc } = window.m20test;
    const abilities = Object.fromEntries(Object.entries({ str: 10, dex: 16, con: 12, int: 12, wis: 10, cha: 10 }).map(([a, v]) => [a, { value: v }]));
    const actor = await Actor.implementation.create({ name: "New hero (test)", type: "character", system: { abilities } });
    await actor.createEmbeddedDocuments("Item", [await take("occupations", "Criminal")]);
    const fast = await doc("classes", "Fast Hero");
    // Drive the window as a player would: choose, click, and take the level.
    const { LevelUp } = await import("/systems/modern20/module/levelup.mjs");
    const open = async () => {
      const app = new LevelUp(actor);
      await app.render(true);
      await wait(() => app.rendered, "the level window");
      return app;
    };
    const choose = async (app, name, value) => {
      const el = app.element.querySelector(`[name="${name}"]`);
      el.value = value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 400));
    };
    const buy = async (app, skill, times) => {
      for (let i = 0; i < times; i++) {
        click(app.element, `[data-action=buy][data-skill="${skill}|"][data-delta="1"]`);
        await new Promise((r) => setTimeout(r, 150));
      }
    };
    try {
      // Level 1: Fast Hero, maximum hit points, (5 + Int 1) x 4 = 24 points, two feats, the class's and occupation's feats.
      let app = await open();
      await choose(app, "cls", fast.uuid);
      await wait(() => app.element.querySelector("[name='feats.0.name']"), "the feat boxes");
      const left = () => app.element.querySelector(".m20-panel h3 span.m20-hint, .m20-panel h3 span.m20-warning")?.innerText ?? "";
      if (!/24 of 24/.test(app.element.innerText)) errors.push(`level 1's skill points: ${left()}`);
      await buy(app, "hide", 4);
      await buy(app, "computerUse", 2);   // cross-class for a Fast hero: 2 points, 1 rank
      await choose(app, "feats.0.name", "Alertness");
      await choose(app, "feats.1.name", "Dodge");
      // A Fast hero's 1st level brings a talent.
      const talent = [...app.element.querySelectorAll("[name=talent] option")].find((o) => /Evasion/.test(o.textContent));
      if (!talent) errors.push("Fast Hero 1 offers no Evasion talent");
      else await choose(app, "talent", talent.value);
      await wait(() => !app.element.querySelector("[data-action=finish]").disabled, "Take level 1 to be ready");
      click(app.element, "[data-action=finish]");
      await wait(() => actor.items.some((i) => i.type === "class" && i.name === "Fast Hero"), "Fast Hero 1", 20000);
      await wait(() => actor.system.history.length === 1, "level 1 in the history", 20000);
      const h1 = actor.system.history[0];
      if (h1.level !== 1 || h1.hitPoints !== null || !h1.isNew) errors.push(`level 1's record: ${JSON.stringify(h1)}`);
      if (actor.system.skills.hide.ranks !== 4 || actor.system.skills.computerUse.ranks !== 1) errors.push(`ranks after level 1: Hide ${actor.system.skills.hide.ranks}, Computer Use ${actor.system.skills.computerUse.ranks}`);
      if (actor.system.skills.computerUse.points !== 2) errors.push(`Computer Use's points: ${actor.system.skills.computerUse.points}, not 2`);
      for (const n of ["Alertness", "Dodge", "Simple Weapons Proficiency"]) if (!actor.items.some((i) => i.type === "feat" && i.name === n)) errors.push(`no ${n} after level 1`);
      if (actor.system.actionPoints.value !== 5) errors.push(`${actor.system.actionPoints.value} action points after level 1, not 5`);
      if (actor.system.hp.max !== 8 + 1) errors.push(`max hit points ${actor.system.hp.max} at level 1, not 9 (d8 max + Con 1)`);
      // Level 2: a Fast Hero level, 6 on the die, 6 points, a bonus feat from the class's list.
      app = await open();
      await wait(() => app.element.querySelector("[name=hitPoints]"), "the hit points box");
      await choose(app, "hitPoints", 6);
      await buy(app, "hide", 1);
      const bonus = [...app.element.querySelectorAll("[name=bonusFeat] option")].find((o) => /Acrobatic/.test(o.textContent));
      if (!bonus) errors.push("Fast Hero 2 offers no Acrobatic bonus feat");
      else await choose(app, "bonusFeat", bonus.value);
      app.element.querySelector("[name=wealth]").checked = false;
      app.element.querySelector("[name=wealth]").dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 400));
      click(app.element, "[data-action=finish]");
      await wait(() => actor.system.history.length === 2, "level 2 in the history", 20000);
      const cls = actor.items.find((i) => i.type === "class");
      if (cls.system.level !== 2 || cls.system.hitPoints[1] !== 6) errors.push(`after level 2: Fast Hero ${cls.system.level}, rolls ${JSON.stringify(cls.system.hitPoints)}`);
      if (!actor.items.some((i) => i.type === "talent" && i.name === "Evasion")) errors.push("no Evasion from level 1");
      const acrobatic = actor.items.find((i) => i.type === "feat" && i.name === "Acrobatic");
      if (!acrobatic?.getFlag("modern20", "bonusFor")) errors.push("no Acrobatic as Fast Hero's bonus feat after level 2");
      if (actor.system.skills.hide.ranks !== 5) errors.push(`Hide ${actor.system.skills.hide.ranks} after level 2, not 5`);
      // The Build tab lists both levels; level 2 undone takes back exactly what it gave.
      await actor.sheet.render({ force: true });
      await wait(() => actor.sheet.rendered, "the sheet");
      actor.sheet.changeTab("build", "primary");
      const rows = actor.sheet.element.querySelectorAll("section.tab[data-tab=build] table.m20-levels tr").length;
      if (rows !== 2) errors.push(`${rows} levels listed on the Build tab, not 2`);
      if (!actor.sheet.element.querySelector("section.tab[data-tab=skills] input[name=\"system.skills.hide.ranks\"]")?.disabled) errors.push("ranks can be edited on the Skills tab without editing allowed");
      const { undoLastLevel } = await import("/systems/modern20/module/levelup.mjs");
      const undone = undoLastLevel(actor);
      const confirm = await wait(() => [...foundry.applications.instances.values()].find((a) => a instanceof foundry.applications.api.DialogV2 && a.rendered), "the undo question");
      confirm.element.querySelector("button[data-action=yes]").click();
      await undone;
      await wait(() => actor.system.history.length === 1, "level 2 taken back", 20000);
      if (actor.items.find((i) => i.type === "class").system.level !== 1) errors.push("the class is still level 2");
      if (actor.items.some((i) => i.name === "Acrobatic")) errors.push("Acrobatic, level 2's bonus feat, is still there");
      if (!actor.items.some((i) => i.name === "Evasion")) errors.push("Evasion, level 1's, was taken back too");
      if (actor.system.skills.hide.ranks !== 4) errors.push(`Hide ${actor.system.skills.hide.ranks} after the undo, not 4`);
      if (actor.system.actionPoints.value !== 5) errors.push(`${actor.system.actionPoints.value} action points after the undo, not 5`);
      await actor.sheet.close();
    } catch (e) {
      errors.push(e.message);
    }
    for (const app of foundry.applications.instances.values()) if (app.constructor.name === "LevelUp") await app.close();
    await actor.delete();
    return errors;
  },

  async "something gained outside a level: a feat, a new ability, free ranks and +1 Wis, with a note, and undone"() {
    const errors = [];
    const { take, wait, click } = window.m20test;
    const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: 10 }]));
    const actor = await Actor.implementation.create({ name: "Touched (test)", type: "character", system: { abilities } });
    await actor.createEmbeddedDocuments("Item", [await take("classes", "Smart Hero", { level: 2 })]);
    const { Grant, undoLastLevel } = await import("/systems/modern20/module/levelup.mjs");
    const set = async (app, name, value) => {
      const el = app.element.querySelector(`[name="${name}"]`);
      if (!el) throw new Error(`the window has no ${name}`);
      el.value = value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 400));
    };
    try {
      const featsBefore = actor.system.derived.advancement.feats.have;
      const app = new Grant(actor);
      await app.render(true);
      await wait(() => app.rendered, "the window");
      const note = "Touched by the artifact (session 12)";
      await set(app, "note", note);
      await set(app, "items.0.name", "Arcane Skills");
      await set(app, "newFeat.name", "Light at Will");
      await set(app, "newFeat.description", "Casts light at will.");
      click(app.element, "[data-action=addRow][data-list=ranks]");
      await wait(() => app.element.querySelector("[name='ranks.0.skill']"), "a rank row");
      await set(app, "ranks.0.skill", "research|");
      await set(app, "ranks.0.ranks", 2);
      await set(app, "ability", "wis");
      await set(app, "bonus", 1);
      click(app.element, "[data-action=finish]");
      await wait(() => actor.system.history.length === 1, "the grant in the history", 20000);
      const h = actor.system.history[0];
      if (h.kind !== "grant" || h.note !== note) errors.push(`the record: ${JSON.stringify({ kind: h.kind, note: h.note })}`);
      for (const n of ["Arcane Skills", "Light at Will"]) {
        const it = actor.items.find((i) => i.name === n);
        if (!it) errors.push(`no ${n}`);
        else if (it.getFlag("modern20", "grantNote") !== note) errors.push(`${n} does not carry the note`);
      }
      if (actor.system.derived.advancement.feats.have !== featsBefore) errors.push(`granted feats count against the levels': ${featsBefore} → ${actor.system.derived.advancement.feats.have}`);
      if (actor.system.skills.research.ranks !== 2) errors.push(`Research ${actor.system.skills.research.ranks} ranks, not 2`);
      if (actor.system.derived.skills.find((r) => r.key === "research").points !== 0) errors.push("the free ranks cost skill points");
      if (actor.system.derived.scores.wis !== 11) errors.push(`Wis ${actor.system.derived.scores.wis}, not 11`);
      // The sheet says where it came from.
      await actor.sheet.render({ force: true });
      await wait(() => actor.sheet.rendered, "the sheet");
      actor.sheet.changeTab("feats", "primary");
      const tip = actor.sheet.element.querySelector(`[data-item-id="${actor.items.find((i) => i.name === "Light at Will").id}"] .m20-item-name`)?.dataset.tooltip ?? "";
      if (!tip.includes(note)) errors.push(`the new ability's tooltip: "${tip}"`);
      actor.sheet.changeTab("build", "primary");
      if (!actor.sheet.element.querySelector("section.tab[data-tab=build]").innerText.includes(note)) errors.push("the Build tab does not list the grant with its note");
      // Undone: all of it.
      const undone = undoLastLevel(actor);
      const confirm = await wait(() => [...foundry.applications.instances.values()].find((a) => a instanceof foundry.applications.api.DialogV2 && a.rendered), "the undo question");
      confirm.element.querySelector("button[data-action=yes]").click();
      await undone;
      await wait(() => actor.system.history.length === 0, "the grant taken back", 20000);
      if (actor.items.some((i) => ["Arcane Skills", "Light at Will"].includes(i.name))) errors.push("the granted items are still there");
      if (actor.system.skills.research.ranks !== 0) errors.push(`Research ${actor.system.skills.research.ranks} after the undo`);
      if (actor.system.derived.scores.wis !== 10) errors.push(`Wis ${actor.system.derived.scores.wis} after the undo`);
      await actor.sheet.close();
    } catch (e) {
      errors.push(e.message);
    }
    for (const app of foundry.applications.instances.values()) if (app.constructor.name === "Grant") await app.close();
    await actor.delete();
    return errors;
  },
};
