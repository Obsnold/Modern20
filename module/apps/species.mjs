import { MODERN20 } from "../config.mjs";
import { packDocuments, sourceStamp } from "./level-up.mjs";
import { grantFeatByName } from "./occupation.mjs";
import { announce, problem } from "./announce.mjs";

/**
 * Applying a species, which is the half a data model cannot do.
 *
 * Everything a species changes about a character's numbers is derived from
 * the item on every preparation pass, so nothing here touches Strength or
 * Defense or size. What is left is the part that has to happen once, because
 * it is rolled or chosen:
 *
 *   - the named qualities become specialAbility items, so darkvision is a
 *     thing on the sheet rather than a sentence in an item nobody opens
 *   - the bonus feats are granted from the feats compendium
 *   - the racial Hit Dice are rolled, which is the one number that would be
 *     absurd to re-derive: a bugbear's 3d8 re-rolling itself on every render
 *
 * A character has one species or none. d20 Modern proper needs none — it
 * prints one playable species and calls it the baseline — so nothing here
 * runs unless a species is actually added.
 */

const SPECIES_PACK = "modern20.species";

/**
 * Every species in the compendium, described well enough to choose between.
 *
 * A picker that offers eighteen names and nothing else is a picker nobody can
 * use: what separates an ogre from a halfling is the numbers, so the numbers
 * come with the name.
 */
