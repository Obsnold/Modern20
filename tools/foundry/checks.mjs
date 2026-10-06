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
    if (packs.length !== 13) errors.push(`${packs.length} compendiums, not 13`);
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
};
