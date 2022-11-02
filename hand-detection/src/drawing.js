import simplify from "./simplify";

const ws = new WebSocket("ws://localhost:16001");

function distance(p1, p2) {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

function copyPoint(out, p) {
  out[0] = p[0];
  out[1] = p[1];
  return out;
}

// From chaikin-smooth NPM package
function chaikinSmooth(input, output) {
  if (!Array.isArray(output)) output = [];

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

export function handleFrame(hands, ctx) {
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

    const indexDip = hand.keypoints[7];
    const indexTip = hand.keypoints[8];
    const middleTip = hand.keypoints[12];

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

    if (distance(indexTip, middleTip) <= 3 * distance(indexTip, indexDip)) {
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
    smoothedPoints = simplify(smoothedPoints, 2, true);
    smoothedPoints = chaikinSmooth(smoothedPoints);

    // Send message containing this line's updated geometry
    ws.send(
      JSON.stringify({ type: "line", id: line.id, points: smoothedPoints })
    );

    // Render debug visualization
    ctx.beginPath();
    ctx.moveTo(...smoothedPoints[0]);
    for (const point of smoothedPoints.slice(1)) {
      ctx.lineTo(...point);
    }
    ctx.stroke();
  }
}