export async function speciesChoices() {
  const documents = await packDocuments(SPECIES_PACK);
  return documents
    .map((document) => {
      const system = document.system;
      return {
        uuid: document.uuid,
        name: document.name,
        img: document.img,
        size: system.size,
        sizeLabel: game.i18n.localize(MODERN20.sizes[system.size]?.label ?? system.size),
        baseSpeed: system.baseSpeed,
        nonhuman: system.nonhuman,
        reach: system.reach,
        naturalArmor: system.naturalArmor,
        attackBonus: system.attackBonus,
        extraHitDice: system.extraHitDice,
        hitDiceFormula: `${system.extraHitDice}${system.hitDie}`,
        levelAdjustment: system.levelAdjustment,
        // Null is not zero: the aasimar's entry prints the label and leaves it
        // blank, and the step says so rather than claim a number.
        hasLevelAdjustment: system.levelAdjustment !== null,
        modifiers: Object.entries(system.abilityModifiers ?? {})
          .filter(([, amount]) => amount)
          .map(([key, amount]) => ({
            label: game.i18n.localize(MODERN20.abilities[key]),
            value: amount >= 0 ? `+${amount}` : `${amount}`
          })),
        traits: (system.traits ?? []).map((trait) => trait.name),
        bonusFeats: system.bonusFeats ?? [],
        bonusFeatOptions: system.bonusFeatOptions ?? [],
        freeLanguages: system.freeLanguages,
        otherLanguages: system.otherLanguages,
        rulesPage: system.rulesPage
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The size on the sheet with no species applied over it. */
function storedSize(actor) {
  return actor.system?._source?.attributes?.size ?? "medium";
}

/**
 * A species decides how big you are, and a token has to follow.
 *
 * Size is derived from the species item, so the sheet is right the moment one
 * is added — but a prototype token's width and height are stored, and nothing
 * derives them. An ogre hero was Large on its sheet and one square on the
 * canvas.
 *
 * Only where the token still matches the size it had: a token somebody has
 * resized by hand is a decision, which is the rule module/migrate.mjs follows
 * for the creatures it repairs.
 */
async function syncTokenToSize(actor, from, to) {
  if (!actor?.isOwner) return;
  if (game.users.activeGM?.id !== game.user.id
      && !actor.testUserPermission(game.user, "OWNER")) return;

  const was = MODERN20.sizes[from]?.squares ?? 1;
  const now = MODERN20.sizes[to]?.squares ?? 1;
  if (was === now) return;

  const token = actor.prototypeToken ?? {};
  if (token.width !== was || token.height !== was) return;

  await actor.update({ prototypeToken: { width: now, height: now } });
}

/**
 * Everything that happens once a species item exists on an actor.
 *
 * One function so that there is one answer, whether the item arrived through
 * applySpecies — which awaits this — or by being dragged onto a sheet, where
 * the createItem hook calls it and nobody is waiting.
 */
export async function completeSpecies(actor, species, { rollHitDice = true } = {}) {
  await grantSpecies(actor, species, { rollHitDice });
  await syncTokenToSize(actor, storedSize(actor), species.system.size);
}

/**
 * Take a species off a character and await the consequences.
 *
 * The trash button on the sheet goes through the deleteItem hook instead;
 * this is for a caller that has to know the work is finished.
 */
export async function removeSpecies(actor, species) {
  if (!actor || !species) return;
  await actor.deleteEmbeddedDocuments("Item", [species.id], { modern20Species: true });
  await uncompleteSpecies(actor, species);
}

/**
 * Everything that has to happen once a species item is gone.
 *
 * The mirror of completeSpecies, and shared the same way: removeSpecies
 * awaits it, and the deleteItem hook calls it for the trash button on the
 * sheet. Leaving the token out of the hook's path left an ex-ogre standing in
 * four squares.
 */
export async function uncompleteSpecies(actor, species) {
  await removeSpeciesGrants(actor, species);
  await syncTokenToSize(actor, species.system.size, storedSize(actor));
}

/**
 * Add a species to a character, with everything it grants.
 *
 * The checked, awaited way in. It refuses a second species, records the feat
 * that was picked, and finishes the granting before it returns — which the
 * creator needs, because the next thing it does is set hit points the racial
 * Hit Dice are added to. A species dragged onto a sheet instead goes through
 * the createItem hook, which calls the same completeSpecies.
 *
 * @param {any} actor                    The character.
 * @param {string} uuid                  The species document to add.
 * @param {object} [options]
 * @param {string} [options.bonusFeat]   Which of the offered feats was taken.
 * @param {boolean} [options.rollHitDice]  Whether to roll the racial Hit Dice
 *   now. The creator passes false and rolls them itself, after the first
 *   class level has set the hit points these are added to.
 * @returns {Promise<any|null>} The species item, or null if nothing was added.
 */
export async function applySpecies(actor, uuid, { bonusFeat = "", rollHitDice = true } = {}) {
  if (!actor || !uuid) return null;
  if (!canTakeSpecies(actor)) return null;

  const document = await foundry.utils.fromUuid(uuid);
  if (!document) return null;

  const source = document.toObject();
  if (bonusFeat) source.system.bonusFeatChosen = bonusFeat;
  source.system.rolledHitPoints = 0;
  foundry.utils.setProperty(source, "flags.modern20.source",
                            sourceStamp({ origin: "species", label: document.name }));

  // The option tells the createItem hook to stand down: the granting happens
  // here, awaited, because every caller of this carries straight on.
  const [species] = await actor.createEmbeddedDocuments(
    "Item", [source], { modern20Species: true }
  );
  if (!species) return null;

  await completeSpecies(actor, species, { rollHitDice });
  return species;
}

/**
 * Whether this actor may take a species at all, saying why if not.
 *
 * Checked here and again in the hook, because the two ways in are different:
 * this one is a function call that can refuse before anything is created, and
 * the hook is a species already dropped on a sheet.
 */
export function canTakeSpecies(actor, ignore = null) {
  // Only a hero applies one. Every character-building item works this way —
  // a class on an ordinary derives nothing either — but a species that went
  // on and changed no number would look like it had worked, so say so.
  if (actor.type !== "hero") {
    problem(game.i18n.format("MODERN20.Species.HeroOnly", { name: actor.name }));
    return false;
  }

  const existing = actor.items.find(
    (item) => item.type === "species" && item.id !== ignore
  );
  if (existing) {
    problem(game.i18n.format("MODERN20.Species.AlreadyHas", {
      name: actor.name, species: existing.name
    }));
    return false;
  }
  return true;
}

/**
 * Everything a species grants beyond the numbers its item derives.
 *
 * Called from the createItem hook, so it runs whichever way the item arrived.
 * The traits become specialAbility items — the type that already existed for
 * exactly them — and are stamped with the species, which is what lets
 * removing it take them away again.
 */
export async function grantSpecies(actor, species, { rollHitDice = true } = {}) {
  const stamp = species.flags?.modern20?.source
    ?? sourceStamp({ origin: "species", label: species.name });

  const traits = (species.system.traits ?? []).map((trait) => ({
    name: trait.name,
    type: "specialAbility",
    img: species.img,
    system: {
      description: trait.description,
      source: species.system.source,
      srdUrl: species.system.srdUrl,
      rulesPage: species.system.rulesPage,
      abilityType: trait.abilityType ?? "",
      sense: Boolean(trait.sense)
    },
    flags: { modern20: { source: stamp, speciesId: species.id } }
  }));
  if (traits.length) await actor.createEmbeddedDocuments("Item", traits);

  for (const name of species.system.bonusFeats ?? []) await grantFeatByName(actor, name);
  if (species.system.bonusFeatChosen) {
    await grantFeatByName(actor, species.system.bonusFeatChosen);
  }

  const lines = [];
  if (rollHitDice && species.system.extraHitDice) {
    const gained = await rollRacialHitDice(actor, species);
    if (gained) lines.push(gained);
  }

  await announce(actor, {
    title: game.i18n.format("MODERN20.Species.Applied", {
      name: actor.name, species: species.name
    }),
    lines,
    img: species.img
  });
}

/**
 * Take back what a species gave, when the species itself is removed.
 *
 * The derived half — size, speed, reach, natural armor, the attack bonus and
 * the ability modifiers — reverts on its own, because it was never stored.
 * This is the rest. The traits go, because a trait is a copy of a line on the
 * species and an orphaned one claims the character still has darkvision. The
 * hit points go, because the roll was recorded for exactly this.
 *
 * The feats stay, and are named rather than removed: a feat is something the
 * character learned, it may since have been a prerequisite for something
 * else, and a player who wants it gone can delete it.
 */
export async function removeSpeciesGrants(actor, species) {
  const traits = actor.items
    .filter((item) => item.type === "specialAbility"
      && item.flags?.modern20?.speciesId === species.id)
    .map((item) => item.id);
  if (traits.length) await actor.deleteEmbeddedDocuments("Item", traits);

  const rolled = species.system.rolledHitPoints ?? 0;
  if (rolled) {
    const hp = actor.system.hp;
    await actor.update({
      "system.hp.max": Math.max(1, hp.max - rolled),
      "system.hp.value": Math.max(0, Math.min(hp.value, hp.max - rolled))
    });
  }

  const kept = (species.system.bonusFeats ?? []).slice();
  if (species.system.bonusFeatChosen) kept.push(species.system.bonusFeatChosen);

  const lines = [];
  if (traits.length) {
    lines.push(game.i18n.format("MODERN20.Species.RemovedTraits", { count: traits.length }));
  }
  if (rolled) {
    lines.push(game.i18n.format("MODERN20.Species.RemovedHitPoints", { points: rolled }));
  }
  if (kept.length) {
    lines.push(game.i18n.format("MODERN20.Species.KeptFeats", { names: kept.join(", ") }));
  }
  if (!lines.length) return;

  await announce(actor, {
    title: game.i18n.format("MODERN20.Species.Removed", {
      name: actor.name, species: species.name
    }),
    lines,
    img: species.img
  });
}

/**
 * Roll the racial Hit Dice and add them to the character's hit points.
 *
 * "A bugbear gains 3 Hit Dice (3d8 hit points). The bugbear's Constitution
 * modifier applies to each Hit Die when determining hit points." Added rather
 * than set: these come before the first class level, and the class adds its
 * own on top.
 */
export async function rollRacialHitDice(actor, species) {
  const dice = species.system.extraHitDice;
  const die = species.system.hitDie || "d8";
  const con = actor.system.abilities?.con?.mod ?? 0;

  const roll = await new foundry.dice.Roll(`${dice}${die} + ${dice} * ${con}`).evaluate();
  // The SRD's floor for hit points is one per Hit Die, which a bad roll and a
  // negative Constitution modifier can otherwise take a character below.
  const gained = Math.max(dice, roll.total);

  const hp = actor.system.hp;
  await actor.update({
    "system.hp.max": hp.max + gained,
    "system.hp.value": hp.value + gained
  });
  // Recorded on the species, so removing it gives back this number and not a
  // fresh roll or an average.
  await species.update({ "system.rolledHitPoints": gained });

  await roll.toMessage({
    speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
    flavor: game.i18n.format("MODERN20.Species.Rolled", {
      dice: `${dice}${die}`,
      gained,
      rolled: roll.total,
      con: con >= 0 ? ` +${con}` : ` ${con}`
    })
  });

  return game.i18n.format("MODERN20.Species.Rolled", {
    dice: `${dice}${die}`, gained, rolled: roll.total,
    con: con >= 0 ? ` +${con}` : ` ${con}`
  });
}
