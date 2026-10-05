/**
 * Items are known by an identifier, not their name: a slug of the name the SRD
 * prints ("Armor Proficiency (light)" -> "armor-proficiency-light"), set by the
 * importer. A renamed item keeps its identifier, and both copies of a feat the
 * books print twice ("Wild Talent (Arcana)", "Wild Talent (Modern)") share one.
 */

/** The book a split duplicate's name ends with. */
const BOOK_SUFFIX = / \((Modern|Arcana|Future|Menace)\)$/;

/** "Armor Proficiency (light)" -> "armor-proficiency-light". */
export function slug(name) {
  return (name ?? "").replace(BOOK_SUFFIX, "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** An item's identifier: the one it carries, or (an item made by hand) its name's slug. */
export const identify = (item) => item.system?.identifier || slug(item.name);
