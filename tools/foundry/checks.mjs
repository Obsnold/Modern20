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
    async take(pack, name, system = {}) {
      const o = (await window.m20test.doc(pack, name)).toObject();
      delete o._id;
      foundry.utils.mergeObject(o.system, system);
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

  async "the roll dialog: a modifier, an action point, firing modes, Point Blank Shot and a talent's note"() {
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
};
