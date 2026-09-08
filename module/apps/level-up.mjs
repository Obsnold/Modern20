

// SRD character-level milestones, independent of individual class level:
// "A multiclass character receives a new feat every three character levels"
// and "increases one ability score by +1 every four character levels".
const FEAT_EVERY = 3;
const ABILITY_INCREASE_EVERY = 4;

/**
 * Shared lookups for what a class level or an occupation can grant.
 *
 * The choices themselves are presented inline by the character creator and the
 * level-up screen; this module only answers "what is available" and "add it".
 */

const TALENT_PACK = "modern20.talents";
const FEAT_PACK = "modern20.feats";

/** Documents from a compendium, or an empty array if it is not installed. */
export async function packDocuments(packId) {
  const pack = game.packs.get(packId);
  if (!pack) return [];
  return pack.getDocuments();
}

/**
 * Add a compendium document to the actor, stamped with where it came from.
 *
 * The stamp is what lets a sheet answer "why does this character have this" —
 * a talent from a level, a feat from an occupation, a class feature granted
 * automatically. Without it a granted item is indistinguishable from one
 * dragged on by hand.
 */
export async function grant(actor, uuid, source = null) {
  if (!uuid) return null;
  const document = await fromUuid(uuid);
  if (!document) return null;

  const data = document.toObject();
  if (source) foundry.utils.setProperty(data, "flags.modern20.source", source);

  const [created] = await actor.createEmbeddedDocuments("Item", [data]);
  return created;
}

/** A provenance stamp: what granted this, and at what point. */
export function sourceStamp({ origin, label, characterLevel = null }) {
  return { origin, label, characterLevel, at: new Date().toISOString() };
}

/** Talents the character does not already have, from this class's trees. */
export async function talentChoices(actor, classItem) {
  const owned = new Set(actor.items.filter((i) => i.type === "talent").map((i) => i.name));
  const talents = await packDocuments(TALENT_PACK);
  return talents
    .filter((t) => t.system.sourceClass === classItem.name && !owned.has(t.name))
    .map((t) => ({ uuid: t.uuid, name: t.name, tree: t.system.tree }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Feats the character does not already have, unless the feat repeats. */
export async function featChoices(actor) {
  const owned = new Set(actor.items.filter((i) => i.type === "feat").map((i) => i.name));
  const feats = await packDocuments(FEAT_PACK);
  return feats
    .filter((f) => f.system.repeatable || !owned.has(f.name))
    .map((f) => ({ uuid: f.uuid, name: f.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A named class feature, e.g. an advanced class's "Weapon Focus".
 *
 * Some of these are real feats that exist in the compendium; the rest are
 * unique to the class. Grant the feat when one matches by name, and otherwise
 * record the feature as a talent so it is at least visible on the sheet.
 */
export async function grantNamedFeature(actor, classItem, feature, level) {
  const source = sourceStamp({
    origin: "class",
    label: game.i18n.format("MODERN20.Source.ClassLevel", { name: classItem.name, level })
  });

  const feats = await packDocuments(FEAT_PACK);
  const match = feats.find((f) => f.name.toLowerCase() === feature.toLowerCase());
  if (match) return grant(actor, match.uuid, source);

  const [created] = await actor.createEmbeddedDocuments("Item", [{
    name: feature,
    type: "talent",
    img: "icons/svg/statue.svg",
    flags: { modern20: { source } },
    system: {
      tree: game.i18n.localize("MODERN20.LevelUp.ClassFeature"),
      sourceClass: classItem.name,
      description: game.i18n.format("MODERN20.LevelUp.GrantedAt", {
        name: classItem.name, level
      })
    }
  }]);
  return created;
}
