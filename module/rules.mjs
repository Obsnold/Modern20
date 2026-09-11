import { RULES_TOPICS, SKILL_RULES } from "./rules-links.mjs";

/**
 * Links from the system into the rules compendium.
 *
 * The rules reference is one page per entry — a page for the Acrobatic feat, one
 * for the gargoyle, one for Handguns — so anything the system shows has a page
 * worth opening. A compendium document carries its own in `system.rulesPage`;
 * everything else names a topic from module/rules-links.mjs.
 *
 * The link is rendered by the system rather than by Foundry's own content-link
 * enricher, because enriching is asynchronous and a skills table needs
 * forty-one of them per render. What it costs is one delegated click handler,
 * installed once — see `activateRulesLinks`.
 */

/** The class every rules link carries, which is what the handler listens for. */
const LINK_CLASS = "m20-rules";

/** The page for a topic the sheets name, or "" if there is none. */
export function rulesTopic(topic) {
  return RULES_TOPICS[topic] ?? "";
}

/**
 * The page for a skill, or for one of its subjects.
 *
 * Craft (chemical) has a page of its own and Knowledge (streetwise) does not,
 * so a subject falls back to its skill rather than to nothing.
 */
export function skillRules(skill, specialty = "") {
  if (specialty) {
    const subject = SKILL_RULES[`${skill}:${String(specialty).toLowerCase()}`];
    if (subject) return subject;
  }
  return SKILL_RULES[skill] ?? "";
}

/**
 * A link that opens a rules page, as an HTML string.
 *
 * Returns "" when there is no page, so a template can insert it
 * unconditionally and get nothing where nothing is known.
 */
export function rulesLink(uuid, { label = "", tooltip = "" } = {}) {
  if (!uuid) return "";
  // Escaped because both of these are translated strings, and an apostrophe
  // typed as a quote in one of them would end the attribute.
  const hint = Handlebars.escapeExpression(
    tooltip || game.i18n.localize("MODERN20.Rules.Open"));
  const text = label ? `<span>${Handlebars.escapeExpression(label)}</span>` : "";
  return `<a class="${LINK_CLASS}" data-rules-uuid="${uuid}" data-tooltip="${hint}"`
    + ` aria-label="${hint}"><i class="fa-solid fa-book-open"></i>${text}</a>`;
}

/**
 * Open a rules page in its journal.
 *
 * A page is opened through its entry rather than on its own, which is how
 * Foundry shows a journal: the whole entry with that page scrolled to, so the
 * reader can see what surrounds the rule as well as the rule.
 */
export async function openRulesPage(uuid) {
  if (!uuid) return;
  const page = await foundry.utils.fromUuid(uuid);
  if (!page) {
    // The rules compendium can be missing for two ordinary reasons: a world
    // that has not finished installing the system, and a module that removed
    // the pack. Neither is worth an error in the console.
    ui.notifications.warn(game.i18n.localize("MODERN20.Warning.NoRulesPage"));
    return;
  }
  const entry = page.parent ?? page;
  await entry.sheet.render({ force: true, pageId: page.id });
}

/**
 * Listen for clicks on every rules link there will ever be.
 *
 * One delegated handler on the document, installed at ready, rather than one
 * per application: the links are on every sheet, on the creation and level-up
 * screens and on chat cards, which outlive the sheet that posted them. A
 * handler bound per application is one that is missing from whatever renders
 * next.
 */
export function activateRulesLinks() {
  document.addEventListener("click", (event) => {
    const link = event.target.closest?.(`a.${LINK_CLASS}[data-rules-uuid]`);
    if (!link) return;
    event.preventDefault();
    openRulesPage(link.dataset.rulesUuid);
  });
}
