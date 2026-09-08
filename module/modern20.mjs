import { MODERN20 } from "./config.mjs";

import { Modern20Hero } from "./data/actor-hero.mjs";
import { Modern20Ordinary } from "./data/actor-ordinary.mjs";
import { Modern20Creature } from "./data/actor-creature.mjs";
import { Modern20Vehicle } from "./data/actor-vehicle.mjs";
import {
  Modern20Class, Modern20Occupation, Modern20Talent, Modern20Feat,
  Modern20Weapon, Modern20Armor, Modern20Gear, Modern20VehicleMod,
  Modern20Spell, Modern20PsiPower
} from "./data/items.mjs";

import { Modern20Actor } from "./documents/actor.mjs";
import { Modern20Item } from "./documents/item.mjs";
import { Modern20HeroSheet } from "./sheets/actor-sheet.mjs";
import {
  Modern20OrdinarySheet, Modern20CreatureSheet, Modern20VehicleSheet
} from "./sheets/npc-sheets.mjs";
import { Modern20ItemSheet } from "./sheets/item-sheet.mjs";
import { rollWealthCheck, lossFormulaForGap } from "./dice/wealth.mjs";

const SYSTEM_ID = "modern20";

Hooks.once("init", () => {
  console.log(`${SYSTEM_ID} | Initializing the Modern20 game system`);

  CONFIG.MODERN20 = MODERN20;

  CONFIG.Actor.documentClass = Modern20Actor;
  CONFIG.Item.documentClass = Modern20Item;

  CONFIG.Actor.dataModels = {
    hero: Modern20Hero,
    ordinary: Modern20Ordinary,
    creature: Modern20Creature,
    vehicle: Modern20Vehicle
  };

  CONFIG.Item.dataModels = {
    class: Modern20Class,
    occupation: Modern20Occupation,
    talent: Modern20Talent,
    feat: Modern20Feat,
    weapon: Modern20Weapon,
    armor: Modern20Armor,
    gear: Modern20Gear,
    vehicleMod: Modern20VehicleMod,
    spell: Modern20Spell,
    psiPower: Modern20PsiPower
  };

  // Initiative is a straight Dexterity-based check in d20 Modern.
  CONFIG.Combat.initiative = { formula: "1d20 + @attributes.initiative.value", decimals: 0 };

  registerSheets();
  registerHandlebarsHelpers();

  // Exposed so macros and companion modules can reach the system without
  // reaching into module internals.
  game.modern20 = {
    Modern20Actor,
    Modern20Item,
    rollWealthCheck,
    lossFormulaForGap,
    config: MODERN20
  };
});

/**
 * An occupation's Wealth Bonus Increase is a one-time increase to starting
 * Wealth, not an ongoing modifier: Wealth erodes as the character buys things,
 * so re-deriving it every preparation pass would silently refund purchases.
 * Applied once, when the occupation is added to a character.
 */
Hooks.on("createItem", async (item) => {
  if (item.type !== "occupation") return;
  const actor = item.parent;
  if (!actor || actor.system.wealth === undefined) return;
  if (!game.user.isGM && game.user.id !== game.users.find((u) => u.character?.id === actor.id)?.id) return;

  const bonus = item.system.wealthBonus ?? 0;
  if (!bonus) return;

  await actor.update({ "system.wealth.bonus": actor.system.wealth.bonus + bonus });
  ui.notifications.info(game.i18n.format("MODERN20.Info.OccupationWealth", {
    name: item.name, bonus
  }));
});

Hooks.once("ready", () => {
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
    [Modern20VehicleSheet, ["vehicle"], "MODERN20.SheetLabel.Vehicle"]
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

function registerHandlebarsHelpers() {
  // Modifiers read as "+3" / "-1" everywhere on the sheet.
  Handlebars.registerHelper("modern20Signed", (value) => {
    const n = Number(value) || 0;
    return n >= 0 ? `+${n}` : `${n}`;
  });

  Handlebars.registerHelper("modern20Concat", (...args) => args.slice(0, -1).join(""));
}
