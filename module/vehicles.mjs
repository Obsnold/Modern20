/**
 * Vehicles in play (rules/vehicles.mjs): who is aboard which, the driver's Drive (or Pilot) checks for stunts and to keep
 * control, with what they do to its speed, and its mounted weapons fired by a gunner, the driver, or a GM's crew.
 */
import * as V from "./rules/vehicles.mjs";
import * as R from "./rules/rolls.mjs";
import { rollCheck, characterRolls, post } from "./roll.mjs";
import { SYSTEM_ID } from "./config.mjs";
import { spendAmmo } from "./ammo.mjs";
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

/**
 * The terms aboard adds: its speed's on a skill check, and on an attack its speed's and how it is driven, and a monstrous
 * Dashboard Figurine's +1; on a save, a humorous one's +1 for its driver.
 */
export function aboardTerms(actor, kind = "check") {
  const a = aboardOf(actor);
  if (!a) return [];
  const fx = a.vehicle.system.derived?.fx ?? {};
  if (kind === "save") return a.role === "driver" && fx.driverSaves ? [{ label: fx.names.driverSaves, value: fx.driverSaves }] : [];
  const value = kind === "attack" ? a.attack : a.check;
  return [
    ...(value ? [{ label: `Aboard ${a.vehicle.name} (${a.speedLabel.toLowerCase()}${kind === "attack" && a.vehicle.system.driving !== "normal" ? `, driving ${a.drivingLabel.toLowerCase()}` : ""})`, value }] : []),
    ...(kind === "attack" && fx.attack ? [{ label: fx.names.attack, value: fx.attack }] : []),
  ];
}

/**
 * What an occupant has from its vehicle against attacks: the vehicle's speed bonus to Defense and its cover's (Seats of
 * Safety: three-quarters at least), `{ defense, reflex, full }`; `full` when its cover is total, and it cannot be attacked.
 */
