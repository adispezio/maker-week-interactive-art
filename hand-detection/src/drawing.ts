import simplify from "./simplify";

type KeyPoint = {
  // Coords are screen pixels, x in 0..640 and y in 0..480
  x: number;
  y: number;
  name: string;
};

type KeyPoint3D = {
  // Coords are like, `0.06` and stuff? No idea what the axes are
  x: number;
  y: number;
  z: number;
  name: string;
};

type Hand = {
  keypoints: Array<KeyPoint>;
  keypoints3D: Array<KeyPoint3D>;
  score: number;
  handedness: "Left" | "Right";
};

enum KeyPointID {
  Wrist = 0,
  ThumbCmc,
  ThumbMcp,
  ThumbIp,
  ThumbTip,
  IndexFingerMcp,
  IndexFingerPip,
  IndexFingerDip,
  IndexFingerTip,
  MiddleFingerMcp,
  MiddleFingerPip,
  MiddleFingerDip,
  MiddleFingerTip,
  RingFingerMcp,
  RingFingerPip,
  RingFingerDip,
  RingFingerTip,
  PinkyFingerMcp,
  PinkyFingerPip,
  PinkyFingerDip,
  PinkyFingerTip,
}

const ws = new WebSocket("ws://localhost:16001");

function distance(p1: { x: number; y: number }, p2: { x: number; y: number }) {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

function distance3D(
  p1: { x: number; y: number; z: number },
  p2: { x: number; y: number; z: number }
) {
  return Math.sqrt(
    (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2 + (p1.z - p2.z) ** 2
  );
}

function copyPoint(out: [number, number], p: [number, number]) {
  out[0] = p[0];
  out[1] = p[1];
  return out;
}

// From chaikin-smooth NPM package
function chaikinSmooth(input: Array<[number, number]>) {
  const output = [];

  if (input.length > 0) output.push(copyPoint([0, 0], input[0]));

  for (var i = 0; i < input.length - 1; i++) {
    var p0 = input[i];
    var p1 = input[i + 1];
    var p0x = p0[0],
      p0y = p0[1],
      p1x = p1[0],
      p1y = p1[1];

    var Q = [0.75 * p0x + 0.25 * p1x, 0.75 * p0y + 0.25 * p1y];
    var R = [0.25 * p0x + 0.75 * p1x, 0.25 * p0y + 0.75 * p1y];
    output.push(Q);
    output.push(R);
  }
  if (input.length > 1) output.push(copyPoint([0, 0], input[input.length - 1]));

  return output;
}

// { [0]: null | { id: "...", coords: [[x, y], ...] } }
let allLines = {};
let prevHandCount = 0;

export function handleFrame(hands: Array<Hand>, ctx: CanvasRenderingContext2D) {
  hands = (hands || []).filter((hand) => Object.keys(hand).length > 0);

  if (hands.length < prevHandCount) {
    for (let handIndex = hands.length; handIndex < prevHandCount; handIndex++) {
      delete allLines[handIndex];
      ws.send(
        JSON.stringify({
          type: "presence",
          id: handIndex,
          gone: true,
        })
      );
    }
  }
  prevHandCount = hands.length;

  for (const [handIndex, hand] of hands.entries()) {
    if (hand.keypoints == null) {
      allLines[handIndex] = null;
      continue;
    }

    const indexTip = hand.keypoints[KeyPointID.IndexFingerTip];

    const indexDip3D = hand.keypoints3D[KeyPointID.IndexFingerDip];
    const indexTip3D = hand.keypoints3D[KeyPointID.IndexFingerTip];
    const middleTip3D = hand.keypoints3D[KeyPointID.MiddleFingerTip];

    // Regardless of whether they're gesturing, send a message containing the
    // indexTip's location for presence purposes
    ws.send(
      // TODO: Add stable hand id
      JSON.stringify({
        type: "presence",
        id: handIndex,
        point: [indexTip.x, indexTip.y],
      })
    );

    if (
      distance3D(indexTip3D, middleTip3D) <=
      3 * distance(indexTip3D, indexDip3D)
    ) {
      allLines[handIndex] = null;
      continue;
    }

    if (allLines[handIndex] == null) {
      const id = Math.floor(Math.random() * 1000000);
      allLines[handIndex] = { id, points: [] };
    }
    const line = allLines[handIndex];

    line.points.push([indexTip.x, indexTip.y]);

    let smoothedPoints = line.points;
    smoothedPoints = simplify(smoothedPoints, 5, true);
    smoothedPoints = chaikinSmooth(smoothedPoints);
    smoothedPoints = chaikinSmooth(smoothedPoints);

    // Send message containing this line's updated geometry
    ws.send(
      JSON.stringify({ type: "line", id: line.id, points: smoothedPoints })
    );

    // Render debug visualization
    ctx.beginPath();
    ctx.moveTo(smoothedPoints[0][0], smoothedPoints[0][1]);
    for (const point of smoothedPoints.slice(1)) {
      ctx.lineTo(point[0], point[1]);
    }
    ctx.stroke();
  }
}
