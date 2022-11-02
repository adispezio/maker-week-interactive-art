figma.showUI(__html__);
figma.ui.hide();

const bounds = figma.viewport.bounds;

const strokeWeight = 5;
const presenceCircleSize = 15;

// Maps from remote id -> Figma id
const lineIdMap: Record<number, string> = {};
const handIdMap: Record<number, string> = {};

// Maps from msg ID to a random color.
type RGBType = {
  r: number,
  g: number,
  b: number,
}
const msgIdToRandomColor: Record<number, RGBType> = {};

type Message =
  | { type: "line"; id: number; handId: number; points: Array<[number, number]> }
  | { type: "presence"; id: number; point: [number, number] }
  | { type: "presence"; id: number; gone: true };

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
  return { r, g, b }
}

const msgToHandId = (msg: Message) => {
  if (msg.type === "presence") return msg.id;
  if (msg.type === "line") return msg.handId;
}

const msgToRandomColor = (msg: Message): RGBType => {
  const handId = msgToHandId(msg);
  if (handId == null) return {
    r: 1,
    g: 1,
    b: 1,
  };

  const color = msgIdToRandomColor[handId];
  if (color) return color;

  const randomColor = getRandomColor();
  msgIdToRandomColor[handId] = randomColor;
  return randomColor;
}

figma.ui.onmessage = (msg: Message) => {
  const randomColor = msgToRandomColor(msg);

  if (msg.type === "presence") {
    let ellipse;

    // If we previously created a circle for the same hand, update it
    if (handIdMap[msg.id] != null) {
      ellipse = figma.getNodeById(handIdMap[msg.id]) as EllipseNode;
    } else {
      ellipse = figma.createEllipse();
      ellipse.resize(presenceCircleSize, presenceCircleSize);
      ellipse.fills = [
        {
          type: "SOLID",
          color: randomColor,
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
};
