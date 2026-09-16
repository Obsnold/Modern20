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

/**
 * The shapes an activity can name, and what each draws.
 *
 * A Region takes a rectangle, a circle, an ellipse or a polygon, so a cone or
 * a line would have to be a polygon worked out from where the attacker is
 * standing and which way they are facing. Neither is here yet — and until one
 * is, naming one has to fail rather than quietly draw a circle instead. An
 * unrecognised shape used to fall through to a circle, which is a 30-foot
 * cone of dragon fire rendered as a 30-foot sphere centred on the dragon.
 */
/**
 * The shapes an activity can name, and what each draws.
 *
 * A Region takes a rectangle, a circle, an ellipse or a polygon — there is no
 * cone or ray as there is for a measured template — so a cone and a line are
 * polygons worked out here. Anything not named says so and places nothing: an
 * unrecognised shape used to fall through to a circle, which is a thirty-foot
 * cone of dragon fire rendered as a thirty-foot ball centred on the dragon.
 */
const SHAPES = {
  radius: "circle",
  circle: "circle",
  burst: "circle",
  spread: "circle",
  square: "rectangle",
  cube: "rectangle",
  cone: "cone",
  line: "line",
  ray: "line"
};

/** Shapes that point away from whoever used them, rather than sitting on a spot. */
const DIRECTED = new Set(["cone", "line"]);

/**
 * How wide a cone opens, in radians.
 *
 * "All cones are 30 feet long and 30 feet wide at the base" is the only thing
 * the SRD says about the shape of one, and it gives two numbers that a cone
 * drawn as a sector satisfies exactly: at sixty degrees, every point on the
 * arc is thirty feet from the apex, and the base across it measures thirty.
 * The angle is therefore 2·asin(½) and not the 2·atan(½) that would be right
 * for a triangle with a flat base — that is the 53 degrees dnd5e uses, and it
 * would put the far corners of this cone 33½ feet out, further than the
 * thirty feet the same sentence allows it.
 */
export const CONE_ANGLE = 2 * Math.asin(0.5);

/** "All lines are 5 feet high, 5 feet wide, and 60 feet long." */
export const LINE_WIDTH_FEET = 5;

/**
 * How many segments the cone's arc is drawn in.
 *
 * Even, and so symmetrical about the direction the cone was aimed: stepping a
 * fixed angle and then adding the far edge leaves a short last segment, which
 * pulls the shape a degree or two off the way it was pointed.
 */
const ARC_SEGMENTS = 24;

/** The centre of a token, or null. */
function centreOf(token) {
  return token ? { x: token.center.x, y: token.center.y } : null;
}

/** Where to centre an area that sits on a spot: the target, else the attacker. */
function areaOrigin(item) {
  const targeted = centreOf([...(game.user.targets ?? [])][0]);
  if (targeted) return targeted;

  const own = centreOf(item.actor?.getActiveTokens?.()[0]);
  if (own) return own;

  const { x, y } = canvas.stage?.pivot ?? {};
  return { x: x ?? 0, y: y ?? 0 };
}

/**
 * Where a cone or a line starts and which way it points.
 *
 * It starts at whoever used it and points at what they are aiming at, so both
 * are needed. Refused rather than guessed: a facing taken from the token's
 * rotation would be a direction the player never chose, and this system
 * already treats the user's target as the only thing that counts when an
 * attack needs to know what it is aimed at.
 */
function directedFrom(item) {
  const from = centreOf(item.actor?.getActiveTokens?.()[0]);
  const at = centreOf([...(game.user.targets ?? [])][0]);
  if (!from || !at) return null;

  const angle = Math.atan2(at.y - from.y, at.x - from.x);
  return { origin: from, angle };
}

/** Feet to pixels, the way Foundry converts its own template distances. */
function distancePixels() {
  const grid = canvas.grid;
  if (!grid) return 1;
  return grid.size / grid.distance;
}

/** A cone's outline: the apex, then an arc of the given width across it. */
export function conePoints(origin, angle, length) {
  const points = [origin.x, origin.y];
  const from = angle - CONE_ANGLE / 2;

  for (let step = 0; step <= ARC_SEGMENTS; step++) {
    const at = from + (CONE_ANGLE * step) / ARC_SEGMENTS;
    points.push(origin.x + Math.cos(at) * length, origin.y + Math.sin(at) * length);
  }
  return points;
}

/** A line's outline: a rectangle five feet wide, laid along the angle. */
export function linePoints(origin, angle, length, width) {
  const half = width / 2;
  // The direction across the line, to offset each side by.
  const acrossX = Math.cos(angle + Math.PI / 2) * half;
  const acrossY = Math.sin(angle + Math.PI / 2) * half;
  const endX = origin.x + Math.cos(angle) * length;
  const endY = origin.y + Math.sin(angle) * length;

  return [
    origin.x + acrossX, origin.y + acrossY,
    endX + acrossX, endY + acrossY,
    endX - acrossX, endY - acrossY,
    origin.x - acrossX, origin.y - acrossY
  ];
}

/** The shape data for an activity's area, or null if it cannot be drawn. */
function shapeFor(item, activity) {
  const size = activity.area?.size ?? 0;
  if (!size) return null;

  const type = SHAPES[activity.area.shape];
  if (!type) {
    problem(game.i18n.format("MODERN20.Area.UnknownShape", {
      shape: activity.area.shape || "\u2014"
    }));
    return null;
  }

  const pixels = size * distancePixels();

  if (DIRECTED.has(type)) {
    const aimed = directedFrom(item);
    if (!aimed) {
      problem(game.i18n.localize("MODERN20.Area.NeedsTarget"));
      return null;
    }
    const points = type === "cone"
      ? conePoints(aimed.origin, aimed.angle, pixels)
      : linePoints(aimed.origin, aimed.angle, pixels,
                   LINE_WIDTH_FEET * distancePixels());
    return { type: "polygon", points };
  }

  const origin = areaOrigin(item);
  // Core follows the gridTemplates setting for whether a shape snaps to grid.
  // A polygon is worked out in feet and does not ask.
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

  const shape = shapeFor(item, activity);
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
