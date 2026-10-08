/**
 * Vehicles in play (rules/vehicles.mjs): who is aboard which, the driver's Drive (or Pilot) checks for stunts and to keep
 * control, with what they do to its speed, and its mounted weapons fired by a gunner, the driver, or a GM's crew.
 */
import * as V from "./rules/vehicles.mjs";
import * as R from "./rules/rolls.mjs";
import { rollCheck, characterRolls, post } from "./roll.mjs";
const escape = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** Every vehicle in the world and on the scene: world actors, and unlinked tokens' own. */
function vehicles() {
  const world = game.actors?.filter((a) => a.type === "vehicle") ?? [];
  const tokens = (canvas?.scene?.tokens ?? []).filter((t) => !t.actorLink && t.actor?.type === "vehicle").map((t) => t.actor);
  return [...world, ...tokens];
}

/** The vehicle `actor` is aboard, with its role there and what that does to its rolls; null if none. */
export function aboardOf(actor) {
  if (!actor || actor.type === "vehicle") return null;
  for (const vehicle of vehicles()) {
    const o = vehicle.system.occupants.find((x) => x.uuid === actor.uuid);
    if (o) return { vehicle, role: o.role, ...V.aboard(vehicle.system, o.role) };
  }
  return null;
}

/** The terms aboard adds: its speed's on a skill check, and on an attack its speed's and how it is driven. */
export function aboardTerms(actor, kind = "check") {
  const a = aboardOf(actor);
  if (!a) return [];
  const value = kind === "attack" ? a.attack : a.check;
  return value ? [{ label: `Aboard ${a.vehicle.name} (${a.speedLabel.toLowerCase()}${kind === "attack" && a.vehicle.system.driving !== "normal" ? `, driving ${a.drivingLabel.toLowerCase()}` : ""})`, value }] : [];
}

/** Its driver, as an actor: the occupant whose role is driver. */
export const driverOf = (vehicle) => {
  const o = vehicle.system.occupants.find((x) => x.role === "driver");
  return o ? fromUuidSync(o.uuid) : null;
};

/** The feats an actor has, as the operation rules read them. */
const featsOf = (actor) => (actor?.items?.filter((i) => i.type === "feat") ?? []).map((i) => ({ name: i.name, choice: i.system.choice ?? "" }));

/**
 * The driver's check with the vehicle: their Drive (or Pilot) skill, or a creature's printed bonus, or (no one at the
 * wheel) the GM's crew; with the vehicle's maneuver, its speed's modifier, and −4 without the operation feat its class
 * needs. `dc` and `title` for the card.
 */
function operatorCheck(vehicle, title) {
  const s = vehicle.system;
  const driver = driverOf(vehicle);
  const skill = s.operation.skill === "pilot" ? "pilot" : "drive";
  const name = skill === "pilot" ? "Pilot" : "Drive";
  let terms;
  if (driver?.type === "character") {
    const row = driver.system.derived.skills.find((r) => r.key === skill && !r.specialty);
    terms = R.skillCheck(driver.system.derived, row).terms;
  } else if (driver) {
    const printed = (driver.system.skills ?? []).find((k) => k.name.toLowerCase() === skill);
    terms = [{ label: printed ? name : `${name} (untrained: none printed)`, value: printed?.bonus ?? 0 }];
  } else terms = [{ label: `Crew (${V.CREW[s.crewQuality]?.label.toLowerCase() ?? "normal"})`, value: V.CREW[s.crewQuality]?.check ?? 2 }];
  const speed = V.SPEEDS[s.speed] ?? V.SPEEDS.stationary;
  return {
    driver,
    spec: R.d20(`${vehicle.name}: ${title}`, [
      ...terms, { label: "Maneuver", value: s.maneuver ?? 0 }, { label: `Speed (${speed.label.toLowerCase()})`, value: speed.check },
      { label: `No ${s.operation.skill === "pilot" ? "Aircraft" : "Surface Vehicle"} Operation (${s.operation.class})`, value: driver ? V.operationPenalty(s.operation, featsOf(driver)) : 0 },
    ]),
  };
}

