figma.showUI(__html__);
figma.ui.hide();

const bounds = figma.viewport.bounds;

const strokeWeight = 5;
const presenceCircleSize = 15;

// Maps from remote id -> Figma id
const lineIdMap: Record<number, string> = {};
const handIdMap: Record<number, Presence> = {};

// Maps from msg ID to a random color.
type RGBType = {
  r: number;
  g: number;
  b: number;
};
const msgIdToRandomColor: Record<number, RGBType> = {};

type Message =
  | {
      type: "line";
      id: number;
      handId: number;
      points: Array<[number, number]>;
    }
  | { type: "presence"; id: number; point: [number, number] }
  | { type: "presence"; id: number; gone: true }
  | { type: "peace"; id: number; point: [number, number] };

function cameraPointToFigmaPoint(point: [number, number]): [number, number] {
  return [
    Math.round(((640 - point[0]) / 640) * bounds.width),
    Math.round((point[1] / 480) * bounds.height),
  ];
}

const getRandomColor = () => {
  const r = Math.random();
  const g = Math.random();
  const b = Math.random();
  return { r, g, b };
};

const msgToHandId = (msg: Message) => {
  if (msg.type === "presence") return msg.id;
  if (msg.type === "line") return msg.handId;
};

const msgToRandomColor = (msg: Message): RGBType => {
  const handId = msgToHandId(msg);
  if (handId == null)
    return {
      r: 1,
      g: 1,
      b: 1,
    };

  const color = msgIdToRandomColor[handId];
  if (color) return color;

  const randomColor = getRandomColor();
  msgIdToRandomColor[handId] = randomColor;
  return randomColor;
};

// Gesture detection stuff
enum PeaceState {
  DEFAULT,
  TRIGGERED_OBJECT,
  PLACED_OBJECT,
  WAIT_FOR_DELAY,
}
let peaceState = PeaceState.DEFAULT;
let lastNormalizedPointForPeace: number[];
let peaceObject : ComponentNode

/////// images

const componentHashes = [
  '3841da106e54d554743f7b451a16c0a85fe539fd',
  'ba350bfa63bb11fd724f216635d89ecae4d9f402'
]

/////////////////////////

