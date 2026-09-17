import { EXPECTED } from "./selftest-data.mjs";
import { MODERN20 } from "./config.mjs";
import { RULES_TOPICS, SKILL_RULES } from "./rules-links.mjs";
import { rulesTopic, skillRules } from "./rules.mjs";
import { checkRoll } from "./enrichers.mjs";
import { applySpecies, removeSpecies } from "./apps/species.mjs";

/**
 * What this system does when it is actually running.
 *
 * Every other check in this repository reads files. None of them has ever seen
 * a document load, a sheet derive a number, or a browser fetch an image, and
 * the bugs that reached a table were all of that kind: 183 creatures showing a
 * Defense the book does not print, a compendium that was empty because the
 * deploy never packed it, artwork nobody was being served while it was
 * adjusted three times. Each was found by a person looking at Foundry, which
 * is the slowest instrument available.
 *
 * So this runs in a world, as the GM, and asks the questions only a world can
 * answer:
 *
 *   - do the compendia hold what was built, and does every document in them
 *     construct? A pack that failed to compile is an empty sidebar entry.
 *   - does a character sheet derive the numbers the book prints, from a class
 *     item dragged out of the compendium?
 *   - does a creature's sheet show its printed Defense, at every size?
 *   - do the rules links resolve, and do the rolls in the text roll?
 *   - is the artwork actually being served?
 *   - do the chat cards render?
 *
 * Nothing it does is saved. The actors it builds are constructed in memory and
 * never created, which is also why it is safe to run on a live world mid-game:
 * the only documents it creates are the chat messages it posts, and it deletes
 * those itself.
 */

const { Actor, ChatMessage } = foundry.documents;

const SYSTEM_ID = "modern20";

// Bumped whenever this suite changes, and printed in the report. Two runs have
// now come back byte-identical after a fix, with no way to tell "the fix did
// not work" from "the fix is not on the host yet". A report that names the
// code that produced it answers that in its first line.
export const SUITE_REVISION = 3;

/** One question and its answer. */
class Results {
  constructor() {
    this.rows = [];
    this.group = "";
  }

  section(name) {
    this.group = name;
  }

  /** Record a pass or a failure, with what was expected where it failed. */
  ok(name, passed, detail = "") {
    this.rows.push({ group: this.group, name, passed: Boolean(passed), detail });
    return Boolean(passed);
  }

  /** Compare two values, and say both when they differ. */
  same(name, got, wanted) {
    const passed = got === wanted;
    return this.ok(name, passed, passed ? "" : `expected ${wanted}, got ${got}`);
  }

  get passed() { return this.rows.filter((row) => row.passed).length; }
  get failed() { return this.rows.filter((row) => !row.passed).length; }
}

/**
 * Run every group, and return the results.
 *
 * Each group is wrapped on its own: a group that throws records the throw and
 * the rest still run, because the first failure is rarely the only one and a
 * report that stops at it wastes the trip.
 */
export async function runSelfTest({ images = true } = {}) {
  const results = new Results();

  // What the console and the notification bar say while this runs, which is
  // otherwise a red banner that is gone before it can be read. A report that
  // says "eleven failures" and does not say "and this exception" sends the
  // reader looking in the wrong place.
  const noticed = [];
  const realError = console.error;
  const realNotify = ui.notifications?.error?.bind(ui.notifications);
  console.error = (...args) => {
    noticed.push(args.map((arg) => String(arg?.message ?? arg)).join(" "));
    realError(...args);
  };
  if (realNotify) {
    ui.notifications.error = (message, options) => {
      noticed.push(String(message?.message ?? message));
      return realNotify(message, options);
    };
  }

/** @type {[string, (results: any) => Promise<void>][]} */
    const groups = [
    ["Compendia", checkPacks],
    ["Character sheet", checkHero],
    ["Species", checkSpecies],
    ["Creatures", checkCreatures],
    ["Ready-made characters", checkPregens],
    ["Rules links", checkRulesLinks],
    ["Rolls in the text", checkEnrichers],
    ["Chat cards", checkChatCards]
  ];
  if (images) groups.push(["Artwork", checkImages]);

  try {
    for (const [name, group] of groups) {
      results.section(name);
      try {
        await group(results);
      } catch (error) {
        results.ok(`${name} finished`, false, String(error?.message ?? error));
        realError(`${SYSTEM_ID} | self-test: ${name}`, error);
      }
    }
  } finally {
    console.error = realError;
    if (realNotify) ui.notifications.error = realNotify;
  }

  if (noticed.length) {
    results.section("While it ran");
    // Deduplicated: one fault that repeats per document would otherwise be
    // hundreds of rows saying the same thing.
    for (const message of [...new Set(noticed)].slice(0, 5)) {
      results.ok("an error was reported", false, message.slice(0, 400));
    }
  }
  return results;
}

