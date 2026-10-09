/**
 * Treat Injury from a healer's sheet (rules/treat.mjs): the use, the kit and the patient (the one token targeted, or
 * the healer), the check with what they take off, and on a success a card whose button does what the use does, for
 * whoever can change the patient: hit points restored, surgery's healing and fatigue, a character revived or
 * stabilized; or what long-term care and treating poison or disease give, said.
 */
import * as T from "./rules/treat.mjs";
import { rollCheck } from "./roll.mjs";
import { skillCheck, d20 } from "./rules/rolls.mjs";
import { applyToActor, stabiliseWithHelp } from "./damage.mjs";
import { identify } from "./rules/identify.mjs";
import { aboardTerms } from "./vehicles.mjs";
import { SYSTEM_ID } from "./config.mjs";
const escape = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** Ask which use, with which kit, on whom; then roll it. */
export async function treatInjury(actor, event) {
  const targets = [...(game.user.targets ?? [])];
  const patient = targets.length === 1 && targets[0].actor ? targets[0].actor : actor;
  const self = patient === actor || patient.uuid === actor.uuid;
  const uses = Object.entries(T.TASKS).filter(([, t]) => !self || t.self);
  const chosen = await foundry.applications.api.DialogV2.prompt({
    window: { title: `${actor.name}: Treat Injury` },
    content: `<p>On ${escape(patient.name)}${self ? " (yourself: −5; target a token to treat another)" : ""}.</p>
      <div class="form-group"><label>Use</label><select name="task">${uses.map(([k, t]) => `<option value="${k}">${escape(t.label)} (DC ${t.dc})</option>`).join("")}</select></div>
      <div class="form-group"><label>With the kit it needs (without: −4)</label><input type="checkbox" name="kit" checked></div>`,
    ok: { label: "Treat", callback: (ev, button) => ({ task: button.form.elements.task.value, kit: button.form.elements.kit.checked }) },
    rejectClose: false,
  });
  if (!chosen) return null;
  const task = T.TASKS[chosen.task];
  const d = actor.system.derived;
  const row = d.skills.find((r) => r.key === "treatInjury" && !r.specialty);
  const surgeryFeat = actor.items.some((i) => i.type === "feat" && identify(i) === "surgery");
  const extra = T.treatmentTerms(chosen.task, { kit: chosen.kit, self, surgeryFeat }) ?? [];
  const base = skillCheck(d, row);
  const spec = d20(`Treat Injury: ${task.label} (DC ${task.dc})`, [...base.terms, ...extra, ...aboardTerms(actor, "check")]);
  const judge = (roll) => ({
    treatment: { healer: actor.uuid, patient: patient.uuid, patientName: patient.name, task: chosen.task, total: roll.total, success: roll.total >= task.dc, ranks: Math.floor(row?.ranks ?? 0) },
  });
  return rollCheck(actor, spec, event, { judge });
}

/** A treatment's card: what the check did, and on a success the button that does it. */
export function bindTreatment(message, html, t) {
  const patient = fromUuidSync(t.patient);
  const task = T.TASKS[t.task];
  const box = document.createElement("div");
  box.className = "m20-card-buttons";
  const say = (text, good = t.success) => {
    const p = document.createElement("p");
    p.className = good ? "m20-crit" : "m20-hint";
    p.textContent = text;
    box.append(p);
  };
  const button = (label, handler) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", async () => { b.disabled = true; await handler(); });
    box.append(b);
  };
  if (!t.success) say(`Fails (DC ${task?.dc}).${t.task === "longTermCare" ? ` ${t.patientName} heals at the normal rate today.` : ""}`);
  else if (!patient) say(`${t.patientName} is no longer here.`, false);
  else {
    const can = patient.isOwner;
    const level = patient.system.derived?.level ?? 1;
    switch (t.task) {
      case "restore":
        say(`Succeeds: ${t.patientName} regains 1d4 hit points (once a day).`);
        if (can) button("Restore 1d4 hit points", () => heal(patient, "1d4", "Treat Injury"));
        break;
      case "surgery": {
        const hours = T.surgeryFatigue(t.total, task.dc);
        say(`Succeeds: ${t.patientName} regains ${T.surgeryDice(level)} hit points, and is fatigued for ${hours} hours.`);
        if (can) button(`Heal ${T.surgeryDice(level)} and fatigue`, async () => {
          await heal(patient, T.surgeryDice(level), "Surgery");
          if (!patient.statuses.has("fatigued")) await patient.toggleStatusEffect("fatigued", { active: true });
        });
        break;
      }
      case "revive": {
        const hp = patient.system.hp?.value ?? 0;
        if (!T.revivable(hp, patient.statuses.has("stable"))) { say(`${t.patientName} is dying: stabilize them first.`, false); break; }
        say(`Succeeds: ${t.patientName} is no longer dazed, stunned or unconscious.`);
        if (can) button("Revive", async () => { for (const id of ["dazed", "stunned", "unconscious"]) if (patient.statuses.has(id)) await patient.toggleStatusEffect(id, { active: false }); });
        break;
      }
      case "stabilize":
        say(`Succeeds: ${t.patientName} stops losing hit points.`);
        if (can && patient.statuses.has("dying")) button("Stabilize", () => stabiliseWithHelp(patient));
        break;
      case "longTermCare":
        say(`Succeeds: today's bed rest heals ${t.patientName} 3 hit points per level and 3 points of each ability's damage. Choose "Bed rest with long-term care" when resting.`);
        break;
      default:
        say(`Succeeds: +${t.ranks} on ${t.patientName}'s next saving throw against the ${t.task === "poison" ? "poison's secondary effect" : "disease"}.`);
    }
  }
  (html.querySelector(".message-content") ?? html).append(box);
}

/** Roll the healing and apply it, posting the roll. */
async function heal(actor, formula, title) {
  const Roll = foundry.dice?.Roll ?? globalThis.Roll;
  const roll = await new Roll(formula).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `<div class="m20-roll"><h3>${escape(title)}: ${escape(actor.name)} healed</h3></div>`, flags: { [SYSTEM_ID]: {} } });
  await applyToActor(actor, roll.total, { healing: true });
}
