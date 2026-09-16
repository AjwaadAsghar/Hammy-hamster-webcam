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

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [debugOn, setDebugOn] = useState(true);
  const [gesture, setGesture] = useState("default");
  const memeImagesRef = useRef<Record<string, HTMLImageElement>>({});
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
        // Preload meme images.
        await Promise.all(
          Object.entries(MEMES).map(
            ([key, src]) =>
              new Promise<void>((resolve) => {
                const img = new Image();
                img.onload = () => resolve();
                img.onerror = () => resolve();
                img.src = src;
                memeImagesRef.current[key] = img;
              })
          )
        );

        const vision = await FilesetResolver.forVisionTasks(WASM_URL);

        // CPU delegates: running three GPU/WebGL-backed models concurrently in
        // one tab causes them to fight over WebGL contexts (observed as
        // repeated "Graph finished closing" / recreate churn and a fatal
        // "Cannot read properties of null (reading 'getContext')" crash from
        // inside the vision library). CPU delegates avoid that entirely.
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

        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 640 },
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

        const loop = () => {
          if (cancelled) return;
          // A single frame throwing (e.g. a transient error from the vision
          // library) must not stop rAF from rescheduling, or the whole feed
          // freezes permanently on whatever last rendered.
          try {
            renderFrame();
          } catch (err) {
            console.error("frame error", err);
          }
          rafId = requestAnimationFrame(loop);
        };

        const renderFrame = () => {
          const now = performance.now();
          if (video.readyState >= 2 && canvasRef.current) {
            const handResult = hand!.detectForVideo(video, now);
            const faceResult = face!.detectForVideo(video, now);
            const poseResult = pose!.detectForVideo(video, now);

            const handsLandmarks = (handResult.landmarks ?? []) as Point[][];
            const faceLandmarks = (faceResult.faceLandmarks ?? []) as Point[][];
            const faceMatrices = faceResult.facialTransformationMatrixes
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
            const poseLandmarks = (poseResult.landmarks ?? []) as Point[][];

            const { gesture: detected } = classifyGesture(
              handsLandmarks,
              faceLandmarks.length ? faceLandmarks : null,
              faceMatrices,
              poseLandmarks.length ? poseLandmarks : null
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
            if (topCount >= VOTE_MAJORITY) stableGesture = topGesture;

            draw(
              canvasRef.current,
              video,
              memeImagesRef.current[stableGesture] ?? memeImagesRef.current.default,
              stableGesture,
              debugOnRef.current
            );
            setGesture((prev) => (prev === stableGesture ? prev : stableGesture));
          }
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

      <canvas ref={canvasRef} width={PANEL * 2 + 2} height={PANEL + 46 + 28} className="rounded-xl shadow-2xl" />
      <video ref={videoRef} className="hidden" playsInline muted />

      <p className="text-xs text-zinc-500">
        Current gesture: {displayGestureName(gesture)} · press &quot;d&quot; to toggle debug
      </p>
    </div>
  );
}

function draw(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  memeImg: HTMLImageElement,
  gesture: string,
  debugOn: boolean
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const HEADER_H = 46;
  const FOOTER_H = 28;
  const W = PANEL;
  const H = PANEL;

  ctx.fillStyle = "rgb(26,22,22)";
  ctx.fillRect(0, 0, canvas.width, HEADER_H);
  ctx.fillStyle = "rgb(18,16,16)";
  ctx.fillRect(0, HEADER_H + H, canvas.width, FOOTER_H);

  // Meme panel.
  if (memeImg.complete && memeImg.naturalWidth > 0) {
    ctx.drawImage(memeImg, 0, HEADER_H, W, H);
  } else {
    ctx.fillStyle = "#333";
    ctx.fillRect(0, HEADER_H, W, H);
  }

  // Camera panel, mirrored, cropped to square, centered.
  const vw = video.videoWidth || W;
  const vh = video.videoHeight || H;
  const side = Math.min(vw, vh);
  const sx = (vw - side) / 2;
  const sy = (vh - side) / 2;

  ctx.save();
  ctx.translate(W + 2 + W, HEADER_H);
  ctx.scale(-1, 1);
  ctx.drawImage(video, sx, sy, side, side, -W, 0, W, H);
  ctx.restore();

  // Divider.
  ctx.fillStyle = "rgb(55,50,50)";
  ctx.fillRect(W - 1, HEADER_H, 2, H);

  // Header: live dot + title.
  ctx.fillStyle = "rgb(90,220,100)";
  ctx.beginPath();
  ctx.arc(18, HEADER_H / 2, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgb(235,235,235)";
  ctx.font = "600 15px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("Happy Birthday Stinky", 32, HEADER_H / 2 + 1);

  // Gesture pill.
  const label = displayGestureName(gesture);
  ctx.font = "600 13px system-ui, sans-serif";
  const labelW = ctx.measureText(label).width;
  const padX = 14,
    padY = 8;
  const pillW = labelW + padX * 2;
  const pillH = 16 + padY * 2;
  const pillX0 = canvas.width - pillW - 16;
  const pillY0 = (HEADER_H - pillH) / 2;
  ctx.fillStyle = "rgb(200,160,255)";
  roundRect(ctx, pillX0, pillY0, pillW, pillH, 8);
  ctx.fill();
  ctx.fillStyle = "rgb(25,20,20)";
  ctx.fillText(label, pillX0 + padX, pillY0 + pillH / 2 + 1);

  // Footer hints.
  ctx.fillStyle = "rgb(150,150,150)";
  ctx.font = "12px system-ui, sans-serif";
  const footerY = HEADER_H + H + FOOTER_H / 2 + 1;
  ctx.fillText("live in your browser", 16, footerY);
  const debugHint = debugOn ? "d: hide debug" : "d: show debug";
  const debugW = ctx.measureText(debugHint).width;
  ctx.fillText(debugHint, canvas.width - debugW - 16, footerY);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
