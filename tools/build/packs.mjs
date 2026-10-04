/** Every compendium pack the build writes, by the name system.json gives it. */
import { buildJournal } from "./journal.mjs";
import { buildFeats } from "./feats.mjs";
import { buildSpells, buildPowers, buildIncantations } from "./fx.mjs";
import { buildOccupations } from "./occupations.mjs";
import { buildSpecies } from "./species.mjs";
import { buildEquipment } from "./equipment.mjs";
import { buildClasses, buildTalents } from "./classes.mjs";
import { buildCreatures } from "./creatures.mjs";
import { buildCreatureTypes, buildTemplates } from "./creature-rules.mjs";

export const PACKS = {
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
