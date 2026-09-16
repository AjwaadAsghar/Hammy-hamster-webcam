// Ported 1:1 from the Python main.py gesture-detection logic.

export type Point = { x: number; y: number; z?: number; visibility?: number };

export const GESTURE_GUIDE: { doThis: string; youGet: string }[] = [
  { doThis: "Nothing / no match", youGet: "poker face hamster" },
  { doThis: "Thumbs up (away from your face)", youGet: "thumbs up hamster" },
  { doThis: "Thumbs down (away from your face)", youGet: "thumbs down hamster" },
  { doThis: "Closed fist held beside your head", youGet: "lollipop hamster" },
  { doThis: "Pinch (thumb + index touching) near your face", youGet: "glasses hamster" },
  { doThis: "Index finger near your mouth", youGet: "finger-near-mouth hamster" },
  { doThis: "Index finger up, away from your mouth", youGet: "nerd hamster" },
  {
    doThis: "Bent elbow, wrist raised above shoulder, elbow out to the side",
    youGet: "bicep hamster",
  },
  {
    doThis: "Both wrists tucked together at chest height (hands can be hidden)",
    youGet: "crossed-arms hamster",
  },
  { doThis: "One hand on each cheek", youGet: "shy hamster" },
  { doThis: "Hands clasped together at mouth/chin height", youGet: "thinking hamster" },
  { doThis: "Hands clasped together at chest height, below your face", youGet: "hug hamster" },
  { doThis: "Head tilted down", youGet: "sad hamster" },
  { doThis: "Two hands visible, no other match", youGet: "truck hamster" },
  { doThis: "Turn your head to the side", youGet: "side-eye hamster" },
];

export const MEMES: Record<string, string> = {
  default: "/memes/default.jpg",
  thumbs_up: "/memes/thumbs_up.jpg",
  thumbs_down: "/memes/thumbs_down.jpg",
  side_eye: "/memes/side_eye.jpg",
  fist_by_head: "/memes/fist_by_head.webp",
  two_hands: "/memes/two_hands.jpg",
  glasses: "/memes/glasses.jpg",
  bicep: "/memes/bicep.jpg",
  cross_arms: "/memes/cross_arms.jpg",
  finger_mouth: "/memes/finger_mouth.jpg",
  nerd: "/memes/nerd.jpg",
  shy: "/memes/shy.jpg",
  thinking: "/memes/thinking.jpg",
  hug: "/memes/hug.jpg",
  sad: "/memes/sad.jpg",
};

export const YAW_THRESHOLD_DEG = 18;
export const PITCH_THRESHOLD_DEG = 15;
const GLASSES_NEAR_FACE_DIST = 0.28;
const MOUTH_NEAR_DIST = 0.14;
const ELBOW_BEND_MAX_DEG = 100;
const POSE_VISIBILITY_MIN = 0.5;
const HANDS_TOGETHER_DIST = 0.12;
const HANDS_APART_MIN_DIST = 0.15;
const THINKING_NEAR_MOUTH_DIST = 0.25;
const SHY_NEAR_FACE_DIST = 0.3;
const SHY_HEIGHT_TOLERANCE = 0.18;
const HUG_BELOW_FACE_DIST = 0.2;

const MOUTH_LANDMARK = 13;

const FINGER_JOINTS: [number, number][] = [
  [8, 5],
  [12, 9],
  [16, 13],
  [20, 17],
];

const LEFT_SHOULDER = 11,
  RIGHT_SHOULDER = 12;
const LEFT_ELBOW = 13,
  RIGHT_ELBOW = 14;
const LEFT_WRIST = 15,
  RIGHT_WRIST = 16;
const LEFT_HIP = 23,
  RIGHT_HIP = 24;

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function center(landmarks: Point[]): [number, number] {
  let x = 0,
    y = 0;
  for (const p of landmarks) {
    x += p.x;
    y += p.y;
  }
  return [x / landmarks.length, y / landmarks.length];
}

