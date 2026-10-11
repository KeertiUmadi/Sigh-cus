import { createFileRoute, useHydrated } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plant } from "@/components/Plant";
import { Button } from "@/components/ui/button";
import { TriggerSettings } from "@/components/TriggerSettings";
import { FloatingGerald, useFloatingGerald } from "@/components/FloatingGerald";
import {
  ArrowUpRight,
  Camera,
  Droplets,
  Leaf,
  Play,
  ShieldCheck,
  Sparkles,
  MessageCircle,
  X,
  Volume2,
  VolumeX,
} from "lucide-react";
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
  defaultTriggers,
  type Triggers,
  type Baseline,
  type PlantEvent,
  type PlantState,
  type Reading,
} from "@/lib/plant-core";
import { recallHabits, rememberHabit } from "@/lib/memory.functions";
import { checkDrinkVessel, judgePosture, plantLine, plantVoice } from "@/lib/plant.functions";
import { useFaceSensor } from "@/lib/use-face-sensor";

/** Gerald keeps his mouth shut until you tell him otherwise. */
const VOICE_ON_BY_DEFAULT = false;

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
          "Slouch for five seconds and your desk plant audibly despairs. Drink water and it throws a gospel choir.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlantApp,
});

const STORE_KEY = "guilt-trip-plant/v1";
const DEMO_KINDS = [
  "slouch",
  "drink",
  "away",
  "frown",
  "stare",
  "close",
  "nails",
  "yawn",
  "phone",
  "upright",
] as const;
type DemoKind = (typeof DEMO_KINDS)[number];
const DEMO_LABEL: Record<DemoKind, string> = {
  slouch: "slouch",
  drink: "drink",
  away: "walk away",
  frown: "frown",
  stare: "stare",
  close: "lean in",
  nails: "bite nails",
  yawn: "yawn",
  phone: "check phone",
  upright: "behave",
};

/** Used when running without a camera, so the demo never depends on hardware. */
const SYNTH_BASELINE: Baseline = { pitch: 0.8, frameY: 0.35, eyeDist: 0.18, mouthGap: 0.12 };

