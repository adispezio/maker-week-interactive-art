import simplify from "./simplify";
import sortBy from "lodash/sortBy";
import difference from "lodash/difference";

// What's the largest number of pixels we could expect a fingertip to move in
// one frame?
const MAX_PX_MOVED_PER_FRAME = 50;

// How many frames is a hand allowed to disappear for before coming back?
const MAX_HAND_FRAME_GAP = 10;

// How many frames is a hand allowed to not point before we cut off the line?
const MAX_LINE_FRAME_GAP = 10;

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

// Map the hands we're getting from TensorFlow to our existing state.
// We can't trust the indices in `tfHands` to be stable, so we need to use a
// heuristic to determine which hand is which:
// - For every combination of old hand and new hand, calculate the
//   distance between their cursor locations (the base of the index finger).
// - Go through those pairs in order of ascending distance.
// - For each pair, if neither the old nor new hand have already been assigned,
//   decide if we think it's a plausible match based on the distance and the
//   last time we saw the old hand. If it is valid, record it and remove both
//   the old and new hand from further consideration.
function matchHandPairs(
  handsById: Record<number, DrawingHand>,
  tfHands: Array<TFHand>,
  frameId: number
): [
  handByTFHandIndex: Array<DrawingHand | null>,
  missingHandIds: Array<number>
] {
  const handPairs = sortBy(
    Object.entries(handsById).flatMap(([handId, hand]) =>
      tfHands.map((tfHand, tfHandIdx) => {
        const tfHandLocation = tfHand.keypoints[KeyPointID.IndexFingerMcp];
        return {
          handId: Number(handId),
          tfHandIdx,
          distance: distance(
            { x: hand.point[0], y: hand.point[1] },
            tfHandLocation
          ),
          location: [tfHandLocation.x, tfHandLocation.y] as [number, number],
        };
      })
    ),
    (pair) => pair.distance
  );

  const seenHandIds = new Set<number>();
  const handByTFHandIndex: Array<DrawingHand | null> = new Array(
    tfHands.length
  ).fill(null);

  for (const { handId, tfHandIdx, distance, location } of handPairs) {
    if (seenHandIds.has(handId)) continue;
    if (handByTFHandIndex[tfHandIdx] != null) continue;

    const hand = handsById[handId];
    const framesElapsed = frameId - hand.lastSeenFrameId;

    if (distance <= framesElapsed * MAX_PX_MOVED_PER_FRAME) {
      seenHandIds.add(handId);
      handByTFHandIndex[tfHandIdx] = hand;

      hand.point = location;
      hand.lastSeenFrameId = frameId;
    }
  }

  return [
    handByTFHandIndex,
    difference(Object.keys(handsById).map(Number), Array.from(seenHandIds)),
  ];
}

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

  const [handByTFHandIndex, missingHandIds] = matchHandPairs(
    handsById,
    tfHands,
    frameId
  );

  // For each missing hand that's old enough, delete it and send a "gone"
  // message to remove its presence indicator.
  for (const handId of missingHandIds) {
    const hand = handsById[handId];
    const framesElapsed = frameId - hand.lastSeenFrameId;

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
    const indexDip = tfHand.keypoints[KeyPointID.IndexFingerDip];
    const indexTip = tfHand.keypoints[KeyPointID.IndexFingerTip];
    const middleDip = tfHand.keypoints[KeyPointID.IndexFingerDip];
    const middleTip = tfHand.keypoints[KeyPointID.MiddleFingerTip];
    const ringDip = tfHand.keypoints[KeyPointID.RingFingerDip];
    const ringTip = tfHand.keypoints[KeyPointID.RingFingerTip];
    const pinkyDip = tfHand.keypoints[KeyPointID.PinkyFingerDip];
    const pinkyTip = tfHand.keypoints[KeyPointID.PinkyFingerTip];

    const wrist3D = tfHand.keypoints3D[KeyPointID.Wrist];
    const indexTip3D = tfHand.keypoints3D[KeyPointID.IndexFingerTip];
    const middleTip3D = tfHand.keypoints3D[KeyPointID.MiddleFingerTip];

    // Reuse the existing hand if there is one, otherwise create a new one.
    let hand = handByTFHandIndex[tfHandIndex];
    if (hand == null) {
      const id = nextHandId++;
      hand = {
        id,
        point: [indexBase.x, indexBase.y],
        lastSeenFrameId: frameId,
        line: null,
      };
      handsById[id] = hand;
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
    const indexUp = indexTip.y < indexDip.y;
    const middleUp = middleTip.y < middleDip.y;
    const ringDown = ringTip.y > ringDip.y;
    const pinkyDown = pinkyTip.y > pinkyDip.y;

    const isPeaceSign = indexUp && middleUp && ringDown && pinkyDown;
    const isPointing =
      !isPeaceSign &&
      distance3D(indexTip3D, wrist3D) > 1.4 * distance(middleTip3D, wrist3D);

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
            point: [indexBase.x, indexBase.y],
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
