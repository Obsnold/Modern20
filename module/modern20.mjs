import { MODERN20 } from "./config.mjs";
import { registerSettings, setting } from "./settings.mjs";

import { Modern20Hero } from "./data/actor-hero.mjs";
import { Modern20Ordinary } from "./data/actor-ordinary.mjs";
import { Modern20Creature } from "./data/actor-creature.mjs";
import { Modern20Vehicle } from "./data/actor-vehicle.mjs";
import { Modern20Object } from "./data/actor-object.mjs";
import {
  Modern20Class, Modern20Occupation, Modern20Talent, Modern20Feat,
  Modern20Weapon, Modern20Armor, Modern20Gear, Modern20Container, Modern20VehicleMod,
  Modern20Spell, Modern20PsiPower, Modern20SpecialAbility, Modern20Species
} from "./data/items.mjs";

import { Modern20Actor } from "./documents/actor.mjs";
import { Modern20Item } from "./documents/item.mjs";
import { Modern20HeroSheet } from "./sheets/actor-sheet.mjs";
import {
  Modern20OrdinarySheet, Modern20CreatureSheet, Modern20VehicleSheet,
  Modern20ObjectSheet
} from "./sheets/npc-sheets.mjs";
import { Modern20ItemSheet } from "./sheets/item-sheet.mjs";
import { rollWealthCheck, lossFormulaForGap } from "./dice/wealth.mjs";
import { applyOccupationWealth, grantFeatByName } from "./apps/occupation.mjs";
import { canTakeSpecies, completeSpecies, uncompleteSpecies } from "./apps/species.mjs";
import { bindDamageControls } from "./apps/damage.mjs";
import { registerConditions } from "./conditions.mjs";
import { activateRulesLinks, rulesLink, rulesTopic, skillRules } from "./rules.mjs";
import { registerEnrichers } from "./enrichers.mjs";
import { Modern20Browser } from "./apps/browser.mjs";
import { Modern20SelfTest } from "./apps/selftest.mjs";
import { registerHotbarDrop, rollItem } from "./macros.mjs";
import { migrateWorld } from "./migrate.mjs";
import { CONDITIONS } from "./condition-list.mjs";
import { ACTIVITY_TYPES } from "./data/activity.mjs";

const SYSTEM_ID = "modern20";

Hooks.once("init", () => {
  console.log(`${SYSTEM_ID} | Initializing the Modern20 game system`);

  CONFIG.MODERN20 = MODERN20;
  // Exposed so a module can register its own activity type before any item is
  // prepared.
  CONFIG.MODERN20.activityTypes = ACTIVITY_TYPES;

  CONFIG.Actor.documentClass = Modern20Actor;
  CONFIG.Item.documentClass = Modern20Item;

  CONFIG.Actor.dataModels = {
    hero: Modern20Hero,
    ordinary: Modern20Ordinary,
    creature: Modern20Creature,
    vehicle: Modern20Vehicle,
    object: Modern20Object
  };

  CONFIG.Item.dataModels = {
    species: Modern20Species,
    class: Modern20Class,
    occupation: Modern20Occupation,
    talent: Modern20Talent,
    feat: Modern20Feat,
    weapon: Modern20Weapon,
    armor: Modern20Armor,
    gear: Modern20Gear,
    container: Modern20Container,
    vehicleMod: Modern20VehicleMod,
    spell: Modern20Spell,
    psiPower: Modern20PsiPower,
    specialAbility: Modern20SpecialAbility
  };

  // Initiative is a straight Dexterity-based check in d20 Modern.
  CONFIG.Combat.initiative = { formula: "1d20 + @attributes.initiative.value", decimals: 0 };

  // Registered before anything reads one: data preparation falls back to the
  // default when a key is missing, but a world should never need that.
  registerSettings();

  registerSheets();
  registerHandlebarsHelpers();
  registerPartials();
  // The rolls the rules text asks for, wherever enriched content is rendered.
  registerEnrichers();
  // After config: several conditions enumerate the skill list.
  registerConditions(CONDITIONS);

  // Exposed so macros and companion modules can reach the system without
  // reaching into module internals.
  game.modern20 = {
    Modern20Actor,
    Modern20Item,
    rollWealthCheck,
    lossFormulaForGap,
    // One window over every pack, which a macro can open as well as the
    // button below: game.modern20.browser().
    browser: () => Modern20Browser.show(),
    // What a macro made by dragging an item to the hotbar calls.
    rollItem,
    // What this system does when it is actually running, which nothing that
    // reads the repository can tell you: game.modern20.selftest().
    selftest: () => Modern20SelfTest.show(),
    config: MODERN20
  };
});

