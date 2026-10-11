import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plant, type PlantExpression } from "@/components/Plant";
import { Button } from "@/components/ui/button";
import { Drama, PictureInPicture2, Square } from "lucide-react";
import { createPortal } from "react-dom";
import { StreakChart } from "@/components/StreakChart";
import { playFanfare } from "@/lib/fanfare";
import {
  calibrate,
  createState,
  drinkSignals,
  logDrink,
  moodLabel,
  RULES,
  tick,
  type Baseline,
  type PlantEvent,
  type PlantState,
  type Reading,
} from "@/lib/plant-core";
import { checkDrinkVessel, judgePosture, plantLine, plantVoice } from "@/lib/plant.functions";
import { useFaceSensor } from "@/lib/use-face-sensor";

const TEXT_ONLY = true;
const EXPRESSIONS: PlantExpression[] = ["squint", "eye-roll", "pressed-lips", "head-shake", "smug", "unimpressed", "watchful"];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sigh-cus — the desk plant that judges your posture" },
      {
        name: "description",
        content:
          "A melodramatic office plant that watches your posture, hydration and screen time through your webcam, then sighs, wilts and sends theatrical guilt notifications.",
      },
      { property: "og:title", content: "Sigh-cus — the desk plant that judges your posture" },
      {
        property: "og:description",
        content:
          "Slouch for two minutes and your desk plant audibly despairs. Drink water and it throws a gospel choir.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlantApp,
});

const STORE_KEY = "guilt-trip-plant/v1";

/** Used when running without a camera, so the demo never depends on hardware. */
const SYNTH_BASELINE: Baseline = { pitch: 0.8, frameY: 0.35, eyeDist: 0.18, mouthGap: 0.12 };

type Mode = "off" | "camera" | "demo";

type Bubble = {
  line: string;
  delivery: string;
  leaf: string;
  kind: PlantEvent["kind"];
};

function restore(): PlantState {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return createState(Date.now());
    const parsed = JSON.parse(raw) as PlantState;
    if (typeof parsed?.mood !== "number" || !Array.isArray(parsed?.trail)) {
      return createState(Date.now());
    }
    return parsed;
  } catch {
    return createState(Date.now());
  }
}

