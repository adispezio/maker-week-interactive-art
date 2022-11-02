// Parameters
const PEN_DIAMETER = 10
const PEN_TRAIL_LENGTH = 50

let frame: FrameNode

const idToLastNumPoints = {}
const bounds = figma.viewport.bounds
async function onPointsMessage({ id, points }: { id: string, points: number[][] }) {
  // If we already saw this line, don't re-draw the already-seen points
  const numPoints = points.length
  if (idToLastNumPoints[id]) {
    points = points.slice(idToLastNumPoints[id])
  }
  idToLastNumPoints[id] = numPoints

  points = simplify(points, 4, true)
  // points = chaikinSmooth(points)
  points.forEach(([x, y]) => {
    // x-axis is flipped
    drawPoint({ x: -x, y })
  })
}
figma.ui.onmessage = ({id, points, type}: {id: string, points: number[][], type: string}) => {
  if (type === "ws-message") {
    onPointsMessage({ id, points })
  }
}

async function setup() {
  // const numberOfRectangles = 1
  // frame = figma.createFrame()

  await new Promise(r => setTimeout(r, 0))
}

const myPenCircles: EllipseNode[] = []
let i = 0
async function draw() {
  i = (i + 1) % 3
  clearOldPoints()
}

const drawPoint = ({ x, y }: { x: number, y: number }) => {
  const CIRCLE_DIAMETER = PEN_DIAMETER

  const { x: viewportX, y: viewportY, width: viewportWidth, height: viewportHeight } = bounds
  const penCircles: EllipseNode[] = myPenCircles

  clearOldPoints()

  const nextCircleX = x
  const nextCircleY = y
  const prevCircleX = penCircles[penCircles.length-1]?.x ?? nextCircleX
  const prevCircleY = penCircles[penCircles.length-1]?.y ?? nextCircleY

  const distFromLastCircle = Math.sqrt(
    Math.pow(nextCircleX - prevCircleX, 2) + Math.pow(nextCircleY - prevCircleY, 2)
  )
  const circlesNeededToCover = penCircles.length > 0 ? distFromLastCircle / CIRCLE_DIAMETER : 1
  
  let pointsForSmoothing: number[][] = myPenCircles.map(circle => [circle.x, circle.y])
  for (let i = 0; i < circlesNeededToCover; i++) {
    pointsForSmoothing.push([
      lerp(prevCircleX, nextCircleX, i / circlesNeededToCover),
      lerp(prevCircleY, nextCircleY, i / circlesNeededToCover)
    ])
  }

  // Try to smooth the line into a nice one
  const pointsLength = pointsForSmoothing.length
  if (circlesNeededToCover > 5) {
    pointsForSmoothing = chaikinSmooth(pointsForSmoothing)
  } else {
    pointsForSmoothing = pointsForSmoothing.slice(penCircles.length)
  }
  console.log({ circlesNeededToCover, pointsLength, newPointsLength: pointsForSmoothing })
  // Don't rerender old points
  
  pointsForSmoothing.forEach(([intermediateX, intermediateY]) => {
    const xPercent = (intermediateX - viewportX) / (viewportWidth)
    const hue = lerp(0, 360, xPercent)
    const brightness = 50 // lerp(viewportY, viewportY + viewportHeight, nextCircleY)
    const color = HSBToRGB(hue, 100, brightness)
    
    const circle = figma.createEllipse()
    circle.resize(CIRCLE_DIAMETER, CIRCLE_DIAMETER)
  
    circle.x = intermediateX
    circle.y = intermediateY
    circle.fills = [{ type: "SOLID", color }]
    figma.currentPage.appendChild(circle)
    penCircles.push(circle)
  })
}

// Delete old points to create the "trail" effect
const clearOldPoints = () => {
  const MAX_DOTS_IN_PEN = PEN_TRAIL_LENGTH
  const penCircles: EllipseNode[] = myPenCircles

  if (i % 3 == 0) {
    penCircles?.shift()?.remove()
  }

  while (penCircles.length >= MAX_DOTS_IN_PEN) {
    const oldestCircle = penCircles.shift()
    if (oldestCircle) oldestCircle.remove()
  }
}

// Draw points following the cursor
const drawCursorPoints = () => {  
  if (figma.activeUsers[0].position) {
    const { x: mouseX, y: mouseY } = figma.activeUsers[0].position
    drawPoint({ x: mouseX, y: mouseY })
  }
}

const lerp = (v0: number, v1: number, t: number): number => {
  return v0*(1-t)+v1*t
}

const HSBToRGB = (h: number, s: number, b: number) => {
  s /= 100;
  b /= 100;
  const k = (n: number) => (n + h / 60) % 6;
  const f = (n: number) => b * (1 - s * Math.max(0, Math.min(k(n), 4 - k(n), 1)));
  return {r: f(5), g: f(3), b: f(1)};
}

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
})()

function copy(out: Array<any>, a: Array<any>) {
  out[0] = a[0];
  out[1] = a[1];
  return out;
}

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

figma.showUI(__html__)
figma.ui.hide()
plugin()

async function plugin() {
  setup()
  while (true) {
    draw()
    const DRAW_DELAY_MS = 5
    await new Promise(r => setTimeout(r, DRAW_DELAY_MS))
  }

  figma.closePlugin()
}