import { useCallback, useEffect, useRef, useState } from "react";
import type { Reading } from "./plant-core";

export type SensorStatus =
  | "idle"
  | "loading"
  | "running"
  | "denied"
  | "unsupported"
  | "failed";

/**
 * Webcam face tracking. MediaPipe is loaded only when the user actually starts
 * the camera, so nothing browser-only is pulled into the server render.
 */
export function useFaceSensor(onReading: (reading: Reading) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const landmarkerRef = useRef<{
    detectForVideo: (v: HTMLVideoElement, t: number) => {
      faceLandmarks?: { x: number; y: number }[][];
    };
  } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const callbackRef = useRef(onReading);
  const rafRef = useRef(0);
  const lastAtRef = useRef(0);
  const [status, setStatus] = useState<SensorStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  callbackRef.current = onReading;

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStatus("idle");
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    setError(null);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      setError("This browser cannot open a camera.");
      return;
    }

    setStatus("loading");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
    } catch (e) {
      setStatus("denied");
      setError(
        (e as Error).name === "NotAllowedError"
          ? "Camera access was blocked. Allow it in your browser, then try again."
          : "No camera found on this machine.",
      );
      return;
    }

    streamRef.current = stream;
    const video = videoRef.current;
    if (!video) {
      stop();
      return;
    }
    video.srcObject = stream;
    await video.play().catch(() => undefined);

    try {
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm",
      );
      const make = (delegate: "GPU" | "CPU") =>
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate,
          },
          runningMode: "VIDEO",
          numFaces: 1,
        });
      try {
        landmarkerRef.current = await make("GPU");
      } catch {
        landmarkerRef.current = await make("CPU");
      }
    } catch (e) {
      setStatus("failed");
      setError(
        `Could not load the face tracker (${(e as Error).message}). You can still run the plant in demo mode.`,
      );
      return;
    }

    setStatus("running");
    void videoRef.current?.play().catch(() => undefined);

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const v = videoRef.current;
      const lm = landmarkerRef.current;
      if (!v || !lm || v.readyState < 2) return;

      const now = performance.now();
      if (now - lastAtRef.current < 200) return; // ~5 readings a second
      lastAtRef.current = now;

      const results = lm.detectForVideo(v, now);
      const face = results?.faceLandmarks?.[0];
      const at = Date.now();

      if (!face) {
        callbackRef.current({
          at,
          faceVisible: false,
          pitch: 0,
          frameY: 0,
          eyeDist: 0,
          mouthGap: 0,
        });
        return;
      }

      // Work in pixels: mixing a normalised x with a normalised y would make
      // the angles depend on the video's aspect ratio.
      const W = v.videoWidth || 640;
      const H = v.videoHeight || 480;
      const px = (i: number) => (face[i]?.x ?? 0) * W;
      const py = (i: number) => (face[i]?.y ?? 0) * H;

      const eyeMidY = (py(33) + py(133)) / 2;
      const eyeMidX = (px(33) + px(133)) / 2;
      const eyeDist = Math.hypot(px(133) - px(33), py(133) - py(33));
      const mouthGap = (py(14) - py(13)) / (eyeDist || 1);

      callbackRef.current({
        at,
        faceVisible: eyeDist > 8,
        pitch: (py(1) - eyeMidY) / (eyeDist || 1),
        frameY: eyeMidY / H,
        eyeDist: eyeDist / W,
        mouthGap,
      });
    };
    loop();
  }, [stop]);

  /** Small JPEG of the current frame, for the on-demand posture judgement. */
  const captureFrame = useCallback((): string | null => {
    const v = videoRef.current;
    if (!v || v.readyState < 2) return null;
    const c = document.createElement("canvas");
    const scale = Math.min(1, 512 / Math.max(v.videoWidth, v.videoHeight));
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.7);
  }, []);

  return { videoRef, start, stop, status, error, captureFrame };
}