function PlantApp() {
  const [state, setState] = useState<PlantState>(() => createState(Date.now()));
  const stateRef = useRef(state);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [mode, setMode] = useState<Mode>("off");
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [leaf, setLeaf] = useState<"wither" | "perk" | "droop">("perk");
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [judging, setJudging] = useState<string | null>(null);
  const [log, setLog] = useState<{ at: number; kind: string; line: string }[]>([]);
  const [demoSpeed, setDemoSpeed] = useState(1);
  const [expressionStep, setExpressionStep] = useState<number | null>(null);
  useEffect(() => {
    if (expressionStep === null) return;
    const timeout = setTimeout(() => {
      setExpressionStep(expressionStep >= EXPRESSIONS.length - 1 ? null : expressionStep + 1);
    }, 4200);
    return () => clearTimeout(timeout);
  }, [expressionStep]);

  const readingRef = useRef<Reading | null>(null);
  const demoRef = useRef<Reading>({ ...SYNTH_BASELINE, at: Date.now(), faceVisible: true });
  const calibSamples = useRef<Reading[]>([]);
  const collecting = useRef(false);
  const recentLines = useRef<string[]>([]);
  const busy = useRef(false);
  const modeRef = useRef<Mode>("off");
  const speedRef = useRef(1);
  const baseRef = useRef<Baseline | null>(null);
  const lastAt = useRef(0);

  modeRef.current = mode;
  speedRef.current = demoSpeed;
  baseRef.current = baseline;

  const onReading = useCallback((r: Reading) => {
    readingRef.current = r;
    if (collecting.current && r.faceVisible) {
      calibSamples.current.push(r);
    }
  }, []);

  const sensor = useFaceSensor(onReading);
  const { videoRef, start, stop, status, error, captureFrame, setFrameSource } = sensor;
  const [pipWin, setPipWin] = useState<Window | null>(null);
  const pipRef = useRef<Window | null>(null);
  pipRef.current = pipWin;

  const openFloat = useCallback(async () => {
    const dpip = (window as unknown as { documentPictureInPicture?: { requestWindow: (o: { width: number; height: number }) => Promise<Window> } }).documentPictureInPicture;
    if (!dpip) {
      setVoiceNote("Floating Gerald needs Chrome or Edge on a computer. Keep this tab visible instead.");
      return;
    }
    if (pipRef.current && !pipRef.current.closed) return;
    try {
      const w = await dpip.requestWindow({ width: 240, height: 300 });
      for (const ss of Array.from(document.styleSheets)) {
        try {
          const st = w.document.createElement("style");
          st.textContent = Array.from(ss.cssRules).map((r) => r.cssText).join("\n");
          w.document.head.appendChild(st);
        } catch {
          if (ss.href) {
            const l = w.document.createElement("link");
            l.rel = "stylesheet";
            l.href = ss.href;
            w.document.head.appendChild(l);
          }
        }
      }
      w.document.documentElement.className = document.documentElement.className;
      w.document.body.className = "m-0 bg-background text-foreground";
      w.document.title = "Gerald";
      w.addEventListener("pagehide", () => {
        setFrameSource(null);
        setPipWin(null);
      });
      setFrameSource(w);
      setPipWin(w);
    } catch {
      setVoiceNote("The browser blocked the floating plant. Press Float Gerald again.");
    }
  }, [setFrameSource]);

  // Chrome can pop Gerald out automatically when you switch tabs while the camera is on.
  useEffect(() => {
    if (mode !== "camera") return;
    try {
      navigator.mediaSession?.setActionHandler("enterpictureinpicture" as MediaSessionAction, () => void openFloat());
    } catch {
      /* unsupported */
    }
    return () => {
      try {
        navigator.mediaSession?.setActionHandler("enterpictureinpicture" as MediaSessionAction, null);
      } catch {
        /* unsupported */
      }
    };
  }, [mode, openFloat]);

  function backToApp() {
    window.focus();
  }
  const captureRef = useRef(captureFrame);
  captureRef.current = captureFrame;

  // hydrate persisted state
  useEffect(() => {
    const s = restore();
    stateRef.current = s;
    setState(s);
  }, []);

  const commit = useCallback((next: PlantState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopAll = useCallback(() => {
    stop();
    setMode("off");
    audioRef.current?.pause();
    audioRef.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
    setVoiceNote(null);
  }, [stop]);

  const speak = useCallback(async (text: string, delivery: string) => {
    // Text-only while the user validates responses: no ElevenLabs, no browser voice.
    if (TEXT_ONLY) {
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    try {
      const { audio } = await plantVoice({
        data: { text, delivery: delivery as "sigh" | "scold" | "gospel" | "whisper" },
      });
      const el = new Audio(`data:audio/mpeg;base64,${audio}`);
      audioRef.current?.pause();
      audioRef.current = el;
      el.onended = () => setSpeaking(false);
      await el.play();
    } catch (e) {
      setVoiceNote(
        "The spoken voice is unavailable, so the plant is using the browser's voice instead. " +
          "Give the ElevenLabs key the text_to_speech permission for the real thing.",
      );
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = delivery === "whisper" ? 0.82 : 0.95;
        u.pitch = (delivery === "gospel" ? 1.2 : 0.85) + (Math.random() - 0.5) * 0.3;
        u.onend = () => setSpeaking(false);
        window.speechSynthesis.speak(u);
      } else {
        setSpeaking(false);
      }
      void e;
    }
  }, []);

  const [quietUntil, setQuietUntil] = useState<number | null>(null);
  const quietRef = useRef<number | null>(null);
  quietRef.current = quietUntil;
  useEffect(() => {
    if (!quietUntil) return;
    const id = window.setTimeout(() => setQuietUntil(null), Math.max(0, quietUntil - Date.now()));
    return () => window.clearTimeout(id);
  }, [quietUntil]);

  function goQuiet(minutes: number | null) {
    if (minutes === null) return setQuietUntil(null);
    setQuietUntil(Date.now() + minutes * 60_000);
    audioRef.current?.pause();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  const react = useCallback(
    async (events: PlantEvent[]) => {
      if (!events.length) return;
      const ev = events.find((x) => x.kind === "drink") ?? events[events.length - 1];
      if (!ev) return;
      // quiet time: keep counting, say nothing
      if (quietRef.current && Date.now() < quietRef.current) {
        if (ev.kind === "drink") {
          setLeaf("perk");
          setPulse((p) => p + 1);
          setBubble({ line: "Sip counted.", delivery: "whisper", leaf: "perk", kind: "drink" });
        }
        return;
      }
      // a drink always gets its comment, even if another line is mid-flight
      if (busy.current && ev.kind !== "drink") return;
      busy.current = true;
      const s = stateRef.current;
      try {
        const out = await plantLine({
          data: {
            kind: ev.kind,
            mood: s.mood,
            slouchSeconds: s.slouchMs / 1000,
            dryMinutes: s.dryMs / 60000,
            screenMinutes: s.screenMs / 60000,
            drinks: s.drinkCount,
            streak: s.drinkStreak,
            recentLines: recentLines.current,
          },
        });
        const nextLeaf = out.leaf as "wither" | "perk" | "droop";
        setLeaf(nextLeaf);
        setPulse((p) => p + 1);
        setBubble({ line: out.line, delivery: out.delivery, leaf: out.leaf, kind: ev.kind });
        recentLines.current = [out.line, ...recentLines.current].slice(0, 12);
        setLog((l) => [{ at: ev.at, kind: ev.kind, line: out.line }, ...l].slice(0, 12));
        if (ev.kind === "drink") playFanfare();
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Your plant is suffering", { body: out.line });
        }
        busy.current = false;
        await speak(out.line, out.delivery);
      } catch (e) {
        if (ev.kind === "drink") {
          const pool = [
            "Wow. Hydrated. Truly, a historic achievement for someone of your caliber.",
            "Look at you, keeping yourself alive. Groundbreaking.",
            "One whole sip. I'll notify the newspapers.",
            "Impressive. Most adults need a reminder for that. Oh wait, you did too.",
            "Water. Voluntarily. I almost respect it.",
          ];
          const line = pool[Math.floor(Math.random() * pool.length)] ?? pool[0]!;
          setBubble({ line, delivery: "scold", leaf: "perk", kind: "drink" });
          setLog((l) => [{ at: ev.at, kind: ev.kind, line }, ...l].slice(0, 12));
          playFanfare();
        }
        setVoiceNote((e as Error).message || "The plant could not find words.");
      } finally {
        busy.current = false;
      }
    },
    [speak],
  );

  // the watching loop
  useEffect(() => {
    if (mode === "off") return;
    lastAt.current = Date.now();
    const id = window.setInterval(() => {
      const base = baseRef.current ?? SYNTH_BASELINE;
      const now = Date.now();
      const dt = Math.min(2000, now - lastAt.current) * speedRef.current;
      lastAt.current = now;
      const reading =
        modeRef.current === "camera" ? readingRef.current : { ...demoRef.current, at: now };
      if (!reading) return;
      const prev = stateRef.current;
      const out = tick(prev, reading, dt, base);
      commit(out.state);
      const sip = out.events.some((e) => e.kind === "drink");
      if (sip && modeRef.current === "camera") {
        // head tilt says "sip": ask Gemini to confirm there is a cup or bottle
        const frame = captureRef.current?.();
        const rest = out.events.filter((e) => e.kind !== "drink");
        if (rest.length) void react(rest);
        if (!frame) {
          void react(out.events.filter((e) => e.kind === "drink"));
          return;
        }
        void checkDrinkVessel({ data: { image: frame } })
          .then((v) => v.holdingDrink)
          .catch(() => true) // if the check fails, trust the head tilt
          .then((ok) => {
            if (ok) {
              void react(out.events.filter((e) => e.kind === "drink"));
              return;
            }
            const cur = stateRef.current;
            commit({
              ...cur,
              drinkCount: prev.drinkCount,
              drinkStreak: prev.drinkStreak,
              mood: Math.min(cur.mood, prev.mood),
              dryMs: prev.dryMs + dt,
              slouchMs: prev.slouchMs,
              lastDrinkAt: Date.now() - RULES.drinkCooldownMs + 5000,
            });
            setVoiceNote("Head tipped back, but Gemini saw no cup or bottle. Not counted.");
          });
        return;
      }
      if (out.events.length) void react(out.events);
    }, 200);
    return () => window.clearInterval(id);
  }, [mode, commit, react]);

  // persist
  useEffect(() => {
    const id = window.setInterval(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(stateRef.current));
      } catch {
        /* storage full or blocked; the plant simply forgets */
      }
    }, 4000);
    return () => window.clearInterval(id);
  }, []);

  async function beginCamera() {
    // Some browsers (older Safari, embedded frames) throw here — never let it block the camera.
    try {
      if ("Notification" in window && Notification.permission === "default") {
        const p = Notification.requestPermission() as Promise<NotificationPermission> | undefined;
        p?.catch?.(() => undefined);
      }
    } catch {
      /* ignore */
    }
    setMode("camera");
    await new Promise((r) => setTimeout(r, 0));
    await start();
  }

  function beginDemo() {
    demoRef.current = { ...SYNTH_BASELINE, at: Date.now(), faceVisible: true };
    setMode("demo");
    setDemoSpeed(10);
  }

  function calibrateNow() {
    calibSamples.current = [];
    collecting.current = true;
    setVoiceNote("Hold your best posture for a few seconds…");
    window.setTimeout(() => {
      collecting.current = false;
      try {
        setBaseline(calibrate(calibSamples.current.slice(-12)));
        setVoiceNote(null);
      } catch (e) {
        setVoiceNote((e as Error).message);
      }
    }, 2500);
  }

  function demo(kind: "slouch" | "drink" | "away" | "upright") {
    const b = baseRef.current ?? SYNTH_BASELINE;
    const at = Date.now();
    if (kind === "away") demoRef.current = { at, faceVisible: false, pitch: 0, frameY: 0, eyeDist: 0, mouthGap: 0 };
    else if (kind === "slouch")
      demoRef.current = { at, faceVisible: true, pitch: b.pitch * 1.5, frameY: b.frameY, eyeDist: b.eyeDist, mouthGap: b.mouthGap };
    else if (kind === "drink") {
      demoRef.current = { at, faceVisible: true, pitch: b.pitch * 0.6, frameY: b.frameY, eyeDist: b.eyeDist, mouthGap: b.mouthGap + 0.25 };
      // one press is one sip: the mouth closes again shortly after
      window.setTimeout(() => demo("upright"), 1200);
    } else demoRef.current = { at, faceVisible: true, ...b };
  }

  function drankByHand() {
    const out = logDrink(stateRef.current, Date.now());
    commit(out.state);
    if (out.events.length) void react(out.events);
    else setVoiceNote("Already counted a sip in the last 20 seconds.");
  }

  const sip =
    mode === "camera" && readingRef.current && baseRef.current
      ? drinkSignals(readingRef.current, baseRef.current)
      : { chinUp: false, mouthOpen: false, chinWayUp: false };

  async function askGerald() {
    const frame = captureFrame?.();
    if (!frame) {
      setVoiceNote("Start the camera first so Gerald can get a look at you.");
      return;
    }
    setJudging("Gerald is squinting at you…");
    try {
      const verdict = await judgePosture({ data: { image: frame } });
      setJudging(null);
      setLeaf(verdict.leaf as "wither" | "perk" | "droop");
      setPulse((p) => p + 1);
      setBubble({ line: verdict.line, delivery: verdict.delivery, leaf: verdict.leaf, kind: "slouch" });
      setLog((l) => [{ at: Date.now(), kind: "verdict", line: verdict.summary }, ...l].slice(0, 12));
      await speak(verdict.line, verdict.delivery);
    } catch (e) {
      setJudging(null);
      setVoiceNote((e as Error).message);
    }
  }

  function reset() {
    const fresh = createState(Date.now());
    stateRef.current = fresh;
    setState(fresh);
    setBubble(null);
    setLog([]);
    recentLines.current = [];
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {
      /* nothing to clean */
    }
  }

  const active = mode !== "off";
  const sessionMinutes = useMemo(
    () =>
      Math.floor(
        ((state.trail[state.trail.length - 1]?.at ?? state.startedAt) - state.startedAt) / 60000,
      ),
    [state],
  );

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-8">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.35em] text-primary">Passive-aggressive office tamagotchi</p>
        <h1 className="mt-2 font-display text-5xl leading-none sm:text-6xl">Sigh-cus</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          A desk plant that does not track productivity. It watches your posture, your hydration and
          your screen time, and reacts entirely through guilt and melodrama.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* camera view — spans the full width so more of the room is visible */}
        <section className={mode === "camera" ? "lg:col-span-2" : "hidden"}>
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            onLoadedMetadata={(e) => void e.currentTarget.play().catch(() => undefined)}
            className="aspect-video max-h-[60vh] w-full -scale-x-100 rounded-xl bg-muted object-contain"
          />
        </section>
        {/* the plant */}
        <section className="rounded-3xl border bg-card p-5">
          <div className="mx-auto h-72 w-full max-w-xs">
            <Plant mood={state.mood} leaf={leaf} speaking={speaking} pulse={pulse} reaction={bubble?.kind} previewExpression={expressionStep === null ? undefined : EXPRESSIONS[expressionStep]} />
          </div>
          <div className="mt-2 flex justify-center">
            <Button variant="outline" size="sm" onClick={() => (pipWin ? pipWin.close() : void openFloat())}>
              <PictureInPicture2 className="mr-2 h-4 w-4" />
              {pipWin ? "Bring Gerald back in" : "Float Gerald over other windows"}
            </Button>
          </div>
          {pipWin &&
            createPortal(
              <button
                type="button"
                onClick={backToApp}
                title="Back to Sigh-cus"
                className="flex h-screen w-screen cursor-pointer flex-col items-center justify-center gap-1 border-0 bg-background p-2 text-foreground"
              >
                <div className="h-48 w-40">
                  <Plant mood={state.mood} leaf={leaf} speaking={speaking} pulse={pulse} reaction={bubble?.kind} previewExpression={expressionStep === null ? undefined : EXPRESSIONS[expressionStep]} />
                </div>
                <p className="line-clamp-3 px-1 text-center text-xs italic leading-snug">
                  {bubble?.line ?? `${Math.round(state.mood)}% happy · ${moodLabel(state.mood)}`}
                </p>
              </button>,
              pipWin.document.body,
            )}

          <div className="mt-2 rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <p className="text-xs uppercase tracking-widest text-primary">
              {quietUntil ? "quiet time" : bubble ? bubble.kind === "drink" ? "celebrating" : bubble.kind === "back" ? "noticing you" : "nagging" : "waiting"}
            </p>
            <p className="mt-2 min-h-[3.5rem] font-display text-xl italic leading-snug">
              {bubble?.line ??
                (active
                  ? "Nothing yet. Give it a moment. Or two. Or twenty."
                  : "Start the camera and tell it where good posture looks like for you.")}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-secondary p-3">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">mood</p>
              <p className="mt-1 font-display text-2xl">{Math.round(state.mood)}</p>
              <p className="text-xs text-primary">{moodLabel(state.mood)}</p>
            </div>
            <div className="rounded-xl bg-secondary p-3">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">drinks</p>
              <p className="mt-1 font-display text-2xl">{state.drinkCount}</p>
              <p className="text-xs text-primary">
                streak {state.drinkStreak} · slouches {state.slouchCount}
              </p>
            </div>
          </div>
        </section>

        {/* controls + evidence */}
        <section className="space-y-5">
          <div className="rounded-3xl border bg-card p-5">
            {(!active || status === "denied" || status === "failed" || status === "unsupported") && (
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={beginCamera}
                  disabled={status === "loading"}
                  className="cursor-pointer rounded-xl bg-primary px-5 py-2.5 font-medium text-primary-foreground transition hover:opacity-90 hover:ring-2 hover:ring-primary/40 disabled:cursor-wait disabled:opacity-50"
                >
                  {status === "loading" ? "Opening camera…" : "Start the camera"}
                </button>
                <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={beginDemo}
                  className="rounded-xl border border-border px-5 py-2.5 font-medium hover:border-primary"
                >
                  Run in demo mode
                </button>
                <Button
                  variant="outline"
                  onClick={() => setExpressionStep(expressionStep === null ? 0 : null)}
                  aria-pressed={expressionStep !== null}
                  className="h-auto min-h-11 border-border bg-card px-5 py-2.5 text-foreground hover:border-primary hover:bg-secondary hover:text-foreground"
                >
                  {expressionStep === null ? <Drama aria-hidden="true" /> : <Square aria-hidden="true" />}
                  {expressionStep === null ? "Preview expressions" : "Stop expressions"}
                </Button>
                </div>
              </div>
            )}


            {mode === "camera" && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {!baseline ? (
                  <button
                    onClick={calibrateNow}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                  >
                    I am sitting up straight — remember this
                  </button>
                ) : (
                  <span className="text-sm text-primary">Posture baseline saved.</span>
                )}
                {quietUntil ? (
                  <button onClick={() => goQuiet(null)} className="rounded-xl border border-primary px-4 py-2 text-sm text-primary">
                    Quiet until {new Date(quietUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} — let Gerald talk again
                  </button>
                ) : (
                  <button onClick={() => goQuiet(30)} className="rounded-xl border border-border px-4 py-2 text-sm hover:border-primary">
                    Quiet for 30 minutes
                  </button>
                )}
                <button onClick={drankByHand} className="rounded-xl border border-border px-4 py-2 text-sm hover:border-primary">
                  I just drank water
                </button>
                <button onClick={askGerald} className="rounded-xl border border-border px-4 py-2 text-sm hover:border-primary">
                  What does my posture look like right now?
                </button>
                <button onClick={stopAll} className="rounded-xl border border-border px-4 py-2 text-sm hover:border-destructive">
                  Stop
                </button>
              </div>
            )}

            {mode === "demo" && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="mr-1 text-sm text-muted-foreground">Pretend that I…</span>
                {(["slouch", "drink", "away", "upright"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => demo(k)}
                    className="rounded-full border border-border px-4 py-1.5 text-sm capitalize hover:border-primary"
                  >
                    {k === "upright" ? "sit up" : k === "away" ? "walk away" : k}
                  </button>
                ))}
                {quietUntil ? (
                  <button onClick={() => goQuiet(null)} className="rounded-full border border-primary px-4 py-1.5 text-sm text-primary">
                    Quiet until {new Date(quietUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} — let Gerald talk again
                  </button>
                ) : (
                  <button onClick={() => goQuiet(30)} className="rounded-full border border-border px-4 py-1.5 text-sm hover:border-primary">
                    Quiet for 30 minutes
                  </button>
                )}
                <button
                  onClick={() => setDemoSpeed((s) => (s === 1 ? 10 : 1))}
                  className="ml-auto rounded-full border border-border px-3 py-1 text-xs hover:border-primary"
                >
                  {demoSpeed === 10 ? "demo speed ×10" : "real time"}
                </button>
                <button onClick={stopAll} className="rounded-xl border border-border px-4 py-2 text-sm hover:border-destructive">
                  Stop
                </button>
              </div>
            )}

            {mode === "camera" && baseline && (
              <p className="mt-3 text-xs text-muted-foreground">
                Sip detector: chin up{" "}
                <span className={sip.chinUp ? "text-primary" : ""}>{sip.chinUp ? "yes" : "no"}</span> · mouth open{" "}
                <span className={sip.mouthOpen ? "text-primary" : ""}>{sip.mouthOpen ? "yes" : "no"}</span>
                {" "}— tip your head back like you are drinking and hold it for a second.
              </p>
            )}

            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
            {judging && <p className="mt-3 text-sm text-primary">{judging}</p>}
            {voiceNote && <p className="mt-3 text-sm text-muted-foreground">{voiceNote}</p>}
          </div>

          <div className="rounded-3xl border bg-card p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-2xl">Guilt streak</h2>
              <span className="text-xs text-muted-foreground">
                {sessionMinutes} min watched · two minutes of slouching earns a sigh
              </span>
            </div>
            <div className="mt-4">
              <StreakChart trail={state.trail} />
            </div>
            <button onClick={reset} className="mt-4 text-xs text-muted-foreground underline hover:text-primary">
              Forgive me and start over
            </button>
          </div>

          <div className="rounded-3xl border bg-card p-5">
            <h2 className="font-display text-2xl">What it said</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {log.length === 0 && <li className="text-muted-foreground">Nothing yet.</li>}
              {log.map((entry, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-16 shrink-0 text-xs uppercase tracking-widest text-muted-foreground">
                    {entry.kind}
                  </span>
                  <span className="italic">{entry.line}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
