/**
 * Whether an actor is still there to write to. A change made a moment after another (current hit
 * points following the maximum, class features following levels) can find its character being
 * deleted: still in the world on this client, but gone by the time the write reaches the server.
 * So a deletion under way counts as gone.
 */
const deleting = new Set();

/** Whether `actor` exists and is not being deleted: a world actor, or a token's on its scene. */
export function exists(actor) {
  if (!actor || deleting.has(actor.uuid)) return false;
  return actor.isToken ? !!actor.token?.parent?.tokens.has(actor.token.id) : game.actors.has(actor.id);
}

/** Register the hooks; called once, at init. */
export function registerPresenceHooks() {
  Hooks.on("preDeleteActor", (actor) => { deleting.add(actor.uuid); });
  Hooks.on("deleteActor", (actor) => { deleting.delete(actor.uuid); });
}