/**
 * Every compendium holds what was built, and every document in it constructs.
 *
 * `getDocuments()` rather than the index: an index entry exists for a document
 * whose data model throws on load, and a compendium full of those looks
 * perfectly normal until somebody opens one.
 */
async function checkPacks(results) {
  for (const [name, expected] of Object.entries(EXPECTED.packs)) {
    const pack = game.packs?.get(`${SYSTEM_ID}.${name}`);
    if (!results.ok(`${name} is registered`, Boolean(pack))) continue;

    const index = await pack.getIndex();
    results.same(`${name} holds ${expected}`, index.size, expected);
  }

  // One pack read in full, since reading all fifteen would take longer than
  // anybody will wait: creatures is the one with embedded documents, active
  // effects and prototype tokens on every entry.
  const creatures = game.packs?.get(`${SYSTEM_ID}.creatures`);
  if (!creatures) return;
  const documents = await creatures.getDocuments();
  const broken = documents.filter((actor) => !actor.system || !actor.name);
  results.ok("every creature constructs", broken.length === 0,
             broken.length ? `${broken.length} failed to build` : "");

  const items = documents.reduce((total, actor) => total + actor.items.size, 0);
  results.ok(`creatures carry their ${items} abilities`, items > 0);
}

/**
 * A character sheet derives what the book prints.
 *
 * The character is made the way a player makes one: an actor, and a class item
 * dropped onto it. It is deleted in a `finally`, so what is left behind is
 * nothing, and what is exercised is the path a table actually takes.
 *
 * Two earlier attempts avoided touching the world and both produced an actor
 * with no items on it — `new Actor({ items: [...] })` and then
 * `create(..., { temporary: true })`. Foundry does not build embedded
 * collections for a document that was never saved, and the symptom is every
 * class-derived number coming back as though the character had no class:
 * eight failures that read like the class system is broken. The two fixture
 * rows below are there because of that. A test that cannot say whether its own
 * setup worked will blame the system every time.
 */
async function checkHero(results) {
  const wanted = EXPECTED.class;
  const cls = await foundry.utils.fromUuid(wanted.uuid);
  if (!results.ok(`${wanted.name} is in the compendium`, Boolean(cls))) return;

  const source = cls.toObject();
  source.system.levels = wanted.levels;
  // Pack bookkeeping, which a document in a world has no use for. Dropped so
  // that if any of it is what a creation refuses, it is not this that refuses.
  for (const key of ["_id", "_key", "_slug", "_stats", "ownership", "folder", "sort"]) {
    delete source[key];
  }

  if (!game.user?.isGM) {
    results.ok("a character can be made to check the arithmetic on", false,
               "only a GM can create the actor this needs");
    return;
  }

  const abilities = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
  let actor = null;
  try {
    actor = await Actor.implementation.create({
      name: "Modern20 self-test (deleted when this finishes)",
      type: "hero",
      system: {
        abilities: Object.fromEntries(
          Object.entries(abilities).map(([key, value]) => [key, { value }])
        )
      }
    });
    // Dropped on, the way the sheet does it. What this returns is reported
    // rather than assumed: an item that fails validation is logged and
    // skipped, and the only visible symptom is a character with no class.
    let created = [];
    try {
      created = await actor.createEmbeddedDocuments("Item", [source]);
    } catch (error) {
      results.ok("the class item can be added to a character", false,
                 String(error?.message ?? error));
    }
    results.same("adding the class item created one document", created.length, 1);

    await checkHeroNumbers(results, actor, wanted, abilities);
  } finally {
    if (actor?.id) await actor.delete();
  }
}

