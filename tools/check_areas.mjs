/**
 * The shape of a cone and a line, against the numbers the SRD prints.
 *
 *     node tools/check_areas.mjs
 *
 * A Region has no cone and no ray — only a rectangle, a circle, an ellipse
 * and a polygon — so both are polygons this system works out itself, and an
 * arithmetic mistake in one draws a shape that looks plausible and covers the
 * wrong squares. Nobody at a table would catch that; the book states the
 * dimensions exactly, so it can be checked here.
 *
 *   "All cones are 30 feet long and 30 feet wide at the base."
 *   "All lines are 5 feet high, 5 feet wide, and 60 feet long."
 */
import { installStubs } from "./lib/foundry-stubs.mjs";

installStubs();
const { conePoints, linePoints, CONE_ANGLE, LINE_WIDTH_FEET } =
  await import("../module/apps/area.mjs");

let failures = 0;
const fail = (message) => { failures++; console.log(`FAIL  ${message}`); };
const close = (got, want, slack = 0.001) => Math.abs(got - want) <= slack;

const pairs = (points) => {
  const out = [];
  for (let index = 0; index < points.length; index += 2) {
    out.push({ x: points[index], y: points[index + 1] });
  }
  return out;
};

const origin = { x: 0, y: 0 };

/* -- the cone ----------------------------------------------------------- */

// Thirty long and thirty wide at the base. Drawn as a sector both are exact
// at sixty degrees, which is what fixes the angle — not a number chosen to
// match another system, and not the 53 degrees a flat-based triangle wants,
// which would send the corners further out than the book lets the cone reach.
if (!close(CONE_ANGLE, 2 * Math.asin(0.5))) {
  fail(`the cone's angle is ${CONE_ANGLE}, not 2*asin(0.5)`);
}
{
  const degrees = (CONE_ANGLE * 180) / Math.PI;
  if (!close(degrees, 60, 0.01)) fail(`the cone opens ${degrees}°, expected 60°`);
}

for (const length of [30, 60, 15]) {
  for (const angle of [0, Math.PI / 4, Math.PI, -Math.PI / 3, 2]) {
    const points = pairs(conePoints(origin, angle, length));

    // The apex is where the thing breathing it is standing.
    if (points[0].x !== 0 || points[0].y !== 0) {
      fail(`the cone's first point is not its apex at ${angle} rad`);
      break;
    }

    // Every point on the arc is exactly the cone's length from the apex, so
    // the cone reaches as far as the book says in every direction it covers.
    const arc = points.slice(1);
    for (const point of arc) {
      const reach = Math.hypot(point.x, point.y);
      if (!close(reach, length, 0.001)) {
        fail(`a cone point is ${reach.toFixed(3)} from the apex, not ${length}`);
        break;
      }
    }

    // The base is as wide as the cone is long.
    const first = arc[0];
    const last = arc[arc.length - 1];
    const base = Math.hypot(last.x - first.x, last.y - first.y);
    if (!close(base, length, 0.05)) {
      fail(`a ${length}-foot cone has a base ${base.toFixed(2)} wide, not ${length}`);
    }

    // And it points where it was aimed: the middle of the arc is on the angle.
    const middle = arc[Math.floor(arc.length / 2)];
    const aimed = Math.atan2(middle.y, middle.x);
    const off = Math.abs(Math.atan2(Math.sin(aimed - angle), Math.cos(aimed - angle)));
    if (off > 0.05) {
      fail(`a cone aimed at ${angle} rad points ${aimed.toFixed(3)} instead`);
    }
  }
}

/* -- the line ----------------------------------------------------------- */

if (LINE_WIDTH_FEET !== 5) fail(`a line is ${LINE_WIDTH_FEET} feet wide, not 5`);

for (const length of [60, 30]) {
  for (const angle of [0, Math.PI / 6, Math.PI / 2, -2]) {
    const points = pairs(linePoints(origin, angle, length, LINE_WIDTH_FEET));
    if (points.length !== 4) { fail("a line is not four corners"); break; }

    const [nearLeft, farLeft, farRight, nearRight] = points;
    const width = Math.hypot(nearLeft.x - nearRight.x, nearLeft.y - nearRight.y);
    const run = Math.hypot(farLeft.x - nearLeft.x, farLeft.y - nearLeft.y);

    if (!close(width, LINE_WIDTH_FEET)) {
      fail(`a line is ${width.toFixed(3)} wide, not ${LINE_WIDTH_FEET}`);
    }
    if (!close(run, length)) {
      fail(`a ${length}-foot line runs ${run.toFixed(3)}`);
    }

    // It starts at the shooter: the near edge straddles the origin.
    const midNear = { x: (nearLeft.x + nearRight.x) / 2, y: (nearLeft.y + nearRight.y) / 2 };
    if (!close(Math.hypot(midNear.x, midNear.y), 0)) {
      fail("a line does not start where it was fired from");
    }

    // And runs the way it was aimed.
    const midFar = { x: (farLeft.x + farRight.x) / 2, y: (farLeft.y + farRight.y) / 2 };
    const aimed = Math.atan2(midFar.y - midNear.y, midFar.x - midNear.x);
    const off = Math.abs(Math.atan2(Math.sin(aimed - angle), Math.cos(aimed - angle)));
    if (off > 0.001) fail(`a line aimed at ${angle} rad runs at ${aimed.toFixed(3)}`);

    // The corners must go round the shape, not across it: a polygon whose
    // points cross over renders as a bow tie.
    const area = points.reduce((total, point, index) => {
      const next = points[(index + 1) % points.length];
      return total + (point.x * next.y - next.x * point.y);
    }, 0) / 2;
    if (!close(Math.abs(area), length * LINE_WIDTH_FEET, 0.001)) {
      fail(`a ${length}x${LINE_WIDTH_FEET} line encloses ${Math.abs(area).toFixed(2)}`);
    }
  }
}

console.log(`cone ${((CONE_ANGLE * 180) / Math.PI).toFixed(2)}°, `
  + `line ${LINE_WIDTH_FEET} feet wide, checked at every angle and length`);
console.log(failures ? `\n${failures} FAILURES` : "\nall area checks passed");
process.exit(failures ? 1 : 0);
