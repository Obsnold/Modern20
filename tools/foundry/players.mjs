/**
 * A second player, in a browser of their own: what a player may and may not do, with the GM
 * connected too. run.mjs runs SETUP as the GM, joins as the player and runs AS_PLAYER in their
 * browser, then TOGETHER in both browsers at once (each rolling for the player's hero), then AFTER
 * as the GM. Each is sent to its page on its own, so each is self-contained.
 */

/** As the GM: a player user, a hero they own, the GM's own character with an attack card in chat, a creature. */
export async function SETUP() {
  const user = game.users.getName("Player") ?? await User.implementation.create({ name: "Player", role: CONST.USER_ROLES.PLAYER });
  const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: 12 }]));
  const hero = await Actor.implementation.create({ name: "Player's hero", type: "character", system: { abilities }, ownership: { default: 0, [user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER } });
  await hero.createEmbeddedDocuments("Item", [await window.m20test.take("classes", "Strong Hero", { level: 2 })]);
  const npc = await Actor.implementation.create({ name: "GM's thug", type: "character", system: { abilities } });
  const creature = await Actor.implementation.create({ ...(await window.m20test.doc("creatures", "Wolf")).toObject(), ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER } });
  const { characterRolls } = await import("/systems/modern20/module/roll.mjs");
  await characterRolls(npc).unarmed();
  return { heroId: hero.id, npcId: npc.id, creatureId: creature.id, gmCard: game.messages.contents.at(-1).id };
}

/** As the player: their own character works (its sheet, rolls, a level taken, something granted); the GM's does not, nor damage to a creature they do not own. */
export async function AS_PLAYER({ heroId, npcId, creatureId, gmCard }) {
  const errors = [];
  const wait = async (test, what, ms = 10000) => {
    const until = Date.now() + ms;
    while (Date.now() < until) { const v = await test(); if (v) return v; await new Promise((r) => setTimeout(r, 100)); }
    throw new Error(`waited for ${what}`);
  };
  try {
    // A client setting: the player's browser asks before rolling unless told not to.
    await game.settings.set("modern20", "askBeforeRolling", false);
    if (game.user.isGM) errors.push("the player is a GM");
    const hero = game.actors.get(heroId);
    if (!hero?.isOwner) errors.push("the player does not own their hero");
    if (game.actors.get(npcId)?.testUserPermission(game.user, "LIMITED")) errors.push("the player can see the GM's own character");
    // Their sheet, and a roll from its button.
    await hero.sheet.render({ force: true });
    await wait(() => hero.sheet.rendered, "the hero's sheet");
    const n = game.messages.size;
    hero.sheet.element.querySelector("[data-action=rollSave][data-save=fort]").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await wait(() => game.messages.size > n, "the player's save to post");
    // Their own attack's card has its buttons; the GM's card for the GM's character has none for them.
    const { characterRolls } = await import("/systems/modern20/module/roll.mjs");
    await characterRolls(hero).unarmed();
    const mine = game.messages.contents.at(-1);
    await wait(() => ui.chat.element?.querySelector(`li[data-message-id="${mine.id}"] .m20-card-buttons button`), "buttons on the player's own attack card");
    await wait(() => ui.chat.element?.querySelector(`li[data-message-id="${gmCard}"]`), "the GM's card in the player's chat");
    if (ui.chat.element.querySelector(`li[data-message-id="${gmCard}"] .m20-card-buttons button`)) errors.push("the player has buttons on the GM's attack card");
    // Damage to a creature they do not own is refused, and changes nothing.
    const { applyToActor } = await import("/systems/modern20/module/damage.mjs");
    const creature = game.actors.get(creatureId);
    const hp = creature.system.hp.value;
    await applyToActor(creature, 5);
    if (creature.system.hp.value !== hp) errors.push(`the player damaged a creature they do not own: ${hp} → ${creature.system.hp.value}`);
    // A creature they may only observe: its sheet opens, but offers no Edit and no hit points to change.
    await creature.sheet.render({ force: true });
    await wait(() => creature.sheet.rendered, "the observed creature's sheet");
    if (creature.sheet.element.querySelector("[data-action=toggleEdit]")) errors.push("the player is offered Edit on a creature they only observe");
    if (creature.sheet.element.querySelector("input[name=\"system.hp.value\"]:not([disabled])")) errors.push("the player can change an observed creature's hit points");
    await creature.sheet.close();
    // Their own level, taken in the level window, and something gained outside a level.
    const { LevelUp, Grant } = await import("/systems/modern20/module/levelup.mjs");
    const levelUp = new LevelUp(hero);
    levelUp.choices.hitPoints = 5;
    await levelUp.render(true);
    await wait(() => levelUp.rendered && levelUp.element.querySelector("[data-action=finish]:not([disabled])"), "the level window, ready");
    levelUp.element.querySelector("[data-action=finish]").click();
    await wait(() => hero.system.history.length === 1, "the player's level to be taken", 20000);
    if (hero.items.find((i) => i.type === "class")?.system.level !== 3) errors.push("the player's level did not raise their class to 3");
    const grant = new Grant(hero);
    grant.choices.note = "A gift (player)";
    grant.choices.ranks = [{ skill: "climb|", ranks: 1 }];
    await grant.render(true);
    await wait(() => grant.rendered && grant.element.querySelector("[data-action=finish]:not([disabled])"), "the grant window, ready");
    grant.element.querySelector("[data-action=finish]").click();
    await wait(() => hero.system.history.length === 2, "the player's grant", 20000);
    if (hero.system.skills.climb.ranks < 1) errors.push("the player's granted rank is not there");
    // Their own hit points, changed on their sheet.
    const box = hero.sheet.element.querySelector("input[name=\"system.hp.value\"]");
    box.value = "3";
    box.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(() => hero.system.hp.value === 3, "the player's hit point change");
    await hero.sheet.close();
  } catch (e) {
    errors.push(e.message);
  }
  return errors;
}

