// This file holds the main code for the plugin. It has access to the *document*.
// You can access browser APIs such as the network by creating a UI which contains
// a full browser environment (see documentation).
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

let myNodes: RectangleNode[] = []

async function setup() {
  // This plugin creates 5 rectangles on the screen.
  const numberOfRectangles = 1
  const nodes: RectangleNode[] = []

  for (let i = 0; i < numberOfRectangles; i++) {
    const rect = figma.createRectangle()
    rect.x = i * 150
    rect.fills = [{ type: "SOLID", color: { r: 1, g: 0.5, b: 0 } }]
    figma.currentPage.appendChild(rect)
    nodes.push(rect)
  }

  figma.currentPage.selection = nodes
  figma.viewport.scrollAndZoomIntoView(nodes)

  await new Promise(r => setTimeout(r, 0))

  myNodes = nodes

}

const HSBToRGB = (h: number, s: number, b: number) => {
  s /= 100;
  b /= 100;
  const k = (n: number) => (n + h / 60) % 6;
  const f = (n: number) => b * (1 - s * Math.max(0, Math.min(k(n), 4 - k(n), 1)));
  return {r: f(5), g: f(3), b: f(1)};
};


let i = 0
const myPenCircles: EllipseNode[] = []
async function draw() {
  // Runs this code if the plugin is run in Figma
  const nodes: RectangleNode[] = myNodes
  const penCircles: EllipseNode[] = myPenCircles

  if (i < 250) nodes[0].x += 2
  else nodes[0].x -= 2

  nodes[0].fills = [{ type: "SOLID", color: HSBToRGB(i * (360 / 500), 100, 50) }]
  
  if (figma.activeUsers[0].position) {
    const MAX_DOTS_IN_PEN = 50
    const CIRCLE_DIAMETER = 10
    const { x: mouseX, y: mouseY } = figma.activeUsers[0].position

    while (penCircles.length >= MAX_DOTS_IN_PEN) {
      const oldestCircle = penCircles.shift()
      if (oldestCircle) oldestCircle.remove()
    }

    const nextCircleX = mouseX - CIRCLE_DIAMETER/2
    const nextCircleY = mouseY - CIRCLE_DIAMETER/2
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

  i = (i + 1) % 500
}

const lerp = (v0: number, v1: number, t: number): number => {
  return v0*(1-t)+v1*t
}