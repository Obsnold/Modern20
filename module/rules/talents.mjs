/**
 * Choosing a class's talents and bonus feats.
 *
 *   talents      one for each Talent in a class's levels taken, from its talent trees.
 *                A talent's prerequisites name other talents ("Evasion, uncanny dodge 1."),
 *                sometimes as a choice ("Skill emphasis plus either faith or aware."), or a
 *                talent from a tree ("One talent from the Research Talent Tree."). Linguist's
 *                (ranks in three languages) is the table's to check.
 *   bonus feats  one for each Bonus Feat in a class's levels taken, from its bonus feat list
 */
import { slug } from "./identify.mjs";

/** The bonus feats a class's levels give: one for each Bonus Feat feature at or below its level. */
export const bonusFeatSlots = (cls) => (cls.system.levels ?? [])
  .filter((l) => l.level <= (cls.system.level ?? 0))
  .reduce((n, l) => n + (l.features ?? []).filter((f) => /^bonus feat/i.test(f.name)).length, 0);

/**
 * Whether a talent's prerequisites are met by `owned`, the character's talents as
 * `{ name, tree }`: `{ met, missing }`, `met` null for one the sheet cannot check.
 */
export function talentPrerequisites(talent, owned) {
  const pre = talent.system.prerequisites ?? { value: "", talents: [] };
  const text = (pre.value ?? "").trim();
  if (!text) return { met: true, missing: [] };
  const have = new Set(owned.map((t) => slug(t.name)));
  const missing = [];
  // "One talent from the Research Talent Tree", "one other talent from either the X or the Y Talent Tree".
  const trees = [...text.matchAll(/the ([A-Z][\w\s/-]*?) Talent Tree/g)].map((m) => m[1].trim());
  if (trees.length) {
    const others = owned.filter((t) => trees.includes(t.tree) && slug(t.name) !== slug(talent.name) && !(pre.talents ?? []).some((p) => slug(p.name) === slug(t.name)));
    if (!others.length) missing.push(`a talent from the ${trees.join(" or ")} Talent Tree`);
  }
  // Talents named: all of those before "either", and one of those after it.
  const [allPart, anyPart] = text.split(/\beither\b/i);
  const named = (part) => (pre.talents ?? []).filter((p) => part && new RegExp(p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(part));
  const all = named(trees.length ? allPart.replace(/one (other )?talent from.*$/i, "") : allPart);
  const any = anyPart && !trees.length ? named(anyPart) : [];
  for (const p of all.filter((p) => !any.includes(p))) if (!have.has(slug(p.name))) missing.push(p.name);
  if (any.length && !any.some((p) => have.has(slug(p.name)))) missing.push(any.map((p) => p.name).join(" or "));
  // A prerequisite that names neither talents nor a tree (Linguist's language ranks).
  if (!(pre.talents ?? []).length && !trees.length) return { met: null, missing: [text] };
  return { met: !missing.length, missing };
}
