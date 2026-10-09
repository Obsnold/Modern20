/**
 * Feats that give spells or powers to cast a few times a day, without a casting class:
 *
 *   Wild Talent (Modern)     "Select one 0-level psionic power. The character can manifest this power
 *                            up to three times in a 24-hour period. There is no power point cost ...
 *                            the character is considered 1st level or his or her manifester level,
 *                            whichever is higher."
 *   Wild Talent (Arcana)     the same, of nine: "burst, daze, detect psionics, distract, far hand, far
 *                            punch, finger of fire, missive, or verve"
 *   Magical Heritage         "Choose three 0-level arcane spells ("cantrips"). You may cast each of these
 *                            spells once per day per your arcane spellcasting level (minimum 1)."
 *
 * Magical Heritage does not say which ability its saving throw DCs add: Intelligence here, its
 * prerequisite and the Mage's. Its "treated as a Mage for purposes of arcane spell failure" has nothing
 * to follow, the system not keeping arcane spell failure.
 */

/** The nine 0-level powers Urban Arcana's Wild Talent allows. */
export const ARCANA_TALENTS = ["Burst", "Daze", "Detect Psionics", "Distract", "Far Hand", "Far Punch", "Finger of Fire", "Missive", "Verve"];

/** The feats, by identifier: the item type they give, how many, of what level, from which lists, and the ability for DCs. */
export const FEAT_CASTING = {
  "wild-talent": { type: "power", kind: "psionic", count: 1, level: 0, lists: null, ability: "" },
  "magical-heritage": { type: "spell", kind: "arcane", count: 3, level: 0, lists: ["Mage", "Arcane"], ability: "int" },
};

/** The feat's rule for a feat item (`{ name, system }`), with the copy's own limits (Arcana's nine), or null. */
export function featCasting(feat, key) {
  const rule = FEAT_CASTING[key];
  if (!rule) return null;
  const only = key === "wild-talent" && /Arcana/.test(feat.system?.source?.book ?? "") ? ARCANA_TALENTS : null;
  return { ...rule, key, only };
}

/** Whether a spell or power (`{ name, system: { levels } }`) may be chosen for the feat's rule. */
export function eligible(rule, entry) {
  if (rule.only && !rule.only.includes(entry.name)) return false;
  return (entry.system?.levels ?? []).some((l) => l.level === rule.level && (!rule.lists || rule.lists.includes(l.class)));
}

/**
 * The feat as a caster, beside the classes' (rules/casting.mjs casters): its caster level the character's own
 * of its kind, or 1 if higher or none; and how many times a day each of its spells or powers is cast.
 */
export function featCaster(rule, name, casters = []) {
  const own = Math.max(0, ...casters.filter((c) => c.kind === rule.kind).map((c) => c.casterLevel));
  return {
    name, kind: rule.kind, feat: true, casterLevel: Math.max(1, own),
    ability: rule.ability, lists: [], excluded: "", prepared: false, spontaneous: false, perDay: {}, known: {}, powerPoints: 0, freeManifestations: 0,
    uses: rule.type === "power" ? 3 : Math.max(1, own),
  };
}
