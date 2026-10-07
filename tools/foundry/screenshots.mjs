/**
 * Pictures of the sheets, for a person to look over (layout, overlapping text, what reads badly):
 * what the checks cannot judge. run.mjs takes them after the checks, into the test data folder's
 * screenshots/ (FOUNDRY_SCREENSHOTS=0 skips them).
 *
 * SETUP runs in the page and makes what is pictured; it returns the sheets as `{ name, uuid, tabs }`,
 * `tabs` the tabs to picture (none: the sheet as it opens). SHOW opens one alone, over nothing.
 */
export async function SETUP() {
  const { take } = window.m20test;
  const abilities = (scores) => Object.fromEntries(Object.entries(scores).map(([a, v]) => [a, { value: v }]));
  const gunslinger = await Actor.implementation.create({
    name: "Gunslinger (screenshots)", type: "character",
    system: { abilities: abilities({ str: 12, dex: 16, con: 12, int: 10, wis: 10, cha: 10 }), skills: { sleightOfHand: { ranks: 6 }, tumble: { ranks: 6 }, spot: { ranks: 4 } }, actionPoints: { value: 4, granted: 6 } },
  });
  await gunslinger.createEmbeddedDocuments("Item", [
    await take("classes", "Fast Hero", { level: 4 }), await take("classes", "Gunslinger", { level: 2 }), await take("species", "Half-Elf"),
    await take("occupations", "Military"), await take("feats", "Personal Firearms Proficiency"), await take("feats", "Point Blank Shot"),
    await take("talents", "Evasion"), await take("equipment", "Beretta 92F (9mm autoloader)", { loaded: 12 }), await take("equipment", "9mm"),
    await take("equipment", "Leather jacket", { equipped: true }),
  ]);
  const mage = await Actor.implementation.create({ name: "Mage (screenshots)", type: "character", system: { abilities: abilities({ str: 8, dex: 12, con: 10, int: 17, wis: 12, cha: 10 }) } });
  await mage.createEmbeddedDocuments("Item", [
    await take("classes", "Smart Hero", { level: 4 }), await take("classes", "Mage", { level: 2 }),
    await take("spells", "Daze"), await take("spells", "Burning Hands", { prepared: 1 }), await take("incantations", "Bibliolalia"),
  ]);
  const bodak = await window.m20test.doc("creatures", "Bodak");
  const cls = await window.m20test.doc("classes", "Telepath");
  return [
    { name: "gunslinger", uuid: gunslinger.uuid, tabs: ["main", "build", "skills", "feats", "gear", "effects", "details"] },
    { name: "mage", uuid: mage.uuid, tabs: ["main", "magic"] },
    { name: "creature", uuid: bodak.uuid, tabs: [] },
    { name: "class", uuid: cls.uuid, tabs: [] },
  ];
}

/**
 * Open one sheet, alone and in the middle of the screen, on `tab`: every other window closed, and
 * what Foundry lays over a fresh world (its welcome tour, the notice that the browser has no
 * graphics card) taken away, and the game board hidden. Returns the sheet's element id.
 */
export async function SHOW([uuid, tab]) {
  for (const app of [...foundry.applications.instances.values()].filter((a) => a.rendered && a.hasFrame)) await app.close();
  foundry.nue?.Tour?.activeTour?.exit?.();
  document.querySelectorAll(".tour, .tour-overlay, .tour-fadeout, #notifications").forEach((e) => e.remove());
  // The game board behind is drawn without a graphics card, slowly; the pictures are of the sheets alone.
  const board = document.getElementById("board");
  if (board) board.style.display = "none";
  const doc = await fromUuid(uuid);
  await doc.sheet.render({ force: true, tab: tab ?? undefined });
  await window.m20test.wait(() => doc.sheet.rendered, "the sheet");
  if (tab) doc.sheet.changeTab(tab, "primary");
  doc.sheet.setPosition({ left: 200, top: 40 });
  doc.sheet.bringToFront?.();
  return doc.sheet.id;
}
