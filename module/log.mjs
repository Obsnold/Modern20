/**
 * The change log, wired to Foundry: every change to an actor, its items and
 * its effects, and every roll, recorded on the actor (flags.modern20.log) with
 * who made it and when. What counts as build or play, and how a change reads,
 * is rules/log.mjs.
 *
 * Only the client that makes a change records it (pre-hooks run there alone,
 * and post-hooks check the user), so each change is logged once. A change to
 * the actor's own data carries its entry in the same update; a change to an
 * item or effect writes the actor's log after it, marked so that write is not
 * itself logged.
 */
import * as L from "./rules/log.mjs";

const SYSTEM_ID = "modern20";
const NO_LOG = "modern20NoLog";

/** Settings for the log; called from the init hook. */
export function registerLogSettings() {
  game.settings.register(SYSTEM_ID, "logPlayLimit", {
    name: "Session log length",
    hint: "How many session entries (hit points, action points, conditions, rolls) each actor keeps. Build entries (levels, ranks, feats, gear) are always kept.",
    scope: "world", config: true, type: Number, default: L.PLAY_LIMIT,
  });
}

const limit = () => game.settings.get(SYSTEM_ID, "logPlayLimit") ?? L.PLAY_LIMIT;
const meta = (userId = game.user.id) => ({ id: foundry.utils.randomID(), time: Date.now(), user: userId, userName: game.users.get(userId)?.name ?? "Unknown" });
const logged = (actor) => actor && ["character", "creature"].includes(actor.type);

/** Add entries to an actor's log in a write of its own, which is not itself logged. */
export async function record(actor, entries) {
  if (!logged(actor) || !entries.length || !actor.isOwner) return;
  const log = L.append(actor.getFlag(SYSTEM_ID, "log") ?? [], entries, limit());
  await actor.update({ [`flags.${SYSTEM_ID}.log`]: log }, { [NO_LOG]: true, render: true });
}

/** Register the hooks; called once, at init. */
export function registerLogHooks() {
  // The actor's own data: the entry rides in the same update.
  Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
    if (!logged(actor) || options[NO_LOG] || userId !== game.user.id) return;
    const flat = foundry.utils.flattenObject(changes);
    const entries = L.actorEntries(actor.toObject(), flat, meta(userId));
    if (!entries.length) return;
    foundry.utils.setProperty(changes, `flags.${SYSTEM_ID}.log`, L.append(actor.getFlag(SYSTEM_ID, "log") ?? [], entries, limit()));
  });

  // Items: noted before the change, written after it.
  Hooks.on("preUpdateItem", (item, changes, options, userId) => {
    if (!logged(item.parent) || options[NO_LOG] || userId !== game.user.id) return;
    options.modern20Entries = L.itemEntries(item, item.toObject(), foundry.utils.flattenObject(changes), meta(userId));
  });
  Hooks.on("updateItem", (item, changes, options, userId) => {
    if (userId === game.user.id && options.modern20Entries?.length) record(item.parent, options.modern20Entries);
  });
  Hooks.on("createItem", (item, options, userId) => {
    if (userId === game.user.id && !options[NO_LOG]) record(item.parent, [L.itemAdded(item, meta(userId))]);
  });
  Hooks.on("deleteItem", (item, options, userId) => {
    if (userId === game.user.id && !options[NO_LOG]) record(item.parent, [L.itemRemoved(item, meta(userId))]);
  });

  // Effects on the actor itself: conditions from the token HUD, effects made or switched.
  const actorOf = (effect) => (effect.parent?.documentName === "Actor" ? effect.parent : null);
  Hooks.on("createActiveEffect", (effect, options, userId) => {
    if (userId === game.user.id) record(actorOf(effect), [L.effectEntry(effect, "create", meta(userId))]);
  });
  Hooks.on("deleteActiveEffect", (effect, options, userId) => {
    if (userId === game.user.id) record(actorOf(effect), [L.effectEntry(effect, "delete", meta(userId))]);
  });
  Hooks.on("updateActiveEffect", (effect, changes, options, userId) => {
    if (userId !== game.user.id || !("disabled" in changes)) return;
    record(actorOf(effect) ?? effect.parent?.parent, [L.effectEntry(effect, "toggle", meta(userId))]);
  });
}

/** Record a roll the system made (module/roll.mjs calls this). */
export const recordRoll = (actor, title, total) => record(actor, [L.rollEntry(title, total, meta())]);

/** The log as a sheet shows it: newest first, filtered to "all", "build" or "play". */
export function logContext(actor, filter = "all") {
  const time = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
  const entries = (actor.getFlag(SYSTEM_ID, "log") ?? []).filter((e) => filter === "all" || e.kind === filter).slice().reverse();
  return {
    filter,
    filters: [["all", "All"], ["build", "Build"], ["play", "Session"]].map(([id, label]) => ({ id, label, active: id === filter })),
    entries: entries.map((e) => ({ ...e, when: time.format(e.time), build: e.kind === "build" })),
  };
}
