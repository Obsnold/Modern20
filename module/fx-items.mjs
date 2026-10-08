/**
 * Using a potion, scroll, wand, staff or tattoo from a character's sheet (rules/fx-items.mjs): the use chosen (a staff's
 * spells, each with the charges it takes), its charges spent or the item used up, what it gives its user for as long
 * as it lasts (a tattoo's effect), and a card with the spell's
 * saving throw DC, range and duration, and a caster level check (against spell resistance) at the item's level.
 */
import * as F from "./rules/fx-items.mjs";
import { SYSTEM_ID } from "./config.mjs";
const escape = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** A spell, power or incantation by its name, as typed ("Web", "fireball"): from the compendiums, a split duplicate's bare name too. */
async function byName(name) {
  const want = String(name).trim().toLowerCase();
  for (const pack of ["spells", "powers", "incantations"]) {
    const p = game.packs.get(`${SYSTEM_ID}.${pack}`);
    const entry = (await p?.getIndex())?.find((e) => e.name.toLowerCase() === want || e.name.replace(/ \((Modern|Arcana|Future|Menaces)\)$/, "").toLowerCase() === want);
    if (entry) return fromUuid(entry.uuid);
  }
  return null;
}

/** Choose which of a staff's uses: null if cancelled. */
async function chooseUse(item) {
  const uses = item.system.spells;
  if (uses.length <= 1) return 0;
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: `${item.name}: which use?` },
    content: `<p>${escape(item.system.charges.value)} charges left.</p>`,
    buttons: uses.map((u, i) => ({ action: String(i), label: `${u.name} (${u.charges ? `${u.charges} charge${u.charges === 1 ? "" : "s"}` : "no charge"})`, default: i === 0 })),
    rejectClose: false,
  });
  return choice === null || choice === undefined ? null : Number(choice);
}

/** Use a charged item: its charges spent (or it is used up), and its card posted. */
export async function useItem(actor, item) {
  const s = item.system;
  // A seventh tattoo does not work (rules/fx-items.mjs WORN): only so many of a kind at once.
  const over = F.wornOverLimit(actor.items.contents).find((w) => w.over.includes(item.id));
  if (over) return ui.notifications.warn(`${item.name} does not work: only ${over.limit} ${over.label} can at once.`);
  const index = await chooseUse(item);
  if (index === null) return;
  const r = F.useCharges(s, index);
  if (!r.ok) return ui.notifications.warn(`${item.name}: ${r.reason}.`);
  const use = s.spells[index] ?? null;
  // Its spell: by its link, or (one named by hand in the edit view) by its name in the compendiums.
  const spell = use?.uuid ? await fromUuid(use.uuid) : use?.name ? await byName(use.name) : null;
  const cl = s.fx?.casterLevel?.level ?? null;
  // Its save: the DC the book gives with the use, or 10 + 1.5 × the spell's level as the item casts it.
  const level = spell?.system.levels?.length ? F.spellLevelFor(spell.system.levels, s.fx?.casterLevel?.value) : null;
  const saves = !!spell?.system.savingThrow && !/^none/i.test(spell.system.savingThrow);
  const dc = F.printedDC(use?.note) ?? (saves && level !== null ? F.itemSaveDC(level) : null);
  // What it gives its user while it lasts (a Tattoo of Natural Armor's +4 for 7 minutes): its effect, theirs now.
  const given = item.effects.filter((e) => e.getFlag(SYSTEM_ID, "mechanics") && e.disabled).map((e) => {
    const data = e.toObject();
    delete data._id;
    return { ...data, disabled: false, transfer: false, origin: item.uuid, flags: {}, ...(s.lasts?.value ? { duration: { value: s.lasts.value, units: s.lasts.units } } : {}) };
  });
  if (given.length) await actor.createEmbeddedDocuments("ActiveEffect", given);
  if (r.consumed) await item.delete();
  else await item.update({ "system.charges.value": r.charges });

  const rows = [
    spell && [spell.type === "power" ? "Power" : spell.type === "incantation" ? "Incantation" : "Spell", `${spell.name}${level !== null ? ` (level ${level})` : ""}`],
    use?.note && ["As the item gives it", use.note],
    dc !== null && ["Saving throw", `${saves ? `${spell.system.savingThrow}, ` : ""}DC ${dc}`],
    spell?.system.range && ["Range", spell.system.range],
    spell?.system.target?.value && [spell.system.target.label || "Target", spell.system.target.value],
    spell?.system.duration && ["Duration", spell.system.duration],
    [s.fx?.casterLevel?.label || "Caster level", cl ?? "—"],
    !r.consumed && s.charges.max > 1 && ["Charges", `${r.charges} of ${s.charges.max} left${r.used ? ` (used ${r.used})` : ""}`],
  ].filter(Boolean);
  const how = { potion: "Drinks", scroll: "Reads", wand: "Uses", staff: "Uses", tattoo: "Touches and activates" }[s.kind] ?? "Uses";
  if (given.length) rows.push(["Gives", `${given.map((e) => e.name).join(", ")}${s.lasts?.value ? `, for ${s.lasts.value} ${s.lasts.value === 1 ? s.lasts.units.replace(/s$/, "") : s.lasts.units}` : ""} (on the Effects tab)`]);
  const hint = s.kind === "scroll" ? `<p class="m20-hint">Reading it takes a Spellcraft check (DC ${15 + (level ?? 0)}) or read magic; one who cannot yet cast the spell makes a caster level check (DC ${(cl ?? 0) + 1}) or the scroll is wasted.</p>` : "";
  const text = await foundry.applications.ux.TextEditor.implementation.enrichHTML(spell?.system.description ?? s.description, { relativeTo: spell ?? item });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="m20-roll m20-cast"><h3>${escape(item.name)}</h3><p class="m20-hint">${escape(how)} ${escape(item.name)}${r.consumed ? ", used up" : ""}.</p>
      <dl>${rows.map(([k, v]) => `<dt>${escape(k)}</dt><dd>${escape(v)}</dd>`).join("")}</dl>${hint}
      <details><summary>Description</summary>${text}</details></div>`,
    flags: cl ? { [SYSTEM_ID]: { levelCheck: { actor: actor.uuid, bonus: cl, label: s.fx?.casterLevel?.label === "Manifester Level" ? "Manifester level check" : "Caster level check" } } } : {},
  });
}