type Mode = "off" | "camera" | "demo" | "nocam";

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
  const hydrated = useHydrated();
  const showDemo =
    hydrated &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      /^id-preview--[a-z0-9-]+\.lovable\.app$/.test(window.location.hostname));
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
  const [triggers, setTriggers] = useState<Triggers>(defaultTriggers);
  const triggersRef = useRef(triggers);
  triggersRef.current = triggers;
  const [voiceOn, setVoiceOn] = useState(VOICE_ON_BY_DEFAULT);
  const voiceRef = useRef(VOICE_ON_BY_DEFAULT);
  voiceRef.current = voiceOn;

  const readingRef = useRef<Reading | null>(null);
  const demoRef = useRef<Reading>({ ...SYNTH_BASELINE, at: Date.now(), faceVisible: true });
  const calibSamples = useRef<Reading[]>([]);
  const collecting = useRef(false);
  const recentLines = useRef<string[]>([]);
  const memories = useRef<string[]>([]);
  const MEM_KEY = "sigh-cus-memory-id";
  const remember = useCallback(async (ev: PlantEvent) => {
    if (ev.kind === "back") return;
    const label =
      ev.kind === "fixed"
        ? `fixed their ${ev.of ?? "slouch"} habit`
        : ev.kind === "drink"
          ? "finally drank water"
          : `triggered a ${ev.kind} nag`;
    const text = `On ${new Date().toDateString()} at ${new Date().toLocaleTimeString()}, the user ${label}.`;
    try {
      const out = await rememberHabit({
        data: { assistantId: localStorage.getItem(MEM_KEY) ?? undefined, text },
      });
      if (out.assistantId) {
        localStorage.setItem(MEM_KEY, out.assistantId);
        memories.current = [...memories.current, text].slice(-8);
      }
    } catch {
      /* memory is optional */
    }
  }, []);
  useEffect(() => {
    const id = localStorage.getItem(MEM_KEY);
    if (!id) return;
    void recallHabits({ data: { assistantId: id } })
      .then((r) => {
        memories.current = r.memories;
      })
      .catch(() => {});
  }, []);
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
  const { videoRef, start, stop, status, error, captureFrame } = sensor;
  const [geraldOpen, setGeraldOpen] = useState(false);
  const floating = useFloatingGerald(sensor.setFrameSource);
  async function openGeraldCorner() {
    try {
      await floating.open();
      setGeraldOpen(false);
      setVoiceNote(null);
    } catch (e) {
      setGeraldOpen(true);
      setVoiceNote((e as Error).message);
    }
  }

  // Each camera/chair needs its own upright reference, not demo proportions.
  useEffect(() => {
    if (mode !== "camera" || status !== "running" || baseline) return;
    calibSamples.current = [];
    collecting.current = true;
    setVoiceNote("Sit upright for a few seconds while Gerald remembers your posture…");
    const id = window.setTimeout(() => {
      collecting.current = false;
      try {
        setBaseline(calibrate(calibSamples.current));
        setVoiceNote(null);
      } catch (e) { setVoiceNote((e as Error).message); }
    }, 2500);
    return () => { window.clearTimeout(id); collecting.current = false; };
  }, [mode, status, baseline]);

  useEffect(() => {
    if (!geraldOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setGeraldOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [geraldOpen]);

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
    // Gerald stays silent until "Fine, I'll Speak" is pressed.
    if (!voiceRef.current) {
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    let fallbackReason = "ElevenLabs audio is unavailable right now.";
    try {
      const result = await plantVoice({
        data: { text, delivery: delivery as "sigh" | "scold" | "gospel" | "whisper" },
      });
      if (result.error) {
        fallbackReason = result.error;
        throw new Error(result.error);
      }
      const el = new Audio(`data:audio/mpeg;base64,${result.audio}`);
      audioRef.current?.pause();
      audioRef.current = el;
      el.onended = () => setSpeaking(false);
      await el.play();
      setVoiceNote(null);
    } catch (e) {
      if ("speechSynthesis" in window) {
        setVoiceNote(`${fallbackReason} Gerald is using your browser’s voice.`);
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = delivery === "whisper" ? 0.82 : 0.95;
        u.pitch = (delivery === "gospel" ? 1.2 : 0.85) + (Math.random() - 0.5) * 0.3;
        u.onend = () => setSpeaking(false);
        window.speechSynthesis.speak(u);
      } else {
        setVoiceNote(`${fallbackReason} Browser speech is also unavailable.`);
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

  /** The button: lets Gerald speak out loud, or puts him back in his pot. */
  async function toggleVoice() {
    const next = !voiceRef.current;
    voiceRef.current = next;
    setVoiceOn(next);
    if (!next) {
      audioRef.current?.pause();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      setSpeaking(false);
      setVoiceNote("Gerald is back to typing.");
      return;
    }
    setVoiceNote(null);
    await speak("Fine. You asked for this.", "sigh");
  }

  const react = useCallback(
    async (events: PlantEvent[]) => {
      if (!events.length) return;
      const ev =
        events.find((x) => x.kind === "drink") ??
        events.find((x) => x.kind === "fixed") ??
        events[events.length - 1];
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
      // a corrected habit gets its backhanded compliment instantly, no waiting on AI
      if (ev.kind === "fixed") {
        const pool =
          ev.of && ev.of !== "slouch"
            ? [
                "Oh my god!! You actually stopped. A tiny miracle of self-control.",
                "Are you serious? You could fix that all along? Charming.",
                "You have got to be kidding me! Basic self-control. At last.",
                "Oh, you stopped. Truly, a hero walks among us.",
                "Fixed it. Only took being shamed by a fern.",
                "Better. Not good, but better. Baby steps.",
                "Wow, self-control. I'll mark the calendar.",
                "Look at that, you can be taught. Slowly.",
              ]
            : [
                "Oh my god!! A straight spine. And all it took was a disappointed plant.",
                "Oh, a straight spine. Look at you, doing the bare minimum.",
                "Posture corrected. I'd clap, but I'm a plant.",
                "There it is. Was that so hard? Apparently, yes.",
                "Sitting up. Truly, you contain multitudes.",
                "Vertical again. Evolution thanks you.",
              ];
        const fresh = pool.filter((l) => !recentLines.current.includes(l));
        const pick = fresh.length ? fresh : pool;
        const line = pick[Math.floor(Math.random() * pick.length)] ?? pool[0]!;
        recentLines.current = [line, ...recentLines.current].slice(0, 12);
        setLeaf("perk");
        setPulse((p) => p + 1);
        setBubble({ line, delivery: "whisper", leaf: "perk", kind: "fixed" });
        setLog((l) => [{ at: ev.at, kind: ev.kind, line }, ...l].slice(0, 12));
        void speak(line, "whisper");
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
            fixedOf: ev.of,
            mood: s.mood,
            slouchSeconds: s.slouchMs / 1000,
            dryMinutes: s.dryMs / 60000,
            screenMinutes: s.screenMs / 60000,
            drinks: s.drinkCount,
            streak: s.drinkStreak,
            recentLines: recentLines.current,
            memories: memories.current,
          },
        });
        void remember(ev);
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
    [speak, remember],
  );

  // the watching loop
  useEffect(() => {
    if (mode === "off") return;
    lastAt.current = Date.now();
    const clock = floating.floatingWindow ?? window;
    const id = clock.setInterval(() => {
      const base = baseRef.current ?? SYNTH_BASELINE;
      if (modeRef.current === "camera" && !baseRef.current) { lastAt.current = Date.now(); return; }
      const now = Date.now();
      const dt = Math.min(2000, now - lastAt.current) * speedRef.current;
      lastAt.current = now;
      const noCam = modeRef.current === "nocam";
      const reading = noCam
        ? { ...SYNTH_BASELINE, at: now, faceVisible: true }
        : modeRef.current === "camera"
          ? readingRef.current
          : { ...demoRef.current, at: now };
      if (!reading) return;
      const prev = stateRef.current;
      // Without a camera only the habits that need no eyes on you are counted.
      const trig = noCam
        ? Object.fromEntries(
            Object.entries(triggersRef.current).map(([k, v]) => [
              k,
              { ...v, on: v.on && (k === "thirst" || k === "screen") },
            ]),
          ) as typeof triggersRef.current
        : triggersRef.current;
      const out = tick(prev, reading, dt, base, trig);
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
            // a hand at the mouth with a tilt is a sip even if the cup is out of frame
            if (ok || readingRef.current?.handAtMouth) {
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
    return () => clock.clearInterval(id);
  }, [mode, commit, react, floating.floatingWindow]);

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
    setBaseline(null);
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

  function beginNoCamera() {
    setMode("nocam");
    setDemoSpeed(1);
  }

  function beginDemo() {
    if (!showDemo) return;
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

  function demo(kind: DemoKind) {
    const b = baseRef.current ?? SYNTH_BASELINE;
    const at = Date.now();
    const calm = { at, faceVisible: true, ...b, blink: 0.6 };
    if (kind === "frown") demoRef.current = { ...calm, browDown: 0.8 };
    else if (kind === "stare") demoRef.current = { ...calm, blink: 0 };
    else if (kind === "close") demoRef.current = { ...calm, eyeDist: b.eyeDist * 1.35 };
    else if (kind === "nails") demoRef.current = { ...calm, handAtMouth: true };
    else if (kind === "yawn") demoRef.current = { ...calm, jawOpen: 0.8 };
    else if (kind === "phone") demoRef.current = { ...calm, lookDown: 0.8 };
    else if (kind === "away")
      demoRef.current = { at, faceVisible: false, pitch: 0, frameY: 0, eyeDist: 0, mouthGap: 0 };
    else if (kind === "slouch")
      demoRef.current = {
        at,
        faceVisible: true,
        pitch: b.pitch * 1.5,
        frameY: b.frameY,
        eyeDist: b.eyeDist,
        mouthGap: b.mouthGap,
      };
    else if (kind === "drink") {
      demoRef.current = {
        at,
        faceVisible: true,
        pitch: b.pitch * 0.6,
        frameY: b.frameY,
        eyeDist: b.eyeDist,
        mouthGap: b.mouthGap + 0.25,
      };
      // one press is one sip: the mouth closes again shortly after
      window.setTimeout(() => demo("upright"), 1200);
    } else demoRef.current = calm;
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
      setBubble({
        line: verdict.line,
        delivery: verdict.delivery,
        leaf: verdict.leaf,
        kind: "slouch",
      });
      setLog((l) =>
        [{ at: Date.now(), kind: "verdict", line: verdict.summary }, ...l].slice(0, 12),
      );
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
    <main className="app-shell">
      <nav className="app-nav" aria-label="Main navigation">
        <a href="/" className="wordmark">
          <span className="brand-icon">
            <Leaf size={19} />
          </span>
          Sigh-cus<span className="brand-period">.</span>
        </a>
        <a href="/tracks" className="nav-link">
          Made for CodeRED <ArrowUpRight size={15} />
        </a>
      </nav>
      <header className="app-intro">
        <div>
          <p className="eyebrow">
            <span /> A little company. A lot of judgement.
          </p>
          <h1>
            Your desk could use
            <br />a little <em>character.</em>
          </h1>
          <p className="intro-copy">
            Meet Gerald. Your delightfully dramatic desk plant, here to remind you to sit tall, sip
            water, and be a little kinder to yourself.
          </p>
        </div>
        <div className={`session-badge ${active ? "is-active" : ""}`}>
          <span />
          {mode === "camera"
            ? "Camera session"
            : mode === "demo"
              ? "Demo session"
              : mode === "nocam"
                ? "No-camera session"
              : "Ready when you are"}
        </div>
      </header>

      <div className="workspace-grid">
        {/* camera view — spans the full width so more of the room is visible */}
        <section
          className={mode === "camera" ? "camera-panel" : "hidden"}
          aria-label="Camera preview"
        >
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
        <section className="gerald-card" aria-labelledby="gerald-heading">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Your desk companion</p>
              <h2 id="gerald-heading">Gerald</h2>
            </div>
            <span className="plant-label">
              <Leaf size={13} /> Mostly harmless
            </span>
          </div>
          <div className="plant-stage">
            <div className="plant-halo" aria-hidden="true" />
            <span className="stage-note" aria-hidden="true">
              a very opinionated plant
            </span>
            <div className="plant-illustration">
              <Plant
                mood={state.mood}
                leaf={leaf}
                speaking={speaking}
                pulse={pulse}
                reaction={bubble?.kind}
              />
            </div>
          </div>
          <div className="plant-actions">
            <Button variant="outline" size="sm" onClick={() => floating.floatingWindow ? floating.close() : geraldOpen ? setGeraldOpen(false) : void openGeraldCorner()}>
              <MessageCircle className="mr-2 h-4 w-4" />
              {floating.floatingWindow || geraldOpen ? "Close Gerald’s corner" : "Open Gerald’s corner"}
            </Button>
            <Button
              variant={voiceOn ? "default" : "outline"}
              size="sm"
              onClick={() => void toggleVoice()}
            >
              {voiceOn ? (
                <VolumeX className="mr-2 h-4 w-4" />
              ) : (
                <Volume2 className="mr-2 h-4 w-4" />
              )}
              {voiceOn ? "Quiet, Gerald" : "Let Gerald speak"}
            </Button>
          </div>
          <div className="mt-3 mb-5">
            <TriggerSettings value={triggers} onChange={setTriggers} />
          </div>
          <div className="gerald-speech" aria-live="polite">
            <p className="text-xs uppercase tracking-widest text-primary">
              {quietUntil
                ? "quiet time"
                : bubble
                  ? bubble.kind === "drink"
                    ? "celebrating"
                    : bubble.kind === "back" || bubble.kind === "fixed"
                      ? "noticing you"
                      : "nagging"
                  : "waiting"}
            </p>
            <p className="mt-2 min-h-[3.5rem] font-display text-xl italic leading-snug">
              {bubble?.line ??
                (active
                  ? "Nothing yet. Give it a moment. Or two. Or twenty."
                  : "“I’m rooting for you. And quietly judging your posture.”")}
            </p>
          </div>

          <div className="plant-stats">
            <div>
              <p className="stat-label">
                <Sparkles size={13} /> Gerald’s mood
              </p>
              <p className="stat-value">
                {Math.round(state.mood)}
                <span>/ 100</span>
              </p>
              <p className="text-xs text-primary">{moodLabel(state.mood)}</p>
            </div>
            <div>
              <p className="stat-label">
                <Droplets size={13} /> Water breaks
              </p>
              <p className="stat-value">
                {state.drinkCount}
                <span>sips</span>
              </p>
              <p className="text-xs text-primary">
                streak {state.drinkStreak} · {state.slouchCount} slouches
              </p>
            </div>
          </div>
        </section>

        {/* controls + evidence */}
        <section className="session-column" aria-label="Session controls and activity">
          <div className="panel control-panel">
            <p className="eyebrow">
              {active ? "Make yourself at home" : "A healthier desk ritual"}
            </p>
            <h2>{active ? "You have his attention." : "Let’s grow good habits."}</h2>
            <p className="panel-description">
              {mode === "demo"
                ? "Try a habit below and see how Gerald takes it. He has feelings about all of them."
                : mode === "nocam"
                  ? "No camera, so Gerald only tracks water and screen time. Tap “I drank water” when you sip. Posture, phone, yawning and the rest stay off."
                : mode === "camera"
                  ? "Sit comfortably, calibrate your posture, and let Gerald keep you company."
                  : "Turn on your camera and Gerald will look out for you."}
            </p>
            {(!active ||
              status === "denied" ||
              status === "failed" ||
              status === "unsupported") && (
              <div className="start-actions">
                <Button
                  onClick={beginCamera}
                  disabled={status === "loading"}
                  className="cursor-pointer rounded-xl bg-primary px-5 py-2.5 font-medium text-primary-foreground transition hover:opacity-90 hover:ring-2 hover:ring-primary/40 disabled:cursor-wait disabled:opacity-50"
                >
                  <Camera size={17} />
                  {status === "loading" ? "Opening camera…" : "Start the camera"}
                  <ArrowUpRight size={16} />
                </Button>
                {!active && (
                  <Button
                    onClick={beginNoCamera}
                    variant="outline"
                    className="rounded-xl border border-border px-5 py-2.5 font-medium hover:border-primary"
                  >
                    Continue without camera
                  </Button>
                )}
                {showDemo && (
                  <Button
                    onClick={beginDemo}
                    variant="outline"
                    className="rounded-xl border border-border px-5 py-2.5 font-medium hover:border-primary"
                  >
                    <Play size={15} /> Run in demo mode
                  </Button>
                )}
              </div>
            )}
            {!active && (
              <p className="privacy-note">
                <ShieldCheck size={14} />
                Camera starts only when you choose.
              </p>
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
                  <button
                    onClick={() => goQuiet(null)}
                    className="rounded-xl border border-primary px-4 py-2 text-sm text-primary"
                  >
                    Quiet until{" "}
                    {new Date(quietUntil).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}{" "}
                    — let Gerald talk again
                  </button>
                ) : (
                  <button
                    onClick={() => goQuiet(30)}
                    className="rounded-xl border border-border px-4 py-2 text-sm hover:border-primary"
                  >
                    Quiet for 30 minutes
                  </button>
                )}
                <button
                  onClick={drankByHand}
                  className="rounded-xl border border-border px-4 py-2 text-sm hover:border-primary"
                >
                  I just drank water
                </button>
                <button
                  onClick={askGerald}
                  className="rounded-xl border border-border px-4 py-2 text-sm hover:border-primary"
                >
                  What does my posture look like right now?
                </button>
                <button
                  onClick={stopAll}
                  className="rounded-xl border border-border px-4 py-2 text-sm hover:border-destructive"
                >
                  Stop
                </button>
              </div>
            )}

            {showDemo && mode === "demo" && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="mr-1 text-sm text-muted-foreground">Pretend that I…</span>
                {DEMO_KINDS.map((k) => (
                  <button
                    key={k}
                    onClick={() => demo(k)}
                    className="rounded-full border border-border px-4 py-1.5 text-sm capitalize hover:border-primary"
                  >
                    {DEMO_LABEL[k]}
                  </button>
                ))}
                {quietUntil ? (
                  <button
                    onClick={() => goQuiet(null)}
                    className="rounded-full border border-primary px-4 py-1.5 text-sm text-primary"
                  >
                    Quiet until{" "}
                    {new Date(quietUntil).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}{" "}
                    — let Gerald talk again
                  </button>
                ) : (
                  <button
                    onClick={() => goQuiet(30)}
                    className="rounded-full border border-border px-4 py-1.5 text-sm hover:border-primary"
                  >
                    Quiet for 30 minutes
                  </button>
                )}
                <button
                  onClick={() => setDemoSpeed((s) => (s === 1 ? 10 : 1))}
                  className="ml-auto rounded-full border border-border px-3 py-1 text-xs hover:border-primary"
                >
                  {demoSpeed === 10 ? "demo speed ×10" : "real time"}
                </button>
                <button
                  onClick={stopAll}
                  className="rounded-xl border border-border px-4 py-2 text-sm hover:border-destructive"
                >
                  Stop
                </button>
              </div>
            )}

            {mode === "camera" && baseline && (
              <p className="mt-3 text-xs text-muted-foreground">
                Sip detector: chin up{" "}
                <span className={sip.chinUp ? "text-primary" : ""}>
                  {sip.chinUp ? "yes" : "no"}
                </span>{" "}
                · mouth open{" "}
                <span className={sip.mouthOpen ? "text-primary" : ""}>
                  {sip.mouthOpen ? "yes" : "no"}
                </span>{" "}
                — tip your head back like you are drinking and hold it for a second.
              </p>
            )}

            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
            {judging && <p className="mt-3 text-sm text-primary">{judging}</p>}
            {voiceNote && <p className="mt-3 text-sm text-muted-foreground">{voiceNote}</p>}
          </div>

          <div className="panel mood-panel">
            <div className="panel-title-row">
              <div>
                <p className="eyebrow">The emotional forecast</p>
                <h2>Mood trail</h2>
              </div>
              <span className="duration-label">{sessionMinutes} min together</span>
            </div>
            <div className="mt-4">
              <StreakChart trail={state.trail} />
            </div>
            <button
              onClick={reset}
              className="mt-4 text-xs text-muted-foreground underline hover:text-primary"
            >
              Forgive me and start over
            </button>
          </div>

          <div className="panel activity-panel">
            <div className="panel-title-row">
              <h2>Words from the pot</h2>
              <span className="activity-count">
                {log.length} {log.length === 1 ? "note" : "notes"}
              </span>
            </div>
            <ul className="activity-log">
              {log.length === 0 && (
                <li className="empty-log">
                  <span className="empty-log-icon">
                    <Leaf size={18} />
                  </span>
                  <div>
                    <p>A peaceful little moment.</p>
                    <span>Gerald’s commentary will appear here.</span>
                  </div>
                </li>
              )}
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
      <footer className="app-footer">
        <span>
          <Leaf size={14} /> Small habits. Happier humans.
        </span>
        <span>A desk companion with a flair for the dramatic.</span>
      </footer>
      {floating.floatingWindow && <FloatingGerald window={floating.floatingWindow} sourceVideo={videoRef.current}>
        <div className="floating-gerald-plant"><Plant mood={state.mood} leaf={leaf} speaking={speaking} pulse={pulse} reaction={bubble?.kind} /></div>
        <p className="floating-gerald-message" aria-live="polite">{bubble?.line ?? "I’m rooting for you. And quietly judging your posture."}</p>
        <div className="floating-gerald-actions">
          <Button variant="outline" size="sm" onClick={() => { window.focus(); floating.close(); }}>Back to Sigh-cus <ArrowUpRight /></Button>
          {active && <Button variant="outline" size="sm" onClick={drankByHand}><Droplets />I drank water</Button>}
          <Button variant="outline" size="sm" onClick={floating.close}><X />Close</Button>
        </div>
      </FloatingGerald>}
      <aside className="gerald-widget" aria-label="Gerald’s corner">
        {geraldOpen && (
          <section
            className="gerald-widget-panel"
            id="gerald-corner"
            aria-labelledby="gerald-corner-title"
          >
            <div className="widget-header">
              <div>
                <p className="eyebrow">Your little desk companion</p>
                <h2 id="gerald-corner-title">Gerald’s corner</h2>
              </div>
              <button
                type="button"
                onClick={() => setGeraldOpen(false)}
                className="widget-close"
                aria-label="Close Gerald’s corner"
              >
                <X size={18} />
              </button>
            </div>
            <div className="widget-message" aria-live="polite">
              <p>
                {bubble?.line ??
                  "I’m here. Sit tall, take a sip, and carry on. I’ll handle the dramatic sighing."}
              </p>
            </div>
            <p className="widget-status">
              {moodLabel(state.mood)} · {state.drinkCount} water{" "}
              {state.drinkCount === 1 ? "break" : "breaks"}
            </p>
            <div className="widget-controls">
              <button type="button" onClick={() => void toggleVoice()}>
                {voiceOn ? <VolumeX size={15} /> : <Volume2 size={15} />}
                {voiceOn ? "Mute voice" : "Enable voice"}
              </button>
              {active && (
                <button type="button" onClick={drankByHand}>
                  <Droplets size={15} />I drank water
                </button>
              )}
              {!active && showDemo && (
                <button type="button" onClick={beginDemo}>
                  <Play size={15} />
                  Try demo
                </button>
              )}
            </div>
          </section>
        )}
        <button
          type="button"
          className="gerald-launcher"
          aria-label={geraldOpen ? "Close Gerald’s corner" : "Open Gerald’s corner"}
          aria-expanded={geraldOpen}
          aria-controls="gerald-corner"
          onClick={() => floating.floatingWindow ? floating.close() : geraldOpen ? setGeraldOpen(false) : void openGeraldCorner()}
        >
          {geraldOpen ? (
            <X size={23} />
          ) : (
            <div className="launcher-plant" aria-hidden="true">
              <Plant
                mood={state.mood}
                leaf={leaf}
                speaking={speaking}
                pulse={pulse}
                reaction={bubble?.kind}
              />
            </div>
          )}
          {!geraldOpen && <span className="launcher-status" aria-hidden="true" />}
        </button>
      </aside>
    </main>
  );
}
