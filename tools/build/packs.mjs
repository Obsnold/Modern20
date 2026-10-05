/** Every compendium pack the build writes, by the name system.json gives it. */
import { conform, obj } from "../../module/data/schema.mjs";
import { once } from "./once.mjs";
import { ITEM_MODELS, ACTOR_MODELS } from "../../module/data/models.mjs";
import { buildJournal } from "./journal.mjs";
import { buildFeats } from "./feats.mjs";
import { buildSpells, buildPowers, buildIncantations } from "./fx.mjs";
import { buildOccupations } from "./occupations.mjs";
import { buildSpecies } from "./species.mjs";
import { buildEquipment } from "./equipment.mjs";
import { buildClasses, buildTalents } from "./classes.mjs";
import { buildCreatures } from "./creatures.mjs";
import { buildCreatureTypes, buildTemplates } from "./creature-rules.mjs";

const BUILDERS = {
  rules: buildJournal,
  classes: buildClasses,
  talents: buildTalents,
  feats: buildFeats,
  spells: buildSpells,
  powers: buildPowers,
  incantations: buildIncantations,
  occupations: buildOccupations,
  species: buildSpecies,
  equipment: buildEquipment,
  creatures: buildCreatures,
  "creature-types": buildCreatureTypes,
  templates: buildTemplates,
};

/** The model a document's system data is described by, or null (journal entries, folders). */
export function modelFor(doc) {
  if (!doc.system) return null;
  const fields = doc._key.startsWith("!actors!") ? ACTOR_MODELS[doc.type] : ITEM_MODELS[doc.type];
  return fields ? obj(fields) : undefined;
}

/**
 * Each pack's builder, with every document's system data conformed to its
 * model: what is missing filled in with defaults, as Foundry would on load.
 */
export const PACKS = Object.fromEntries(Object.entries(BUILDERS).map(([name, build]) => [name, once(() => {
  const r = build();
  return { ...r, documents: r.documents.map((d) => { const m = modelFor(d); return m ? { ...d, system: conform(m, d.system) } : d; }) };
})]));