/**
 * Whether this client is the one that should act on a hook.
 *
 * Foundry fires document and combat hooks on every connected client, so
 * anything that writes has to decide which client writes. "The GM" is not an
 * answer when two GMs are connected, and "an owner" is not an answer when a
 * GM and the owner are both looking at the same character — which is how the
 * occupation Wealth bonus came to be added twice, and would have had a
 * dragged species create its traits twice and roll its racial Hit Dice twice.
 *
 * Foundry nominates one: game.users.activeGM resolves to the same user on
 * every client. Where no GM is connected, an owner may act on their own
 * document, and anything not about a particular document waits for a GM —
 * which is what the combat hooks did before by asking for isGM.
 */
function actsOnHooks(actor = null) {
  const activeGM = game.users?.activeGM;
  if (activeGM) return activeGM.id === game.user.id;
  return Boolean(actor?.isOwner);
}

/**
 * An occupation's Wealth increase is applied when it is added. The skill and
 * bonus feat choices are made inline - in the creator, or on the occupation
 * item's own sheet - rather than by interrupting with a dialog.
 */
Hooks.on("createItem", async (item) => {
  if (item.type !== "occupation") return;
  const actor = item.parent;
  if (!actsOnHooks(actor)) return;

  await applyOccupationWealth(actor, item);
});

/**
 * A species grants what it grants however it arrived.
 *
 * applySpecies and removeSpecies do the work themselves and await it, because
 * their callers — the creator, the self-test — carry straight on and need it
 * finished. They say so with an option, and these hooks stand down. What is
 * left for the hooks is the other way in: a species dragged onto a sheet from
 * the compendium, or deleted with the trash button, where nobody is waiting.
 *
 * A hook handler cannot be awaited by whatever caused it. That is the whole
 * reason for the split: when the granting lived here alone, the creator
 * raced it, and the self-test saw a species with none of its traits and then
 * an exception from work still running against an actor it had deleted.
 */
Hooks.on("createItem", async (item, options) => {
  if (item.type !== "species" || options?.modern20Species) return;
  const actor = item.parent;
  if (!actsOnHooks(actor)) return;

  // A character has one species. Dropping a second is refused by removing it
  // again, because a hook cannot stop the creation it is told about.
  if (!canTakeSpecies(actor, item.id)) {
    await actor.deleteEmbeddedDocuments("Item", [item.id], { modern20Species: true });
    return;
  }
  await completeSpecies(actor, item);
});

Hooks.on("deleteItem", async (item, options) => {
  if (item.type !== "species" || options?.modern20Species) return;
  const actor = item.parent;
  if (!actsOnHooks(actor)) return;

  await uncompleteSpecies(actor, item);
});

/**
 * Picking the occupation's bonus feat on its sheet grants the feat, so the
 * choice has an effect without a separate step.
 */
Hooks.on("updateItem", async (item, changes) => {
  if (item.type !== "occupation") return;
  const chosen = changes.system?.bonusFeatChosen;
  if (!chosen) return;
  const actor = item.parent;
  if (!actsOnHooks(actor)) return;

  await grantFeatByName(actor, chosen);
});

// renderChatMessage was deprecated in v13 in favour of this, which passes an
// HTMLElement rather than jQuery.
Hooks.on("renderChatMessageHTML", (message, html) => bindDamageControls(message, html));

/**
 * Refill the turn budget when a combatant's turn comes round.
 *
 * "Each round's activity begins with the character with the highest initiative
 * result and then proceeds, in order, from there." Only the GM writes, so the
 * update happens once rather than once per connected client.
 */
Hooks.on("combatTurnChange", async (combat, previous, current) => {
  if (!actsOnHooks() || !setting("autoTurnReset")) return;
  const actor = combat.combatants.get(current?.combatantId)?.actor;
  if (!actor) return;

  // "Each round a dying character loses 1 hit point until he or she dies or
  // becomes stable." Before the turn refills, since a dying character has no
  // turn to take.
  await actor.bleed();

  await actor.startTurn();
  // The character has now had a chance to act, so is no longer flat-footed.
  if (setting("autoFlatFooted")) {
    await actor.toggleStatusEffect("flatfooted", { active: false });
  }
});

/**
 * "At the start of a battle, before the character has had a chance to act
 * (specifically, before the character's first turn in the initiative order),
 * the character is flat-footed."
 *
 * Applied to everyone when the battle starts and cleared as each combatant's
 * turn arrives, which is exactly what the rule describes. Surprise is not
 * automated: who was aware of whom is the GM's call, not the tracker's.
 */
Hooks.on("combatStart", async (combat) => {
  if (!actsOnHooks()) return;
  const flatFooted = setting("autoFlatFooted");
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!actor) continue;
    if (setting("autoTurnReset")) await actor.startTurn();
    if (flatFooted) await actor.toggleStatusEffect("flatfooted", { active: true });
  }
});

