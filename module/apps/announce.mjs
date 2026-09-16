import { rulesLink, rulesTopic } from "../rules.mjs";

const { ChatMessage } = foundry.documents;

/**
 * Where a message about play belongs.
 *
 * Foundry gives a notification five seconds and keeps no history — the
 * lifetime is a constant on the Notifications class, and there is no log to
 * scroll back through. So in a fight, "you have already used this turn's
 * attack action" or "reloaded, six of fifteen" is gone before anyone has
 * looked away from the map.
 *
 * The rule this module applies:
 *
 *   - Something that happened in play is a record, and records go to chat,
 *     which is permanent and scrollable and which everyone can see.
 *   - Something the player has to notice and act on is a sticky notification,
 *     which stays until dismissed rather than timing out.
 *   - Something that is only an acknowledgement stays a passing toast.
 *
 * Rolls already post their own cards; this is for the things around them that
 * used to be toasts and nothing else.
 */

/**
 * Post a record of something that happened, and warn if it needs noticing.
 *
 * @param {any}      actor        Whose record this is; the speaker.
 * @param {object}   options
 * @param {string}   options.title    Headline, already localized.
 * @param {string[]} [options.lines]  Detail lines, already localized.
 * @param {string}   [options.img]    Icon, defaulting to the actor's.
 * @param {boolean}  [options.warning]  Style as a warning and raise a toast,
 *   for a rule the player is working against.
 * @param {boolean}  [options.whisper]  Keep it to the GM and the owners.
 * @param {string}   [options.rules]  A topic from module/rules-links.mjs. The
 *   card carries a link to it, because a record of a rule being applied is
 *   exactly where the rule itself is worth reaching: "the character is dying"
 *   is only useful next to what dying means.
 */
export async function announce(actor, {
  title, lines = [], img, warning = false, whisper = false, rules = ""
}) {
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/modern20/templates/chat/record-card.hbs",
    {
      title, lines, img: img ?? actor?.img, warning, name: actor?.name,
      rules: rulesLink(rulesTopic(rules))
    }
  );

  const message = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: { modern20: { record: true } }
  };
  if (whisper) message.whisper = recipientsFor(actor);

  // A warning also gets a toast, to catch the eye now — but a passing one,
  // since the card behind it is the permanent copy. Only `problem` sticks,
  // because nothing happened there and nothing was written down.
  if (warning) ui.notifications.warn(title);

  return ChatMessage.create(message);
}

/** The GM plus whoever owns this actor. */
function recipientsFor(actor) {
  return game.users
    .filter((user) => user.isGM || (actor && actor.testUserPermission(user, "OWNER")))
    .map((user) => user.id);
}

/**
 * A passing acknowledgement: no record worth keeping, nothing to act on.
 *
 * Kept as a function rather than a raw ui.notifications call so the choice
 * between the three is visible at each call site.
 */
export function acknowledge(message) {
  ui.notifications.info(message);
}

/**
 * A problem with the request rather than with the rules — no scene to draw on,
 * an item that has been deleted. Sticky, because it means nothing happened and
 * the player is waiting for something that never will.
 */
export function problem(message) {
  ui.notifications.warn(message, { permanent: true });
}
