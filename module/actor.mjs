/**
 * The system's Actor class: what Foundry's dice see of an actor.
 */
import { initiativeBonus } from "./roll.mjs";

export class Modern20Actor extends foundry.documents.Actor {
  /**
   * A new character's token: its hit points on bar 1, shown when its owner
   * hovers, linked to the character (damage to the token is damage to the
   * character), friendly, and seeing. Creatures carry theirs in the pack.
   */
  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    if (this.type !== "character") return;
    const { TOKEN_DISPOSITIONS, TOKEN_DISPLAY_MODES } = CONST;
    this.updateSource({
      prototypeToken: {
        actorLink: true,
        disposition: TOKEN_DISPOSITIONS.FRIENDLY,
        displayBars: TOKEN_DISPLAY_MODES.OWNER_HOVER,
        displayName: TOKEN_DISPLAY_MODES.OWNER_HOVER,
        bar1: { attribute: "hp" },
        sight: { enabled: true },
        ...(data.prototypeToken ?? {}),
      },
    });
  }

  /**
   * A token bar's hit points, as the token HUD changes them: down past 0, which Foundry's bar stops at,
   * since a character at −1 to −9 is dying (Modern/deathdyinghealing); never above the maximum. Its
   * conditions follow (module/damage.mjs).
   */
  async modifyTokenAttribute(attribute, value, isDelta = false, isBar = true) {
    if (attribute !== "hp" || !isBar) return super.modifyTokenAttribute(attribute, value, isDelta, isBar);
    const hp = this.system.hp;
    const current = hp.value ?? hp.max ?? 0;
    const next = Math.min(isDelta ? current + value : value, hp.max ?? Infinity);
    if (next === current) return this;
    const updates = { "system.hp.value": next };
    const allowed = Hooks.call("modifyTokenAttribute", { attribute, value, isDelta, isBar }, updates, this);
    return allowed !== false ? this.update(updates) : this;
  }

  /** `@init` is the initiative bonus for the combat tracker's `1d20 + @init`; the rest is the actor's data. */
  getRollData() {
    const data = super.getRollData();
    data.init = initiativeBonus(this);
    data.initTie = data.init / 100;
    return data;
  }
}