export function occupantCover(actor) {
  const a = aboardOf(actor);
  if (!a) return null;
  const s = a.vehicle.system;
  const seats = s.derived?.fx?.seatsOfSafety;
  const cover = V.COVER[seats && ["none", "one-quarter", "one-half"].includes(s.cover) ? "three-quarters" : s.cover] ?? V.COVER.none;
  return { vehicle: a.vehicle, full: cover.defense === null, defense: (V.SPEEDS[s.speed]?.defense ?? 0) + (cover.defense ?? 0), reflex: Math.max(cover.reflex ?? 0, s.derived?.fx?.reflex ?? 0), label: cover.label.toLowerCase() };
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
  if (!weapon.system.melee && !(await spendAmmo(vehicle, weapon))) return null;
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


/** A damage card, as post() makes one: `formula` of fire or another type, for the Apply, Half and Heal buttons. */
const damageCard = (actor, title, formula, type, hints = []) => post(actor, { title, terms: [{ label: "Damage", value: formula }], formula, hints }, { flags: { damage: { nonlethal: false, type, half: null } } });

/** A vehicle about to explode: a button to explode it, 10d6 fire inside and half that within 30 feet, each as a damage card. */
export function bindExplosion(message, html, { vehicle: uuid }) {
  const vehicle = fromUuidSync(uuid);
  if (!vehicle?.isOwner) return;
  const box = document.createElement("div");
  box.className = "m20-card-buttons";
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = "Explode";
  b.addEventListener("click", async () => {
    b.disabled = true;
    const inside = await damageCard(vehicle, `${vehicle.name} explodes: everyone inside`, "10d6", "fire", ["Reflex DC 20 for half: target those inside, then Apply or Half."]);
    const half = Math.floor((inside?.total ?? 0) / 2);
    await damageCard(vehicle, `${vehicle.name} explodes: everyone within 30 feet`, String(half), "fire", ["Reflex DC 15 for half: target those within 30 feet, then Apply or Half."]);
    if (!vehicle.statuses.has("destroyed")) await vehicle.toggleStatusEffect("destroyed", { active: true, overlay: true });
  });
  box.append(b);
  (html.querySelector(".message-content") ?? html).append(box);
}

/** The size of what a vehicle hits: another vehicle's or a creature's own, or an object's as chosen. */
const sizeOf = (actor) => (actor?.type === "character" ? actor.system.derived?.size : actor?.system?.size) || "medium";

/**
 * A collision (Modern/VehicleCombat/CollisionsAndRamming): what it hit (another vehicle, a creature targeted, or an object),
 * how it struck, and its damage to both, each a damage card (a moving vehicle or creature struck may save, Reflex DC 15,
 * for half); those aboard each a share by their cover; both vehicles two speed categories slower; and the drivers' checks
 * to keep control (DC 15). A Bumper of the Ram makes it one speed and size worse for what it strikes, one better for itself;
 * Bumpers of Blasting add 5d6 fire to what it strikes at street speed or faster.
 */
export async function collide(vehicle) {
  const s = vehicle.system;
  const targets = [...(game.user.targets ?? [])].map((t) => t.actor).filter((a) => a && a.uuid !== vehicle.uuid);
  const others = [...new Map([...targets, ...vehicles()].filter((a) => a.uuid !== vehicle.uuid).map((a) => [a.uuid, a])).values()];
  const items = vehicle.items.filter((i) => i.system?.fx?.power === "vehicular");
  const over = new Set(V.vehicleOverLimit(items));
  const has = (name) => items.some((i) => i.name === name && !over.has(i.id));
  const sizes = ["tiny", "small", "medium", "large", "huge", "gargantuan", "colossal"];
  const chosen = await foundry.applications.api.DialogV2.prompt({
    window: { title: `${vehicle.name}: a collision` },
    content: `<div class="form-group"><label>What it hit</label><select name="other"><option value="">An object (its size below)</option>${others.map((a) => `<option value="${a.uuid}" ${targets.includes(a) ? "selected" : ""}>${escape(a.name)}${a.type === "vehicle" ? ` (${escape(V.SPEEDS[a.system.speed]?.label.toLowerCase() ?? "")})` : ""}</option>`).join("")}</select></div>
      <div class="form-group"><label>An object's size</label><select name="size">${sizes.map((z) => `<option value="${z}" ${z === "large" ? "selected" : ""}>${z[0].toUpperCase()}${z.slice(1)}</option>`).join("")}</select></div>
      <div class="form-group"><label>How it struck</label><select name="strike">${Object.entries(V.STRIKES).map(([k, x]) => `<option value="${k}">${escape(x.label)} (×${x.multiplier})</option>`).join("")}</select></div>
      ${has("Bumper of the Ram") ? '<div class="form-group"><label>It rammed, with its Bumper of the Ram</label><input type="checkbox" name="ram" checked></div>' : ""}
      ${has("Bumpers of Blasting") && V.SPEEDS[s.speed]?.check <= -1 ? '<div class="form-group"><label>The Bumpers of Blasting blast (+5d6 fire)</label><input type="checkbox" name="blast"></div>' : ""}`,
    ok: { label: "Collide", callback: (ev, button) => ({ other: button.form.elements.other.value, size: button.form.elements.size.value, strike: button.form.elements.strike.value, ram: !!button.form.elements.ram?.checked, blast: !!button.form.elements.blast?.checked }) },
    rejectClose: false,
  });
  if (!chosen) return null;
  const other = chosen.other ? fromUuidSync(chosen.other) : null;
  const speeds = [s.speed, other?.type === "vehicle" ? other.system.speed : "stationary"];
  const sizesHit = [s.size, other ? sizeOf(other) : chosen.size];
  const ram = chosen.ram && chosen.strike !== "sideswipe";
  const roll = async (steps) => {
    const c = V.collisionDamage({ speeds, sizes: sizesHit, strike: chosen.strike, steps });
    const Roll = foundry.dice?.Roll ?? globalThis.Roll;
    const r = await new Roll(c.formula).evaluate();
    return { ...c, total: Math.floor(r.total * c.multiplier), rolled: r.total };
  };
  const own = await roll(ram ? -1 : 0);
  const theirs = ram ? await roll(1) : own;
  const name = other?.name ?? `a ${chosen.size} object`;
  const moving = other?.type === "vehicle" ? other.system.speed !== "stationary" : !!other;
  const how = (c) => `${c.formula}${c.multiplier !== 1 ? ` × ${c.multiplier}` : ""} (${c.speed === "allOut" ? "all-out" : `${c.speed} speed`}, ${c.size}): rolled ${c.rolled}`;
  await damageCard(vehicle, `Collision: ${vehicle.name}`, String(own.total), "", [how(own)]);
  if (other) {
    await damageCard(vehicle, `Collision: ${name}`, String(theirs.total), "", [how(theirs), ...(moving ? ["A moving vehicle or creature struck: Reflex DC 15 for half (Half)."] : [])]);
    if (chosen.blast) await damageCard(vehicle, `Bumpers of Blasting: ${name}`, "5d6", "fire", ["The blast's fire, to what it struck: the vehicle takes none of it."]);
  }
  // Those aboard each vehicle: their share by its cover (none behind three-quarters or more, or Seats of Safety).
  for (const [v, c] of [[vehicle, own], ...(other?.type === "vehicle" ? [[other, theirs]] : [])]) {
    const share = V.occupantShare(v.system.cover, { seatsOfSafety: v.system.derived?.fx?.seatsOfSafety });
    if (share && v.system.occupants.length) await damageCard(v, `Collision: those aboard ${v.name}`, String(Math.floor(c.total * share)), "", [`Its ${v.system.cover} cover: ${share === 1 ? "all" : share === 0.5 ? "half" : "a quarter"} of what it took. Each Reflex DC 15 for half.`]);
  }
  // Both two speed categories slower; the driver who caused it checks to keep control now, the other at their next action.
  for (const v of [vehicle, ...(other?.type === "vehicle" ? [other] : [])]) if (v.isOwner) await v.update({ "system.speed": V.slowerBy(v.system.speed, 2) });
  for (const [v, when] of [[vehicle, "now"], ...(other?.type === "vehicle" ? [[other, "at the start of their next action"]] : [])]) {
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: v }), content: `<div class="m20-roll"><p>${escape(v.name)}'s driver: a Drive check (DC 15) ${when}, or lose control.</p></div>`, flags: { [SYSTEM_ID]: { vehicleCheck: { vehicle: v.uuid, keep: 15 } } } });
  }
  return { own, theirs };
}

