import simplify from "./simplify";
import sortBy from "lodash/sortBy";
import range from "lodash/range";

// What's the largest number of pixels we could expect a fingertip to move in
// one frame?
const MAX_PX_MOVED_PER_FRAME = 100;

// How many frames is a hand allowed to disappear for before coming back?
const MAX_HAND_FRAME_GAP = 10;

// How many frames is a hand allowed to not point before we cut off the line?
const MAX_LINE_FRAME_GAP = 5;

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

type TFHand = {
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

type DrawingHand = {
  id: number;
  point: [number, number];
  lastSeenFrameId: number;
  line: {
    id: number;
    points: Array<[number, number]>;
    lastSeenFrameId: number;
  } | null;
};

let handsById: Record<number, DrawingHand> = {};
let nextHandId = 0;
let nextLineId = 0;
let frameId = 0;

export function handleFrame(
  tfHands: Array<TFHand>,
  ctx: CanvasRenderingContext2D
) {
  frameId++;
  tfHands = (tfHands || []).filter((tfHand) => Object.keys(tfHand).length > 0);

  // First, map the hands we're getting from TensorFlow to our existing state.
  // We can't trust the indices in the array to be stable, so we need to use a
  // heuristic to determine which hand is which:
  // - For each pair of old hand and new hand, calculate the distance between
  //   their index finger tip locations.
  // - Go through those pairs in order of ascending distance.
  // - For each pair, if neither the old nor new hand are already taken, decide
  //   if we think it's a valid mapping based on the distance and the last time
  //   we saw the old hand. If it is valid, record it and remove both hands
  //   from further consideration.
  const handPairs = sortBy(
    Object.entries(handsById).flatMap(([handId, oldHand]) =>
      tfHands.map((newHand, newHandIdx) => {
        const newHandLocation = newHand.keypoints[KeyPointID.IndexFingerTip];
        return {
          handId: Number(handId),
          newHandIdx,
          distance: distance(
            { x: oldHand.point[0], y: oldHand.point[1] },
            newHandLocation
          ),
          location: [newHandLocation.x, newHandLocation.y] as [number, number],
        };
      })
    ),
    (pair) => pair.distance
  );
  const newHandIdxByOldHandId: Record<number, number> = {};
  const oldHandIdByNewHandIdx: Record<number, number> = {};
  const removedHandIds = new Set(Object.keys(handsById).map(Number));
  const newHandIndices = new Set(range(0, tfHands.length));

  for (const { handId, newHandIdx, distance, location } of handPairs) {
    if (newHandIdxByOldHandId[handId] != null) continue;
    if (oldHandIdByNewHandIdx[newHandIdx] != null) continue;

    const oldHand = handsById[handId];
    const framesElapsed = frameId - oldHand.lastSeenFrameId;
    if (distance > framesElapsed * MAX_PX_MOVED_PER_FRAME) {
      continue;
    }

    newHandIdxByOldHandId[handId] = newHandIdx;
    oldHandIdByNewHandIdx[newHandIdx] = handId;
    removedHandIds.delete(handId);
    newHandIndices.delete(newHandIdx);
    oldHand.point = location;
    oldHand.lastSeenFrameId = frameId;
  }

  // For each removed hand that's old enough, send a "gone" message.
  for (const handId of removedHandIds) {
    const oldHand = handsById[handId];
    const framesElapsed = frameId - oldHand.lastSeenFrameId;

    if (framesElapsed > MAX_HAND_FRAME_GAP) {
      delete handsById[handId];
      ws.send(
        JSON.stringify({
          type: "presence",
          id: handId,
          gone: true,
        })
      );
    }
  }

  for (const [tfHandIndex, tfHand] of tfHands.entries()) {
    const indexBase = tfHand.keypoints[KeyPointID.IndexFingerMcp];
    const indexMcp = tfHand.keypoints[KeyPointID.IndexFingerMcp];
    const indexTip = tfHand.keypoints[KeyPointID.IndexFingerTip];
    const middleMcp = tfHand.keypoints[KeyPointID.MiddleFingerMcp];
    const middleTip = tfHand.keypoints[KeyPointID.MiddleFingerTip];

    const wrist3D = tfHand.keypoints3D[KeyPointID.Wrist];
    const indexTip3D = tfHand.keypoints3D[KeyPointID.IndexFingerTip];
    const middleTip3D = tfHand.keypoints3D[KeyPointID.MiddleFingerTip];

    const oldHandId = oldHandIdByNewHandIdx[tfHandIndex];

    let hand: DrawingHand;
    if (oldHandId == null) {
      const id = nextHandId++;
      handsById[id] = {
        id,
        point: [indexBase.x, indexBase.y],
        lastSeenFrameId: frameId,
        line: null,
      };
      hand = handsById[id];
    } else {
      hand = handsById[oldHandId];
    }

    // Regardless of whether they're gesturing, send a message containing the
    // indexBase's location for presence purposes.
    ws.send(
      JSON.stringify({
        type: "presence",
        id: hand.id,
        point: [indexBase.x, indexBase.y],
      })
    );

    // Detect finger up or down
    const indexUp = indexTip.y < indexMcp.y;
    const middleUp = middleTip.y < middleMcp.y;
    const isPeaceSign = indexUp && middleUp;

    // TODO: Better gesture heuristic
    const isPointing =
      !isPeaceSign &&
      distance3D(indexTip3D, wrist3D) > 1.5 * distance(middleTip3D, wrist3D);

    if (!isPointing) {
      // If too many frames have elapsed since the last time we saw this hand
      // pointing, remove the line so that the next time they point it will
      // start a new one.
      if (
        hand.line &&
        frameId - hand.line.lastSeenFrameId > MAX_LINE_FRAME_GAP
      ) {
        hand.line = null;
      }

      if (isPeaceSign) {
        ws.send(
          JSON.stringify({
            type: "peace",
            id: hand.id,
            point: [middleTip.x, middleTip.y],
          })
        );
      }

      continue;
    }

    if (hand.line == null) {
      const lineId = nextLineId++;
      hand.line = {
        id: lineId,
        points: [],
        lastSeenFrameId: frameId,
      };
    }

    hand.line.points.push([indexBase.x, indexBase.y]);
    hand.line.lastSeenFrameId = frameId;

    let smoothedPoints = hand.line.points;
    smoothedPoints = simplify(smoothedPoints, 5, true);
    smoothedPoints = chaikinSmooth(smoothedPoints);
    smoothedPoints = chaikinSmooth(smoothedPoints);

    // Send message containing this line's updated geometry
    ws.send(
      JSON.stringify({
        type: "line",
        id: hand.line.id,
        handId: hand.id,
        points: smoothedPoints,
      })
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
