import { announce, problem } from "./announce.mjs";

/**
 * Placing an activity's area on the canvas.
 *
 * In v14 the MeasuredTemplate document was merged into Region — Scene#templates
 * is deprecated until v16, and MeasuredTemplateDocument.createDocuments is a
 * shim that creates a Region with flags.core.MeasuredTemplate and converts
 * back. So this creates Regions directly rather than going through a path with
 * a removal date.
 *
 * Auto-targeting whoever stands inside is deliberately not done: that is
 * module territory in every system, and guessing at it would override the
 * targets a player has deliberately chosen.
 */

const SHAPES = {
  radius: "circle",
  circle: "circle",
  square: "rectangle"
};

/** Where to centre the area: the target, else the attacker, else the view. */
function areaOrigin(item) {
  const targeted = [...(game.user.targets ?? [])][0];
  if (targeted) return { x: targeted.center.x, y: targeted.center.y };

  const own = item.actor?.getActiveTokens?.()[0];
  if (own) return { x: own.center.x, y: own.center.y };

  const { x, y } = canvas.stage?.pivot ?? {};
  return { x: x ?? 0, y: y ?? 0 };
}

/** Feet to pixels, the way Foundry converts its own template distances. */
function distancePixels() {
  const grid = canvas.grid;
  if (!grid) return 1;
  return grid.size / grid.distance;
}

/** The shape data for an activity's area, or null if it has none. */
function shapeFor(activity, origin) {
  const size = activity.area?.size ?? 0;
  if (!size) return null;

  const type = SHAPES[activity.area.shape] ?? "circle";
  const pixels = size * distancePixels();
  // Core follows the gridTemplates setting for whether a shape snaps to grid.
  const gridBased = game.settings.get("core", "gridTemplates") === true;

  if (type === "rectangle") {
    // A square area is measured from a corner, so centre it on the origin.
    return {
      type: "rectangle",
      x: origin.x - pixels / 2,
      y: origin.y - pixels / 2,
      width: pixels,
      height: pixels,
      gridBased
    };
  }

  return { type: "circle", x: origin.x, y: origin.y, radius: pixels, gridBased };
}

/**
 * Draw an activity's area on the current scene as a Region.
 *
 * Returns the created region, or null when there is nothing to draw or no
 * scene to draw it on.
 */
export async function placeArea(item, activity, { messageId = "" } = {}) {
  if (!canvas?.scene) {
    problem(game.i18n.localize("MODERN20.Area.NoScene"));
    return null;
  }

  const origin = areaOrigin(item);
  const shape = shapeFor(activity, origin);
  if (!shape) {
    problem(game.i18n.localize("MODERN20.Area.NoArea"));
    return null;
  }

  // Clicking the button again moves the blast rather than leaving a second one
  // on the map: the same explosion did not happen twice.
  if (messageId) {
    const stale = canvas.scene.regions
      .filter((region) => region.getFlag("modern20", "area")?.messageId === messageId)
      .map((region) => region.id);
    if (stale.length) await canvas.scene.deleteEmbeddedDocuments("Region", stale);
  }

  const [region] = await canvas.scene.createEmbeddedDocuments("Region", [{
    // Region requires a non-blank name.
    name: item.name,
    shapes: [shape],
    flags: { modern20: { area: { itemId: item.id, activityId: activity.id, messageId } } }
  }]);

  if (region) {
    await announce(item.actor, {
      title: game.i18n.format("MODERN20.Area.Placed", {
        name: item.name, size: activity.area.size
      }),
      img: item.img
    });
  }
  return region ?? null;
}
