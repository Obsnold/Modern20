/**
 * Class features given as a character's classes reach their levels (rules/features.mjs): after a
 * class is added, changed or removed, the client that did it brings the character's features into
 * line, copying each new one from the class features compendium. Several changes at once make
 * one pass; a character deleted meanwhile is skipped.
 */
import { featuresDue, featureChanges } from "./rules/features.mjs";
import { SYSTEM_ID } from "./config.mjs";

const pending = new Map();
const exists = (actor) => (actor.isToken ? !!actor.token?.parent?.tokens.has(actor.token.id) : game.actors.has(actor.id));

/** Bring a character's class features into line with its classes, now. */
export async function syncFeatures(actor) {
  if (!actor || actor.type !== "character" || actor.pack || !actor.isOwner || !exists(actor)) return;
  const classes = actor.items.filter((i) => i.type === "class");
  const owned = actor.items.filter((i) => i.type === "feature" && i.getFlag(SYSTEM_ID, "grantedBy"))
    .map((i) => ({ id: i.id, classId: i.getFlag(SYSTEM_ID, "grantedBy"), name: i.name, rank: i.system.rank }));
  const { add, remove, ranks } = featureChanges(featuresDue(classes), owned);
  if (remove.length) await actor.deleteEmbeddedDocuments("Item", remove);
  if (ranks.length) await actor.updateEmbeddedDocuments("Item", ranks.map((r) => ({ _id: r.id, "system.rank": r.rank })));
  if (!add.length) return;
  const data = [];
  for (const f of add) {
    const source = await fromUuid(f.uuid);
    if (!source) continue;
    const o = source.toObject();
    delete o._id;
    foundry.utils.mergeObject(o, { system: { rank: f.rank }, flags: { [SYSTEM_ID]: { grantedBy: f.classId } }, _stats: { compendiumSource: source.uuid } });
    data.push(o);
  }
  if (data.length) await actor.createEmbeddedDocuments("Item", data);
}

/** The same, a moment later, so several changes at once make one pass. */
function soon(actor, userId) {
  if (!actor || actor.type !== "character" || userId !== game.user.id) return;
  clearTimeout(pending.get(actor.uuid));
  pending.set(actor.uuid, setTimeout(() => {
    pending.delete(actor.uuid);
    syncFeatures(actor);
  }, 150));
}

/** Register the hooks; called once, at init. */
export function registerFeatureHooks() {
  // A character made with its classes already in it (Build as a character) has had no item hooks.
  Hooks.on("createActor", (actor, options, userId) => soon(actor, userId));
  for (const hook of ["createItem", "updateItem", "deleteItem"]) {
    Hooks.on(hook, (item, ...rest) => {
      if (item.type === "class") soon(item.parent?.documentName === "Actor" ? item.parent : null, rest.at(-1));
    });
  }
}