/**
 * A way into the browser from where the packs are.
 *
 * The compendium sidebar is core's, so the button is added to the rendered
 * directory rather than to a template of ours — and inside a try, because a
 * change to core's own markup should cost a button rather than the sidebar.
 */
Hooks.on("renderCompendiumDirectory", (app, html) => {
  try {
    // v13 hands the hook an element; older cores handed it jQuery. Neither
    // HTMLElement nor jQuery is a global this system may reach for.
    const element = html?.nodeType === 1 ? html : html?.[0];
    if (!element || element.querySelector(".m20-browse")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "m20-browse";
    button.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> `
      + game.i18n.localize("MODERN20.Browser.Open");
    button.addEventListener("click", () => Modern20Browser.show());
    (element.querySelector(".directory-footer") ?? element).append(button);
  } catch (error) {
    console.warn(`${SYSTEM_ID} | could not add the browser button to the sidebar`, error);
  }
});

Hooks.once("ready", () => {
  // One delegated handler for every rules link on every sheet, card and app.
  activateRulesLinks();
  // An item dropped on the hotbar becomes a macro that uses it.
  registerHotbarDrop();
  // Derived data that arrived after this world did. Not awaited: the world is
  // playable while it runs, and a failure inside it says so itself.
  migrateWorld();
  console.log(`${SYSTEM_ID} | Ready`);
});

function registerSheets() {
  const { DocumentSheetConfig } = foundry.applications.apps;
  const { Actor: ActorDoc, Item: ItemDoc } = foundry.documents;

  // One sheet per actor type: an ordinary has no action points, a creature has
  // neither Wealth nor action points, and a vehicle has no abilities at all.
  // Sharing the hero sheet rendered inputs bound to fields those schemas do
  // not define.
  const actorSheets = [
    [Modern20HeroSheet, ["hero"], "MODERN20.SheetLabel.Hero"],
    [Modern20OrdinarySheet, ["ordinary"], "MODERN20.SheetLabel.Ordinary"],
    [Modern20CreatureSheet, ["creature"], "MODERN20.SheetLabel.Creature"],
    [Modern20VehicleSheet, ["vehicle"], "MODERN20.SheetLabel.Vehicle"],
    [Modern20ObjectSheet, ["object"], "MODERN20.SheetLabel.Object"]
  ];

  for (const [sheet, types, label] of actorSheets) {
    DocumentSheetConfig.registerSheet(ActorDoc, SYSTEM_ID, sheet, {
      types, makeDefault: true, label
    });
  }

  DocumentSheetConfig.registerSheet(ItemDoc, SYSTEM_ID, Modern20ItemSheet, {
    makeDefault: true,
    label: "MODERN20.SheetLabel.Item"
  });
}

/**
 * Templates used with {{> ...}} have to be loaded before they can be resolved
 * as partials; HandlebarsApplicationMixin only loads an application's own PARTS.
 */
function registerPartials() {
  foundry.applications.handlebars.loadTemplates([
    "systems/modern20/templates/creator/skills-table.hbs"
  ]);
}

function registerHandlebarsHelpers() {
  // Modifiers read as "+3" / "-1" everywhere on the sheet.
  Handlebars.registerHelper("modern20Signed", (value) => {
    const n = Number(value) || 0;
    return n >= 0 ? `+${n}` : `${n}`;
  });

  Handlebars.registerHelper("modern20Concat", (...args) => args.slice(0, -1).join(""));

  // Core ships eq/lt/gt but nothing for array membership, which the
  // occupation sheet needs to tick the skills already chosen.
  Handlebars.registerHelper("includes", (list, value) =>
    Array.isArray(list) && list.includes(value));

  // Core has no arithmetic helper; the level-up preview needs "score + 1".
  Handlebars.registerHelper("add", (a, b) => (Number(a) || 0) + (Number(b) || 0));

  // Core has no way to write a literal list in a template.
  Handlebars.registerHelper("array", (...args) => args.slice(0, -1));

  /**
   * A link into the rules compendium: `{{modern20Rules topic="wealth"}}`,
   * `{{modern20Rules uuid=system.rulesPage}}` or
   * `{{modern20Rules skill=row.key specialty=row.specialty}}`.
   *
   * Named arguments because the three ways of naming a page are not
   * interchangeable, and a helper that took one positional argument would
   * leave every template working out which it had.
   */
  Handlebars.registerHelper("modern20Rules", (options) => {
    const { topic, uuid, skill, specialty, label } = options?.hash ?? {};
    const page = uuid
      || (topic ? rulesTopic(topic) : "")
      || (skill ? skillRules(skill, specialty) : "");
    return new Handlebars.SafeString(rulesLink(page, { label }));
  });
}
