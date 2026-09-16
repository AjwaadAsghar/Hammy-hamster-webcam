"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  FilesetResolver,
  HandLandmarker,
  FaceLandmarker,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import { MEMES, classifyGesture, displayGestureName, type Point } from "../lib/gestures";

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
                  // Row-major 4x4 flattened -> [row][col]
                  const d = m.data;
                  const rows: number[][] = [];
                  for (let r = 0; r < 4; r++) {
                    rows.push([d[r * 4], d[r * 4 + 1], d[r * 4 + 2], d[r * 4 + 3]]);
                  }
                  return rows;
                })
              : null;
          }

          if (frameCount % POSE_EVERY_N === 0) {
            const poseResult = pose!.detectForVideo(video, now);
            lastPoseLandmarks = (poseResult.landmarks ?? []) as Point[][];
          }

          const { gesture: detected } = classifyGesture(
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

          drawOverlay(overlayRef.current, video, handsLandmarks, debugOnRef.current);
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
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 p-4">
      <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">
        &larr; back
      </Link>

      {status === "error" && (
        <p className="max-w-md text-center text-sm text-red-400">
          Couldn&apos;t start the camera: {errorMsg}. Camera access needs HTTPS (or localhost)
          and browser permission.
        </p>
      )}
      {status === "loading" && (
        <p className="text-sm text-zinc-400">Loading models and camera…</p>
      )}

      <div
        className="overflow-hidden rounded-xl shadow-2xl"
        style={{ width: PANEL * 2 + 2 }}
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

        {/* Meme + camera panels */}
        <div className="flex" style={{ height: PANEL }}>
          <img
            src={MEMES[gesture] ?? MEMES.default}
            alt={label}
            width={PANEL}
            height={PANEL}
            style={{ width: PANEL, height: PANEL, objectFit: "cover", background: "#333" }}
          />
          <div style={{ width: 2, background: "rgb(55,50,50)" }} />
          <div style={{ position: "relative", width: PANEL, height: PANEL }}>
            <video
              ref={videoRef}
              playsInline
              muted
              style={{
                width: PANEL,
                height: PANEL,
                objectFit: "cover",
                transform: "scaleX(-1)",
                background: "#111",
              }}
            />
            {/* Hand-landmark overlay, mirrored the same way as the video so
                drawn coordinates don't need their own mirroring logic. */}
            <canvas
              ref={overlayRef}
              width={PANEL}
              height={PANEL}
              style={{
                position: "absolute",
                inset: 0,
                width: PANEL,
                height: PANEL,
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

      <p className="text-xs text-zinc-500">
        Current gesture: {label} · press &quot;d&quot; to toggle debug
      </p>
    </div>
  );
}

function drawOverlay(
  canvas: HTMLCanvasElement | null,
  video: HTMLVideoElement,
  handsLandmarks: Point[][],
  debugOn: boolean
) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!debugOn || !handsLandmarks.length) return;

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
