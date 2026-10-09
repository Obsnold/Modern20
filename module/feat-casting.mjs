/**
 * Wild Talent's power and Magical Heritage's cantrips on a character (rules/feat-casting.mjs): chosen when the
 * feat comes (in the level window, or asked when it is dropped on), added as items marked with the feat
 * (`flags.modern20.fromFeat`), cast so many times a day each (`flags.modern20.featUses`, the times used), and
 * gone with the feat.
 */
import * as FC from "./rules/feat-casting.mjs";
import { identify } from "./rules/identify.mjs";
import { SYSTEM_ID } from "./config.mjs";
const escape = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** The feat's rule for a feat item, or null if it gives nothing to cast. */
export const featRule = (feat) => (feat?.type === "feat" ? FC.featCasting(feat, identify(feat)) : null);

/** The spells or powers the feat gave, on its character. */
export const fromFeat = (actor, feat) => actor.items.filter((i) => i.flags?.[SYSTEM_ID]?.fromFeat === feat.id);

/** What may be chosen for a feat's rule, from its compendium: `[{ name, uuid }]`, sorted, but `except` (uuids or names). */
export async function eligibleFor(rule, except = []) {
  const pack = game.packs.get(`${SYSTEM_ID}.${rule.type === "power" ? "powers" : "spells"}`);
  const index = (await pack?.getIndex({ fields: ["system.levels"] })) ?? [];
  return index.filter((e) => FC.eligible(rule, e) && !except.includes(e.uuid) && !except.includes(e.name)).map((e) => ({ name: e.name, uuid: e.uuid })).sort((a, b) => a.name.localeCompare(b.name));
}

/** The feat as a caster of the spell or power it gave, with its level: `{ caster, level }`, or null for any other item. */
export function featCasterFor(actor, item) {
  const id = item.flags?.[SYSTEM_ID]?.fromFeat;
  const feat = id ? actor.items.get(id) : null;
  const rule = featRule(feat);
  return rule ? { caster: FC.featCaster(rule, feat.name, actor.system.derived?.casters ?? []), level: rule.level } : null;
}

/** Add the chosen spells or powers (uuids) for the feat. */
async function addFor(actor, feat, uuids) {
  const data = [];
  for (const uuid of uuids) {
    const doc = await fromUuid(uuid);
    if (!doc) continue;
    const o = doc.toObject();
    delete o._id;
    foundry.utils.mergeObject(o, { flags: { [SYSTEM_ID]: { fromFeat: feat.id, featUses: 0 } }, _stats: { compendiumSource: doc.uuid } });
    data.push(o);
  }
  if (data.length) await actor.createEmbeddedDocuments("Item", data);
}

/** Ask for what the feat still lacks (its power, or its three cantrips), and add them. */
export async function chooseFor(actor, feat) {
  const rule = featRule(feat);
  if (!rule) return;
  const have = fromFeat(actor, feat);
  const missing = rule.count - have.length;
  if (missing <= 0) return ui.notifications.info(`${feat.name} has all its ${rule.type}s.`);
  const options = await eligibleFor(rule, have.map((i) => i.name));
  const what = rule.type === "power" ? "0-level psionic power" : "0-level arcane spell";
  const select = (n) => `<div class="form-group"><label>${missing > 1 ? `${n + 1}.` : "Choose"}</label><select name="pick${n}"><option value="">—</option>${options.map((o) => `<option value="${o.uuid}">${escape(o.name)}</option>`).join("")}</select></div>`;
  const picks = await foundry.applications.api.DialogV2.prompt({
    window: { title: `${actor.name}: ${feat.name}` },
    content: `<p>${missing === 1 ? `A ${what}` : `${missing} ${what}s`} for ${escape(feat.name)}${rule.only ? ` (one of ${rule.only.length})` : ""}.</p>${Array.from({ length: missing }, (_, n) => select(n)).join("")}`,
    ok: { label: "Add", callback: (ev, button) => Array.from({ length: missing }, (_, n) => button.form.elements[`pick${n}`].value) },
    rejectClose: false,
  });
  const chosen = [...new Set((picks ?? []).filter(Boolean))];
  await addFor(actor, feat, chosen);
}

/** Cast or manifest one the feat gave: one of its uses today. */
export async function useFromFeat(actor, item, found, card) {
  const used = item.flags?.[SYSTEM_ID]?.featUses ?? 0;
  const uses = found.caster.uses;
  if (used >= uses) return ui.notifications.warn(`${item.name}: ${found.caster.name}'s ${uses} a day are used. A new day brings them back.`);
  await item.setFlag(SYSTEM_ID, "featUses", used + 1);
  return card(actor, item, found, `${found.caster.name}: ${uses - used - 1} of ${uses} left today${item.type === "power" ? ", no power points" : ""}`);
}

/** Register the hooks; called once, at init. */
export function registerFeatCastingHooks() {
  // The feat added with its spells or powers chosen (the level window's, in `featPicks`): those added. One
  // dropped on the sheet is asked for there; any other way, the Magic tab offers the choice.
  Hooks.on("createItem", (item, options, userId) => {
    const actor = item.parent;
    if (userId !== game.user.id || actor?.type !== "character" || !featRule(item)) return;
    const picks = item.flags?.[SYSTEM_ID]?.featPicks;
    if (picks?.length) addFor(actor, item, picks);
  });
  // The feat gone: what it gave too.
  Hooks.on("deleteItem", (item, options, userId) => {
    const actor = item.parent;
    if (userId !== game.user.id || actor?.documentName !== "Actor" || item.type !== "feat") return;
    const ids = fromFeat(actor, item).map((i) => i.id).filter((id) => actor.items.has(id));
    if (ids.length) actor.deleteEmbeddedDocuments("Item", ids);
  });
}