/** The numbers a sheet shows once a class is on it. */
async function checkHeroNumbers(results, actor, wanted, abilities) {
  // The fixture, before anything is concluded from it.
  results.same("the character has its class item", actor?.items?.size, 1);
  results.same(`the class item is at level ${wanted.levels}`,
               actor?.items?.contents?.[0]?.system?.levels, wanted.levels);

  const system = actor.system;
  results.same("Strength 15 is +2", system.abilities.str.mod, 2);
  results.same("Charisma 8 is -1", system.abilities.cha.mod, -1);
  results.same(`${wanted.name} ${wanted.levels} is level ${wanted.levels}`,
               system.details.level, wanted.levels);

  // The class table, which is the whole point of a class item.
  const row = wanted.row;
  results.same("base attack from the class table",
               system.attributes.baseAttack, row.baseAttack);
  results.same("Fortitude save", system.saves.fort.value,
               row.fort + Math.floor((abilities.con - 10) / 2));
  results.same("Reflex save", system.saves.ref.value,
               row.ref + Math.floor((abilities.dex - 10) / 2));
  results.same("Will save", system.saves.will.value,
               row.will + Math.floor((abilities.wis - 10) / 2));

  // "A character's Defense is equal to 10 + class bonus + Dex modifier."
  results.same("Defense", system.defense.value,
               10 + row.defense + Math.floor((abilities.dex - 10) / 2));
  results.same("flat-footed Defense loses Dexterity",
               system.defense.flatFooted, 10 + row.defense);
  results.same("initiative is the Dexterity modifier",
               system.attributes.initiative.value,
               Math.floor((abilities.dex - 10) / 2));
  results.same("massive damage threshold is Constitution",
               system.attributes.massiveDamage, abilities.con);
  results.same("grapple is base attack plus Strength",
               system.attributes.grapple, row.baseAttack + 2);

  /*
   * Action points: the class's own base plus half the character level.
   *
   * The base belongs to the class — five for a basic one, six for most
   * advanced, seven for the prestige classes and the Swindler — and the
   * system used a flat five for all fifty-two, so anyone with an advanced
   * class was a point short.
   */
  {
    const cls = actor.items.contents[0];
    const base = cls?.system?.actionPointBase;
    results.ok(`${wanted.name} has a printed action point base`, Boolean(base),
               `base ${base}`);
    results.same("action points are the class base plus half the level",
                 system.actionPoints.max,
                 base + Math.floor(system.details.level
                   * MODERN20.actionPoints.perLevel));
  }

  // Skills: ranks, the ability modifier, and nothing invented.
  const skill = system.skills.climb;
  results.ok("every SRD skill is on the sheet",
             Object.keys(system.skills).length === Object.keys(MODERN20.skills).length,
             `${Object.keys(system.skills).length} on the sheet, `
             + `${Object.keys(MODERN20.skills).length} in the config`);
  results.same("an untrained Climb is the Strength modifier", skill.total, 2);
  results.ok("Climb is a class skill for a Strong hero", skill.classSkill);
}

/**
 * A species changes the character, and removing it changes it back.
 *
 * The second half is the half worth testing. Every one of these numbers is
 * re-applied from the species item on each preparation pass rather than
 * written into a stored field, so an ogre who stops being an ogre has to lose
 * ten points of Strength, five points of natural armor and four feet of
 * reach — and a system that added them once would keep them for ever.
 *
 * The ogre is the fixture because it moves every number at once: Large, the
 * biggest ability spread in either chapter, natural armor, an attack bonus
 * and the only printed reach.
 */
