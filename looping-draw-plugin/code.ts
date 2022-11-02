let myNodes: RectangleNode[] = []

const idToLastNumPoints = {}
const bounds = figma.viewport.bounds
async function onPointsMessage({ id, points }: { id: string, points: number[][] }) {
  // If we already saw this line, don't re-draw the already-seen points
  const numPoints = points.length
  if (idToLastNumPoints[id]) {
    points = points.slice(idToLastNumPoints[id])
  }
  idToLastNumPoints[id] = numPoints
  points.forEach(([x, y]) => {
    drawPoint({ x, y })
  })
}
figma.ui.onmessage = ({id, points, type}: {id: string, points: number[][], type: string}) => {
  if (type === "ws-message") {
    onPointsMessage({ id, points })
  }
}

async function setup() {
  const numberOfRectangles = 1
  const nodes: RectangleNode[] = []

  // for (let i = 0; i < numberOfRectangles; i++) {
  //   const rect = figma.createRectangle()
  //   rect.x = i * 150
  //   rect.fills = [{ type: "SOLID", color: { r: 1, g: 0.5, b: 0 } }]
  //   figma.currentPage.appendChild(rect)
  //   nodes.push(rect)
  // }

  // figma.currentPage.selection = nodes
  // figma.viewport.scrollAndZoomIntoView(nodes)

  await new Promise(r => setTimeout(r, 0))

  myNodes = nodes
}

let i = 0
const myPenCircles: EllipseNode[] = []
async function draw() {
  clearOldPoints()
}

const drawPoint = ({ x, y }: { x: number, y: number }) => {
  const CIRCLE_DIAMETER = 10

  const penCircles: EllipseNode[] = myPenCircles

  clearOldPoints()

  const nextCircleX = x - CIRCLE_DIAMETER/2
  const nextCircleY = y - CIRCLE_DIAMETER/2
  const prevCircleX = penCircles[penCircles.length-1]?.x ?? nextCircleX
  const prevCircleY = penCircles[penCircles.length-1]?.y ?? nextCircleY

  const distFromLastCircle = Math.sqrt(
    Math.pow(nextCircleX - prevCircleX, 2) + Math.pow(nextCircleY - prevCircleY, 2)
  )
  const circlesNeededToCover = penCircles.length > 0 ? 2 * distFromLastCircle / CIRCLE_DIAMETER : 1

  for (let i = 0; i < circlesNeededToCover; i++) {
    const circle = figma.createEllipse()
    circle.resize(CIRCLE_DIAMETER, CIRCLE_DIAMETER)

    circle.x = lerp(prevCircleX + CIRCLE_DIAMETER/2, nextCircleX, i / circlesNeededToCover)
    circle.y = lerp(prevCircleY + CIRCLE_DIAMETER/2, nextCircleY, i / circlesNeededToCover)

    circle.fills = [{ type: "SOLID", color: { r: 1, g: 0.5, b: 0 } }]
    figma.currentPage.appendChild(circle)
    penCircles.push(circle)
  }
}

const clearOldPoints = () => {
  const MAX_DOTS_IN_PEN = 50
  const penCircles: EllipseNode[] = myPenCircles

  while (penCircles.length >= MAX_DOTS_IN_PEN) {
    const oldestCircle = penCircles.shift()
    if (oldestCircle) oldestCircle.remove()
  }
}

const drawCursorTrail = () => {
  const nodes: RectangleNode[] = myNodes
  const penCircles: EllipseNode[] = myPenCircles

  if (i < 250) nodes[0].x += 2
  else nodes[0].x -= 2

  nodes[0].fills = [{ type: "SOLID", color: HSBToRGB(i * (360 / 500), 100, 50) }]
  
  if (figma.activeUsers[0].position) {
    const { x: mouseX, y: mouseY } = figma.activeUsers[0].position
    drawPoint({ x: mouseX, y: mouseY })
  }

  i = (i + 1) % 500
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