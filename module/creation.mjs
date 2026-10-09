/**
 * Potions, scrolls and wands of a spell from a character's Magic tab (rules/creation.mjs): added as bought or found,
 * at its purchase DC; or made by a feature that makes them (Brew Potion, Scribe Scroll, the Artificer's Craft
 * Artifice): the raw materials' Wealth check, the Craft check, and on a success the item, with the XP it costs said
 * (the system keeps no XP). And the Artificer's magic mastercraft on a weapon or armor, from the Gear tab.
 */
import * as C from "./rules/creation.mjs";
import { buy } from "./wealth.mjs";
import { rollCheck } from "./roll.mjs";
import { skillCheck, d20 } from "./rules/rolls.mjs";
import { identify } from "./rules/identify.mjs";
import { aboardTerms } from "./vehicles.mjs";
const escape = (s) => foundry.utils.escapeHTML(String(s ?? ""));

const ICONS = {
  potion: "systems/modern20/assets/icons/delapouite/magic-potion.svg",
  scroll: "systems/modern20/assets/icons/lorc/scroll-unfurled.svg",
  wand: "systems/modern20/assets/icons/lorc/crystal-wand.svg",
  tattoo: "systems/modern20/assets/icons/lorc/pierced-body.svg",
};

/** The features the character has that make each kind, by identifier. */
const featuresOf = (actor) => new Set(actor.items.filter((i) => i.type === "feature").map((i) => identify(i)));

/**
 * The highest caster level a maker can give what it makes: "no higher than the Mage's class level" (the Mystic's, for
 * hers); the Artificer's "total class levels in all arcane spellcasting classes (Artificer, Mage, Techno Mage)".
 */
function makerLevel(actor, maker) {
  const levels = (names) => actor.items.filter((i) => i.type === "class" && names.includes(i.name.toLowerCase())).reduce((n, c) => n + c.system.level, 0);
  if (maker.feature === "craft-artifice") return levels(["artificer", "mage", "techno mage"]);
  // The class whose feature it is (Brew Potion is the Mage's and the Mystic's: the one the character has it from).
  const feature = actor.items.find((i) => i.type === "feature" && identify(i) === maker.feature);
  return levels([(feature?.system.className ?? "").toLowerCase()]);
}

/** A Craft check in one of its specialties: the row's, or (none bought) its Intelligence alone. */
async function craftCheck(actor, specialty, dc, title) {
  const d = actor.system.derived;
  const row = d.skills.find((r) => r.key === "craft" && r.specialty.toLowerCase() === specialty);
  const base = row ? skillCheck(d, row) : d20(`Craft (${specialty}) check`, [{ label: "Intelligence", value: d.modifiers.int ?? 0 }]);
  const spec = d20(`${title}: Craft (${specialty}) (DC ${dc})`, [...base.terms, ...aboardTerms(actor, "check")]);
  const roll = await rollCheck(actor, spec, undefined, { judge: (r) => ({ verdict: r.total >= dc ? { good: true, text: "Succeeds." } : { good: false, text: "Fails: the materials are used up." } }) });
  return roll ? roll.total >= dc : null;
}