async function checkSpecies(results) {
  const wanted = EXPECTED.species;
  const species = await foundry.utils.fromUuid(wanted.uuid);
  if (!results.ok(`${wanted.name} is in the compendium`, Boolean(species))) return;

  results.same("the species is Large", species.system.size, wanted.size);
  results.same("it counts as nonhuman", species.system.nonhuman, wanted.nonhuman);
  results.same("its printed reach", species.system.reach, wanted.reach);
  results.same("its natural armor", species.system.naturalArmor, wanted.naturalArmor);
  results.same("its level adjustment",
               species.system.levelAdjustment, wanted.levelAdjustment);
  results.same("its named qualities", species.system.traits.length, wanted.traits);

  if (!game.user?.isGM) {
    results.ok("a character can be made to check the arithmetic on", false,
               "only a GM can create the actor this needs");
    return;
  }

  const abilities = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  let actor = null;
  try {
    actor = await Actor.implementation.create({
      name: "Modern20 self-test (deleted when this finishes)",
      type: "hero",
      system: {
        abilities: Object.fromEntries(
          Object.entries(abilities).map(([key, value]) => [key, { value }])
        )
      }
    });

    // Every score is 10, so whatever the sheet shows above 10 is the species.
    const before = actor.system.abilities.str.total;
    results.same("with no species, Strength is the score that was rolled", before, 10);
    results.same("with no species, size is Medium", actor.system.attributes.size, "medium");
    // No species at all is a human, which is what d20 Modern is played by.
    results.same("with no species, the character is a human",
                 actor.system.details.nonhuman, false);
    results.same("a human gets two starting feats",
                 actor.system.details.startingFeats, MODERN20.startingFeats.human);

    /*
     * Through applySpecies, not createEmbeddedDocuments.
     *
     * The granting is done by a createItem hook when a species is dragged
     * onto a sheet, and a hook handler cannot be awaited by whatever caused
     * it — so checking straight after a raw creation found a species with
     * none of its traits, no rolled Hit Dice and a one-square token, and then
     * threw when this test deleted the actor out from under work still
     * running against it. applySpecies awaits all of it, which is also what
     * the creator needs of it.
     */
    let applied = null;
    try {
      applied = await applySpecies(actor, wanted.uuid);
    } catch (error) {
      results.ok("the species item can be added to a character", false,
                 String(error?.message ?? error));
    }
    if (!results.ok("adding the species created one document", Boolean(applied))) return;

    // Everything the species grants, which the createItem hook does whichever
    // way the item arrived — this path is the drag-onto-a-sheet one.
    const traits = actor.items.filter((item) => item.type === "specialAbility");
    results.same("its named qualities arrived as items",
                 traits.length, wanted.traits);
    results.ok("the racial Hit Dice were rolled and recorded",
               (applied.system.rolledHitPoints ?? 0) > 0,
               `recorded ${applied.system.rolledHitPoints}`);

    // A character has one species; a second is refused by removing it again.
    const speciesCount = () => actor.items.filter((i) => i.type === "species").length;
    const one = speciesCount();
    const second = await applySpecies(actor, wanted.uuid);
    results.ok("a second species is refused", second === null && speciesCount() === one,
               `${speciesCount()} species on the sheet`);

    const system = actor.system;
    for (const [key, amount] of Object.entries(wanted.abilityModifiers)) {
      if (!amount) continue;
      results.same(`${key} is 10 ${amount >= 0 ? "+" : ""}${amount}`,
                   system.abilities[key].total, 10 + amount);
    }
    results.same("the stored Strength score is untouched",
                 actor.system._source.abilities.str.value, 10);

    results.same("size comes from the species", system.attributes.size, wanted.size);
    // Size is derived; a prototype token's footprint is stored, so a hook has
    // to move it or a Large hero stands in one square.
    results.same("the token grew to the species' footprint",
                 actor.prototypeToken.width, MODERN20.sizes[wanted.size].squares);
    results.same("speed comes from the species",
                 system.attributes.speed, wanted.baseSpeed);
    results.same("reach comes from the species", system.attributes.reach, wanted.reach);
    results.same("natural armor is in Defense",
                 system.defense.naturalArmor, wanted.naturalArmor);
    results.same("the species attack bonus is on attacks",
                 system.attributes.attackMisc, wanted.attackBonus);
    // "CR = Character Level + Level Adjustment", and a character with no
    // class levels is still level 1.
    results.same("challenge rating is level plus the adjustment",
                 system.details.challengeRating,
                 system.details.level + wanted.levelAdjustment);

    /*
     * Large: "-1 size penalty to Defense", and +4 on grapple.
     *
     * With the species' own ability modifiers in them, which is the point and
     * which the first version of these two lines left out: an ogre built on
     * straight tens has Dexterity 8 and Strength 20, so its Defense carries a
     * -1 for Dex and its grapple a +5 for Str.
     */
    const large = MODERN20.sizes[wanted.size];
    results.same("Defense carries the size penalty, natural armor and Dexterity",
                 system.defense.value,
                 10 + wanted.naturalArmor + large.mod + system.abilities.dex.mod);
    results.same("grapple carries the size bonus and Strength",
                 system.attributes.grapple,
                 system.attributes.baseAttack + system.abilities.str.mod + large.grapple);

    /*
     * What being a nonhuman costs, which is the part a player notices.
     *
     * "Shadowkind characters get 4 fewer skill points at 1st level and 1
     * fewer skill point each level thereafter", and of feats, "they gain only
     * one bonus feat at 1st level instead of two". This character has no
     * class and so no skill point budget to compare — that arithmetic is
     * checked against the book's own seventeen printed pairs by
     * check_species — but the flag and the feat count are on the sheet.
     */
    results.same("the sheet knows it is a nonhuman", system.details.nonhuman, true);
    results.same("a nonhuman gets one starting feat",
                 system.details.startingFeats, MODERN20.startingFeats.nonhuman);

    /*
     * An Active Effect has to beat the species, not lose to it.
     *
     * Foundry applies effects between prepareBaseData and prepareDerivedData,
     * so anything the system writes in the second overwrites what a GM put
     * there in the first. Speed and reach have no `misc` field to target
     * instead, so an effect on the field itself is the only route a GM has —
     * and it worked on a human and silently did nothing on an ogre until the
     * species moved to prepareBaseData.
     */
    const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: "Modern20 self-test",
      changes: [{
        key: "system.attributes.speed",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: "10"
      }]
    }]);
    results.same("an effect on speed applies over the species' own",
                 actor.system.attributes.speed, wanted.baseSpeed + 10);
    if (effect?.id) await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
    results.same("and removing the effect returns the species' speed",
                 actor.system.attributes.speed, wanted.baseSpeed);

    // And now the half that matters: take it away again, awaited for the same
    // reason it was added that way.
    const hpBefore = actor.system.hp.max;
    await removeSpecies(actor, applied);
    const after = actor.system;
    results.same("removing the species returns Strength to the rolled score",
                 after.abilities.str.total, 10);
    results.same("removing the species returns size to Medium",
                 after.attributes.size, "medium");
    results.same("removing the species removes its natural armor",
                 after.defense.naturalArmor, 0);
    results.same("removing the species removes its attack bonus",
                 after.attributes.attackMisc, 0);
    results.same("removing the species returns reach to five feet",
                 after.attributes.reach, 5);
    results.same("removing the species makes it a human again",
                 after.details.nonhuman, false);
    results.same("and the token gave the squares back",
                 actor.prototypeToken.width, MODERN20.sizes.medium.squares);
    // The traits are copies of lines on the species, and an orphaned one
    // claims the character still has darkvision.
    results.same("removing the species removed its qualities",
                 actor.items.filter((item) => item.type === "specialAbility").length, 0);
    results.ok("removing the species gave back the racial hit points",
               actor.system.hp.max <= hpBefore,
               `${hpBefore} with the species, ${actor.system.hp.max} without`);
    results.same("and gives back the second starting feat",
                 after.details.startingFeats, MODERN20.startingFeats.human);
  } finally {
    if (actor?.id) await actor.delete();
  }
}

