/**
 * Whether a character meets an advanced or prestige class's requirements, as its class page
 * prints them (`system.requirements`, each `{ label, value, feats, talents }`).
 *
 *   Base Attack Bonus, Base Reflex Save      against the character's base bonus
 *   Skills                                   each clause: ranks in a skill, or in one of the
 *                                            skills or specialties it names ("either", "or",
 *                                            "any one")
 *   Feats                                    each clause: a feat it names, or one of them
 *   <Class> Talents                          the talents named, "any two" of a list or a class,
 *                                            or one from a tree
 *   Starting Occupation                      the occupation
 *   Special, Other                           the ability to cast arcane or divine spells (of a
 *                                            level), a base Reflex save
 *
 * Anything else (an allegiance, a holy symbol) is the table's to check: `met` null. Checked
 * against the character as it is now, which includes what the class itself has given since.
 */
import { SKILLS } from "../data/skills.mjs";
import { slug } from "./identify.mjs";

const SKILL_NAMES = Object.entries(SKILLS).map(([key, s]) => ({ key, name: s.name })).sort((a, b) => b.name.length - a.name.length);

/** Split at commas and " plus " outside parentheses. */
function clauses(text) {
  const out = [];
  let depth = 0, cur = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (!depth && (c === "," || text.startsWith(" plus ", i))) {
      out.push(cur);
      cur = "";
      if (c !== ",") i += 5;
      continue;
    }
    cur += c;
  }
  return [...out, cur].map((x) => x.trim().replace(/^(and|plus)\s+/i, "")).filter(Boolean);
}

/** The skills a clause names, each with the specialties allowed (null for any). */
function skillsIn(clause) {
  const found = [];
  let rest = clause;
  for (const s of SKILL_NAMES) {
    const re = new RegExp(`\\b${s.name.replace(/[/]/g, "\\/")}\\b(?:\\s*\\(([^)]*)\\))?`, "gi");
    rest = rest.replace(re, (_, inner) => {
      const any = !inner || /\b(any|select one)\b/i.test(inner);
      found.push({ key: s.key, specialties: any ? null : inner.split(/,|\bor\b/).map((x) => x.trim().toLowerCase()).filter(Boolean) });
      return " ";
    });
  }
  return found;
}

/** Ranks the character has in a skill, in the best of the specialties allowed. */
function ranksIn(skills, key, specialties) {
  return Math.max(0, ...skills.filter((r) => r.key === key && (!specialties || !r.specialty || specialties.some((s) => r.specialty.toLowerCase() === s || r.specialty.toLowerCase().startsWith(s)))).map((r) => r.ranks ?? 0));
}

const NUMBERS = { one: 1, two: 2, three: 3 };

/**
 * One requirement: `{ met, missing }`, `met` null when it is for the table to check. `c` is what
 * the character has: `{ d, feats, talents, occupation }`, `d` its derived numbers, feats and
 * talents its items `{ name, system }`.
 */
export function requirementMet(r, c) {
  const label = r.label.toLowerCase();
  const value = (r.value ?? "").split(/\.\s/)[0].replace(/\.$/, "");
  const num = (t) => Number(t.match(/[+-]?\d+/)?.[0] ?? NaN);
  const res = (ok, missing) => ({ met: ok, missing: ok ? [] : missing });
  if (label === "base attack bonus") return res(c.d.baseAttackBonus >= num(value), [`base attack bonus ${value}`]);
  if (label === "base reflex save" || /^base reflex save/i.test(value)) return res(c.d.baseSaves.ref >= num(value), [`base Reflex save +${num(value)}`]);
  if (label === "skills") {
    const missing = [];
    // A list of alternatives split at its commas ("6 ranks in Knowledge (a), Knowledge (b), or Knowledge (c)"):
    // a part with no ranks of its own joins the one before.
    const parts = clauses(value).reduce((acc, x) => {
      if (acc.length && Number.isNaN(num(x))) acc[acc.length - 1] += `, ${x}`;
      else acc.push(x);
      return acc;
    }, []);
    for (const clause of parts) {
      const need = num(clause);
      const skills = skillsIn(clause);
      if (Number.isNaN(need) || !skills.length) return { met: null, missing: [value] };
      if (!skills.some((s) => ranksIn(c.d.skills, s.key, s.specialties) >= need)) missing.push(clause.replace(/^either\s+/i, ""));
    }
    return res(!missing.length, missing);
  }
  if (label === "feats") {
    const have = new Set(c.feats.map((f) => slug(f.name)));
    const links = (r.feats ?? []).map((f) => f.name);
    const missing = [];
    for (const clause of clauses(value).flatMap((x) => x.split(/\s+and\s+/))) {
      const options = links.filter((n) => clause.toLowerCase().includes(n.toLowerCase().replace(/\s*\(.*\)$/, "")));
      if (!options.length) return { met: null, missing: [value] };
      if (!options.some((n) => have.has(slug(n.replace(/\s*\(.*\)$/, ""))))) missing.push(clause);
    }
    return res(!missing.length, missing);
  }
  if (/talents$/.test(label)) {
    const className = r.label.replace(/ Talents$/i, "");
    const own = c.talents;
    const count = value.match(/\bany (one|two|three)\b/i);
    const tree = value.match(/from the (.+?) Talent Tree/i);
    if (tree) return res(own.some((t) => t.system.tree === tree[1]), [value]);
    const named = (r.talents ?? []).map((t) => t.name);
    if (count && !named.length) return res(own.filter((t) => t.system.className === className).length >= NUMBERS[count[1].toLowerCase()], [value]);
    const have = (n) => own.some((t) => slug(t.name) === slug(n));
    if (count) return res(named.filter(have).length >= NUMBERS[count[1].toLowerCase()], [value]);
    if (/\beither\b|\bor\b/i.test(value)) return res(named.some(have), [value]);
    return res(named.length > 0 && named.every(have), named.filter((n) => !have(n)));
  }
  if (label === "starting occupation") return res(slug(c.occupation?.name ?? "") === slug(value), [`starting occupation ${value}`]);
  const casting = value.match(/ability to cast (?:(\d)\w*-level )?(arcane|divine) spells/i);
  if (casting) {
    const level = Number(casting[1] ?? 0);
    return res((c.d.casters ?? []).some((k) => k.kind === casting[2].toLowerCase() && (k.perDay?.[level] ?? 0) > 0), [value]);
  }
  return { met: null, missing: [value] };
}

/** All of a class's requirements, each with whether it is met. */
export const classRequirements = (cls, c) => (cls.system.requirements ?? []).map((r) => ({ label: r.label, value: r.value, ...requirementMet(r, c) }));