const say = (actor, html) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="m20-roll">${html}</div>` });

/** A potion, scroll or wand of `spell` (one of the character's spells): asked how, then added or made. */
export async function fxItemFromSpell(actor, spell) {
  const level = C.spellLevel(spell.system.levels);
  const kinds = Object.keys(C.KINDS).filter((k) => C.canHold(k, level).ok);
  if (!kinds.length) return ui.notifications.warn(`${spell.name}: ${C.canHold("scroll", level).reason}.`);
  const have = featuresOf(actor);
  const min = C.minCasterLevel(level);
  // The caster's own level, where one of its classes casts the spell: the most it can make one at.
  const own = Math.max(min, ...(actor.system.derived?.casters ?? []).map((c) => c.casterLevel ?? 0));
  const makers = Object.fromEntries(kinds.map((k) => [k, C.MAKERS[k].filter((m) => have.has(m.feature))]));
  const options = kinds.map((k) => `<option value="${k}">${C.KINDS[k].label} (${k === "wand" ? "50 charges" : "one use"}${["potion", "tattoo"].includes(k) ? ": a spell that affects only its user" : ""})</option>`).join("");
  const ways = [...new Set(Object.values(makers).flat().map((m) => m.label))];
  const chosen = await foundry.applications.api.DialogV2.prompt({
    window: { title: `${spell.name}: a potion, scroll, wand or tattoo` },
    content: `<div class="form-group"><label>Make it a</label><select name="kind">${options}</select></div>
      <div class="form-group"><label>Caster level (at least ${min})</label><input type="number" name="cl" min="${min}" value="${own}"></div>
      <div class="form-group"><label>How</label><select name="how"><option value="add">Bought or found: added to the Gear tab</option>${ways.map((w) => `<option value="${escape(w)}">Made with ${escape(w)}</option>`).join("")}</select></div>
      <p class="m20-hint">Made, it takes the raw materials' Wealth check, then a Craft check; the XP it costs is said, for you to take off.</p>`,
    ok: { label: "Go", callback: (ev, button) => ({ kind: button.form.elements.kind.value, cl: Math.max(min, Math.round(button.form.elements.cl.valueAsNumber || min)), how: button.form.elements.how.value }) },
    rejectClose: false,
  });
  if (!chosen) return null;
  const data = C.itemOf(chosen.kind, spell, chosen.cl, { img: ICONS[chosen.kind] });
  data.system.spells[0].uuid = spell._stats?.compendiumSource || spell.uuid;
  if (chosen.how === "add") {
    const [item] = await actor.createEmbeddedDocuments("Item", [data]);
    await say(actor, `<p>${escape(actor.name)} gets a ${escape(item.name)} (caster level ${chosen.cl}, purchase DC ${data.system.purchaseDC.dc}).</p>`);
    return item;
  }
  const maker = (makers[chosen.kind] ?? []).find((m) => m.label === chosen.how);
  if (!maker) return ui.notifications.warn(`${chosen.how} does not make a ${chosen.kind}.`);
  const most = makerLevel(actor, maker);
  if (chosen.cl > most) return ui.notifications.warn(`${maker.label}: a caster level no higher than your ${maker.feature === "craft-artifice" ? "arcane spellcasting class levels" : "class level"} (${most}).`);
  const m = C.making(chosen.kind, maker, level, chosen.cl);
  // The raw materials first: a Wealth check, or bought within means.
  if (!(await buy(actor, m.materials, `raw materials for a ${data.name}`))) return null;
  const made = await craftCheck(actor, m.craft, m.craftDC, `Making a ${data.name}`);
  if (made === null) ui.notifications.info(`The Craft check for the ${data.name} was not made: the materials are bought, for when it is.`);
  if (!made) return null;
  const [item] = await actor.createEmbeddedDocuments("Item", [data]);
  await say(actor, `<h3>${escape(actor.name)} makes a ${escape(item.name)}</h3><p>Caster level ${chosen.cl}. It costs ${m.xp} XP (spell level ${level} × caster level ${chosen.cl} × materials DC ${m.materials}): take them off.</p>`);
  return item;
}

/** The Artificer's magic mastercraft: a +1 to +3 enhancement bonus put on a weapon or armor (rules/creation.mjs). */
export async function magicMastercraft(actor, item) {
  const artificer = actor.items.filter((i) => i.type === "class" && /^artificer$/i.test(i.name)).reduce((n, c) => n + c.system.level, 0);
  const chosen = await foundry.applications.api.DialogV2.prompt({
    window: { title: `${item.name}: magic mastercraft` },
    content: `<div class="form-group"><label>Enhancement bonus</label><select name="bonus"><option value="1">+1</option><option value="2">+2</option><option value="3">+3</option></select></div>
      <div class="form-group"><label>The components' purchase DC (the Craft skill's for building it)</label><input type="number" name="components" min="0" value="${item.system.purchaseDC?.dc ?? 10}"></div>`,
    ok: { label: "Make it", callback: (ev, button) => ({ bonus: Number(button.form.elements.bonus.value), components: Math.max(0, button.form.elements.components.valueAsNumber || 0) }) },
    rejectClose: false,
  });
  if (!chosen) return null;
  const m = C.magicMastercraft(item.type, chosen.components, chosen.bonus, artificer);
  if (!(await buy(actor, m.materials, `magic mastercraft +${chosen.bonus} for ${item.name}`))) return null;
  if (!(await craftCheck(actor, "mechanical", m.mechanicalDC, `Magic mastercraft on ${item.name}`))) return null;
  if (!(await craftCheck(actor, "chemical", m.chemicalDC, `Magic mastercraft on ${item.name}`))) return null;
  await item.update({ "system.enhancement": Math.max(chosen.bonus, item.system.enhancement ?? 0) });
  await say(actor, `<h3>${escape(item.name)} is +${chosen.bonus}</h3><p>It costs ${m.xp} XP (+${chosen.bonus} × 10 × components DC ${chosen.components}): take them off.</p>`);
  return item;
}
