figma.showUI(__html__);
figma.ui.hide();

const bounds = figma.viewport.bounds;

const strokeWeight = 5;
const presenceCircleSize = 15;

// Maps from remote id -> Figma id
const lineIdMap: Record<number, string> = {};
const handIdMap: Record<number, string> = {};

type Message =
| { type: 'line', id: number, points: Array<[number, number]> }
| { type: 'presence', id: number, point: [number, number], gone?: boolean }
;

function cameraPointToFigmaPoint([x, y]: [number, number]): [number, number] {
  return [
    Math.round(((640 - x) / 640) * bounds.width),
    Math.round((y / 480) * bounds.height),
  ];
}

figma.ui.onmessage = (msg: Message) => {
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
          color: { r: 1, g: 0, b: 0 },
        },
      ];
      handIdMap[msg.id] = ellipse.id;
    }

    const [x, y] = cameraPointToFigmaPoint(msg.point);
    ellipse.x = bounds.x + x - presenceCircleSize / 2;
    ellipse.y = bounds.y + y - presenceCircleSize / 2;

    if (msg.gone) {
      ellipse.remove();
    }
  }

  if (msg.type === "line") {
    let vector;

    // If we previously created a vector for the same line, delete it
    if (lineIdMap[msg.id] != null) {
      vector = figma.getNodeById(lineIdMap[msg.id]) as VectorNode;
      vector.remove();
    }

    vector = figma.createVector();
    vector.relativeTransform = [
      [1, 0, bounds.x],
      [0, 1, bounds.y],
    ];
    vector.strokeWeight = strokeWeight;
    vector.strokeCap = "ROUND";
    vector.strokes = [
      {
        type: "SOLID",
        color: { r: 1, g: 0, b: 0 },
      },
    ];
    lineIdMap[msg.id] = vector.id;

    const data =
      "M " +
      msg.points
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