/** Every creature's sheet shows the Defense and the token the book gives it. */
async function checkCreatures(results) {
  for (const wanted of EXPECTED.creatures) {
    const actor = await foundry.utils.fromUuid(wanted.uuid);
    if (!results.ok(`${wanted.name} (${wanted.size}) loads`, Boolean(actor))) continue;

    results.same(`${wanted.name}: Defense`, actor.system.defense.value, wanted.defense);
    results.same(`${wanted.name}: token is ${wanted.squares} squares`,
                 actor.prototypeToken.width, wanted.squares);
    results.same(`${wanted.name}: token artwork`,
                 actor.prototypeToken.texture.src, wanted.art);
  }
}

/**
 * The six characters this system ships are playable.
 *
 * They are the first thing anybody opens, and the one place a rules mistake
 * reaches a table without anybody having built anything. Their hit points,
 * Wealth and class level are worked out from the SRD when the pack is built;
 * a sheet that shows something else means the model and the generator
 * disagree, and one of them is wrong in front of a player.
 */
async function checkPregens(results) {
  for (const wanted of EXPECTED.pregens) {
    const actor = await foundry.utils.fromUuid(wanted.uuid);
    if (!results.ok(`${wanted.name} loads`, Boolean(actor))) continue;

    results.same(`${wanted.name}: carries ${wanted.items} items`,
                 actor.items.size, wanted.items);
    results.same(`${wanted.name}: is a ${wanted.className} at level ${wanted.level}`,
                 actor.system.details.level, wanted.level);
    results.same(`${wanted.name}: hit points`, actor.system.hp.max, wanted.hp);
    results.same(`${wanted.name}: Wealth bonus`, actor.system.wealth.bonus, wanted.wealth);

    // What the class table gives at that level, exactly. Not "more than
    // nothing": a Smart or Charismatic hero is printed with a base attack and
    // a Defense bonus of zero at 1st level, and asking for more than nothing
    // failed both of them while they were entirely correct.
    const row = wanted.row;
    if (row) {
      const system = actor.system;
      results.same(`${wanted.name}: base attack from the class table`,
                   system.attributes.baseAttack, row.baseAttack);
      results.same(`${wanted.name}: Defense bonus from the class table`,
                   system.defense.classBonus, row.defense);
      results.same(`${wanted.name}: Fortitude base`, system.saves.fort.base, row.fort);
      results.same(`${wanted.name}: Reflex base`, system.saves.ref.base, row.ref);
      results.same(`${wanted.name}: Will base`, system.saves.will.base, row.will);
      results.same(`${wanted.name}: Reputation from the class table`,
                   system.reputation.base, row.reputation);
    }
    // And the class's skill list reached the sheet, which is the half of a
    // class that has no numbers in it.
    if (wanted.classSkill) {
      results.ok(`${wanted.name}: ${wanted.classSkill} is a class skill`,
                 actor.system.skills[wanted.classSkill]?.classSkill === true);
    }
  }
}

