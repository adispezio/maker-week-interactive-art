figma.showUI(__html__);
figma.ui.hide();

const bounds = figma.viewport.bounds;

const strokeWeight = 15;
const cursorScale = 2;

// Config controlled by the video UI; see `hand-detection/src/shared/params.js`.
type DrawingConfig = {
  maxLinesPersisting: number;
  maxStickersPersisting: number;
};

let drawingConfig: DrawingConfig = {
  maxLinesPersisting: 15,
  maxStickersPersisting: 20,
};

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

enum PresenceMode {
  Cursor = "cursor",
  Pencil = "pencil",
}

type Message =
  | {
      type: "line";
      id: LineId;
      handId: HandId;
      points: Array<[number, number]>;
    }
  | {
      type: "presence";
      id: HandId;
      point: [number, number];
      cursorName: string;
      mode: PresenceMode;
    }
  | { type: "presence"; id: HandId; gone: true }
  | { type: "peace"; id: HandId; point: [number, number] }
  | { type: "config"; config: DrawingConfig };

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

type Color = { r: number; g: number; b: number };

// Gesture detection stuff
enum PeaceState {
  DEFAULT,
  CREATING_OBJECT,
  TRIGGERED_OBJECT,
  PLACED_OBJECT,
  WAIT_FOR_DELAY,
}
let peaceState = PeaceState.DEFAULT;
let lastNormalizedPointForPeace: number[];
let peaceObjectId: string = "-1:-1";

/////// images

const componentHashes = [
  "3841da106e54d554743f7b451a16c0a85fe539fd", // peace
  "ba350bfa63bb11fd724f216635d89ecae4d9f402", // slay
  "2c83518d4dd76855bf5f63e3943e365d1c018b0d", // taco
  "0d0505bc86661da814026b1ddd57ba6edb2dc5a9", // flan
  "020958c2bb11fab15c03df71f173adc0a6176915", // onigiri
  "8907f725c510fbec4a97f681b803f8d666f09633", // golden gate
  "a1d77250c56697bf34bf1fd45b95b23b229cf7ba", // golden gate 2
  "dbd2e03ac5327502b78e6d987ef534e453843292", // big apple
  "848f91b2ddf7b633fd69b5674c6df21b5c968cde", // statue liberty
  "177b4e9e2b8c9643139dd26b1ca201ec21d817a2", // empire state
  "14c73ac92e597c6127117716c9b2b8614a0cb04d", // rock on
  "07279b98a37715de081a3652dc78964a1ee79bea", // party time
  "7f33b657d888f46983c30374cf7eee231ffd15f7", // lets jam dino
];

const colors: Array<Color> = [
  { r: 255 / 255, g: 199 / 255, b: 0 / 255 },
  { r: 242 / 255, g: 78 / 255, b: 30 / 255 },
  { r: 238 / 255, g: 70 / 255, b: 211 / 255 },
  { r: 85 / 255, g: 81 / 255, b: 255 / 255 },
  { r: 144 / 255, g: 124 / 255, b: 255 / 255 },
  { r: 27 / 255, g: 196 / 255, b: 125 / 255 },
  { r: 0 / 255, g: 181 / 255, b: 206 / 255 },
  { r: 24 / 255, g: 160 / 255, b: 251 / 255 },
  { r: 15 / 255, g: 169 / 255, b: 88 / 255 },
  { r: 151 / 255, g: 71 / 255, b: 255 / 255 },
  { r: 132 / 255, g: 132 / 255, b: 132 / 255 },
  { r: 210 / 255, g: 124 / 255, b: 44 / 255 },
];

/////////////////////////

