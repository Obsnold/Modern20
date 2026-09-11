/**
 * An item dragged to the hotbar, as a macro that uses it.
 *
 * Every mature system does this and players expect it: a weapon on the bar
 * that attacks, a spell on the bar that casts. Foundry's own answer to a
 * dropped item is to do nothing, so the drop is intercepted here.
 *
 * The macro looks the item up **by name on whoever is selected**, rather than
 * holding the id of the one that was dragged. That is what makes one bar work
 * for a table: the same "Colt Python" button fires whichever character is
 * holding a Colt Python, including one dragged out of the compendium browser
 * onto a sheet ten minutes later. It also means a macro survives the item
 * being deleted and rebought, which on a Wealth economy happens constantly.
 */

/** What a dropped item's macro runs. */
function command(name) {
  return `game.modern20.rollItem(${JSON.stringify(name)});`;
}

export function registerHotbarDrop() {
  Hooks.on("hotbarDrop", (bar, data, slot) => {
    if (data?.type !== "Item" || !data.uuid) return true;
    // Not awaited: the hook is synchronous and has to answer now, and what it
    // has to say is that the drop was handled.
    assignItemMacro(data.uuid, slot);
    return false;
  });
}

async function assignItemMacro(uuid, slot) {
  const item = await foundry.utils.fromUuid(uuid);
  if (!item) return;

  const { Macro } = foundry.documents;
  const script = command(item.name);
  // One macro per item, however many times it is dragged: a second copy of
  // the same script is a hotbar full of duplicates.
  const existing = game.macros.find(
    (macro) => macro.name === item.name && macro.command === script
  );
  const macro = existing ?? await Macro.create({
    name: item.name,
    type: "script",
    img: item.img,
    command: script,
    flags: { modern20: { itemMacro: true } }
  });

  await game.user.assignHotbarMacro(macro, slot);
}

/**
 * Use the item of this name on the character being played.
 *
 * The character assigned to the user, or the token they have selected — the
 * same rule the rules-text rolls follow, because it is the same question:
 * whose sheet is this about.
 */
export async function rollItem(name) {
  const actor = game.user.character ?? canvas.tokens?.controlled?.[0]?.actor;
  if (!actor) {
    ui.notifications.warn(game.i18n.localize("MODERN20.Warning.NoRoller"));
    return null;
  }

  const wanted = String(name).toLowerCase();
  const item = actor.items.find((entry) => entry.name.toLowerCase() === wanted);
  if (!item) {
    ui.notifications.warn(game.i18n.format("MODERN20.Warning.NoSuchItem", {
      name, actor: actor.name
    }));
    return null;
  }

  return item.roll();
}
