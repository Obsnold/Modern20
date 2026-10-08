/**
 * The system's ActiveEffect class: an effect on a piece of gear (a ring, a jacket) is suppressed while the gear
 * is not in use, unequipped, kept elsewhere or worn beyond the limit of its kind, as rules/character.mjs leaves
 * out the system's own (an FX item's bonus works while it is worn, not in a drawer).
 */
import { wornOverLimit } from "./rules/fx-items.mjs";

export class Modern20ActiveEffect extends foundry.documents.ActiveEffect {
  get isSuppressed() {
    const item = this.parent;
    if (item?.documentName === "Item" && item.parent?.documentName === "Actor" && item.system && "equipped" in item.system) {
      if (!item.system.equipped || item.system.stored) return true;
      // Worn beyond the limit of its kind (a third ring): not working.
      if (item.system.fx?.slot && wornOverLimit(item.parent.items.contents).some((w) => w.over.includes(item.id))) return true;
    }
    return super.isSuppressed;
  }
}