figma.ui.onmessage = (msg: Message) => {
  if (msg.type === "config") {
    drawingConfig = msg.config;
  }

  if (msg.type === "presence") {
    let presence: Presence;

    // If we previously created a circle for the same hand, update it
    if (handIdMap[msg.id] != null) {
      presence = handIdMap[msg.id];
    } else {
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      presence = new Presence(randomColor);
      handIdMap[msg.id] = presence;
    }

    if ("gone" in msg) {
      presence.remove();
      delete handIdMap[msg.id];
    } else {
      presence.setCursorName(msg.cursorName);
      presence.setMode(msg.mode);

      const [x, y] = cameraPointToFigmaPoint(msg.point);
      presence.setX(bounds.x + x);
      presence.setY(bounds.y + y);
      flying.map((node) => node.interactWithPresenceAt(presence));
    }
  }

  if (msg.type === "line") {
    const presence = handIdMap[msg.handId];
    renderVector(msg.id, msg.points, presence.color);
    if (presence.node) {
      figma.currentPage.appendChild(presence.node);
    }
  }

  if (msg.type === "peace") {
    const normalizedPoint = [(640 - msg.point[0]) / 640, msg.point[1] / 480];
    // x: [left, right] => [640, 0]
    // y: [top, down] => [0, 480]
    // convert points to [0, 1][0, 1]
    const viewportPoint = [
      normalizedPoint[0] * bounds.width + bounds.x,
      normalizedPoint[1] * bounds.height + bounds.y,
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
        peaceState = PeaceState.CREATING_OBJECT;

        if (peaceObjectId === "-1:-1") {
          const randomNumber = Math.floor(
            Math.random() * componentHashes.length
          );

          // Create a new instance of a sticker to follow the hand!
          figma
            .importComponentByKeyAsync(componentHashes[randomNumber])
            .then((newComponent) => {
              const peaceObject = newComponent.createInstance();
              peaceObject.x = viewportPoint[0] - peaceObject.width / 2;
              peaceObject.y = viewportPoint[1] - peaceObject.height / 2;

              peaceObjectId = peaceObject.id;
              peaceState = PeaceState.TRIGGERED_OBJECT;

              chronologicalInstanceIdsForSticker.push(peaceObject.id);

              setTimeout(function () {
                if (peaceState == PeaceState.TRIGGERED_OBJECT) {
                  // Once we place the item, update the state.
                  peaceObject.x -= peaceObject.width / 4;
                  peaceObject.y -= peaceObject.height / 4;
                  peaceObject.rescale(1.5);
                  peaceState = PeaceState.PLACED_OBJECT;
                }
              }, 1000);
            });

          break;
        }
      }
      case PeaceState.CREATING_OBJECT: {
        // Waiting for object to be created just in case it takes a while
        break;
      }
      case PeaceState.TRIGGERED_OBJECT: {
        // We have triggered setTimeout but it hasn't triggered yet. update the position of the object created
        const peaceObject = figma.getNodeById(peaceObjectId) as InstanceNode;
        if (peaceObject != null) {
          peaceObject.x = viewportPoint[0] - peaceObject.width / 2;
          peaceObject.y = viewportPoint[1] - peaceObject.height / 2;
        }
        break;
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
              peaceObjectId = "-1:-1";
            }, 300);
          }
        }
        break;
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
  color: Color = { r: 255, g: 255, b: 255 }
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
    lineToTrailData[msgId] = { points: [] };
  }

  vector.relativeTransform = [
    [1, 0, bounds.x],
    [0, 1, bounds.y],
  ];

  const trailData = lineToTrailData[msgId];
  trailData.points = points;
  const data =
    "M " +
    points.map((point) => cameraPointToFigmaPoint(point).join(" ")).join(" L ");

  vector.vectorPaths =
    points.length == 0
      ? []
      : [
          {
            windingRule: "EVENODD",
            data,
          },
        ];
};

class Presence {
  node?: InstanceNode;
  color: RGB;
  x = 0;
  y = 0;
  cursorName: string | null = null;
  mode: PresenceMode = PresenceMode.Cursor;

