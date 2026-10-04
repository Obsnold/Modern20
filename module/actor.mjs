/**
 * The system's Actor class: what Foundry's dice see of an actor.
 */
import { initiativeBonus } from "./roll.mjs";

export class Modern20Actor extends foundry.documents.Actor {
  /** `@init` is the initiative bonus for the combat tracker's `1d20 + @init`; the rest is the actor's data. */
  getRollData() {
    const data = super.getRollData();
    data.init = initiativeBonus(this);
    return data;
  }
}
