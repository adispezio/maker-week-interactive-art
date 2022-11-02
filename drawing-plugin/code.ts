figma.showUI(__html__);
figma.ui.hide();

// Map from remote id -> Figma id
const idMap: Record<number, string> = {};
const bounds = figma.viewport.bounds;

type Message = { type: 'line', id: number, points: Array<[number, number]> };

figma.ui.onmessage = (msg: Message) => {
  if (msg.type === "line") {
    let vector;

    // If we previously created a vector for the same line, delete it
    if (idMap[msg.id] != null) {
      vector = figma.getNodeById(idMap[msg.id]) as VectorNode;
      vector.remove();
    }

    vector = figma.createVector();
    vector.relativeTransform = [
      [1, 0, bounds.x],
      [0, 1, bounds.y],
    ];
    vector.strokeWeight = 5;
    vector.strokeCap = "ROUND";
    vector.strokes = [
      {
        type: "SOLID",
        color: { r: 1, g: 0, b: 0 },
      },
    ];
    idMap[msg.id] = vector.id;

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
