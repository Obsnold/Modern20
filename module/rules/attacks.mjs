/**
 * A creature's printed attacks, read so they can be rolled: "+8 melee (1d4, knife) or +12
 * ranged (1d4, knife)", "+15 melee (2d4+10, 4 claws), +10 melee (1d6+5, bite) or +8 ranged
 * touch (special, eye ray)".
 *
 * A line is a list of choices, each a group of attacks made together:
 *
 *   " or " / ", or " / ";"   between choices
 *   ", " / " and "     between attacks made together (a full attack's claws and bite)
 *
 * An attack is `{ name, count, bonuses, kind, touch, damage, critical, extra, nonlethal, text }`: `kind`
 * "melee", "ranged", or "swarm" (automatic damage, no bonuses to roll);
 * `bonuses` its iterative attack bonuses (+25/+20/+15), `damage` its dice as a formula (null for
 * "special", or when none is printed), `extra` the dice it adds of another kind ("plus 1d6
 * fire") and `note` what it adds that is not dice ("plus poison").
 */
import { critical as readCritical } from "./rolls.mjs";

const DASHES = /[–—−]/g;

/** Split at commas, " or " and " and " outside parentheses: `[{ text, sep }]`, `sep` what joined it to the one before. */
function split(text) {
  const parts = [];
  let depth = 0, start = 0, sep = null;
  const s = text;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    if (depth) continue;
    const rest = s.slice(i);
    const m = rest.match(/^(;\s*or\s+|;\s*|,\s*or\s+|\s+or\s+|,\s*and\s+|\s+and\s+|,\s*)/);
    if (m && i > start) {
      parts.push({ text: s.slice(start, i).trim(), sep });
      sep = /or|;/.test(m[1]) ? "or" : "and";
      i += m[1].length - 1;
      start = i + 1;
    }
  }
  if (s.slice(start).trim()) parts.push({ text: s.slice(start).trim(), sep });
  return parts;
}

