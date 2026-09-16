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

/** The species a character already has, or null. */
export function speciesOf(actor) {
  return actor?.items?.find((item) => item.type === "species") ?? null;
}

/**
 * Add a species to a character, with everything it grants.
 *
 * @param {any} actor                    The character.
 * @param {string} uuid                  The species document to add.
 * @param {object} [options]
 * @param {string} [options.bonusFeat]   Which of the offered feats was taken.
 * @param {boolean} [options.rollHitDice]  Whether to roll the racial Hit Dice
 *   and add them. False when a sheet is being transcribed and already has the
 *   hit points written on it.
 * @returns {Promise<any|null>} The species item, or null if nothing was added.
 */
export async function applySpecies(actor, uuid, { bonusFeat = "", rollHitDice = true } = {}) {
  if (!actor || !uuid) return null;

  // Only a hero applies one. Every character-building item works this way —
  // a class on an ordinary derives nothing either — but a species that went
  // on and changed no number would look like it had worked, so say so.
  if (actor.type !== "hero") {
    problem(game.i18n.format("MODERN20.Species.HeroOnly", { name: actor.name }));
    return null;
  }

  const existing = speciesOf(actor);
  if (existing) {
    problem(game.i18n.format("MODERN20.Species.AlreadyHas", {
      name: actor.name, species: existing.name
    }));
    return null;
  }

  const document = await foundry.utils.fromUuid(uuid);
  if (!document) return null;

  const source = document.toObject();
  if (bonusFeat) source.system.bonusFeatChosen = bonusFeat;
  const stamp = sourceStamp({ origin: "species", label: document.name });
  foundry.utils.setProperty(source, "flags.modern20.source", stamp);

  const [species] = await actor.createEmbeddedDocuments("Item", [source]);
  if (!species) return null;

  // The named qualities, as items. The SRD prints these under SPECIES TRAITS
  // and specialAbility is the type that already existed for exactly them.
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
    flags: { modern20: { source: stamp } }
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
    img: species.img,
    rules: ""
  });

  return species;
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