  constructor(color: RGB) {
    this.color = color;

    (async () => {
      const component = await figma.importComponentByKeyAsync(
        "c6b05cda3de574524f86d89807a2182c692d05be"
      );
      await figma.loadFontAsync({ family: "Inter", style: "Medium" });

      this.node = component.createInstance();
      this.node.scaleFactor = cursorScale;

      const pencil = this.node.findOne(
        (child) => child.name === "pencil"
      ) as BooleanOperationNode;
      pencil.fills = [{ type: "SOLID", color: color }];

      const cursor = this.node.findOne(
        (child) => child.name === "pointer"
      ) as VectorNode;
      cursor.fills = [{ type: "SOLID", color: color }];

      const labelRect = this.node.findOne(
        (child) => child.name === "label"
      ) as RectangleNode;
      labelRect.fills = [{ type: "SOLID", color: color }];

      this.setX(this.x);
      this.setY(this.y);
      this.setMode(this.mode);
      if (this.cursorName) {
        this.setCursorName(this.cursorName);
      }
    })();
  }

  setX(x: number) {
    this.x = x;

    if (this.node) {
      this.node.x = x;
    }
  }

  setY(y: number) {
    this.y = y;

    if (this.node) {
      this.node.y = y;
    }
  }

  setCursorName(cursorName: string) {
    this.cursorName = cursorName;

    if (this.node) {
      const textNode = this.node.findOne(
        (child) => child.type === "TEXT"
      ) as TextNode;
      if (textNode) {
        textNode.characters = this.cursorName;
      }
    }
  }

  setMode(mode: PresenceMode) {
    this.mode = mode;

    if (this.node) {
      const pencilNode = this.node.findOne((child) => child.name === "pencil")!;
      const pointerNode = this.node.findOne(
        (child) => child.name === "pointer"
      )!;

      if (this.mode === PresenceMode.Cursor) {
        pencilNode.visible = false;
        pointerNode.visible = true;
      } else {
        pencilNode.visible = true;
        pointerNode.visible = false;
      }
    }
  }

  remove() {
    this.node?.remove();
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
    if (!presence.node) {
      return;
    }
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
    } else if (
      this.interactingPresences.has(presence.node.id) &&
      distBetween > presenceR + thisNodeR + tolerance
    ) {
      this.interactingPresences.delete(presence.node.id);
    }
  }
}

type TrailData = {
  points: [number, number][];
};

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
  const remoteIdsWereDeleted: Set<number> = new Set();
  for (
    let i = 0;
    i < chronologicalRemoteIdsForLine.length - drawingConfig.maxLinesPersisting;
    i++
  ) {
    const msgId = chronologicalRemoteIdsForLine[i];
    // Erase the next point in the trail if the presence is gone
    const trailData = lineToTrailData[msgId];
    if (!handIdMap[msgId] && trailData.points.length > 0) {
      trailData.points = trailData.points.slice(1);
      renderVector(Number(msgId), trailData.points);
    } else if (!handIdMap[msgId] && trailData.points.length == 0) {
      figma.getNodeById(lineIdMap[msgId])?.remove();
      delete lineIdMap[msgId];
      remoteIdsWereDeleted.add(msgId);
    }
  }

  chronologicalRemoteIdsForLine = chronologicalRemoteIdsForLine.filter(
    (id) => !remoteIdsWereDeleted.has(id)
  );
};

const eraseOldStickers = () => {
  const instanceIdsWereDeleted: Set<string> = new Set();
  for (
    let i = 0;
    i <
    chronologicalInstanceIdsForSticker.length -
      drawingConfig.maxStickersPersisting;
    i++
  ) {
    const instanceId = chronologicalInstanceIdsForSticker[i];
    // Fade out the sticker
    const sticker = figma.getNodeById(instanceId) as InstanceNode;
    if (sticker.opacity <= 0.04) {
      sticker.remove();
      instanceIdsWereDeleted.add(instanceId);
    } else {
      sticker.opacity -= 0.04;
    }
  }

  chronologicalInstanceIdsForSticker =
    chronologicalInstanceIdsForSticker.filter(
      (id) => !instanceIdsWereDeleted.has(id)
    );
};

async function draw() {
  flying.forEach((node) => node.step());
  eraseOldTrails();
  eraseOldStickers();
}

loop();
async function loop() {
  while (true) {
    draw();
    const DRAW_DELAY_MS = 50;
    await new Promise((r) => setTimeout(r, DRAW_DELAY_MS));
  }
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
