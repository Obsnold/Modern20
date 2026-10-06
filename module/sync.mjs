/**
 * Keeping the world's items in step with the compendiums: an item a character got from a
 * Modern20 compendium carries copies of its mechanics (its effects and notes,
 * tools/build/mechanics.mjs). When the system is updated, the GM's client refreshes those
 * copies from their source, once per version, so a feat whose effect changed (or that has one
 * for the first time) works on characters made before. Everything else on the item (a choice,
 * a level, ranks, what was prepared) is the character's and is left alone.
 */
import { SYSTEM_ID } from "./config.mjs";

const NO_LOG = "modern20NoLog";

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

/** Refresh one item's effects and notes from its source. Returns whether anything changed. */
async function refresh(item, source) {
  const fresh = source.effects.map((e) => {
    const data = e.toObject();
    delete data._id;
    return data;
  });
  const same = JSON.stringify(item.effects.map((e) => [e.name, e.changes])) === JSON.stringify(fresh.map((e) => [e.name, e.changes]))
    && JSON.stringify(item.system.notes ?? null) === JSON.stringify(source.system.notes ?? null);
  if (same) return false;
  const opts = { [NO_LOG]: true };
  if (item.effects.size) await item.deleteEmbeddedDocuments("ActiveEffect", item.effects.map((e) => e.id), opts);
  if (fresh.length) await item.createEmbeddedDocuments("ActiveEffect", fresh, opts);
  if ("notes" in (source.system ?? {})) await item.update({ "system.notes": source.system.notes }, opts);
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
  let changed = 0;
  for (const item of items) {
    const source = await sourceOf(item);
    if (source && (await refresh(item, source))) changed++;
  }
  await game.settings.set(SYSTEM_ID, "syncedVersion", version);
  if (changed) ui.notifications.info(`Modern20 ${version}: updated ${changed} item${changed === 1 ? "" : "s"} from the compendiums.`);
}
