/**
 * Active effects, applied to an actor's data.
 *
 * Two kinds of change:
 *
 *   Add, Override   ordinary effects (a condition's penalties, an effect made on the sheet).
 *                   Foundry applies these itself; `applyEffects` does the same where Foundry
 *                   is not (npm test).
 *   Custom          the system's own: the mechanics the build puts on feats, talents and
 *                   species (tools/build/mechanics.mjs). Foundry leaves these alone; the
 *                   character's numbers apply them (rules/character.mjs), and their value may
 *                   be a formula: `@classes.tough-hero.level`, `@level`, `@abilities.con.mod`.
 */
export const MODES = { CUSTOM: 0, MULTIPLY: 1, ADD: 2, DOWNGRADE: 3, UPGRADE: 4, OVERRIDE: 5 };

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
    for (const c of e.changes ?? []) {
      if (c.mode === MODES.ADD) addAt(out, c.key, Number(c.value));
      else if (c.mode === MODES.OVERRIDE) addAt(out, c.key, Number(c.value), true);
      else if (c.mode === MODES.CUSTOM && custom) addAt(out, c.key, resolveValue(c.value, context));
    }
  }
  return out;
}

/**
 * The system's own (Custom) changes of `effects` added to a copy of `bonuses` (a character's
 * `system.bonuses`): only changes under `system.bonuses.` apply, formulas worked out against
 * `context`.
 */
export function withSystemBonuses(bonuses, effects, context = {}) {
  const out = structuredClone(bonuses ?? {});
  for (const e of effects) {
    if (e.disabled) continue;
    for (const c of e.changes ?? []) {
      if (c.mode !== MODES.CUSTOM || !c.key.startsWith("system.bonuses.")) continue;
      addAt(out, c.key.slice("system.bonuses.".length), resolveValue(c.value, context));
    }
  }
  return out;
}

/**
 * What a formula can refer to: `@classes.<identifier>.level` (each class's level), `@level` (the
 * character's level), and `@abilities.<ability>.mod` (from the scores before any effect).
 */
export function mechanicsContext(classes, level, modifiers) {
  const slugOf = (name) => name.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    classes: Object.fromEntries(classes.map((c) => [c.system.identifier || slugOf(c.name), { level: c.system.level ?? 0 }])),
    level,
    abilities: Object.fromEntries(Object.entries(modifiers).map(([a, mod]) => [a, { mod: mod ?? 0 }])),
  };
}