/**
 * Repairing a vehicle (Modern/VehicleCombat/DamagingVehicles): an hour's work and a Repair check (DC 20; −4 without a
 * mechanical tool kit) by a character, or the GM's crew; made, 2d6 hit points back. Not once destroyed.
 */
export async function repair(vehicle, event) {
  if (vehicle.statuses.has("destroyed") || vehicle.system.derived?.state === "destroyed") return ui.notifications.warn(`${vehicle.name} is destroyed: it cannot be repaired.`);
  const mine = game.actors.filter((a) => a.type === "character" && a.isOwner);
  const chosen = await foundry.applications.api.DialogV2.prompt({
    window: { title: `${vehicle.name}: an hour's repairs` },
    content: `<div class="form-group"><label>Who repairs it</label><select name="who">${mine.map((a) => `<option value="${a.uuid}">${escape(a.name)}</option>`).join("")}<option value="">The crew (${escape(V.CREW[vehicle.system.crewQuality]?.label.toLowerCase() ?? "normal")})</option></select></div>
      <div class="form-group"><label>With a mechanical tool kit (without: −4)</label><input type="checkbox" name="kit" checked></div>`,
    ok: { label: "Repair", callback: (ev, button) => ({ who: button.form.elements.who.value, kit: button.form.elements.kit.checked }) },
    rejectClose: false,
  });
  if (!chosen) return null;
  const who = chosen.who ? fromUuidSync(chosen.who) : null;
  const terms = who
    ? R.skillCheck(who.system.derived, who.system.derived.skills.find((r) => r.key === "repair" && !r.specialty)).terms
    : [{ label: `Crew (${V.CREW[vehicle.system.crewQuality]?.label.toLowerCase() ?? "normal"})`, value: V.CREW[vehicle.system.crewQuality]?.check ?? 2 }];
  const spec = R.d20(`${vehicle.name}: an hour's repairs, Repair (DC 20)`, [...terms, { label: "Without a mechanical tool kit", value: chosen.kit ? 0 : -4 }]);
  const roll = await rollCheck(who ?? vehicle, spec, event, { judge: (r) => ({ verdict: r.total >= 20 ? { good: true, text: "Succeeds: 2d6 hit points back." } : { good: false, text: "Fails: no progress this hour." } }) });
  if (!roll || roll.total < 20) return roll;
  const Roll = foundry.dice?.Roll ?? globalThis.Roll;
  const back = await new Roll("2d6").evaluate();
  await back.toMessage({ speaker: ChatMessage.getSpeaker({ actor: vehicle }), flavor: `<div class="m20-roll"><h3>${escape(vehicle.name)} repaired</h3></div>` });
  const { applyToActor } = await import("./damage.mjs");
  await applyToActor(vehicle, back.total, { healing: true });
  return roll;
}

/**
 * A vehicle's token: its picture upright and inside its squares (the icon, fitted: not the round token picture, which
 * spills past a long vehicle's width), and its squares turned as it turns. Called once, at init.
 */
export function registerVehicleHooks() {
  const isVehicle = (token) => token.actor?.type === "vehicle" && token.actor.system.squares;
  // The system's own round picture (0.8.0's) is the vehicle's icon instead; fitted inside its squares, upright.
  const art = (token) => {
    const src = token.texture?.src ?? "";
    return { "texture.src": src.replace("systems/modern20/assets/tokens/", "systems/modern20/assets/icons/"), "texture.fit": "contain", lockRotation: true };
  };
  Hooks.on("preCreateToken", (token, data) => {
    if (!isVehicle(token)) return;
    token.updateSource({ ...art(token), ...V.footprintFacing(token.actor.system.squares, data.rotation ?? token.rotation) });
  });
  // Turned: its squares turned with it, by the client that turned it. Foundry moves a token's size as movement, so it is
  // resized after the turn (TokenDocument#resize keeps its centre), not in the same update.
  Hooks.on("updateToken", async (token, changes, options, userId) => {
    if (userId !== game.user.id || !isVehicle(token) || !("rotation" in changes)) return;
    const to = V.footprintFacing(token.actor.system.squares, token.rotation);
    const fix = token.texture.fit !== "contain" || !token.lockRotation ? art(token) : {};
    if (Object.keys(fix).length) await token.update(fix);
    if (token.width !== to.width || token.height !== to.height) await token.resize(to);
  });
}
