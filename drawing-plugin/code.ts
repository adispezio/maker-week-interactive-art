figma.showUI(__html__);
figma.ui.hide();

const bounds = figma.viewport.bounds;

const strokeWeight = 5;
const presenceCircleSize = 15;

// Maps from remote id -> Figma id
const lineIdMap: Record<number, string> = {};
const handIdMap: Record<number, string> = {};

type Message =
  | { type: "line"; id: number; points: Array<[number, number]> }
  | { type: "presence"; id: number; point: [number, number] }
  | { type: "presence"; id: number; gone: true };

function cameraPointToFigmaPoint(point: [number, number]): [number, number] {
  return [
    Math.round(((640 - point[0]) / 640) * bounds.width),
    Math.round((point[1] / 480) * bounds.height),
  ];
}

figma.ui.onmessage = (msg: Message) => {
  if (msg.type === "presence") {
    let ellipse: EllipseNode;

    // If we previously created a circle for the same hand, update it
    if (handIdMap[msg.id] != null) {
      ellipse = figma.getNodeById(handIdMap[msg.id]) as EllipseNode;
    } else {
      ellipse = figma.createEllipse();
      ellipse.resize(presenceCircleSize, presenceCircleSize);
      ellipse.fills = [
        {
          type: "SOLID",
          color: { r: 1, g: 0, b: 0 },
        },
      ];
      handIdMap[msg.id] = ellipse.id;
    }

    if ("gone" in msg) {
      ellipse.remove();
      delete handIdMap[msg.id];
    } else {
      const [x, y] = cameraPointToFigmaPoint(msg.point);
      ellipse.x = bounds.x + x - presenceCircleSize / 2;
      ellipse.y = bounds.y + y - presenceCircleSize / 2;
      flying.map(node => node.interactWithPresenceAt(bounds.x + x, bounds.y + y, presenceCircleSize / 2, ellipse.id))
    }
  }

  if (msg.type === "line") {
    let vector;

    // If we previously created a vector for the same line, update it
    if (lineIdMap[msg.id] != null) {
      vector = figma.getNodeById(lineIdMap[msg.id]) as VectorNode;
    } else {
      vector = figma.createVector();
      vector.strokeWeight = strokeWeight;
      vector.strokeCap = "ROUND";
      vector.strokes = [
        {
          type: "SOLID",
          color: { r: 1, g: 0, b: 0 },
        },
      ];
      lineIdMap[msg.id] = vector.id;
    }

    vector.relativeTransform = [
      [1, 0, bounds.x],
      [0, 1, bounds.y],
    ];

    const data =
      "M " +
      msg.points
        .map((point) => cameraPointToFigmaPoint(point).join(" "))
        .join(" L ");

    vector.vectorPaths = [
      {
        windingRule: "EVENODD",
        data,
      },
    ];
  }
};

class FlyingNode {
  node: DefaultShapeMixin
  interactingPresences: Set<string> = new Set()
  vx: number
  vy: number

  constructor() {
    const whichShape = 3 * Math.random()
    if (whichShape < 1) {
      this.node = figma.createRectangle()
    } else {
      this.node = figma.createEllipse()
    }
    // this.node.fills = [{ "type": "SOLID", "color": HSBToRGB(360 * Math.random(), 100, 50)}]
    const size = 75 + 100 * Math.random()
    this.node.resize(size, size)
    this.node.x = bounds.x + bounds.width * Math.random() - size / 2
    this.node.y = bounds.y + bounds.height * Math.random() - size / 2
    this.vx = 3 + 3 * Math.random() * (2 * Math.random() < 1 ? 1 : -1)
    this.vy = 3 + 3 * Math.random() * (2 * Math.random() < 1 ? 1 : -1)
  }

  step() {
    this.node.x = bounds.x + (this.node.x + this.vx - bounds.x) % bounds.width
    this.node.y = bounds.y + (this.node.y + this.vy - bounds.y) % bounds.height
  }

  interactWithPresenceAt(x: number, y: number, r: number, handId: string) {
    const thisNodeR = this.node.width / 2
    const distBetween = dist(x, y, this.node.x + thisNodeR, this.node.y + thisNodeR)
    const tolerance = 10
    if (!this.interactingPresences.has(handId) && distBetween <= r + thisNodeR) {
      this.interactingPresences.add(handId)
      this.node.fills = [{ "type": "SOLID", "color": HSBToRGB(360 * Math.random(), 100, 50)}]
    } else if (this.interactingPresences.has(handId) && distBetween > r + thisNodeR + tolerance) {
      this.interactingPresences.delete(handId)
    }
  }

}

const flying: FlyingNode[] = []
async function setup() {
  flying.push(new FlyingNode())
  flying.push(new FlyingNode())
  flying.push(new FlyingNode())
  flying.push(new FlyingNode())
  flying.push(new FlyingNode())
  flying.push(new FlyingNode())
  flying.push(new FlyingNode())
}

async function draw() {
  flying.map(node => node.step())
}

loop()
async function loop() {
  setup()
  while (true) {
    draw()
    const DRAW_DELAY_MS = 5
    await new Promise(r => setTimeout(r, DRAW_DELAY_MS))
  }

  figma.closePlugin()
}

const dist = (x0: number, y0: number, x1: number, y1: number): number => {
  return Math.sqrt(Math.pow(x0 - x1, 2) + Math.pow(y0 - y1, 2))
}

const HSBToRGB = (h: number, s: number, b: number): {r: number, g: number, b: number} => {
  s /= 100;
  b /= 100;
  const k = (n: number) => (n + h / 60) % 6;
  const f = (n: number) => b * (1 - s * Math.max(0, Math.min(k(n), 4 - k(n), 1)));
  return {r: f(5), g: f(3), b: f(1)};
}