figma.ui.onmessage = (msg: Message) => {
  const randomColor = msgToRandomColor(msg);

  if (msg.type === "presence") {
    let presence: Presence;

    // If we previously created a circle for the same hand, update it
    if (handIdMap[msg.id] != null) {
      presence = handIdMap[msg.id];
    } else {
      presence = new Presence(randomColor);
      handIdMap[msg.id] = presence;
    }

    if ("gone" in msg) {
      presence.node.remove();
      delete handIdMap[msg.id];
    } else {
      const [x, y] = cameraPointToFigmaPoint(msg.point);
      presence.setX(bounds.x + x - presenceCircleSize / 2);
      presence.setY(bounds.y + y - presenceCircleSize / 2);
      flying.map((node) => node.interactWithPresenceAt(presence));
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
          color: randomColor,
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

  if (msg.type === "peace") {
    const normalizedPoint = [(640 - msg.point[0]) / 640, msg.point[1] / 480];
    // x: [left, right] => [640, 0]
    // y: [top, down] => [0, 480]
    // convert points to [0, 1][0, 1]
    const viewportPoint = [
      normalizedPoint[0] * bounds.width + bounds.x - 100,
      normalizedPoint[1] * bounds.height + bounds.y - 100,
    ];

    // States
    // DEFAULT
    // TRIGGERED_OBJECT --> we won't recognize anything for a bit
    // PLACED_OBJECT -> go back to default only if we are far away
    switch (peaceState) {
      case PeaceState.DEFAULT: {
        // We got a gesture and we haven't decided to place something yet!
        // Let's trigger something and register the point we triggered it at.
        lastNormalizedPointForPeace = normalizedPoint;
        peaceState = PeaceState.TRIGGERED_OBJECT;

        // Create a new object to follow the hand!
        //peaceObject = figma.createNodeFromSvg(peaceSvg);
        const randomNumber = Math.floor(Math.random() * componentHashes.length);
        figma.importComponentByKeyAsync(componentHashes[randomNumber]).then((newComponent) => {
          peaceObject = newComponent.clone()
          peaceObject.x = viewportPoint[0];
          peaceObject.y = viewportPoint[1];

          setTimeout(function () {
            if (peaceState == PeaceState.TRIGGERED_OBJECT) {
              // Once we place the item, update the state.
              peaceObject.rescale(1.5);
              peaceState = PeaceState.PLACED_OBJECT;
            }
          }, 1000);
        })

        break;
      }
      case PeaceState.TRIGGERED_OBJECT: {
        // We have triggered setTimeout but it hasn't triggered yet. update the position of the object created
        if (peaceObject != null) {
          peaceObject.x = viewportPoint[0];
          peaceObject.y = viewportPoint[1];
        }
      }
      case PeaceState.PLACED_OBJECT: {

        // We have now placed an object. we will now check the positions to ensure they are far away.
        if (lastNormalizedPointForPeace != null) {
          var a = lastNormalizedPointForPeace[0] - normalizedPoint[0];
          var b = lastNormalizedPointForPeace[1] - normalizedPoint[1];

          const sqLength = a * a + b * b;
          if (sqLength > 0.02) {
            // go back to default after a delay, and sit in a dummy state.
            peaceState = PeaceState.WAIT_FOR_DELAY;
            setTimeout(function () {
              peaceState = PeaceState.DEFAULT;
            }, 300);
          }
        }
      }
      case PeaceState.WAIT_FOR_DELAY: {
        // We have triggered setTimeout but it hasn't done anything yet. don't do anything here.
      }
    }
  }
};

class Presence {
  node: EllipseNode;
  vx: number = 0;
  vy: number = 0;

  constructor(color: { r: number; g: number; b: number }) {
    this.node = figma.createEllipse();
    this.node.resize(presenceCircleSize, presenceCircleSize);
    this.node.fills = [
      {
        type: "SOLID",
        color,
      },
    ];
  }

  setX(x: number) {
    const rawVx = x - this.node.x;
    const smoothedVx = lerp(this.vx, rawVx, 0.1);
    this.vx = smoothedVx;
    this.node.x = x;
  }

  setY(y: number) {
    const rawVy = y - this.node.y;
    const smoothedVy = lerp(this.vy, rawVy, 0.1);
    this.vy = smoothedVy;
    this.node.y = y;
  }
}

class FlyingNode {
  node: DefaultShapeMixin;
  interactingPresences: Set<string> = new Set();
  vxInitial: number;
  vyInitial: number;
  vx: number;
  vy: number;

  constructor() {
    const whichShape = 3 * Math.random();
    if (whichShape < 1) {
      this.node = figma.createRectangle();
    } else {
      this.node = figma.createEllipse();
    }
    // this.node.fills = [{ "type": "SOLID", "color": HSBToRGB(360 * Math.random(), 100, 50)}]
    const size = 75 + 100 * Math.random();
    this.node.resize(size, size);
    this.node.x = bounds.x + bounds.width * Math.random() - size / 2;
    this.node.y = bounds.y + bounds.height * Math.random() - size / 2;
    this.vx = this.vxInitial =
      3 + 3 * Math.random() * (2 * Math.random() < 1 ? 1 : -1);
    this.vy = this.vyInitial =
      3 + 3 * Math.random() * (2 * Math.random() < 1 ? 1 : -1);
  }

  step() {
    this.node.x =
      bounds.x + mod(this.node.x + this.vx - bounds.x, bounds.width);
    this.node.y =
      bounds.y + mod(this.node.y + this.vy - bounds.y, bounds.height);
    const vxSameSign = this.vxInitial > 0 == this.vx > 0;
    const vySameSign = this.vyInitial > 0 == this.vy > 0;
    const dampingFactor = 0.0005;
    this.vx = lerp(
      this.vx,
      vxSameSign ? this.vxInitial : -this.vxInitial,
      dampingFactor
    );
    this.vy = lerp(
      this.vy,
      vySameSign ? this.vyInitial : -this.vyInitial,
      dampingFactor
    );
  }

  interactWithPresenceAt(presence: Presence) {
    const presenceR = presence.node.width / 2;
    const thisNodeR = this.node.width / 2;
    const distBetween = dist(
      presence.node.x + presenceR,
      presence.node.y + presenceR,
      this.node.x + thisNodeR,
      this.node.y + thisNodeR
    );
    const tolerance = 10;
    if (
      !this.interactingPresences.has(presence.node.id) &&
      distBetween <= presenceR + thisNodeR
    ) {
      this.interactingPresences.add(presence.node.id);
      this.node.fills = [
        { type: "SOLID", color: HSBToRGB(360 * Math.random(), 100, 50) },
      ];
      this.vx = lerp(this.vx, presence.vx, 0.5);
      this.vy = lerp(this.vy, presence.vy, 0.5);
    } else if (
      this.interactingPresences.has(presence.node.id) &&
      distBetween > presenceR + thisNodeR + tolerance
    ) {
      this.interactingPresences.delete(presence.node.id);
    }
  }
}

const flying: FlyingNode[] = [];
async function setup() {
  flying.push(new FlyingNode());
  flying.push(new FlyingNode());
  flying.push(new FlyingNode());
  flying.push(new FlyingNode());
  flying.push(new FlyingNode());
  flying.push(new FlyingNode());
  flying.push(new FlyingNode());
}

async function draw() {
  flying.map((node) => node.step());
}

loop();
async function loop() {
  setup();
  while (true) {
    draw();
    const DRAW_DELAY_MS = 5;
    await new Promise((r) => setTimeout(r, DRAW_DELAY_MS));
  }

  figma.closePlugin();
}

const lerp = (v0: number, v1: number, t: number): number => {
  return v0 * (1 - t) + v1 * t;
};

const dist = (x0: number, y0: number, x1: number, y1: number): number => {
  return Math.sqrt(Math.pow(x0 - x1, 2) + Math.pow(y0 - y1, 2));
};

// mod that wraps negatives into positives, like the designer
const mod = (l: number, r: number) => {
  return ((l % r) + r) % r;
};

const HSBToRGB = (
  h: number,
  s: number,
  b: number
): { r: number; g: number; b: number } => {
  s /= 100;
  b /= 100;
  const k = (n: number) => (n + h / 60) % 6;
  const f = (n: number) =>
    b * (1 - s * Math.max(0, Math.min(k(n), 4 - k(n), 1)));
  return { r: f(5), g: f(3), b: f(1) };
};
