/**
 * Active effects, as Foundry applies them to an actor's data: used where
 * Foundry is not (npm test), so the arithmetic is checked the same way it runs.
 *
 * Only the modes the system's effects use: Add and Override.
 */
export const MODES = { CUSTOM: 0, MULTIPLY: 1, ADD: 2, DOWNGRADE: 3, UPGRADE: 4, OVERRIDE: 5 };

/** Apply `effects` (each `{ disabled, changes: [{ key, mode, value }] }`) to a copy of an actor's `{ system }`. */
export function applyEffects(actor, effects) {
  const out = structuredClone(actor);
  for (const e of effects) {
    if (e.disabled) continue;
    for (const c of e.changes ?? []) {
      const path = c.key.split(".");
      const last = path.pop();
      const target = path.reduce((o, k) => (o[k] ??= {}), out);
      const value = Number(c.value);
      if (c.mode === MODES.ADD) target[last] = (target[last] ?? 0) + value;
      else if (c.mode === MODES.OVERRIDE) target[last] = value;
    }
  }
  return out;
}