/** One attack: "+21/+16/+11 melee (2d6+7/19–20, +3 greatsword)". Null if it is not one. */
export function readAttack(text) {
  const t = text.replace(DASHES, "-");
  // A swarm's attack: "swarm (2d6 plus poison, swarm)", automatic damage with no attack roll (Arcana/Creatures/Swarm).
  const swarm = t.match(/^swarm\s*\((.*)\)\s*$/i);
  if (swarm) return { ...readAttack(`+0 melee (${swarm[1]})`), bonuses: [], kind: "swarm", critical: null, text: text.trim() };
  const m = t.match(/^(.*?)\s*([+-]\d+(?:\/[+-]\d+)*)\s+(melee|ranged)(\s+touch)?\s*(?:\((.*)\))?\s*$/i);
  if (!m) return null;
  const [, before, bonusText, kind, touch, inside = ""] = m;
  // Inside the parentheses: the damage, then (after the first top-level comma) the weapon.
  // With no comma, the parentheses hold the damage ("(1d6)") or, when it is not dice, the attack's name
  // ("(poison spittle)").
  const comma = inside.indexOf(",");
  const named = comma < 0 && inside && !/^\d/.test(inside.trim());
  const damageText = named ? "" : (comma >= 0 ? inside.slice(0, comma) : inside).trim();
  let name = (comma >= 0 ? inside.slice(comma + 1) : named ? inside : before).trim() || (kind.toLowerCase() === "melee" ? "Melee" : "Ranged");
  const count = Number(name.match(/^(\d+)\s+/)?.[1] ?? 1);
  if (count > 1) name = name.replace(/^\d+\s+/, "").replace(/s$/, "");
  const [main, ...plus] = damageText.split(/\s+plus\s+/);
  const dm = main.match(/^(\d+(?:d\d+)?(?:\s*[+-]\s*\d+)?)((?:\/(?:\d+-\d+|\d+|x\d+))*)\s*(nonlethal)?/i);
  const extra = plus.map((p) => p.match(/^(\d+d\d+(?:[+-]\d+)?)\s*(.*)$/)).filter(Boolean).map((p) => ({ formula: p[1], type: p[2] }));
  const note = plus.filter((p) => !/^\d+d\d+/.test(p)).join(", ");
  return {
    name: name[0].toUpperCase() + name.slice(1),
    count,
    bonuses: bonusText.split("/").map(Number),
    kind: kind.toLowerCase(),
    touch: !!touch,
    damage: dm ? dm[1].replace(/\s+/g, "") : null,
    critical: dm ? readCritical(dm[2].replace(/^\//, "") || "20") : null,
    nonlethal: !!dm?.[3],
    extra,
    note,
    text: text.trim(),
  };
}

/** A printed attack line as its choices: `[[attack, ...], ...]`. Parts that are not attacks are left out. */
export function readAttacks(line) {
  const choices = [];
  for (const { text, sep } of split((line ?? "").trim())) {
    const attack = readAttack(text);
    if (!attack) continue;
    if (sep === "and" && choices.length) choices.at(-1).push(attack);
    else choices.push([attack]);
  }
  return choices;
}

const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

/** The roll for one of an attack's iterative bonuses (`bonusIndex`), with its critical. */
export function attackRoll(attack, bonusIndex = 0) {
  const bonus = attack.bonuses[bonusIndex] ?? attack.bonuses[0];
  const which = attack.bonuses.length > 1 ? ` (${["first", "second", "third", "fourth", "fifth", "sixth"][bonusIndex] ?? `${bonusIndex + 1}th`} attack)` : "";
  const terms = bonus ? [{ label: "Attack bonus", value: bonus }] : [];
  const formula = ["1d20", ...terms.map((t) => (t.value < 0 ? `- ${-t.value}` : `+ ${t.value}`))].join(" ");
  return { title: `${attack.name}: ${attack.kind}${attack.touch ? " touch" : ""} attack${which}`, terms, formula, critical: attack.critical };
}

/**
 * An attack's damage, as printed (its Strength already counted); on a critical its dice and
 * bonus rolled `multiplier` times, and any extra dice of another kind once, as the SRD has it.
 * Null when the damage is not dice.
 */
export function damageRoll(attack, multiplier = 1) {
  if (!attack.damage) return null;
  const main = multiplier > 1 ? Array.from({ length: multiplier }, () => `(${attack.damage})`).join(" + ") : attack.damage;
  const formula = [main, ...attack.extra.map((e) => `${e.formula}${e.type ? `[${e.type}]` : ""}`)].join(" + ");
  const terms = [
    { label: attack.nonlethal ? "Nonlethal" : "Damage", value: attack.damage },
    ...attack.extra.map((e) => ({ label: e.type || "Extra", value: e.formula })),
    ...(attack.note ? [{ label: "Plus", value: attack.note }] : []),
  ];
  const crit = multiplier > 1 ? `: critical (×${multiplier})` : "";
  return { title: `${attack.name}: damage${crit}${attack.nonlethal ? " (nonlethal)" : ""}`, terms, formula, nonlethal: attack.nonlethal };
}

/** An attack line's choices, laid out for a sheet: each attack's buttons, with where to find it again. */
export function attackRows(line, choices) {
  return choices.map((group, choice) => group.map((a, index) => ({
    line, choice, index, name: a.count > 1 ? `${a.count} ${a.name}s` : a.name,
    kind: a.kind === "swarm" ? "automatic, no attack roll" : `${a.kind}${a.touch ? " touch" : ""}`,
    bonuses: a.bonuses.map((b, bonus) => ({ bonus, label: signed(b) })),
    damage: a.damage ? `${a.damage}${a.extra.map((e) => ` + ${e.formula} ${e.type}`).join("")}${a.nonlethal ? " nonlethal" : ""}` : "",
    note: a.note, first: index === 0 && choice > 0,
  })));
}
