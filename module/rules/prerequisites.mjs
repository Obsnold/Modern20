/**
 * Whether a character meets a feat's prerequisites, as the feat prints them ("Dexterity 13, Dodge, base
 * attack bonus +4."). Each clause, split at its commas, is one of:
 *
 *   an ability score          "Dexterity 13", "Intelligence 13 (for arcane spellcasters) or Wisdom 13 ..."
 *   base attack bonus         "base attack bonus +4", "Base attack bonus +2 or better"
 *   a base save               "Base Fortitude save bonus +5"
 *   skill ranks               "Tumble 4 ranks", "Drive 6 ranks or Pilot 6 ranks", "Craft (electrical) 8 ranks"
 *   character or caster level "Character level 8th+", "caster level 6"
 *   a feat                    "Dodge", "Armor Proficiency (light)", one of them with "or"
 *
 * Anything else (proficiency with the weapon, an allegiance, a mecha's free hand slots, the ability to turn
 * undead) is the table's to check. Plain functions over the character's derived data and feat names.
 */
import { skillKey } from "../data/skills.mjs";
import { slug } from "./identify.mjs";

const ABILITIES = { strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha", str: "str", dex: "dex", con: "con", int: "int", wis: "wis", cha: "cha" };

/** Split at commas outside parentheses: "Dexterity 13, Craft (electrical) 8 ranks". */
function clauses(text) {
  const out = [];
  let depth = 0, cur = "";
  for (const c of text) {
    if (c === "(") depth++;
    if (c === ")") depth = Math.max(0, depth - 1);
    if (c === "," && !depth) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  return [...out, cur].map((x) => x.trim().replace(/^(and|plus)\s+/i, "").replace(/\.$/, "").trim()).filter(Boolean);
}

/**
 * One alternative of a clause: `true` met, `false` not, `null` for the table. `c` is `{ d, feats }`: the
 * derived data and the names of the feats (and class features) the character has.
 */
function alternative(text, c) {
  const t = text.trim().replace(/\s+/g, " ");
  let m;
  if ((m = t.match(/^(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma|Str|Dex|Con|Int|Wis|Cha) (\d+)/i))) {
    return (c.d.scores?.[ABILITIES[m[1].toLowerCase()]] ?? 0) >= Number(m[2]);
  }
  if ((m = t.match(/^base attack bonus \+(\d+)/i))) return (c.d.baseAttackBonus ?? 0) >= Number(m[1]);
  if ((m = t.match(/^base (Fortitude|Reflex|Will) save bonus \+(\d+)/i))) return (c.d.baseSaves?.[{ fortitude: "fort", reflex: "ref", will: "will" }[m[1].toLowerCase()]] ?? 0) >= Number(m[2]);
  if ((m = t.match(/^character level (\d+)/i))) return (c.d.level ?? 0) >= Number(m[1]);
  if ((m = t.match(/^caster level (\d+)/i))) return Math.max(0, ...(c.d.casters ?? []).map((k) => k.casterLevel)) >= Number(m[1]);
  if ((m = t.match(/^(.+?)(?: \(([^)]*)\))? (\d+) ranks?$/i)) && skillKey(m[1])) {
    const key = skillKey(m[1]), specialty = (m[2] ?? "").toLowerCase();
    const ranks = Math.max(0, ...(c.d.skills ?? []).filter((r) => r.key === key && (!specialty || r.specialty.toLowerCase() === specialty)).map((r) => r.ranks ?? 0));
    return ranks >= Number(m[3]);
  }
  // A feat: by name, or by its name without what it is "of" ("Starship Operation (of the appropriate type)").
  const have = new Set(c.feats.map((n) => slug(n)));
  const bare = (n) => slug(n.replace(/\s*\((of|for|in|with)\b.*\)$/i, ""));
  if (c.known.has(slug(t))) return have.has(slug(t));
  if (c.known.has(bare(t))) return [...c.feats].some((n) => bare(n) === bare(t));
  return null;
}

/**
 * A feat's prerequisites (`text`, as printed) against a character: `{ met, missing, check }`, `met` false
 * if any clause is not met, null if none is unmet but some are the table's to check (named in `check`).
 * `c` is `{ d, feats, known }`: derived data, the names of the feats it has, and the slugs of every feat
 * there is (to tell a feat's name from other wording).
 */
export function featPrerequisites(text, c) {
  const missing = [], check = [];
  for (const clause of clauses(String(text ?? ""))) {
    // Alternatives ("Drive 6 ranks or Pilot 6 ranks"), but not "+2 or better", which is the one.
    const results = clause.replace(/\s+or better\b/i, "").split(/\s+or\s+/i).map((a) => alternative(a.replace(/\s*\(for [^)]*\)/i, ""), c));
    if (results.some((r) => r === true)) continue;
    if (results.every((r) => r === false)) missing.push(clause);
    else check.push(clause);
  }
  return { met: missing.length ? false : check.length ? null : true, missing, check };
}
