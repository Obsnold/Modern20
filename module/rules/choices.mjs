/**
 * Feats and talents taken with a choice, and how a choice is matched.
 *
 * The choice is free text on the owned item ("Glock 17", "Knowledge (history)"),
 * matched loosely so a player need not type a weapon's full printed name.
 */

import { FEAT_RULES } from "./feats.mjs";

/** Identifiers of the feats and talents taken with a choice, and what is chosen. */
export const CHOICES = Object.fromEntries(Object.entries(FEAT_RULES).filter(([, r]) => r.choice).map(([id, r]) => [id, r.choice]));

const plain = (s) => (s ?? "").toLowerCase().replace(/[’']/g, "").replace(/\s+/g, " ").trim().replace(/(\w{3,})s\b/g, "$1");
const base = (s) => plain(s).replace(/\s*\(.*\)$/, "");

/** Does `choice` name `target`? "Glock 17" names "Glock 17 (9mm autoloader)"; "grenade launchers" names "(grenade launchers)". */
export function chooses(choice, target) {
  const c = plain(choice), t = plain(target);
  if (!c) return false;
  // The whole name, its name without the parenthetical, its first words ("glock 17" of "glock 17 (9mm ...)"),
  // or the group it names in parentheses ("grenade launchers").
  return t === c || base(t) === c || base(t).startsWith(`${c} `) || t.includes(`(${c})`);
}

/** The skills a choice names: "Knowledge (history) and Knowledge (civics)", "Climb". */
export function chosenSkills(choice) {
  return (choice ?? "").split(/\s*(?:,|\band\b)\s*/).map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = s.match(/^(.+?)(?: [\(\[](.+)[\)\]])?$/);
    return { name: m[1], specialty: m[2] ?? "" };
  });
}
