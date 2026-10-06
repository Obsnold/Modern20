/**
 * Ammunition on a character: what a weapon has loaded and which of the character's
 * ammunition it draws on (`system.loaded`, `system.ammunition`), rounds spent as it
 * fires, and reloading from what is carried. The rules are rules/ammo.mjs.
 */
import * as A from "./rules/ammo.mjs";
const escape = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** The ammunition item a weapon draws on: the one chosen for it, or else the first that fits. */
export function ammoFor(actor, weapon) {
  const chosen = actor.items.get(weapon.system.ammunition);
  if (chosen) return chosen;
  return actor.items.find((i) => i.type === "ammunition" && A.fits(weapon, i)) ?? null;
}

/** Spend the rounds a shot takes; false (with a warning) if the weapon cannot fire. */
export async function spendAmmo(actor, weapon, mode = "single") {
  const ammo = ammoFor(actor, weapon);
  const supply = ammo && ammo.system.quantity !== null ? ammo.system.quantity : null;
  const r = A.fire(weapon, mode, { loaded: weapon.system.loaded ?? 0, supply });
  if (!r.ok) {
    ui.notifications.warn(`${weapon.name}: ${r.reason}.${A.magazineOf(weapon.system.magazine) ? " Reload it on the Gear tab." : ""}`);
    return false;
  }
  if (r.loaded !== (weapon.system.loaded ?? 0)) await weapon.update({ "system.loaded": r.loaded });
  if (ammo && r.supply !== supply) await ammo.update({ "system.quantity": r.supply });
  return true;
}

/** Reload a weapon from its ammunition: as many rounds as fit and are carried. */
export async function reloadWeapon(actor, weapon) {
  const mag = A.magazineOf(weapon.system.magazine);
  if (!mag || mag.capacity === Infinity) return ui.notifications.info(`${weapon.name} is not reloaded by magazine${mag ? "; a belt feeds it" : ""}.`);
  const ammo = ammoFor(actor, weapon);
  if (!ammo && weapon.system.noAmmunition) return refill(actor, weapon, mag);
  if (!ammo) return ui.notifications.warn(`${actor.name} has no ammunition for ${weapon.name}. Add some, and choose it on the weapon's row.`);
  // Ammunition with no count (a special round the book prices by the box without saying how many) fills the magazine.
  const supply = ammo.system.quantity ?? mag.capacity;
  const r = A.reload(weapon, weapon.system.loaded ?? 0, supply);
  if (!r.added) return ui.notifications.info(r.loaded >= mag.capacity ? `${weapon.name} is already full.` : `${actor.name} has no ${ammo.name} left.`);
  await weapon.update({ "system.loaded": r.loaded, "system.ammunition": ammo.id });
  if (ammo.system.quantity !== null) await ammo.update({ "system.quantity": r.supply });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="m20-roll"><p>Reloads ${escape(weapon.name)} with ${r.added} ${escape(ammo.name)} (${r.loaded}/${mag.capacity}): ${escape(r.action)}.</p></div>`,
  });
}

/** Refill a weapon the book sells no ammunition for: its magazine full, nothing drawn from what is carried. */
async function refill(actor, weapon, mag) {
  const loaded = weapon.system.loaded ?? 0;
  if (loaded >= mag.capacity) return ui.notifications.info(`${weapon.name} is already full.`);
  await weapon.update({ "system.loaded": mag.capacity });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="m20-roll"><p>Reloads ${escape(weapon.name)} (${mag.capacity}/${mag.capacity}): ${escape(A.reloadAction(mag.type))}.</p></div>`,
  });
}