/** Every rules link resolves to a page that exists. */
async function checkRulesLinks(results) {
  for (const cited of EXPECTED.rulesPages) {
    const page = await foundry.utils.fromUuid(cited.uuid);
    results.ok(`${cited.pack}: "${cited.name}" cites a page that exists`,
               Boolean(page), page ? "" : cited.uuid);
  }

  // Asked through the accessors the sheets use, not by reading the generated
  // tables: a link is only as good as what `rulesTopic` hands the template,
  // and reading the table directly would pass while that returned rubbish.
  // (It also cost a run: the tables map a name to a UUID string, this asked
  // each value for a `.uuid` it does not have, and 67 working links were
  // reported as resolving to nothing.)
  const topics = Object.keys(RULES_TOPICS);
  const deadTopics = [];
  for (const topic of topics) {
    if (!await foundry.utils.fromUuid(rulesTopic(topic))) deadTopics.push(topic);
  }
  results.ok(`all ${topics.length} sheet topics resolve`, deadTopics.length === 0,
             deadTopics.slice(0, 3).join(", "));

  const skills = Object.keys(SKILL_RULES);
  const deadSkills = [];
  for (const skill of skills) {
    // A specialty is keyed "knowledge:tactics"; the accessor takes both halves.
    const [name, specialty] = skill.split(":");
    if (!await foundry.utils.fromUuid(skillRules(name, specialty))) deadSkills.push(skill);
  }
  results.ok(`all ${skills.length} skill links resolve`, deadSkills.length === 0,
             deadSkills.slice(0, 3).join(", "));
}

