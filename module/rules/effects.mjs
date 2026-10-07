/**
 * Active effects, applied to an actor's data.
 *
 * Two kinds of change:
 *
 *   add, override   ordinary effects (a condition's penalties, an effect made on the sheet).
 *                   Foundry applies these itself; `applyEffects` does the same where Foundry
 *                   is not (npm test).
 *   modern20        the system's own: the mechanics the build puts on feats, talents and
 *                   species (tools/build/mechanics.mjs). Foundry skips them (the type's handler
 *                   does nothing); the character's numbers apply them (rules/character.mjs),
 *                   and their value may be a formula: `@classes.tough-hero.level`, `@level`,
 *                   `@abilities.con.mod`.
 */
export const MODES = { CUSTOM: 0, MULTIPLY: 1, ADD: 2, DOWNGRADE: 3, UPGRADE: 4, OVERRIDE: 5 };

/**
 * The system's own change type. Foundry v14 names a change's kind (`type`: "add", "override",
 * ...) where earlier versions numbered it (`mode`); a system can register a type of its own with
 * a handler (CONFIG.ActiveEffect.changeTypes), which Foundry then calls in place of applying the
 * change itself. This one's handler does nothing: the character's numbers apply it.
 */
export const SYSTEM_TYPE = "modern20";

const MODE_TYPES = { 0: "custom", 1: "multiply", 2: "add", 3: "downgrade", 4: "upgrade", 5: "override" };

/** A change's kind: its v14 `type`, or the type of an older change's numbered `mode`. */
export const changeType = (c) => c.type ?? MODE_TYPES[c.mode] ?? "add";

/** Whether a change is the system's own to apply (its own type, or an older Custom change). */
export const isSystemChange = (c) => [SYSTEM_TYPE, "custom"].includes(changeType(c));

/** An effect's changes: v14 keeps them in `system.changes`, earlier versions in `changes`. */
export const changesOf = (e) => e.system?.changes ?? e.changes ?? [];

/**
 * A change's value: a number, or a formula of `@` references (looked up in `context`, a missing
 * one counting 0), numbers, + − × ÷ and parentheses, with `floor(...)`. Anything else is 0.
 */
export function resolveValue(value, context = {}) {
  const text = String(value ?? "").trim();
  if (text === "") return 0;
  if (/^[+-]?\d+(\.\d+)?$/.test(text)) return Number(text);
  const replaced = text.replace(/@([\w.-]+)/g, (_, path) => {
    const v = path.split(".").reduce((o, k) => o?.[k], context);
    return `(${Number(v) || 0})`;
  });
  if (!/^[\d\s+\-*/().]*$/.test(replaced.replace(/floor\(/g, "("))) return 0;
  try {
    const result = Function("floor", `"use strict"; return (${replaced});`)(Math.floor);
    return Number.isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}

/** Add a change's value at a path below `target` (a specialty skill's key has a colon, not a dot). */
function addAt(target, key, value, override = false) {
  const path = key.split(".");
  const last = path.pop();
  const parent = path.reduce((o, k) => (o[k] ??= {}), target);
  parent[last] = override ? value : (parent[last] ?? 0) + value;
}

/**
 * Apply `effects` (each `{ disabled, changes: [{ key, mode, value }] }`) to a copy of an actor's
 * `{ system }`: Add and Override as Foundry does, and, with `custom`, the system's own changes,
 * formulas worked out against `context`.
 */
export function applyEffects(actor, effects, { custom = true, context = {} } = {}) {
  const out = structuredClone(actor);
  for (const e of effects) {
    if (e.disabled) continue;
    for (const c of changesOf(e)) {
      const type = changeType(c);
      if (type === "add") addAt(out, c.key, Number(c.value));
      else if (type === "override") addAt(out, c.key, Number(c.value), true);
      else if (isSystemChange(c) && custom) addAt(out, c.key, resolveValue(c.value, context));
    }
  }
  return out;
}

/**
 * The system's own (Custom) changes of `effects` added to a copy of `bonuses` (a character's
 * `system.bonuses`): only changes under `system.bonuses.` apply, formulas worked out against
 * `context`.
 *
 * With `sources`, where each bonus came from is noted in it, by key ("skills.listen"): `[{ label,
 * value }]`, the label the effect's `source` (the item that carries it: "Alertness") or its name. The
 * Add changes Foundry has already applied (a condition's, an effect made on the sheet) are noted too,
 * though not added again.
 */
export function withSystemBonuses(bonuses, effects, context = {}, sources = null) {
  const out = structuredClone(bonuses ?? {});
  const note = (key, e, value) => { if (sources && value) (sources[key] ??= []).push({ label: e.source ?? e.name ?? "Effect", value }); };
  for (const e of effects) {
    if (e.disabled) continue;
    for (const c of changesOf(e)) {
      if (!c.key?.startsWith("system.bonuses.")) continue;
      const key = c.key.slice("system.bonuses.".length);
      if (!isSystemChange(c)) {
        if (changeType(c) === "add") note(key, e, Number(c.value) || 0);
        continue;
      }
      // `@rank`: how many of a class feature's levels its class has reached (Medical Specialist +1, +2, +3).
      const value = resolveValue(c.value, { ...context, rank: e.rank ?? 1 });
      addAt(out, key, value);
      note(key, e, value);
    }
  }
  return out;
}

/**
 * The named parts of a bonus (`total`, at `key`), from what `sources` noted: and, if they do not add up
 * to it (an Override, an effect not noted), the rest as "Other effects".
 */
export function partsOf(sources, key, total) {
  const named = [];
  for (const p of sources?.[key] ?? []) {
    const same = named.find((n) => n.label === p.label);
    if (same) same.value += p.value; else named.push({ ...p });
  }
  const rest = (total ?? 0) - named.reduce((n, p) => n + p.value, 0);
  return [...named.filter((p) => p.value), ...(Math.abs(rest) > 1e-9 ? [{ label: "Other effects", value: rest }] : [])];
}

/**
 * What a formula can refer to: `@classes.<identifier>.level` (each class's level), `@level` (the
 * character's level), `@abilities.<ability>.mod` (from the scores before any effect), and on a
 * class feature's effect or note `@rank` (how many of its levels its class has reached).
 */
export function mechanicsContext(classes, level, modifiers) {
  const slugOf = (name) => name.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    classes: Object.fromEntries(classes.map((c) => [c.system.identifier || slugOf(c.name), { level: c.system.level ?? 0 }])),
    level,
    abilities: Object.fromEntries(Object.entries(modifiers).map(([a, mod]) => [a, { mod: mod ?? 0 }])),
  };
}
