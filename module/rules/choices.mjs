/**
 * Feats and talents taken with a choice, and how a choice is matched.
 *
 * The choice is free text on the owned item ("Glock 17", "Knowledge (history)"),
 * matched loosely so a player need not type a weapon's full printed name.
 */

/** Feat and talent names that take a choice, and what is chosen. */
export const CHOICES = {
  "Weapon Focus": "weapon",
  "Weapon Finesse": "weapon",
  "Exotic Melee Weapon Proficiency": "weapon",
  "Exotic Firearms Proficiency": "weapon group",
  "Educated": "two Knowledge skills",
  "Skill Emphasis": "skill",
};

/** Lower case, no apostrophes, and no plural "s": "grenade launchers" and "grenade launcher" are one choice. */
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