function vecDist(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function fingersUp(landmarks: Point[]): number[] {
  const wrist = landmarks[0];
  const pinkyBase = landmarks[17];
  const thumbExtended =
    dist(landmarks[4], pinkyBase) > dist(landmarks[2], pinkyBase) * 1.1;
  const fingers = [thumbExtended ? 1 : 0];
  for (const [tipId, baseId] of FINGER_JOINTS) {
    const extended =
      dist(wrist, landmarks[tipId]) > dist(wrist, landmarks[baseId]) * 1.15;
    fingers.push(extended ? 1 : 0);
  }
  return fingers;
}

function classifySingleHand(fingers: number[]): string | null {
  const [thumb, index, middle, ring, pinky] = fingers;
  const fourCurled = !(index || middle || ring || pinky);
  if (fourCurled) return thumb ? "thumbs_up" : "fist";
  if (index && middle && ring && pinky && thumb) return "open_palm";
  if (index && !middle && !ring && !pinky) return "pointer";
  return null;
}

function thumbDyRatio(landmarks: Point[]): number {
  const scale = dist(landmarks[0], landmarks[9]);
  if (scale < 1e-6) return 0;
  return (landmarks[4].y - landmarks[0].y) / scale;
}

function thumbPointsDown(landmarks: Point[]): boolean {
  return thumbDyRatio(landmarks) > 0.35;
}

function isPinch(landmarks: Point[]): boolean {
  const scale = dist(landmarks[0], landmarks[9]);
  if (scale < 1e-6) return false;
  const thumbIndex = dist(landmarks[4], landmarks[8]);
  const thumbMiddle = dist(landmarks[4], landmarks[12]);
  return thumbIndex < scale * 0.5 && thumbIndex < thumbMiddle * 0.7;
}

function poseVisible(landmark: Point | undefined): boolean {
  if (!landmark) return false;
  return (landmark.visibility ?? 1.0) >= POSE_VISIBILITY_MIN;
}

function elbowAngleDegrees(shoulder: Point, elbow: Point, wrist: Point): number | null {
  const v1 = [shoulder.x - elbow.x, shoulder.y - elbow.y];
  const v2 = [wrist.x - elbow.x, wrist.y - elbow.y];
  const n1 = Math.hypot(v1[0], v1[1]);
  const n2 = Math.hypot(v2[0], v2[1]);
  if (n1 < 1e-6 || n2 < 1e-6) return null;
  const cos = Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

type BicepSignals = { angle: number; wristAbove: number; elbowOut: number };

function bicepSignals(pose: Point[] | null): BicepSignals | null {
  if (!pose) return null;
  let best: BicepSignals | null = null;
  for (const [shoulderI, elbowI, wristI] of [
    [LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST],
    [RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST],
  ]) {
    const shoulder = pose[shoulderI];
    const elbow = pose[elbowI];
    const wrist = pose[wristI];
    if (!poseVisible(shoulder) || !poseVisible(elbow) || !poseVisible(wrist)) continue;
    const angle = elbowAngleDegrees(shoulder, elbow, wrist);
    if (angle === null) continue;
    const wristAbove = shoulder.y - wrist.y;
    const elbowOut = Math.abs(elbow.x - shoulder.x);
    if (best === null || angle < best.angle) best = { angle, wristAbove, elbowOut };
  }
  return best;
}

function detectBicep(pose: Point[] | null): boolean {
  const s = bicepSignals(pose);
  if (!s) return false;
  return s.angle < ELBOW_BEND_MAX_DEG && s.wristAbove > 0.06 && s.elbowOut > 0.06;
}

function detectCrossArms(pose: Point[] | null): boolean {
  if (!pose) return false;
  const lWrist = pose[LEFT_WRIST],
    rWrist = pose[RIGHT_WRIST];
  const lShoulder = pose[LEFT_SHOULDER],
    rShoulder = pose[RIGHT_SHOULDER];
  if (
    !poseVisible(lWrist) ||
    !poseVisible(rWrist) ||
    !poseVisible(lShoulder) ||
    !poseVisible(rShoulder)
  )
    return false;

  const lHip = pose[LEFT_HIP],
    rHip = pose[RIGHT_HIP];
  const chestTop = Math.min(lShoulder.y, rShoulder.y);
  const chestBottom =
    poseVisible(lHip) && poseVisible(rHip) ? Math.max(lHip.y, rHip.y) : chestTop + 0.35;

  const wristsClose = dist(lWrist, rWrist) < 0.18;
  const avgWristY = (lWrist.y + rWrist.y) / 2;
  const atChestHeight = chestTop < avgWristY && avgWristY < chestBottom;
  return wristsClose && atChestHeight;
}

function twoHandCenters(hands: Point[][]): [number, number][] | null {
  if (hands.length !== 2) return null;
  return [center(hands[0]), center(hands[1])];
}

function detectShy(hands: Point[][], headCenter: [number, number] | null): boolean {
  const centers = twoHandCenters(hands);
  if (!centers || !headCenter) return false;
  if (vecDist(centers[0], centers[1]) <= HANDS_APART_MIN_DIST) return false;
  return centers.every(
    (c) =>
      vecDist(c, headCenter) < SHY_NEAR_FACE_DIST &&
      Math.abs(c[1] - headCenter[1]) < SHY_HEIGHT_TOLERANCE
  );
}

function detectThinking(hands: Point[][], mouthPoint: [number, number] | null): boolean {
  const centers = twoHandCenters(hands);
  if (!centers || !mouthPoint) return false;
  if (vecDist(centers[0], centers[1]) >= HANDS_TOGETHER_DIST) return false;
  const avg: [number, number] = [
    (centers[0][0] + centers[1][0]) / 2,
    (centers[0][1] + centers[1][1]) / 2,
  ];
  return vecDist(avg, mouthPoint) < THINKING_NEAR_MOUTH_DIST;
}

function detectHug(hands: Point[][], headCenter: [number, number] | null): boolean {
  const centers = twoHandCenters(hands);
  if (!centers || !headCenter) return false;
  if (vecDist(centers[0], centers[1]) >= HANDS_TOGETHER_DIST) return false;
  const avg: [number, number] = [
    (centers[0][0] + centers[1][0]) / 2,
    (centers[0][1] + centers[1][1]) / 2,
  ];
  return avg[1] - headCenter[1] > HUG_BELOW_FACE_DIST;
}

export function headYawDegrees(m: number[][]): number {
  const r02 = m[0][2];
  return (Math.asin(Math.max(-1, Math.min(1, r02))) * 180) / Math.PI;
}

export function headPitchDegrees(m: number[][]): number {
  const r12 = m[1][2];
  return (Math.asin(Math.max(-1, Math.min(1, -r12))) * 180) / Math.PI;
}

export type ClassifyResult = {
  gesture: string;
  yawDeg: number | null;
  pitchDeg: number | null;
};

export function classifyGesture(
  handsLandmarks: Point[][],
  faceLandmarks: Point[][] | null,
  faceTransformMatrices: number[][][] | null,
  poseLandmarksList: Point[][] | null
): ClassifyResult {
  const pose = poseLandmarksList && poseLandmarksList.length ? poseLandmarksList[0] : null;

  let headCenter: [number, number] = [0.5, 0.3];
  let mouthPoint: [number, number] | null = null;
  let yawDeg: number | null = null;
  let pitchDeg: number | null = null;
  const hasFace = !!(faceLandmarks && faceLandmarks.length);

  if (hasFace) {
    const face = faceLandmarks![0];
    headCenter = center(face);
    mouthPoint = [face[MOUTH_LANDMARK].x, face[MOUTH_LANDMARK].y];
  }
  if (faceTransformMatrices && faceTransformMatrices.length) {
    yawDeg = headYawDegrees(faceTransformMatrices[0]);
    pitchDeg = headPitchDegrees(faceTransformMatrices[0]);
  }

  for (const landmarks of handsLandmarks) {
    const handC = center(landmarks);

    if (isPinch(landmarks)) {
      const nearFace = vecDist(handC, headCenter) < GLASSES_NEAR_FACE_DIST;
      if (nearFace) return { gesture: "glasses", yawDeg, pitchDeg };
      continue;
    }

    const fingers = fingersUp(landmarks);
    const gesture = classifySingleHand(fingers);

    if (gesture === "fist" || gesture === "thumbs_up") {
      const besideHead =
        Math.abs(handC[1] - headCenter[1]) < 0.15 &&
        Math.abs(handC[0] - headCenter[0]) > 0.08 &&
        Math.abs(handC[0] - headCenter[0]) < 0.3;
      if (besideHead) return { gesture: "fist_by_head", yawDeg, pitchDeg };
      if (gesture === "thumbs_up") {
        return {
          gesture: thumbPointsDown(landmarks) ? "thumbs_down" : "thumbs_up",
          yawDeg,
          pitchDeg,
        };
      }
      continue;
    }

    if (gesture === "pointer") {
      const fingertip: [number, number] = [landmarks[8].x, landmarks[8].y];
      const nearMouth = mouthPoint !== null && vecDist(fingertip, mouthPoint) < MOUTH_NEAR_DIST;
      return { gesture: nearMouth ? "finger_mouth" : "nerd", yawDeg, pitchDeg };
    }
  }

  if (detectShy(handsLandmarks, hasFace ? headCenter : null))
    return { gesture: "shy", yawDeg, pitchDeg };
  if (detectThinking(handsLandmarks, mouthPoint)) return { gesture: "thinking", yawDeg, pitchDeg };
  if (detectHug(handsLandmarks, hasFace ? headCenter : null))
    return { gesture: "hug", yawDeg, pitchDeg };

  if (detectCrossArms(pose)) return { gesture: "cross_arms", yawDeg, pitchDeg };
  if (detectBicep(pose)) return { gesture: "bicep", yawDeg, pitchDeg };

  if (handsLandmarks.length === 2) return { gesture: "two_hands", yawDeg, pitchDeg };

  if (pitchDeg !== null && pitchDeg > PITCH_THRESHOLD_DEG)
    return { gesture: "sad", yawDeg, pitchDeg };
  if (yawDeg !== null && Math.abs(yawDeg) > YAW_THRESHOLD_DEG)
    return { gesture: "side_eye", yawDeg, pitchDeg };

  return { gesture: "default", yawDeg, pitchDeg };
}

export function displayGestureName(gesture: string): string {
  return gesture
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
