/**
 * Ammunition on a character: what a weapon has loaded and which of the character's
 * ammunition it draws on (`system.loaded`, `system.ammunition`), rounds spent as it
 * fires, and reloading from what is carried. The rules are rules/ammo.mjs.
 */
import * as A from "./rules/ammo.mjs";
import { identify } from "./rules/identify.mjs";
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
    ui.notifications.warn(`${weapon.name}: ${r.reason}.${A.magazineOf(weapon.system.magazine) ? ` Reload it on ${weapon.actor?.type === "vehicle" ? "the vehicle's sheet" : "the Gear tab"}.` : ""}`);
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
  // A vehicle carries no ammunition items: its mounted weapons refill (the tank's cannon, the Bradley's).
  if (!ammo && (weapon.system.noAmmunition || actor.type === "vehicle")) return refill(actor, weapon, mag);
  if (!ammo) return ui.notifications.warn(`${actor.name} has no ammunition for ${weapon.name}. Add some, and choose it on the weapon's row.`);
  // A different load (beanbag in place of buckshot): the rounds in it come out first, back to their box.
  const load = A.specialAmmo(identify(ammo)) ? identify(ammo) : "";
  let loaded = weapon.system.loaded ?? 0, swapped = "";
  if (loaded > 0 && load !== (weapon.system.loadedWith ?? "")) {
    const old = actor.items.get(weapon.system.loadedFrom || weapon.system.ammunition);
    if (old && old.id !== ammo.id && old.system.quantity !== null) await old.update({ "system.quantity": old.system.quantity + loaded });
    swapped = ` (${loaded} ${old?.name ?? "rounds"} taken out)`;
    loaded = 0;
  }
  // Ammunition with no count (a special round the book prices by the box without saying how many) fills the magazine.
  const supply = ammo.system.quantity ?? mag.capacity;
  const r = A.reload(weapon, loaded, supply);
  if (!r.added && !swapped) return ui.notifications.info(r.loaded >= mag.capacity ? `${weapon.name} is already full.` : `${actor.name} has no ${ammo.name} left.`);
  await weapon.update({ "system.loaded": r.loaded, "system.ammunition": ammo.id, "system.loadedWith": load, "system.loadedFrom": ammo.id });
  if (ammo.system.quantity !== null && r.added) await ammo.update({ "system.quantity": r.supply });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="m20-roll"><p>Reloads ${escape(weapon.name)} with ${r.added} ${escape(ammo.name)}${escape(swapped)} (${r.loaded}/${mag.capacity}): ${escape(r.action)}.</p></div>`,
  });
}

/** Refill a weapon the book sells no ammunition for: its magazine full, nothing drawn from what is carried. */
async function refill(actor, weapon, mag) {
  const loaded = weapon.system.loaded ?? 0;
  if (loaded >= mag.capacity) return ui.notifications.info(`${weapon.name} is already full.`);
  await weapon.update({ "system.loaded": mag.capacity, "system.loadedWith": "", "system.loadedFrom": "" });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="m20-roll"><p>Reloads ${escape(weapon.name)} (${mag.capacity}/${mag.capacity}): ${escape(A.reloadAction(mag.type))}.</p></div>`,
  });
}

/**
 * The special load a weapon fires (rules/ammo.mjs SPECIAL_AMMO), with its name, or null for ordinary
 * rounds: what its magazine was loaded with, or for a weapon with none (a bow, a belt-fed gun) the
 * ammunition it draws on.
 */
export function specialLoad(actor, weapon) {
  const mag = A.magazineOf(weapon.system.magazine);
  if (mag && mag.capacity !== Infinity) {
    const id = weapon.system.loadedWith;
    if (!id) return null;
    const item = actor.items.find((i) => i.type === "ammunition" && identify(i) === id);
    return withKey(A.specialAmmo(id, item?.name ?? id), id);
  }
  const ammo = ammoFor(actor, weapon);
  return ammo ? withKey(A.specialAmmo(identify(ammo), ammo.name), identify(ammo)) : null;
}

/** A special load with its identifier (`key`), which an attack's card keeps for its damage. */
const withKey = (load, key) => (load ? { ...load, key } : null);

/** The load an attack's card recorded (`{ key, name }`), as specialLoad gives it; null for ordinary rounds. */
export const recordedLoad = (load) => (load ? withKey(A.specialAmmo(load.key, load.name), load.key) : null);
