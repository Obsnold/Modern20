/**
 * Treat Injury's uses (Modern/Skills/TreatInjury), each a check against its DC, with the kit it needs:
 *
 *   restore hit points   DC 15, medical kit: 1d4 hit points (once a day)
 *   surgery              DC 20, surgery kit, −4 without the Surgery feat: 1d6 hit points per character level of the
 *                        patient (once a day); fatigued for 24 hours less 2 for each point over the DC, at least 6
 *   revive               DC 15, first aid or medical kit: no longer dazed, stunned or unconscious (not one at −1 or
 *                        lower who is not yet stable)
 *   stabilize            DC 15, medical kit: a dying character stable
 *   long-term care       DC 15, medical kit: a day's bed rest heals 3 hit points per level and 3 ability points
 *   treat poison         DC 15, medical kit: the healer's ranks on the patient's save against its secondary effect
 *   treat disease        DC 15, medical kit: the same, against the disease
 *
 * Without the kit, −4. On oneself only restoring hit points and treating poison or disease, at −5.
 */

export const TASKS = {
  restore: { label: "Restore hit points", dc: 15, kit: "a medical kit", self: true },
  surgery: { label: "Surgery", dc: 20, kit: "a surgery kit", self: false },
  revive: { label: "Revive a dazed, stunned or unconscious character", dc: 15, kit: "a first aid kit or a medical kit", self: false },
  stabilize: { label: "Stabilize a dying character", dc: 15, kit: "a medical kit", self: false },
  longTermCare: { label: "Long-term care (a day of bed rest)", dc: 15, kit: "a medical kit", self: false },
  poison: { label: "Treat poison", dc: 15, kit: "a medical kit", self: true },
  disease: { label: "Treat disease", dc: 15, kit: "a medical kit", self: true },
};

/**
 * The terms a use adds to the healer's Treat Injury check: −4 without its kit, surgery's −4 without the Surgery feat,
 * −5 on oneself. Null when the use cannot be made on oneself.
 */
export function treatmentTerms(task, { kit = true, self = false, surgeryFeat = false } = {}) {
  const t = TASKS[task];
  if (!t || (self && !t.self)) return null;
  return [
    { label: `Without ${t.kit}`, value: kit ? 0 : -4 },
    { label: "Surgery (no Surgery feat)", value: task === "surgery" && !surgeryFeat ? -4 : 0 },
    { label: "On yourself", value: self ? -5 : 0 },
  ].filter((x) => x.value);
}

/** Surgery's healing: 1d6 for each character level of the patient. */
export const surgeryDice = (level) => `${Math.max(1, level ?? 1)}d6`;

/** The fatigue surgery leaves: 24 hours, 2 less for each point the check beat the DC by, never under 6. */
export const surgeryFatigue = (total, dc = TASKS.surgery.dc) => Math.max(6, 24 - 2 * Math.max(0, total - dc));

/** Whether a character can be revived: not one at −1 or lower who is still dying. */
export const revivable = (hp, stable) => hp >= 0 || !!stable;
