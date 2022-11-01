// This file holds the main code for the plugin. It has access to the *document*.
// You can access browser APIs such as the network by creating a UI which contains
// a full browser environment (see documentation).
// plugin()
plugin()

async function plugin() {
  setup()
  while (true) {
    draw()
    await new Promise(r => setTimeout(r, 20))
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
async function draw() {
  // Runs this code if the plugin is run in Figma
  const nodes: RectangleNode[] = myNodes

  if (i < 250) nodes[0].x += 2
  else nodes[0].x -= 2

  
  nodes[0].fills = [{ type: "SOLID", color: HSBToRGB(i * (360 / 500), 100, 50) }]

  i = (i + 1) % 500
}