/** The stunts as one list for the window: each option of each, with its DC. */
function stuntChoices(speed) {
  return Object.entries(V.STUNTS).flatMap(([id, s]) => (s.options
    ? s.options.map(([label], i) => ({ value: `${id}|${i}`, label: `${s.label}: ${label} (DC ${V.stuntDC(id, { option: i, speed })})` }))
    : [{ value: `${id}|0`, label: `${s.label}${s.ask ? "" : ` (DC ${s.dc})`}` }]));
}

/** A Drive (or Pilot) check with the vehicle: a stunt chosen, or to keep control (`control`: its DC), and what follows. */
export async function driveCheck(vehicle, { control = null, event } = {}) {
  const s = vehicle.system;
  let stunt = "control", option = 0, dc = control, larger = 0, apart = 0;
  if (control === null) {
    const chosen = await foundry.applications.api.DialogV2.prompt({
      window: { title: `${vehicle.name}: a ${s.operation.skill === "pilot" ? "Pilot" : "Drive"} check` },
      content: `<div class="form-group"><label>Stunt</label><select name="stunt">${stuntChoices(s.speed).map((o) => `<option value="${o.value}">${escape(o.label)}</option>`).join("")}</select></div>
        <div class="form-group"><label>DC (a check, or to keep control)</label><input type="number" name="dc" value="15"></div>
        <div class="form-group"><label>Sideswipe: size categories the target is larger (smaller: negative)</label><input type="number" name="larger" value="0"></div>
        <div class="form-group"><label>Sideswipe: speed categories apart</label><input type="number" name="apart" value="0" min="0"></div>`,
      ok: { label: "Roll", callback: (ev, button) => ({ pick: button.form.elements.stunt.value, dc: button.form.elements.dc.valueAsNumber, larger: button.form.elements.larger.valueAsNumber || 0, apart: button.form.elements.apart.valueAsNumber || 0 }) },
      rejectClose: false,
    });
    if (!chosen) return null;
    [stunt, option] = chosen.pick.split("|");
    option = Number(option);
    ({ dc, larger, apart } = chosen);
  }
  const rules = V.STUNTS[stunt];
  dc = V.stuntDC(stunt, { option, dc, speed: s.speed, larger, speedsApart: apart });
  const label = rules.options ? `${rules.label} (${rules.options[option][0]})` : rules.label;
  const { driver, spec } = operatorCheck(vehicle, `${label} (DC ${dc})`);
  const judge = (roll) => {
    const success = roll.total >= dc;
    const lost = rules.control ? V.lostControl(roll.total, dc) : null;
    // A failure that calls for a check to keep control: its DC.
    const keep = !success && !rules.control ? (rules.keepAtDC ? dc : rules.keep ?? null) : null;
    const text = success ? "Succeeds." : rules.control ? `Loses control: the vehicle ${lost}${lost === "rolls" ? " (failed by 10 or more)" : ""}.` : `Fails. ${rules.fail}`.trim();
    return { verdict: { good: success, text }, vehicleCheck: { vehicle: vehicle.uuid, keep } };
  };
  const roll = await rollCheck(driver ?? vehicle, spec, event, { judge });
  if (!roll || roll.total < dc) return roll;
  // What a stunt that succeeds does to its speed: a dash one category faster, a hard brake two slower, a bootleg turn to a stop.
  const order = Object.keys(V.SPEEDS), at = order.indexOf(s.speed in V.SPEEDS ? s.speed : "stationary");
  const can = V.reachable(s.topSpeed.character);
  let next = s.speed;
  if (rules.faster) next = order[Math.min(at + rules.faster, order.length - 1)];
  if (rules.slower) next = order[Math.max(at - rules.slower, 0)];
  if (rules.stops) next = "stationary";
  if (next !== s.speed && can.includes(next)) await vehicle.update({ "system.speed": next });
  return roll;
}

