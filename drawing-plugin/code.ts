figma.showUI(__html__);
figma.ui.hide();

const bounds = figma.viewport.bounds;

const strokeWeight = 5;
const maxLinesForThisHub = 5;
const maxStickersForThisHub = 5;

// Maps from remote id -> Figma id
const lineIdMap: Record<number, string> = {};
const lineToTrailData: Record<number, TrailData> = {};
const handIdMap: Record<number, Presence> = {};

let chronologicalRemoteIdsForLine: number[] = [];
let chronologicalInstanceIdsForSticker: string[] = [];

// Maps from msg ID to a random color.
type RGBType = {
  r: number;
  g: number;
  b: number;
};
const msgIdToRandomColor: Record<number, RGBType> = {};

type LineId = number;
type HandId = number;

type Message =
  | {
      type: "line";
      id: LineId;
      handId: HandId;
      points: Array<[number, number]>;
    }
  | { type: "presence"; id: HandId; point: [number, number] }
  | { type: "presence"; id: HandId; gone: true }
  | { type: "peace"; id: HandId; point: [number, number] };

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

type Color = {r: number, g: number, b: number}

// Gesture detection stuff
enum PeaceState {
  DEFAULT,
  TRIGGERED_OBJECT,
  PLACED_OBJECT,
  WAIT_FOR_DELAY,
}
let peaceState = PeaceState.DEFAULT;
let lastNormalizedPointForPeace: number[];
let peaceObject : InstanceNode

/////// images

const componentHashes = [
  '3841da106e54d554743f7b451a16c0a85fe539fd',
  'ba350bfa63bb11fd724f216635d89ecae4d9f402'
]

const cursorHashesToColor: Record<string, Color> = {
  'a425fd9e401d40f98b57066fdd24dacca0d4362e': {r: 255 / 255, g: 199 / 255, b: 0 / 255},
  'b8aa2a4b1c697218c65e1c541afc3321773c3273': {r: 242 / 255, g: 78 / 255, b: 30 / 255},
  'c4d985d91467ca64a1291f00443335097b6603a6': {r: 238 / 255, g: 70 / 255, b: 211 / 255},
  '7c22bdc624f9bfa531428546115adc90691c8f44': {r: 85 / 255, g: 81 / 255, b: 255 / 255},
  '9c38ec1a541dc1e14a9ff2d959cb6048c4d58297': {r: 144 / 255, g: 124 / 255, b: 255 / 255},
  '9d27eb1674e03a863c493216bd193070dd83aa46': {r: 27 / 255, g: 196 / 255, b: 125 / 255},
  'e9dd5713e783b78adff530bb77354b02939ae0fd': {r: 0 / 255, g: 181 / 255, b: 206 / 255},
  '984011f316b58fb6780fc782247783629295451f': {r: 24 / 255, g: 160 / 255, b: 251 / 255},
  '88833500a5a512d9fa86a6f53cdb527d48fb878b': {r: 15 / 255, g: 169 / 255, b: 88 / 255},
  'd8cb2d27ebd52eecbd9cb7a35d08dbda1f20bf7e': {r: 151 / 255, g: 71 / 255, b: 255 / 255},
  '95713294623575c51e0b52514193d5616afe6a90': {r: 132 / 255, g: 132 / 255, b: 132 / 255},
  '1f4b05c45ba610f02028e5c23fced8f37e32fa4b': {r: 210 / 255, g: 124 / 255, b: 44 / 255},
}

/////////////////////////

