/** Every compendium pack the build writes, by the name system.json gives it. */
import { conform, obj } from "../../module/data/schema.mjs";
import { once } from "./once.mjs";
import { slug } from "../../module/rules/identify.mjs";
import { SYSTEM_TYPE } from "../../module/rules/effects.mjs";
import { stableId } from "./ids.mjs";
import { EFFECTS, NOTES, TOGGLES } from "./mechanics.mjs";
import { ITEM_MODELS, ACTOR_MODELS } from "../../module/data/models.mjs";
import { buildJournal } from "./journal.mjs";
import { buildFeats } from "./feats.mjs";
import { buildSpells, buildPowers, buildIncantations } from "./fx.mjs";
import { buildOccupations } from "./occupations.mjs";
import { buildSpecies } from "./species.mjs";
import { buildEquipment } from "./equipment.mjs";
import { buildClasses, buildTalents, buildFeatures } from "./classes.mjs";
import { buildCreatures } from "./creatures.mjs";
import { buildCreatureTypes, buildTemplates } from "./creature-rules.mjs";

const BUILDERS = {
  rules: buildJournal,
  classes: buildClasses,
  talents: buildTalents,
  features: buildFeatures,
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
 * An item's always-on bonuses as one effect, transferred to whoever owns it. Its changes are of
 * the system's own type, under `system.bonuses`: Foundry skips them, and the character's numbers
 * apply them, with any formula worked out (rules/effects.mjs).
 */
function mechanicsEffect(d, changes, { name = d.name, disabled = false } = {}) {
  const id = stableId(`mechanics:${d._id}${disabled ? ":toggle" : ""}`);
  return {
    _id: id, _key: `!items.effects!${d._id}.${id}`, name, img: d.img, type: "base",
    // Foundry v14's form: changes in `system`, each with a named type and the phase it applies in.
    system: { changes: changes.map(([key, value]) => ({ key: `system.bonuses.${key}`, type: SYSTEM_TYPE, value, phase: "initial", priority: null })) },
    transfer: true, disabled, duration: {}, description: "", origin: null, statuses: [], flags: { modern20: { mechanics: true } },
  };
}

/**
 * Each pack's builder, with every document's system data conformed to its
 * model: what is missing filled in with defaults, as Foundry would on load.
 */
export const PACKS = Object.fromEntries(Object.entries(BUILDERS).map(([name, build]) => [name, once(() => {
  const r = build();
  return { ...r, documents: r.documents.map((d) => {
    const m = modelFor(d);
    if (!m) return d;
    // An item's identifier: the slug of its name, without the book a split duplicate is named for.
    const isItem = d._key.startsWith("!items!");
    const system = isItem ? { identifier: slug(d.name), ...d.system } : d.system;
    // Its mechanics (mechanics.mjs): notes in its data, and the always-on bonuses as an effect.
    const key = `${d.type}:${slug(d.name)}`;
    if (isItem && NOTES[key]) system.rollNotes = NOTES[key];
    const mechanics = [...(EFFECTS[key] ? [mechanicsEffect(d, EFFECTS[key])] : []), ...(TOGGLES[key] ? [mechanicsEffect(d, TOGGLES[key].changes, { name: TOGGLES[key].name, disabled: true })] : [])];
    const effects = isItem && mechanics.length ? mechanics : d.effects;
    return { ...d, system: conform(m, system), ...(effects ? { effects } : {}) };
  }) };
})]));