/** In both browsers at the same moment: five saves each for the player's hero, the GM's Reflex and the player's Will. */
export async function TOGETHER({ heroId }) {
  const hero = game.actors.get(heroId);
  const { characterRolls } = await import("/systems/modern20/module/roll.mjs");
  const save = game.user.isGM ? "ref" : "will";
  await Promise.all(Array.from({ length: 5 }, () => characterRolls(hero).save(save)));
  return [];
}

/**
 * As the GM again, the player still connected: the player's change and roll are each in the hero's log
 * once, under the player's name; the saves both made at once are all there; and the hero dying in
 * combat gets one save card on its turn, not one from each browser.
 */
export async function AFTER({ heroId }) {
  const errors = [];
  const hero = game.actors.get(heroId);
  await new Promise((r) => setTimeout(r, 1500));
  const { entries } = await import("/systems/modern20/module/rules/log.mjs");
  const log = entries(hero.getFlag("modern20", "log"));
  for (const [save, by] of [["Reflex", "the GM"], ["Will", "the player"]]) {
    const n = log.filter((e) => new RegExp(`${save} save`).test(e.text ?? "")).length;
    if (n !== 5) errors.push(`${n} of ${by}'s 5 ${save} saves, made while the other rolled too, are in the log`);
  }
  const hp = log.filter((e) => e.kind === "play" && e.changes?.some((c) => c.label === "Current HP" && c.to === "3"));
  if (hp.length !== 1) errors.push(`the hit point change is in the log ${hp.length} times, not once`);
  else if (hp[0].userName !== "Player") errors.push(`the hit point change is logged as made by ${hp[0].userName}`);
  const saves = log.filter((e) => /Fortitude save/.test(e.text ?? ""));
  if (saves.length !== 1) errors.push(`the player's save is in the log ${saves.length} times, not once`);
  // Dying in combat: one save card at the start of its turn, with two browsers connected.
  try {
    const { applyToActor } = await import("/systems/modern20/module/damage.mjs");
    await applyToActor(hero, hero.system.hp.value + 3);
    // A combat of no scene, which every browser's tracker shows. (Foundry 14's tracker throws, in a browser
    // viewing another scene, when a scene's combat changes turn: its own fault, not the system's.)
    const combat = await Combat.implementation.create({ scene: null });
    await combat.createEmbeddedDocuments("Combatant", [{ actorId: hero.id }]);
    const n = game.messages.size;
    await combat.startCombat();
    await new Promise((r) => setTimeout(r, 2000));
    const cards = game.messages.contents.slice(n).filter((m) => m.getFlag("modern20", "save")?.kind === "dying");
    if (cards.length !== 1) errors.push(`${cards.length} dying save cards at the start of its turn, not 1`);
    await combat.delete();
  } catch (e) {
    errors.push(`dying in combat: ${e.message}`);
  }
  return errors;
}
