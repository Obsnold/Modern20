/**
 * The vehicle sheet: its statistics, its hit points and condition (disabled, destroyed), the speed it moves at and
 * what that does (rules/vehicles.mjs), who is aboard (a character or creature dropped on it, as the driver, a gunner
 * or a passenger), and its mounted weapons (weapons dropped on it). The Edit view has every field, as an item's does.
 */
import { describe, Editable } from "./document-sheet.mjs";
import { logContext } from "../log.mjs";
import { conditionStatus } from "./creature-sheet.mjs";
import { SPEEDS, reachable, atSpeed, vehicleState } from "../rules/vehicles.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const { TextEditor } = foundry.applications.ux;

const ROLES = [["driver", "Driver"], ["gunner", "Gunner"], ["passenger", "Passenger"]];
const COVER = { none: "None", "one-quarter": "One-quarter", "one-half": "One-half", "three-quarters": "Three-quarters", "nine-tenths": "Nine-tenths", full: "Full" };
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
const title = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");

export class Modern20VehicleSheet extends Editable(HandlebarsApplicationMixin(ActorSheetV2)) {
  static DEFAULT_OPTIONS = {
    classes: ["modern20", "sheet", "actor", "vehicle"],
    position: { width: 640, height: 720 },
    window: { resizable: true },
    actions: {
      toggleCondition: Modern20VehicleSheet.#onToggleCondition,
      openOccupant: Modern20VehicleSheet.#onOpenOccupant,
      removeOccupant: Modern20VehicleSheet.#onRemoveOccupant,
      editItem: Modern20VehicleSheet.#onEditItem,
      deleteItem: Modern20VehicleSheet.#onDeleteItem,
      filterLog: Modern20VehicleSheet.#onFilterLog,
    },
  };

  static PARTS = { body: { template: "systems/modern20/templates/vehicle-sheet.hbs", scrollable: [""] } };

  async _prepareContext(options) {
    const context = Object.assign(await super._prepareContext(options), await describe(this.document));
    const actor = this.document;
    const s = actor.system;
    const max = s.hp.max ?? 0, hp = s.hp.value ?? max;
    const state = vehicleState(hp, max);
    const speed = atSpeed(s.defense, s.speed);
    const can = reachable(s.topSpeed.character);
    context.v = {
      category: s.category || "Vehicle", size: title(s.size), footprint: `${s.squares.wide} × ${s.squares.long} squares`,
      hp, max, state: state === "destroyed" ? "Destroyed" : state === "disabled" ? "Disabled" : "",
      speeds: Object.entries(SPEEDS).map(([value, x]) => ({ value, label: `${x.label} (${x.character[1] === Infinity ? `${x.character[0]}+` : x.character[0] === x.character[1] ? x.character[0] : `${x.character[0]}–${x.character[1]}`} squares)`, selected: value === s.speed, far: !can.includes(value) })),
      speedTip: "street +1 Defense, −1 on rolls aboard; highway +2, −2; all-out +4, −4",
      defense: speed.defense, defenseTip: `${s.defense} as printed${speed.defense !== s.defense ? `, ${signed(speed.defense - s.defense)} at ${speed.label.toLowerCase()}` : ""}`,
      check: signed(speed.check), hardness: s.hardness, initiative: signed(s.initiative), maneuver: signed(s.maneuver),
      topSpeed: s.topSpeed.value || `${s.topSpeed.character} (${s.topSpeed.chase})`, cover: COVER[s.cover] ?? "—",
      crew: s.crew, passengers: s.passengers, cargo: s.cargo.value || "no",
      occupants: s.occupants.map((o, index) => {
        const who = fromUuidSync(o.uuid);
        return { index, name: who?.name ?? o.name, img: who?.img ?? "", roles: ROLES.map(([value, label]) => ({ value, label, selected: value === o.role })) };
      }),
      weapons: actor.items.filter((i) => i.type === "weapon").map((i) => ({ id: i.id, name: i.name, img: i.img, detail: [i.system.damage?.value, i.system.critical && `crit ${i.system.critical}`, i.system.damageType, i.system.rangeIncrement?.value].filter(Boolean).join(", ") })),
      purchase: s.purchaseDC.value || (s.purchaseDC.dc ?? ""), restriction: s.restriction.value,
    };
    context.description = await TextEditor.implementation.enrichHTML(s.description, { relativeTo: actor, secrets: actor.isOwner });
    context.log = logContext(actor, this.logFilter);
    // Its conditions: a vehicle's own two (a car is not shaken or prone).
    if (!actor.pack) {
      context.status = conditionStatus(actor, hp, max);
      context.status.conditions = context.status.conditions.filter((c) => ["disabled", "destroyed"].includes(c.id));
    }
    return context;
  }

  /** An occupant's role, changed: the driver, a gunner or a passenger. */
  _onRender(context, options) {
    super._onRender(context, options);
    for (const select of this.element.querySelectorAll("[data-occupant-role]")) {
      select.addEventListener("change", async (event) => {
        event.stopPropagation();
        const list = this.document.system.toObject().occupants;
        const i = Number(select.dataset.occupantRole);
        if (!list[i]) return;
        // One driver: another made the driver becomes a passenger.
        if (select.value === "driver") for (const o of list) if (o.role === "driver") o.role = "passenger";
        list[i].role = select.value;
        await this.document.update({ "system.occupants": list });
      });
    }
  }

  /** A character or creature dropped on it: aboard, as the driver if it has none, else a passenger. */
  async _onDropActor(event, actor) {
    if (!this.document.isOwner || actor.type === "vehicle") return null;
    const list = this.document.system.toObject().occupants;
    if (list.some((o) => o.uuid === actor.uuid)) return null;
    list.push({ uuid: actor.uuid, name: actor.name, role: list.some((o) => o.role === "driver") ? "passenger" : "driver" });
    await this.document.update({ "system.occupants": list });
    return actor;
  }

  /** A weapon dropped on it: mounted. Nothing else goes on a vehicle (yet: its FX items do in a later version). */
  async _onDropItem(event, item) {
    if (item.type !== "weapon") {
      ui.notifications.warn(`Only weapons can be mounted on ${this.document.name}.`);
      return null;
    }
    return super._onDropItem(event, item);
  }

  logFilter = "all";
  static #onFilterLog(event, target) {
    this.logFilter = target.dataset.filter;
    this.render();
  }

  static async #onToggleCondition(event, target) {
    if (this.isEditable) await this.document.toggleStatusEffect(target.dataset.condition);
  }

  #occupant(target) {
    return this.document.system.occupants[Number(target.closest("[data-occupant]")?.dataset.occupant)];
  }

  static #onOpenOccupant(event, target) {
    const o = this.#occupant(target);
    const who = o ? fromUuidSync(o.uuid) : null;
    if (who?.sheet) who.sheet.render(true);
    else ui.notifications.warn(`${o?.name ?? "They"} cannot be found: removed from the world?`);
  }

  static async #onRemoveOccupant(event, target) {
    const i = Number(target.closest("[data-occupant]")?.dataset.occupant);
    await this.document.update({ "system.occupants": this.document.system.toObject().occupants.filter((_, j) => j !== i) });
  }

  static #onEditItem(event, target) { this.document.items.get(target.closest("[data-item-id]")?.dataset.itemId)?.sheet.render(true); }
  static async #onDeleteItem(event, target) { await this.document.items.get(target.closest("[data-item-id]")?.dataset.itemId)?.deleteDialog(); }
}
