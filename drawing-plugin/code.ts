// From simplify-js NPM package
const simplify = (function () {
  "use strict";
  // square distance between 2 points
  function getSqDist(p1, p2) {
    var dx = p1[0] - p2[0],
      dy = p1[1] - p2[1];

    return dx * dx + dy * dy;
  }

  // square distance from a point to a segment
  function getSqSegDist(p, p1, p2) {
    var x = p1[0],
      y = p1[1],
      dx = p2[0] - x,
      dy = p2[1] - y;

    if (dx !== 0 || dy !== 0) {
      var t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);

      if (t > 1) {
        x = p2[0];
        y = p2[1];
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }

    dx = p[0] - x;
    dy = p[1] - y;

    return dx * dx + dy * dy;
  }
  // rest of the code doesn't care about point format

  // basic distance-based simplification
  function simplifyRadialDist(points, sqTolerance) {
    var prevPoint = points[0],
      newPoints = [prevPoint],
      point;

    for (var i = 1, len = points.length; i < len; i++) {
      point = points[i];

      if (getSqDist(point, prevPoint) > sqTolerance) {
        newPoints.push(point);
        prevPoint = point;
      }
    }

    if (prevPoint !== point) newPoints.push(point);

    return newPoints;
  }

  function simplifyDPStep(points, first, last, sqTolerance, simplified) {
    var maxSqDist = sqTolerance,
      index;

    for (var i = first + 1; i < last; i++) {
      var sqDist = getSqSegDist(points[i], points[first], points[last]);

      if (sqDist > maxSqDist) {
        index = i;
        maxSqDist = sqDist;
      }
    }

    if (maxSqDist > sqTolerance) {
      if (index - first > 1)
        simplifyDPStep(points, first, index, sqTolerance, simplified);
      simplified.push(points[index]);
      if (last - index > 1)
        simplifyDPStep(points, index, last, sqTolerance, simplified);
    }
  }

  // simplification using Ramer-Douglas-Peucker algorithm
  function simplifyDouglasPeucker(points, sqTolerance) {
    var last = points.length - 1;

    var simplified = [points[0]];
    simplifyDPStep(points, 0, last, sqTolerance, simplified);
    simplified.push(points[last]);

    return simplified;
  }

  // both algorithms combined for awesome performance
  function simplify(points, tolerance, highestQuality) {
    if (points.length <= 2) return points;

    var sqTolerance = tolerance !== undefined ? tolerance * tolerance : 1;

    points = highestQuality ? points : simplifyRadialDist(points, sqTolerance);
    points = simplifyDouglasPeucker(points, sqTolerance);

    return points;
  }

  return simplify;
})();

function copy(out: Array<any>, a: Array<any>) {
  out[0] = a[0];
  out[1] = a[1];
  return out;
}

// From chaikin-smooth NPM package
function chaikinSmooth(input: any) {
  let output;

  if (!Array.isArray(output)) output = [];

  if (input.length > 0) output.push(copy([0, 0], input[0]));
  for (var i = 0; i < input.length - 1; i++) {
    var p0 = input[i];
    var p1 = input[i + 1];
    var p0x = p0[0],
      p0y = p0[1],
      p1x = p1[0],
      p1y = p1[1];

    var Q = [0.75 * p0x + 0.25 * p1x, 0.75 * p0y + 0.25 * p1y];
    var R = [0.25 * p0x + 0.75 * p1x, 0.25 * p0y + 0.75 * p1y];
    output.push(Q);
    output.push(R);
  }
  if (input.length > 1) output.push(copy([0, 0], input[input.length - 1]));
  return output;
}

figma.showUI(__html__);

// Map from remote id -> Figma id
const idMap = {};
const bounds = figma.viewport.bounds;

figma.ui.onmessage = (msg) => {
  if (msg.type === "ws-message") {
    let vector;

    // If we previously created a vector for the same line, delete it
    if (idMap[msg.id] != null) {
      vector = figma.getNodeById(idMap[msg.id]) as VectorNode;
      vector.remove();
    }

    vector = figma.createVector();
    vector.relativeTransform = [
      [1, 0, bounds.x],
      [0, 1, bounds.y],
    ];
    vector.strokeWeight = 5;
    vector.strokeCap = "ROUND";
    vector.strokes = [
      {
        type: "SOLID",
        color: { r: 1, g: 0, b: 0 },
      },
    ];
    idMap[msg.id] = vector.id;

    let points = msg.points;
    points = simplify(points, 4, true);
    points = chaikinSmooth(points);

    const data =
      "M " +
      points
        .map(([x, y]) =>
          [
            Math.round(((640 - x) / 640) * bounds.width),
            Math.round((y / 480) * bounds.height),
          ].join(" ")
        )
        .join(" L ");

    vector.vectorPaths = [
      {
        windingRule: "EVENODD",
        data,
      },
    ];
  }
};