/** The rolls written into the rules text are rolls this system can make. */
async function checkEnrichers(results) {
  const { TextEditor } = foundry.applications.ux;
  const enriched = await TextEditor.implementation.enrichHTML(
    "@Check[skill:climb|dc:15]{a DC 15 Climb check}", { secrets: false }
  );
  results.ok("a check in text becomes something to click",
             enriched.includes("m20-check"), enriched.slice(0, 80));

  results.ok("a check names a real skill", Boolean(checkRoll("skill:climb|dc:15")));
  results.ok("a check that names nothing resolves to nothing",
             checkRoll("skill:basketweaving") === null);

  const page = await foundry.utils.fromUuid(EXPECTED.weapon.rulesPage);
  results.ok("the page a weapon cites has text", Boolean(page?.text?.content),
             page ? "" : "the page did not resolve");
}

/**
 * A chat card renders, with its text enriched.
 *
 * This is the one group that writes to the world, so it cleans up after
 * itself: whatever messages appear while it runs are deleted when it ends.
 */
async function checkChatCards(results) {
  const before = new Set(game.messages?.map((message) => message.id) ?? []);
  try {
    const item = await foundry.utils.fromUuid(EXPECTED.weapon.uuid);
    if (!results.ok(`${EXPECTED.weapon.name} is in the compendium`, Boolean(item))) return;

    const card = await item.toChat();
    results.ok("an item posts a card", Boolean(card));
    results.ok("the card carries the item's name",
               Boolean(card?.content?.includes(item.name)));
    results.same("the card states the printed damage",
                 item.system.damage, EXPECTED.weapon.damage);
  } finally {
    const posted = (game.messages ?? [])
      .filter((message) => !before.has(message.id))
      .map((message) => message.id);
    if (posted.length) {
      await ChatMessage.implementation.deleteDocuments(posted);
    }
  }
}

/**
 * The artwork is actually being served.
 *
 * A path that 404s draws an empty frame and logs nothing a GM will read, and
 * the deploy that copies the packs and not the images looks exactly like the
 * one that copies both. Asked of the server rather than of the repository,
 * because that is the difference that took three attempts to notice.
 */
async function checkImages(results) {
  const missing = [];
  for (const path of EXPECTED.images) {
    try {
      // getRoute, because a host with a route prefix serves every file under
      // it and a bare path would 404 for that reason alone.
      const response = await foundry.utils.fetchWithTimeout(
        foundry.utils.getRoute(path), {}, { timeoutMs: 10000 }
      );
      if (!response.ok) missing.push(`${path} (${response.status})`);
    } catch (error) {
      missing.push(`${path} (${error?.message ?? "failed"})`);
    }
  }
  results.ok(`all ${EXPECTED.images.length} images are served`,
             missing.length === 0,
             missing.slice(0, 3).join(", ")
               + (missing.length > 3 ? ` and ${missing.length - 3} more` : ""));
}
