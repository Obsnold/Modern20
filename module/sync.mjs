/**
 * Keeping the world's items in step with the compendiums: an item a character got from a
 * Modern20 compendium carries copies of its mechanics (its effects and roll notes,
 * tools/build/mechanics.mjs), and of what the book says it does that the rules read (BOOK_FIELDS: a
 * weapon's damage formula). When the system is updated, the GM's client refreshes those copies from
 * their source, once per version, so a feat whose effect changed (or that has one for the first
 * time) works on characters made before. Everything else on the item (a choice, a level, ranks,
 * what was prepared, rounds loaded) is the character's and is left alone.
 */
import { SYSTEM_ID } from "./config.mjs";
import { changesOf } from "./rules/effects.mjs";
import { syncFeatures } from "./features.mjs";

const NO_LOG = "modern20NoLog";

/** The book's data on an item that the rules read, kept in step with the compendium: never a character's own choice. */
const BOOK_FIELDS = ["system.damage.formula", "system.noAmmunition"];

/** The setting that records which version last refreshed the world. */
export function registerSyncSettings() {
  game.settings.register(SYSTEM_ID, "syncedVersion", { scope: "world", config: false, type: String, default: "" });
}

/** The compendium item an item came from, if it is one of this system's. */
async function sourceOf(item) {
  const uuid = item._stats?.compendiumSource;
  if (!uuid?.startsWith(`Compendium.${SYSTEM_ID}.`)) return null;
  return fromUuid(uuid).catch(() => null);
}

/** Refresh one item's effects, notes and book fields from its source. Returns whether anything changed. */
async function refresh(item, source) {
  const fresh = source.effects.map((e) => {
    const data = e.toObject();
    delete data._id;
    return data;
  });
  // Compared as stored (v14 keeps an effect's changes in `system.changes`).
  const stored = (e) => [e.name, changesOf(e).map(({ key, type, value }) => [key, type, value])];
  const sameEffects = JSON.stringify(item.effects.map((e) => stored(e.toObject()))) === JSON.stringify(fresh.map(stored));
  // The roll notes and book fields that differ from the source's.
  const { getProperty, hasProperty } = foundry.utils;
  const changes = {};
  for (const path of ["system.rollNotes", ...BOOK_FIELDS]) {
    if (!hasProperty(source, path)) continue;
    if (JSON.stringify(getProperty(item, path) ?? null) !== JSON.stringify(getProperty(source, path) ?? null)) changes[path] = getProperty(source, path);
  }
  if (sameEffects && !Object.keys(changes).length) return false;
  // A fresh options object each call: Foundry writes the parent into the one it is given.
  const opts = () => ({ [NO_LOG]: true });
  if (!sameEffects) {
    if (item.effects.size) await item.deleteEmbeddedDocuments("ActiveEffect", item.effects.map((e) => e.id), opts());
    if (fresh.length) await item.createEmbeddedDocuments("ActiveEffect", fresh, opts());
  }
  if (Object.keys(changes).length) await item.update(changes, opts());
  return true;
}

/**
 * Refresh every item in the world that came from this system's compendiums: those in the
 * Items directory and those characters and creatures own. Run by the active GM at ready, once
 * per system version.
 */
export async function syncWorldItems() {
  if (!game.user.isActiveGM) return;
  const version = game.system.version;
  if (game.settings.get(SYSTEM_ID, "syncedVersion") === version) return;
  const items = [...game.items, ...game.actors.contents.flatMap((a) => a.items.contents)];
  // Their sources, loaded together (one at a time, a world of many characters takes minutes); each the once.
  const loading = new Map();
  const sources = await Promise.all(items.map((item) => {
    const uuid = item._stats?.compendiumSource ?? "";
    if (!loading.has(uuid)) loading.set(uuid, sourceOf(item));
    return loading.get(uuid);
  }));
  let changed = 0;
  for (const [i, item] of items.entries()) {
    if (sources[i] && (await refresh(item, sources[i]))) changed++;
  }
  // Characters made before class features were items, or whose features changed, are given them.
  for (const actor of game.actors.filter((a) => a.type === "character")) await syncFeatures(actor);
  await game.settings.set(SYSTEM_ID, "syncedVersion", version);
  if (changed) ui.notifications.info(`Modern20 ${version}: updated ${changed} item${changed === 1 ? "" : "s"} from the compendiums.`);
}
