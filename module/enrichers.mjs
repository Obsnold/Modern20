import { MODERN20 } from "./config.mjs";

/**
 * The rolls the rules text asks for, as rolls.
 *
 * The SRD says what to roll constantly — "a DC 15 Climb check", "a Fortitude
 * save (DC 14)" — and on a journal page that is a sentence. The import rewrites
 * 3,103 of those sentences as `@Check[skill:climb|dc:15]{DC 15 Climb check}`,
 * and this is what turns one into something to click: the SRD's own words, with
 * a die in front of them.
 *
 * Registered as a text enricher, so it applies to every piece of enriched
 * content in the world and not only to the pages the import wrote — a GM who
 * types `@Check[save:ref|dc:20]` into their own notes gets the same button.
 *
 * Which is also why anything that displays this system's own prose has to
 * enrich it: the rules say what to roll in an item's text as much as on a
 * page — 1,052 times across the packs, in a spell's description, a feat's
 * benefit, a creature ability's rules text — and text put on screen without
 * being enriched shows the markup itself.
 */

/** `@Check[skill:knowledge|specialty:Streetwise|dc:20]{the printed words}`. */
const CHECK = /@Check\[([^\]]+)\](?:\{([^}]+)\})?/g;

export function registerEnrichers() {
  CONFIG.TextEditor.enrichers.push({ pattern: CHECK, enricher: enrichCheck });
}

/** The fields the import writes rolls into, and so the fields to enrich. */
export const PROSE_FIELDS = ["description", "benefit", "normal", "special"];

/**
 * The prose a document carries, enriched: the fields the SRD prints its rules
 * text in, ready to put on a sheet or a chat card.
 *
 * One helper rather than a call per field, because forgetting one is invisible
 * — the text renders, and only the roll is missing.
 */
export async function enrichProse(document, { secrets = false } = {}) {
  const { TextEditor } = foundry.applications.ux;
  const system = document.system ?? {};
  const out = {};
  for (const field of PROSE_FIELDS) {
    out[field] = await TextEditor.implementation.enrichHTML(system[field] ?? "", {
      secrets, relativeTo: document
    });
  }
  return out;
}

/** `skill:climb|dc:15` as an object. */
function terms(written) {
  const out = {};
  for (const term of String(written).split("|")) {
    const [key, ...rest] = term.split(":");
    out[key.trim()] = rest.join(":").trim();
  }
  return out;
}

/**
 * What a check rolls, or null when it names something the system does not have.
 *
 * A reference that resolves to nothing renders as its own words rather than as
 * a button that cannot roll — the same rule the rules links follow.
 *
 * @param {string} written
 * @returns {Check|null}
 *
 * @typedef {object} Check
 * @property {string} label        The localization key for what is rolled.
 * @property {string} specialty    A subject, as in Knowledge (streetwise).
 * @property {number|null} dc      The DC the SRD printed, where it printed one.
 * @property {string} [skill]      Exactly one of these three is set, which is
 * @property {string} [ability]    what tells the caller which of the actor's
 * @property {string} [save]       three roll methods to call.
 */
export function checkRoll(written) {
  const { skill, specialty, ability, save, dc } = terms(written);
  const roll = { specialty: specialty || "", dc: Number(dc) || null };

  if (skill && MODERN20.skills[skill]) return { ...roll, skill, label: MODERN20.skills[skill].label };
  if (ability && MODERN20.abilities[ability]) {
    return { ...roll, ability, label: MODERN20.abilities[ability] };
  }
  if (save && MODERN20.saves[save]) return { ...roll, save, label: MODERN20.saves[save].label };
  return null;
}

function enrichCheck(match) {
  const roll = checkRoll(match[1]);
  const printed = match[2];

  if (!roll) {
    const text = document.createElement("span");
    text.textContent = printed ?? match[0];
    return text;
  }

  // The SRD's own phrasing where the import kept it, which is the whole point
  // of carrying a label: "a DC 15 Climb check" still reads as a sentence.
  const name = game.i18n.localize(roll.label);
  const label = printed
    ?? (roll.dc ? `${name} (${game.i18n.localize("MODERN20.Check.DC")} ${roll.dc})` : name);

  const anchor = document.createElement("a");
  anchor.className = "m20-check";
  anchor.dataset.check = match[1];
  anchor.dataset.tooltip = game.i18n.format("MODERN20.Check.Roll", { check: name });
  anchor.innerHTML = `<i class="fa-solid fa-dice-d20"></i>`;
  anchor.append(label);
  return anchor;
}
