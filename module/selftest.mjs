import { EXPECTED } from "./selftest-data.mjs";
import { MODERN20 } from "./config.mjs";
import { RULES_TOPICS, SKILL_RULES } from "./rules-links.mjs";
import { checkRoll } from "./enrichers.mjs";

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
  const groups = [
    ["Compendia", checkPacks],
    ["Character sheet", checkHero],
    ["Creatures", checkCreatures],
    ["Rules links", checkRulesLinks],
    ["Rolls in the text", checkEnrichers],
    ["Chat cards", checkChatCards]
  ];
  if (images) groups.push(["Artwork", checkImages]);

  for (const [name, group] of groups) {
    results.section(name);
    try {
      await group(results);
    } catch (error) {
      results.ok(`${name} finished`, false, String(error?.message ?? error));
      console.error(`${SYSTEM_ID} | self-test: ${name}`, error);
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
 * The actor is constructed rather than created: `new Actor(...)` builds the
 * data model and prepares it without writing anything to the world, so this
 * can run mid-session without leaving a Strong Hero in the sidebar.
 */
async function checkHero(results) {
  const wanted = EXPECTED.class;
  const cls = await foundry.utils.fromUuid(wanted.uuid);
  if (!results.ok(`${wanted.name} is in the compendium`, Boolean(cls))) return;

  const source = cls.toObject();
  source.system.levels = wanted.levels;

  const abilities = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
  const actor = new Actor.implementation({
    name: "Modern20 self-test",
    type: "hero",
    system: {
      abilities: Object.fromEntries(
        Object.entries(abilities).map(([key, value]) => [key, { value }])
      )
    },
    items: [source]
  });

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

  // Skills: ranks, the ability modifier, and nothing invented.
  const skill = system.skills.climb;
  results.ok("every SRD skill is on the sheet",
             Object.keys(system.skills).length === Object.keys(MODERN20.skills).length,
             `${Object.keys(system.skills).length} on the sheet, `
             + `${Object.keys(MODERN20.skills).length} in the config`);
  results.same("an untrained Climb is the Strength modifier", skill.total, 2);
  results.ok("Climb is a class skill for a Strong hero", skill.classSkill);
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

/** Every rules link resolves to a page that exists. */
async function checkRulesLinks(results) {
  for (const cited of EXPECTED.rulesPages) {
    const page = await foundry.utils.fromUuid(cited.uuid);
    results.ok(`${cited.pack}: "${cited.name}" cites a page that exists`,
               Boolean(page), page ? "" : cited.uuid);
  }

  const topics = Object.entries(RULES_TOPICS);
  let missing = 0;
  for (const [, topic] of topics) {
    if (!await foundry.utils.fromUuid(topic.uuid)) missing += 1;
  }
  results.ok(`all ${topics.length} sheet topics resolve`, missing === 0,
             missing ? `${missing} resolve to nothing` : "");

  const skills = Object.entries(SKILL_RULES);
  missing = 0;
  for (const [, entry] of skills) {
    if (!await foundry.utils.fromUuid(entry.uuid)) missing += 1;
  }
  results.ok(`all ${skills.length} skill links resolve`, missing === 0,
             missing ? `${missing} resolve to nothing` : "");
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
