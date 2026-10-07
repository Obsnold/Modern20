/**
 * Current hit points that follow the maximum while a character is at full health (rules/damage.mjs
 * followMaximum): a new character starts at full, and one at full stays there as levels,
 * Constitution or Toughness change the maximum; one hurt or dying is left as it is.
 *
 * The maximum is worked out, not stored, so the last one seen is kept beside current hit points
 * (`system.hp.lastMax`). After any change that can move it (to the character, its items or its
 * effects), the client that made the change brings current hit points along.
 */
import { followMaximum } from "./rules/damage.mjs";
import { exists } from "./presence.mjs";

/** Characters waiting to be brought up to date, by uuid: several changes at once make one update. */
const pending = new Map();

/**
 * Bring a character's current hit points along with its maximum, if they should follow it. Adding
 * several items at once fires a hook for each: the update waits a moment, so they make one, and is
 * dropped if the character is deleted meanwhile.
 */
function follow(actor, userId) {
  if (!actor || actor.type !== "character" || actor.pack || userId !== game.user.id || !actor.isOwner) return;
  clearTimeout(pending.get(actor.uuid));
  pending.set(actor.uuid, setTimeout(async () => {
    pending.delete(actor.uuid);
    if (!exists(actor)) return;
    const { value, lastMax = 0, max } = actor.system.hp;
    if (max === undefined || max === lastMax) return;
    const hurt = ["disabled", "dying", "stable", "dead"].some((s) => actor.statuses.has(s));
    const next = followMaximum(value, lastMax, max, { hurt });
    await actor.update({ "system.hp.lastMax": max, ...(next === null ? {} : { "system.hp.value": next }) });
  }, 100));
}

/** The actor a document belongs to: itself, an item's or an effect's owner. */
const actorOf = (doc) => (doc?.documentName === "Actor" ? doc : doc?.parent?.documentName === "Actor" ? doc.parent : doc?.parent?.parent?.documentName === "Actor" ? doc.parent.parent : null);

/** Register the hooks; called once, at init. */
export function registerHitPointHooks() {
  for (const hook of ["createActor", "updateActor"]) Hooks.on(hook, (actor, ...rest) => follow(actor, rest.at(-1)));
  for (const hook of ["createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
    Hooks.on(hook, (doc, ...rest) => follow(actorOf(doc), rest.at(-1)));
  }
}