/** A vehicle check's card: on a failure that calls for it, a button for the check to keep control. */
export function bindVehicleCheck(message, html, flags) {
  const vehicle = fromUuidSync(flags.vehicle);
  if (!vehicle || flags.keep === null || flags.keep === undefined) return;
  const driver = driverOf(vehicle);
  if (!(driver ?? vehicle).isOwner) return;
  const box = document.createElement("div");
  box.className = "m20-card-buttons";
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = `Keep control (DC ${flags.keep})`;
  b.addEventListener("click", async (event) => { b.disabled = true; await driveCheck(vehicle, { control: flags.keep, event }); });
  box.append(b);
  (html.querySelector(".message-content") ?? html).append(box);
}

/**
 * Fire a mounted weapon: by the gunner or driver chosen, with their own attack (and the vehicle's speed, how it is driven,
 * −4 without its operation feat, +2 for a driver with 5 ranks of Drive), or by the GM's crew at its quality's bonus.
 */
export async function fireWeapon(vehicle, weapon, event) {
  const s = vehicle.system;
  const crew = s.occupants.filter((o) => ["gunner", "driver"].includes(o.role)).map((o) => ({ ...o, actor: fromUuidSync(o.uuid) })).filter((o) => o.actor);
  let firer = crew[0]?.actor ?? null;
  if (crew.length > 1) {
    const pick = await foundry.applications.api.DialogV2.wait({
      window: { title: `${weapon.name}: who fires it?` },
      content: `<p>${escape(vehicle.name)}'s ${escape(weapon.name)}.</p>`,
      buttons: crew.map((o, i) => ({ action: String(i), label: `${o.actor.name} (${o.role})`, default: i === 0 })),
      rejectClose: false,
    });
    if (pick === null || pick === undefined) return null;
    firer = crew[Number(pick)].actor;
  }
  if (firer?.type === "character") {
    const role = s.occupants.find((o) => o.uuid === firer.uuid)?.role;
    if (role === "driver" && s.driving === "total") return ui.notifications.warn(`${firer.name} is driving on total defense: no attacks.`);
    const drive = firer.system.derived.skills.find((r) => r.key === "drive" && !r.specialty)?.ranks ?? 0;
    const extra = [
      { label: `No ${s.operation.skill === "pilot" ? "Aircraft" : "Surface Vehicle"} Operation (${s.operation.class})`, value: V.operationPenalty(s.operation, featsOf(firer)) },
      // "A driver with 5 or more ranks in the Drive skill gains a +2 synergy bonus when firing vehicle-mounted weapons while driving."
      { label: "Drive 5 ranks (firing while driving)", value: role === "driver" && drive >= 5 ? 2 : 0 },
    ];
    return characterRolls(firer).attack(weapon, event, { vehicle, extra });
  }
  // No one at it: the GM's crew, at its quality's attack bonus, the vehicle's speed and how it is driven.
  const a = V.aboard(s, "gunner");
  const q = V.CREW[s.crewQuality] ?? V.CREW.normal;
  const spec = R.d20(`${vehicle.name}: ${weapon.name} (crew)`, [{ label: `Crew (${q.label.toLowerCase()})`, value: q.attack }, { label: `Aboard (${a.speedLabel.toLowerCase()})`, value: a.attack }], { critical: R.critical(weapon.system.critical) });
  return rollCheck(vehicle, spec, event, { flags: { attack: { actor: vehicle.uuid, item: weapon.id, crew: true } } });
}

/** A crew's damage with a mounted weapon: its dice (a vehicle has no Strength), multiplied on a critical. */
export function crewDamage(vehicle, weapon, multiplier = 1) {
  const spec = R.damage({ modifiers: {}, damageBonus: {}, parts: {} }, weapon, {});
  if (!spec) return ui.notifications.info(`${weapon.name}: its damage is not a roll.`);
  const rolled = multiplier > 1 ? R.criticalDamage(spec, multiplier) : spec;
  return post(vehicle, rolled, { flags: { damage: { nonlethal: !!spec.nonlethal, type: spec.type ?? weapon.system.damageType ?? "", half: null } } });
}

