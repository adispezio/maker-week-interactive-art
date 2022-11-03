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
let peaceObject : FrameNode

/////// images

const peaceSvg = `<svg width="132" height="180" viewBox="0 0 132 180" fill="none" xmlns="http://www.w3.org/2000/svg">
<g clip-path="url(#clip0_1_8)">
<path d="M131.57 110.74V157.68C131.562 163.597 129.208 169.27 125.024 173.454C120.84 177.638 115.167 179.992 109.25 180H49.12C38.517 179.981 28.3536 175.761 20.8562 168.264C13.3587 160.766 9.1385 150.603 9.12 140V127.36L32.12 99.94V24.55C32.1226 20.4557 33.7482 16.5295 36.6404 13.6316C39.5327 10.7338 43.4558 9.10058 47.55 9.09H47.83C51.926 9.09794 55.8516 10.7299 58.746 13.6281C61.6404 16.5263 63.2674 20.454 63.27 24.55V62.64L102.88 15.44C104.183 13.8843 105.78 12.6011 107.579 11.6639C109.379 10.7266 111.346 10.1538 113.368 9.97818C115.389 9.8026 117.425 10.0277 119.36 10.6407C121.294 11.2536 123.088 12.2423 124.64 13.55L124.85 13.72C127.981 16.3556 129.939 20.1251 130.296 24.2023C130.652 28.2794 129.377 32.3315 126.75 35.47L92.19 76.74C94.4065 76.3436 96.6831 76.4391 98.8587 77.0198C101.034 77.6004 103.056 78.6519 104.78 80.1L105 80.28C107.147 82.0874 108.762 84.4444 109.673 87.0988C110.583 89.7533 110.755 92.6054 110.17 95.35C112.769 94.2916 115.607 93.9623 118.378 94.3976C121.15 94.8328 123.751 96.0161 125.9 97.82L126.11 97.99C127.668 99.2927 128.952 100.892 129.887 102.694C130.823 104.496 131.391 106.466 131.56 108.49C131.613 109.239 131.617 109.991 131.57 110.74Z" fill="black"/>
<path d="M120.66 101.88V148.58C120.657 154.027 118.492 159.25 114.641 163.101C110.79 166.952 105.567 169.117 100.12 169.12H40C29.8599 169.117 20.1359 165.087 12.9667 157.916C5.79749 150.745 1.77002 141.02 1.77002 130.88V118.88L24.77 91.45V15.45C24.7687 13.6558 25.1211 11.8789 25.8071 10.221C26.4932 8.56309 27.4993 7.0567 28.768 5.78799C30.0367 4.51928 31.5431 3.51314 33.201 2.82712C34.8589 2.14111 36.6358 1.78868 38.43 1.79H38.7C40.4942 1.78868 42.2711 2.14111 43.929 2.82712C45.5869 3.51314 47.0933 4.51928 48.362 5.78799C49.6307 7.0567 50.6369 8.56309 51.3229 10.221C52.0089 11.8789 52.3613 13.6558 52.36 15.45V58.45L95.14 7.45C96.2925 6.07564 97.7046 4.94189 99.2955 4.11357C100.886 3.28525 102.625 2.7786 104.412 2.62258C106.199 2.46655 107.999 2.66422 109.709 3.20427C111.42 3.74433 113.007 4.61618 114.38 5.77L114.58 5.95C115.954 7.1025 117.088 8.51458 117.916 10.1055C118.745 11.6964 119.251 13.435 119.407 15.2218C119.563 17.0087 119.366 18.8087 118.826 20.5191C118.286 22.2295 117.414 23.8167 116.26 25.19L76 73.23C78.411 70.7948 81.6492 69.3547 85.0723 69.1954C88.4954 69.0361 91.8533 70.1692 94.48 72.37L94.69 72.55C97.4595 74.8758 99.1945 78.2044 99.515 81.8068C99.8355 85.4092 98.7154 88.9917 96.4 91.77C97.5497 90.3977 98.9588 89.2656 100.547 88.4387C102.135 87.6118 103.87 87.1064 105.654 86.9512C107.437 86.7961 109.234 86.9944 110.94 87.5347C112.647 88.075 114.231 88.9468 115.6 90.1L115.8 90.28C117.484 91.6795 118.805 93.4649 119.651 95.4845C120.498 97.504 120.844 99.698 120.66 101.88Z" fill="#A259FF"/>
<path d="M122.46 99.39C122.291 97.3667 121.722 95.3971 120.784 93.5962C119.847 91.7952 118.561 90.1988 117 88.9L116.79 88.72C115.242 87.412 113.449 86.4246 111.516 85.8151C109.583 85.2057 107.548 84.9864 105.53 85.17C103.991 85.3042 102.481 85.6682 101.05 86.25C101.639 83.5072 101.47 80.6559 100.563 78.0014C99.656 75.3468 98.0441 72.9889 95.9 71.18L95.69 71C93.9605 69.5539 91.9356 68.5037 89.7572 67.9233C87.5788 67.3428 85.2997 67.2461 83.08 67.64L117.65 26.38C120.277 23.2398 121.553 19.1862 121.196 15.1074C120.84 11.0286 118.882 7.25733 115.75 4.62L115.54 4.44C112.399 1.80823 108.342 0.531091 104.26 0.889234C100.178 1.24738 96.4047 3.2115 93.77 6.35L54.17 53.55V15.45C54.1674 11.3549 52.5401 7.42823 49.6454 4.53166C46.7507 1.63508 42.8251 0.00529676 38.73 0L38.45 0C34.354 0.00529196 30.4273 1.63475 27.531 4.53104C24.6348 7.42734 23.0053 11.354 23 15.45V90.84L0 118.26V130.88C0.0185067 141.483 4.23872 151.646 11.7362 159.144C19.2336 166.641 29.397 170.861 40 170.88H100.12C106.038 170.875 111.712 168.521 115.897 164.337C120.081 160.152 122.435 154.478 122.44 148.56V101.65C122.507 100.898 122.513 100.143 122.46 99.39ZM97.82 92.92C99.8399 90.5169 102.731 89.0135 105.858 88.7397C108.985 88.466 112.093 89.4443 114.5 91.46L114.71 91.64C115.907 92.639 116.892 93.8662 117.61 95.2499C118.328 96.6337 118.763 98.1464 118.89 99.7C118.89 99.91 118.89 100.11 118.89 100.32V101.59C118.715 104.078 117.752 106.446 116.14 108.35L104 122.73C102.895 124.04 101.517 125.093 99.9621 125.815C98.4075 126.537 96.714 126.911 95 126.91H94.64C92.4617 126.915 90.3249 126.315 88.4672 125.177C86.6096 124.04 85.1042 122.409 84.1184 120.466C83.1327 118.524 82.7053 116.346 82.8839 114.175C83.0625 112.004 83.84 109.925 85.13 108.17L97.8 92.94L97.82 92.92ZM93.38 73.75L93.59 73.92C95.9965 75.9437 97.5025 78.839 97.7781 81.9712C98.0536 85.1035 97.0762 88.2172 95.06 90.63L82.82 105.22C82.54 105.56 82.28 105.9 82.03 106.22L77.57 111.57C77.1299 109.782 76.1316 108.182 74.72 107L60.26 94.88L77.36 74.47C79.4566 72.3686 82.2645 71.129 85.23 70.9957C88.1955 70.8624 91.1033 71.8451 93.38 73.75ZM26.59 15.45C26.5926 12.3044 27.8427 9.28829 30.066 7.0631C32.2894 4.8379 35.3044 3.58529 38.45 3.58H38.73C41.8756 3.58529 44.8906 4.8379 47.114 7.0631C49.3373 9.28829 50.5874 12.3044 50.59 15.45V63.39L96.52 8.65C97.5197 7.45459 98.7456 6.4683 100.127 5.74768C101.509 5.02706 103.019 4.58629 104.572 4.45065C106.124 4.31501 107.688 4.48716 109.174 4.95724C110.66 5.42732 112.038 6.18608 113.23 7.19L113.44 7.36C115.848 9.38544 117.354 12.2834 117.628 15.4181C117.902 18.5527 116.92 21.6679 114.9 24.08L74.63 72.15C74.39 72.4 74.15 72.64 73.92 72.91L57.52 92.58L43.11 80.48C41.3304 78.9958 39.0357 78.2764 36.7272 78.4787C34.4188 78.6811 32.2843 79.7888 30.79 81.56L26.59 86.56V15.45ZM118.89 148.58C118.882 153.548 116.905 158.31 113.392 161.822C109.88 165.335 105.118 167.312 100.15 167.32H40C30.343 167.301 21.0872 163.456 14.2606 156.625C7.43392 149.795 3.59321 140.537 3.58 130.88V119.56L33.58 83.87C34.4606 82.8233 35.7202 82.1682 37.0828 82.0482C38.4454 81.9283 39.8 82.3532 40.85 83.23L72.46 109.75C73.5067 110.631 74.1618 111.89 74.2818 113.253C74.4017 114.615 73.9768 115.97 73.1 117.02L73 117.14L72.92 117.23C69.7544 121.002 65.2201 123.363 60.3142 123.792C55.4084 124.222 50.5328 122.685 46.76 119.52L39.86 113.72L38.7 115.1L38.42 115.44L37.88 116.08L28.2 127.55L30.95 129.85L40.25 118.77L44.41 122.26C48.9102 126.036 54.7257 127.871 60.5781 127.361C66.4305 126.851 71.8409 124.038 75.62 119.54L75.79 119.32L79.18 115.26C79.2351 119.315 80.8813 123.186 83.7639 126.039C86.6465 128.891 90.5345 130.497 94.59 130.51H95C97.2357 130.502 99.4424 130.004 101.465 129.052C103.488 128.1 105.278 126.717 106.71 125L118.87 110.62L118.89 148.58Z" fill="black"/>
</g>
<defs>
<clipPath id="clip0_1_8">
<rect width="131.61" height="180" fill="white"/>
</clipPath>
</defs>
</svg>`

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
        peaceObject = figma.createNodeFromSvg(peaceSvg);
        peaceObject.x = viewportPoint[0];
        peaceObject.y = viewportPoint[1];

        setTimeout(function () {
          if (peaceState == PeaceState.TRIGGERED_OBJECT) {
            // Once we place the item, update the state.
            peaceObject.rescale(1.5);
            peaceState = PeaceState.PLACED_OBJECT;
          }
        }, 1000);
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