figma.ui.onmessage = (msg: Message) => {
  
  if (msg.type === "presence") {
    let presence: Presence;
    
    // If we previously created a circle for the same hand, update it
    if (handIdMap[msg.id] != null) {
      presence = handIdMap[msg.id];
    } else {
      const randomColorKey = Object.keys(cursorHashesToColor)[Math.floor(Math.random() * Object.keys(cursorHashesToColor).length)]
      presence = new Presence(randomColorKey);
      handIdMap[msg.id] = presence;
    }

    if ("gone" in msg) {
      presence.node?.remove();
      delete handIdMap[msg.id];
    } else {
      const [x, y] = cameraPointToFigmaPoint(msg.point);
      presence.setX(bounds.x + x - presence.cursorSize / 2);
      presence.setY(bounds.y + y - presence.cursorSize / 2);
      flying.map((node) => node.interactWithPresenceAt(presence));
    }
  }

  if (msg.type === "line") {
    const presence = handIdMap[msg.handId]
    renderVector(msg.id, msg.points, cursorHashesToColor[presence.cursorHash])
    if (presence.node) {
      figma.currentPage.appendChild(presence.node)
    }
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
          peaceObject = newComponent.createInstance()

          chronologicalInstanceIdsForSticker.push(peaceObject.id)
          
          peaceObject.x = viewportPoint[0];
          peaceObject.y = viewportPoint[1];

          setTimeout(function () {
            if (peaceState == PeaceState.TRIGGERED_OBJECT) {
              // Once we place the item, update the state.
              peaceObject.x -= peaceObject.width/4
              peaceObject.y -= peaceObject.height/4
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

const renderVector = (
  msgId: number, 
  points: [number, number][], 
  color: Color = {r: 255, g: 255, b: 255}
) => {
  let vector: VectorNode;
  // If we previously created a vector for the same line, update it
  if (lineIdMap[msgId] != null) {
    vector = figma.getNodeById(lineIdMap[msgId]) as VectorNode;
  } else {
    vector = figma.createVector();
    vector.strokeWeight = strokeWeight;
    vector.strokeCap = "ROUND";
    vector.strokes = [
      {
        type: "SOLID",
        color: color,
      },
    ];
    lineIdMap[msgId] = vector.id;
    chronologicalRemoteIdsForLine.push(msgId);
    lineToTrailData[msgId] = {points: []}
  }

  vector.relativeTransform = [
    [1, 0, bounds.x],
    [0, 1, bounds.y],
  ];

  const trailData = lineToTrailData[msgId]
  trailData.points = points
  const data =
    "M " +
    points
      .map((point) => cameraPointToFigmaPoint(point).join(" "))
      .join(" L ");

  vector.vectorPaths = points.length == 0 ? [] : [
    {
      windingRule: "EVENODD",
      data,
    },
  ];
}

class Presence {
  node?: InstanceNode;
  cursorHash: string;
  vx: number = 0;
  vy: number = 0;
  cursorSize = 32;

  constructor(cursorHash: string) {
    this.cursorHash = cursorHash
    figma.importComponentByKeyAsync(cursorHash).then((newComponent) => {
      this.node = newComponent.createInstance()
    })
  }

  setX(x: number) {
    if (!this.node) {return} 
    const rawVx = x - this.node.x - this.cursorSize / 2;
    const smoothedVx = lerp(this.vx, rawVx, 0.1);
    this.vx = smoothedVx;
    this.node.x = x;
  }
  
  setY(y: number) {
    if (!this.node) {return} 
    const rawVy = y - this.node.y - this.cursorSize / 2;
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
    if (!presence.node) {return}
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

type TrailData = {
  points: [number, number][]
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

const eraseOldTrails = () => {
  const remoteIdsWereDeleted: Set<number> = new Set()
  for (let i = 0; i < chronologicalRemoteIdsForLine.length - maxLinesForThisHub; i++) {
    const msgId = chronologicalRemoteIdsForLine[i]
    // Erase the next point in the trail if the presence is gone
    const trailData = lineToTrailData[msgId]
    if (!handIdMap[msgId] && trailData.points.length > 0) {
      trailData.points = trailData.points.slice(1)
      renderVector(Number(msgId), trailData.points)
    } else if (!handIdMap[msgId] && trailData.points.length == 0) {
      figma.getNodeById(lineIdMap[msgId])?.remove()
      delete lineIdMap[msgId]
      remoteIdsWereDeleted.add(msgId)
    }
  }

  chronologicalRemoteIdsForLine = chronologicalRemoteIdsForLine.filter(id => !remoteIdsWereDeleted.has(id))
}

const eraseOldStickers = () => {
  const instanceIdsWereDeleted: Set<string> = new Set()
  for (let i = 0; i < chronologicalInstanceIdsForSticker.length - maxStickersForThisHub; i++) {
    const instanceId = chronologicalInstanceIdsForSticker[i]
    // Fade out the sticker
    const sticker = figma.getNodeById(instanceId) as InstanceNode
    if (sticker.opacity <= 0.04) {
      sticker.remove()
      instanceIdsWereDeleted.add(instanceId)
    } else {
      sticker.opacity -= 0.04
    }
  }

  chronologicalInstanceIdsForSticker = chronologicalInstanceIdsForSticker.filter(id => !instanceIdsWereDeleted.has(id))
}

async function draw() {
  flying.forEach((node) => node.step());
  eraseOldTrails()
  eraseOldStickers()
}

loop();
async function loop() {
  // setup();
  while (true) {
    draw();
    const DRAW_DELAY_MS = 50;
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
