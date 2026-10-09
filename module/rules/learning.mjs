/**
 * The spells and powers a casting class's new level brings, as its class page says:
 *
 *   known        a caster with a table of spells or powers known (a Mystic, a Telepath, a Battle
 *                Mind, a Psionic Agent): at each level, as many more of each level as the table
 *                then gives over those it has. "At each level, the Telepath discovers one or more
 *                previously latent powers, as indicated on the table below."
 *   spellbook    a Mage or Techno Mage: at 1st level "all 0-level arcane spells and three 1st-level
 *                arcane spells of the player's choice", one more 1st-level spell for each point of
 *                Intelligence bonus; at each later level "two new spells of any level or levels that
 *                he can cast, according to his new level"
 *   whole list   an Acolyte or Holy/Unholy Knight: "may prepare and cast any spell on the divine
 *                spell list", so nothing to choose
 *
 * A Telepath's Trigger Power (2nd, 5th and 8th level): "one 0-, 1st-, 2nd-, or 3rd-level power you
 * can use", to try to manifest for no power point cost.
 */
import { tableRow } from "./casting.mjs";

/** The classes that keep a spellbook (or spellfiles): the 1st-level spells they start with, and those each level adds. */
export const SPELLBOOK = {
  "Mage": { first: 3, perLevel: 2, ability: "int" },
  "Techno Mage": { first: 3, perLevel: 2, ability: "int" },
};

/** The levels a trigger power may be. */
export const TRIGGER_LEVELS = [0, 1, 2, 3];

/** A table's numbers at `n` as `{ level: count }`, levels it gives none of left out. */
function atLevel(table, n) {
  const values = tableRow(table, n);
  if (!values) return {};
  return Object.fromEntries(table.columns.map((l, i) => [l, values[i]]).filter(([, v]) => v !== null && v !== undefined));
}

/**
 * What a level of a casting class brings: `cls` the class (`{ name, system }`, `system.casting` as built),
 * `classLevel` its new level, `modifier` the spellbook ability's modifier, `have` how many of each level the
 * character has on this class's lists (`{ level: count }`).
 *
 * Returns `{ kind, all, picks, note }`: `kind` "known", "spellbook", "list" or "" (not a caster, or one that
 * adds to another's casting); `all` the levels every spell of which is added (a Mage's 0-level spells, at
 * 1st); `picks` the choices, each `{ levels, count }` (a spell of any of `levels`).
 */
export function newSpells(cls, classLevel, { modifier = 0, have = {} } = {}) {
  const k = cls.system.casting ?? {};
  const none = { kind: "", all: [], picks: [], note: "" };
  if (!k.kind || k.boosts) return none;
  const book = SPELLBOOK[cls.name];
  if (book) {
    if (classLevel === 1) return { kind: "spellbook", all: [0], picks: [{ levels: [1], count: Math.max(0, book.first + Math.max(0, modifier) - (have[1] ?? 0)) }], note: "" };
    // Any level it can cast at its new level: those its spells a day table gives (0 included: a bonus spell's).
    const levels = Object.keys(atLevel(k.perDay, classLevel)).map(Number).filter((l) => l > 0).sort((a, b) => a - b);
    return { kind: "spellbook", all: [], picks: levels.length ? [{ levels, count: book.perLevel }] : [], note: "" };
  }
  if (k.known?.rows?.length) {
    const known = atLevel(k.known, classLevel);
    const picks = Object.entries(known).map(([l, n]) => ({ levels: [Number(l)], count: Math.max(0, n - (have[l] ?? 0)) })).filter((p) => p.count > 0);
    return { kind: "known", all: [], picks, note: "" };
  }
  return { kind: "list", all: [], picks: [], note: `${cls.name} casts any spell on ${cls.name === "Acolyte" ? "its" : "the Acolyte's"} list of a level it can cast: nothing to choose here. Drag those it prepares onto the Magic tab.` };
}

/** Whether a level of the class brings Trigger Power (the Telepath's 2nd, 5th and 8th). */
export const triggerAt = (features) => features.some((f) => /^trigger power$/i.test(f));
