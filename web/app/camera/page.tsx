"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  FilesetResolver,
  HandLandmarker,
  FaceLandmarker,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import {
  MEMES,
  GESTURE_GUIDE,
  classifyGesture,
  displayGestureName,
  type Point,
} from "../lib/gestures";
import FloatingHearts from "../components/FloatingHearts";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const PANEL = 480; // meme/cam panel size (px)
const VOTE_WINDOW = 12;
const VOTE_MAJORITY = 7;

// Only hand tracking needs to run every frame for gestures to feel
// responsive. Face and pose move slowly by comparison, so running them on
// a fraction of frames cuts CPU-delegate inference cost substantially
// without hurting accuracy.
const FACE_EVERY_N = 2;
const POSE_EVERY_N = 3;

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [debugOn, setDebugOn] = useState(true);
  const [gesture, setGesture] = useState("default");
  const debugOnRef = useRef(debugOn);
  debugOnRef.current = debugOn;

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let rafId = 0;
    let hand: HandLandmarker | null = null;
    let face: FaceLandmarker | null = null;
    let pose: PoseLandmarker | null = null;

    async function setup() {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);

        // CPU delegates: running three GPU/WebGL-backed models concurrently in
        // one tab makes them fight over WebGL contexts (observed as repeated
        // "Graph finished closing" churn and an uncaught crash from inside
        // the vision library). CPU delegates avoid that entirely.
        hand = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: "/models/hand_landmarker.task", delegate: "CPU" },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.6,
          minTrackingConfidence: 0.6,
        });

        face = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: "/models/face_landmarker.task", delegate: "CPU" },
          runningMode: "VIDEO",
          numFaces: 1,
          minFaceDetectionConfidence: 0.6,
          minTrackingConfidence: 0.6,
          outputFacialTransformationMatrixes: true,
        });

        pose = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: "/models/pose_landmarker.task", delegate: "CPU" },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        // Lower capture resolution than the display panel needs: fewer
        // pixels per frame means noticeably cheaper CPU-delegate inference,
        // with no visible quality loss once scaled up to PANEL size.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 480 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) return;

        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();

        if (cancelled) return;
        setStatus("ready");

        const votes: string[] = [];
        let stableGesture = "default";
        let frameCount = 0;
        let lastFaceLandmarks: Point[][] = [];
        let lastFaceMatrices: number[][][] | null = null;
        let lastPoseLandmarks: Point[][] = [];

        const loop = () => {
          if (cancelled) return;
          try {
            renderFrame();
          } catch (err) {
            console.error("frame error", err);
          }
          rafId = requestAnimationFrame(loop);
        };

        const renderFrame = () => {
          const now = performance.now();
          if (video.readyState < 2) return;

          frameCount += 1;

          const handResult = hand!.detectForVideo(video, now);
          const handsLandmarks = (handResult.landmarks ?? []) as Point[][];

          if (frameCount % FACE_EVERY_N === 0) {
            const faceResult = face!.detectForVideo(video, now);
            lastFaceLandmarks = (faceResult.faceLandmarks ?? []) as Point[][];
            lastFaceMatrices = faceResult.facialTransformationMatrixes
              ? faceResult.facialTransformationMatrixes.map((m) => {
                  // MediaPipe packs this as a column-major 4x4 (it's meant to
                  // be usable directly as an OpenGL model matrix), so
                  // M[row][col] = data[col*4 + row], not data[row*4 + col].
                  const d = m.data;
                  const rows: number[][] = [];
                  for (let r = 0; r < 4; r++) {
                    rows.push([d[r], d[4 + r], d[8 + r], d[12 + r]]);
                  }
                  return rows;
                })
              : null;
          }

          if (frameCount % POSE_EVERY_N === 0) {
            const poseResult = pose!.detectForVideo(video, now);
            lastPoseLandmarks = (poseResult.landmarks ?? []) as Point[][];
          }

          const { gesture: detected, yawDeg, pitchDeg } = classifyGesture(
            handsLandmarks,
            lastFaceLandmarks.length ? lastFaceLandmarks : null,
            lastFaceMatrices,
            lastPoseLandmarks.length ? lastPoseLandmarks : null
          );

          votes.push(detected);
          if (votes.length > VOTE_WINDOW) votes.shift();
          const counts: Record<string, number> = {};
          for (const v of votes) counts[v] = (counts[v] ?? 0) + 1;
          let topGesture = stableGesture;
          let topCount = 0;
          for (const [g, c] of Object.entries(counts)) {
            if (c > topCount) {
              topCount = c;
              topGesture = g;
            }
          }
          if (topCount >= VOTE_MAJORITY && topGesture !== stableGesture) {
            stableGesture = topGesture;
            setGesture(stableGesture);
          }

          drawOverlay(
            overlayRef.current,
            video,
            handsLandmarks,
            debugOnRef.current,
            yawDeg,
            pitchDeg,
            lastFaceLandmarks.length > 0
          );
        };
        rafId = requestAnimationFrame(loop);
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    }

    setup();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "d") setDebugOn((d) => !d);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
      hand?.close();
      face?.close();
      pose?.close();
    };
  }, []);

  const label = displayGestureName(gesture);

  return (
    <div
      className="relative flex min-h-screen flex-col items-center gap-4 overflow-x-hidden p-4"
      style={{
        background:
          "linear-gradient(160deg, #ffd6e8 0%, #ffb6d5 35%, #ff8fc4 70%, #ff6fb0 100%)",
      }}
    >
      <FloatingHearts />

      <Link
        href="/"
        className="relative z-10 text-sm font-medium text-pink-900/70 hover:text-pink-900"
      >
        &larr; back
      </Link>

      {status === "error" && (
        <p className="relative z-10 max-w-md text-center text-sm font-medium text-red-700">
          Couldn&apos;t start the camera: {errorMsg}. Camera access needs HTTPS (or localhost)
          and browser permission.
        </p>
      )}
      {status === "loading" && (
        <p className="relative z-10 text-sm font-medium text-pink-900/80">
          Loading models and camera…
        </p>
      )}

      <div className="relative z-10 flex w-full max-w-[962px] flex-col items-center gap-4 lg:max-w-none lg:flex-row lg:items-start">
      <div
        className="w-full overflow-hidden rounded-xl shadow-2xl ring-4 ring-white/60"
        style={{ maxWidth: PANEL * 2 + 2 }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4"
          style={{ height: 46, background: "rgb(26,22,22)" }}
        >
          <div className="flex items-center gap-2">
            <span
              className="inline-block rounded-full"
              style={{ width: 10, height: 10, background: "rgb(90,220,100)" }}
            />
            <span className="text-[15px] font-semibold text-zinc-200">
              Happy Birthday Stinky
            </span>
          </div>
          <span
            className="rounded-lg px-3.5 py-2 text-[13px] font-semibold"
            style={{ background: "rgb(200,160,255)", color: "rgb(25,20,20)" }}
          >
            {label}
          </span>
        </div>

        {/* Meme on top, camera below - stacked on mobile; side by side from
            sm upward. */}
        <div className="flex flex-col sm:flex-row">
          <img
            src={MEMES[gesture] ?? MEMES.default}
            alt={label}
            className="aspect-square w-full object-cover sm:w-1/2"
            style={{ background: "#333" }}
          />
          <div className="h-[2px] w-full sm:h-auto sm:w-[2px]" style={{ background: "rgb(55,50,50)" }} />
          <div className="relative aspect-square w-full sm:w-1/2">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover"
              style={{
                transform: "scaleX(-1)",
                background: "#111",
              }}
            />
            {/* Hand-landmark overlay, mirrored the same way as the video so
                drawn coordinates don't need their own mirroring logic. Its
                drawing-buffer resolution stays fixed at PANEL and is scaled
                visually by CSS to match whatever size the video renders at. */}
            <canvas
              ref={overlayRef}
              width={PANEL}
              height={PANEL}
              className="absolute inset-0 h-full w-full"
              style={{
                transform: "scaleX(-1)",
                pointerEvents: "none",
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-4 text-xs"
          style={{ height: 28, background: "rgb(18,16,16)", color: "rgb(150,150,150)" }}
        >
          <span>live in your browser</span>
          <span>d: {debugOn ? "hide" : "show"} debug</span>
        </div>
      </div>

        {/* Gesture guide */}
        <div
          className="w-full overflow-hidden rounded-xl bg-white/90 shadow-2xl ring-4 ring-white/60 backdrop-blur lg:w-auto"
          style={{ maxWidth: PANEL }}
        >
          <div
            className="flex items-center gap-2 px-4"
            style={{ height: 46, background: "linear-gradient(90deg, #ff6fb0, #ff9ecb)" }}
          >
            <span className="text-lg">🎀</span>
            <span className="text-[15px] font-bold text-white">Gestures to try</span>
          </div>
          <div className="max-h-[420px] divide-y divide-pink-100 overflow-y-auto">
            {GESTURE_GUIDE.map((g, i) => (
              <div key={i} className="flex flex-col gap-0.5 px-4 py-2.5">
                <span className="text-[13px] font-medium text-zinc-800">{g.doThis}</span>
                <span className="text-[12px] font-semibold text-pink-600">→ {g.youGet}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="relative z-10 text-xs font-medium text-pink-900/70">
        Current gesture: {label} · press &quot;d&quot; to toggle debug
      </p>
    </div>
  );
}

function drawOverlay(
  canvas: HTMLCanvasElement | null,
  video: HTMLVideoElement,
  handsLandmarks: Point[][],
  debugOn: boolean,
  yawDeg: number | null,
  pitchDeg: number | null,
  faceDetected: boolean
) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!debugOn) return;

  // Debug readout (mirrored back upright via a canvas-local flip, since the
  // whole canvas element is CSS-mirrored for the hand overlay).
  ctx.save();
  ctx.scale(-1, 1);
  ctx.translate(-canvas.width, 0);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, 230, 26);
  ctx.font = "13px monospace";
  ctx.fillStyle = "#ffff66";
  ctx.textBaseline = "top";
  const yawText = yawDeg !== null ? yawDeg.toFixed(1) : "n/a";
  const pitchText = pitchDeg !== null ? pitchDeg.toFixed(1) : "n/a";
  ctx.fillText(
    `face=${faceDetected ? "yes" : "no"} yaw=${yawText} pitch=${pitchText}`,
    8,
    6
  );
  ctx.restore();

  if (!handsLandmarks.length) return;

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;

  // Video is displayed with object-fit: cover into a square panel, which
  // crops to a centered square of the smaller native dimension - map
  // normalized landmark coords through that same crop to land correctly.
  const side = Math.min(vw, vh);
  const cropX0 = (vw - side) / 2;
  const cropY0 = (vh - side) / 2;
  const scale = PANEL / side;

  const toPanel = (p: Point): [number, number] => [
    (p.x * vw - cropX0) * scale,
    (p.y * vh - cropY0) * scale,
  ];

  for (const landmarks of handsLandmarks) {
    const points = landmarks.map(toPanel);
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.moveTo(points[a][0], points[a][1]);
      ctx.lineTo(points[b][0], points[b][1]);
    }
    ctx.stroke();

    ctx.fillStyle = "#ff0000";
    for (const [x, y] of points) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
