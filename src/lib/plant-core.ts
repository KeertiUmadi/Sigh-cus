/**
 * The plant's brain. Pure and DOM-free so the rules can be tested with a
 * stop-watch instead of a webcam.
 *
 * All timings are in milliseconds of *plant time*. The caller scales real
 * elapsed time by a demo-speed factor before handing it to tick(), so the
 * rules below always read as literal, honest numbers.
 */

export type Reading = {
  /** epoch ms of this reading */
  at: number;
  faceVisible: boolean;
  /**
   * nose tip below the eye line, divided by eye size. The nose sticks out, so
   * dropping your head pushes it further below the eyes (larger) and tipping
   * your chin up pulls it towards them (smaller).
   */
  pitch: number;
  /** eye line height in the frame, 0 = top, 1 = bottom. Larger = you sank down. */
  frameY: number;
  /** distance between the eyes relative to frame width. Larger = closer to the camera. */
  eyeDist: number;
  /** mouth opening relative to eye distance */
  mouthGap: number;
  /** face blendshapes 0..1 (camera only; missing = not measured) */
  browDown?: number | undefined;
  squint?: number | undefined;
  blink?: number | undefined;
  /** Latest observed blink, latched by the camera so the slower UI tick cannot miss it. */
  lastBlinkAt?: number | undefined;
  jawOpen?: number | undefined;
  lookDown?: number | undefined;
  /** a fingertip is at the mouth */
  handAtMouth?: boolean | undefined;
  /** A hand held below the face supports the looking-down phone-use inference. */
  handBelowFace?: boolean | undefined;
};

export type Baseline = {
  /** what "sitting properly" looks like for this person, on this camera */
  pitch: number;
  frameY: number;
  eyeDist: number;
  mouthGap: number;
  browDown?: number | undefined;
  squint?: number | undefined;
};

export const RULES = {
  /** "Slouch for more than 2 minutes, and the plant sighs." */
  slouchMs: 5_000,
  /** no drink for this long -> thirst nag */
  thirstMs: 60_000,
  /** this much screen time -> eye-rest nag */
  screenMs: 60 * 60_000,
  /** face gone for this long -> abandonment nag */
  awayMs: 5_000,
  /** chin tipped up held this long counts as a drink — a real sip takes 3 seconds */
  drinkHoldMs: 3_000,
  /** a sip is one celebration, not one per frame */
  drinkCooldownMs: 20_000,
  /** the plant will not nag twice about the same thing inside this window */
  nagCooldownMs: 45_000,
  moodStart: 72,
  moodMax: 100,
  moodMin: 0,
  slouchHit: 18,
  thirstHit: 8,
  screenHit: 6,
  awayHit: 4,
  /** sitting up straight this long after a slouch nag counts as fixed */
  uprightConfirmMs: 400,
  fixedBoost: 8,
  drinkBoost: 14,
  backBoost: 6,
  /** mood regained per minute spent sitting up straight */
  uprightRecoveryPerMin: 3,
  /** face habits: how long each must last before Gerald says something */
  habitMs: { frown: 5_000, stare: 5_000, close: 5_000, nails: 5_000, yawn: 5_000, phone: 5_000 },
  habitHit: 5,
  /** stopping a nagged habit for this long counts as fixed */
  habitOkMs: 400,
  trailEveryMs: 5_000,
  trailMax: 400,
} as const;

/**
 * How much worse than your own good posture counts as slouching. Exposed to
 * the UI as sensitivity, because every webcam and chair is different.
 */
export const SENSITIVITY = {
  /** head dropped: nose this much further below the eyes than when calibrated */
  slouchPitchRatio: 1.22,
  slouchFrameY: 0.07,
  slouchEyeRatio: 1.25,
  /** mouth this much more open than at rest */
  drinkGapAdd: 0.1,
  /** chin up: nose this much closer to the eye line than when calibrated */
  drinkPitchRatio: 0.86,
  /** chin so far up that it counts even when the bottle hides the mouth */
  drinkPitchHardRatio: 0.7,
};

export const HABITS = ["frown", "stare", "close", "nails", "yawn", "phone"] as const;
export type Habit = (typeof HABITS)[number];
export type NagKind = "slouch" | "thirst" | "screen" | "away" | Habit;
export type EventKind = NagKind | "drink" | "back" | "fixed";
export type Delivery = "sigh" | "scold" | "gospel" | "whisper";
export type Leaf = "wither" | "perk" | "droop";

/** of = which bad habit a fixed event confirms */
export type PlantEvent = { kind: EventKind; at: number; of?: "slouch" | Habit };

export const FLAVOR: Record<EventKind, { delivery: Delivery; leaf: Leaf }> = {
  slouch: { delivery: "sigh", leaf: "wither" },
  thirst: { delivery: "whisper", leaf: "droop" },
  screen: { delivery: "scold", leaf: "droop" },
  away: { delivery: "whisper", leaf: "droop" },
  drink: { delivery: "gospel", leaf: "perk" },
  back: { delivery: "whisper", leaf: "perk" },
  fixed: { delivery: "whisper", leaf: "perk" },
  frown: { delivery: "scold", leaf: "droop" },
  stare: { delivery: "whisper", leaf: "droop" },
  close: { delivery: "scold", leaf: "droop" },
  nails: { delivery: "scold", leaf: "wither" },
  yawn: { delivery: "sigh", leaf: "droop" },
  phone: { delivery: "scold", leaf: "droop" },
};

export type TrailPoint = {
  at: number;
  mood: number;
  drinks: number;
  slouches: number;
};

export type PlantState = {
  mood: number;
  slouchMs: number;
  dryMs: number;
  screenMs: number;
  awayMs: number;
  drinkHoldMs: number;
  /** when the last drink was counted, so one sip is one celebration */
  lastDrinkAt: number;
  /** consecutive drinks without a nag in between */
  drinkStreak: number;
  drinkCount: number;
  slouchCount: number;
  /** a slouch nag is outstanding, waiting for you to sit up */
  slouchNagged: boolean;
  uprightMs: number;
  /** how long each face habit has been going on, and whether a nag awaits a fix */
  habitMs?: Partial<Record<Habit, number>>;
  habitOkMs?: Partial<Record<Habit, number>>;
  habitNagged?: Partial<Record<Habit, boolean>>;
  lastNagAt: Partial<Record<NagKind, number>>;
  startedAt: number;
  lastTrailAt: number;
  trail: TrailPoint[];
};

/** Per-trigger user settings: off = never monitored, ms = how long before Gerald speaks. */
export type TriggerSetting = { on: boolean; ms: number };
export type Triggers = Record<NagKind, TriggerSetting>;
export const TRIGGER_KINDS: NagKind[] = ["slouch", "thirst", "screen", "away", ...HABITS];
export const TRIGGER_LABELS: Record<NagKind, string> = {
  slouch: "Slouching",
  thirst: "Not drinking water",
  screen: "Screen time",
  away: "Walking away",
  frown: "Frowning / squinting",
  stare: "Staring without blinking",
  close: "Leaning too close",
  nails: "Biting nails",
  yawn: "Yawning",
  phone: "Using your phone",
};
export function defaultTriggers(): Triggers {
  const t = {} as Triggers;
  t.slouch = { on: true, ms: RULES.slouchMs };
  t.thirst = { on: true, ms: RULES.thirstMs };
  t.screen = { on: true, ms: RULES.screenMs };
  t.away = { on: true, ms: RULES.awayMs };
  for (const h of HABITS) t[h] = { on: true, ms: RULES.habitMs[h] };
  return t;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function event(kind: EventKind, at: number): PlantEvent {
  return { kind, at };
}

function canNag(s: PlantState, kind: NagKind, at: number) {
  const last = s.lastNagAt[kind];
  return last === undefined || at - last >= RULES.nagCooldownMs;
}

export function createState(at: number): PlantState {
  return {
    mood: RULES.moodStart,
    slouchMs: 0,
    dryMs: 0,
    screenMs: 0,
    awayMs: 0,
    drinkHoldMs: 0,
    lastDrinkAt: at - RULES.drinkCooldownMs,
    drinkStreak: 0,
    drinkCount: 0,
    slouchCount: 0,
    slouchNagged: false,
    uprightMs: 0,
    habitMs: {},
    habitOkMs: {},
    habitNagged: {},
    lastNagAt: {},
    startedAt: at,
    lastTrailAt: at,
    trail: [{ at, mood: RULES.moodStart, drinks: 0, slouches: 0 }],
  };
}

/**
 * Average a handful of "I am sitting properly" readings into a personal
 * baseline. Calibrating beats hard-coded angles: it works on any webcam,
 * any lighting, any chair.
 */
export function calibrate(readings: Reading[]): Baseline {
  const seen = readings.filter((r) => r.faceVisible);
  if (seen.length === 0) {
    throw new Error("No face found yet. Sit where the camera can see you and try again.");
  }
  const avg = (f: (r: Reading) => number) =>
    seen.reduce((sum, r) => sum + f(r), 0) / seen.length;
  return {
    pitch: avg((r) => r.pitch),
    frameY: avg((r) => r.frameY),
    eyeDist: avg((r) => r.eyeDist),
    mouthGap: avg((r) => r.mouthGap),
    browDown: avg((r) => r.browDown ?? 0),
    squint: avg((r) => r.squint ?? 0),
  };
}

/**
 * Two signals must agree (head dropped, sunk lower in frame, leaned in), or one
 * must be extreme. A single mild signal is usually just a glance or a shift.
 */
export function isSlouch(r: Reading, b: Baseline) {
  if (!r.faceVisible) return false;
  const pitchDrop = r.pitch > b.pitch * SENSITIVITY.slouchPitchRatio;
  const sunk = r.frameY > b.frameY + SENSITIVITY.slouchFrameY;
  const leaned = r.eyeDist > b.eyeDist * SENSITIVITY.slouchEyeRatio;
  const hits = Number(pitchDrop) + Number(sunk) + Number(leaned);
  if (hits >= 2) return true;
  return (
    r.pitch > b.pitch * (SENSITIVITY.slouchPitchRatio + 0.18) ||
    r.frameY > b.frameY + SENSITIVITY.slouchFrameY * 2 ||
    r.eyeDist > b.eyeDist * (SENSITIVITY.slouchEyeRatio + 0.2)
  );
}

/** The two things a sip looks like to the camera, exposed so the UI can show them live. */
export function drinkSignals(r: Reading, b: Baseline) {
  if (!r.faceVisible) return { chinUp: false, mouthOpen: false, chinWayUp: false };
  return {
    chinUp: r.pitch < b.pitch * SENSITIVITY.drinkPitchRatio,
    chinWayUp: r.pitch < b.pitch * SENSITIVITY.drinkPitchHardRatio,
    mouthOpen: r.mouthGap > b.mouthGap + SENSITIVITY.drinkGapAdd,
  };
}

/**
 * Chin tipped up with the mouth open, or the chin tipped right back (the
 * bottle usually hides the mouth then). A yawn keeps the chin level.
 */
export function isDrink(r: Reading, b: Baseline) {
  const s = drinkSignals(r, b);
  // a cup or hand at the mouth plus a chin tilt, or a big tilt on its own
  return s.chinWayUp || (s.chinUp && (s.mouthOpen || !!r.handAtMouth));
}

/** Leaning in close to the screen, on its own (not part of a slouch). */
export function isClose(r: Reading, b: Baseline) {
  return r.faceVisible && r.eyeDist > b.eyeDist * SENSITIVITY.slouchEyeRatio && !isSlouch(r, b);
}

/** Which face habits are happening in this one reading. "stare" means no blink. */
export function habitSignals(r: Reading, b: Baseline): Record<Habit, boolean> {
  const v = r.faceVisible;
  const measured = r.blink !== undefined;
  return {
    frown:
      v &&
      ((r.browDown ?? 0) > (b.browDown ?? 0) + 0.3 || (r.squint ?? 0) > (b.squint ?? 0) + 0.35),
    stare: v && measured && (r.blink ?? 0) < 0.2 &&
      !(r.lastBlinkAt !== undefined && r.at >= r.lastBlinkAt && r.at - r.lastBlinkAt <= 400),
    close: isClose(r, b),
    nails: v && !!r.handAtMouth && !drinkSignals(r, b).chinUp,
    yawn: v && (r.jawOpen ?? 0) > 0.55 && !isDrink(r, b),
    // Looking down at a phone often also drops the head: slouch must not veto it.
    // This is a posture inference, not object recognition.
    phone: v && ((r.lookDown ?? 0) > 0.35 ||
      (!!r.handBelowFace && r.pitch > b.pitch * SENSITIVITY.slouchPitchRatio)),
  };
}

/** Count a sip: one celebration per cooldown window. Mutates s. */
function countDrink(s: PlantState, at: number, events: PlantEvent[]) {
  events.push(event("drink", at));
  s.drinkHoldMs = 0;
  s.lastDrinkAt = at;
  s.drinkCount += 1;
  s.drinkStreak += 1;
  s.mood = clamp(s.mood + RULES.drinkBoost, RULES.moodMin, RULES.moodMax);
  s.dryMs = 0;
  s.slouchMs = 0;
}

/** "I just drank" pressed by hand, for when the camera missed the sip. */
export function logDrink(state: PlantState, at: number): { state: PlantState; events: PlantEvent[] } {
  const events: PlantEvent[] = [];
  const s: PlantState = { ...state, lastNagAt: { ...state.lastNagAt } };
  if (at - s.lastDrinkAt < RULES.drinkCooldownMs) return { state: s, events };
  countDrink(s, at, events);
  return { state: s, events };
}

export function moodLabel(mood: number) {
  if (mood >= 80) return "thriving";
  if (mood >= 55) return "hanging in there";
  if (mood >= 30) return "wilting";
  if (mood >= 12) return "dramatically dying";
  return "basically a stick";
}

/**
 * Advance the plant by dtMs of plant time.
 * Returns the new state plus any events the UI should react to.
 */
export function tick(
  state: PlantState,
  reading: Reading,
  dtMs: number,
  baseline: Baseline,
  triggers: Triggers = defaultTriggers(),
): { state: PlantState; events: PlantEvent[] } {
  const T = triggers;
  const events: PlantEvent[] = [];
  const s: PlantState = { ...state, lastNagAt: { ...state.lastNagAt } };
  const at = reading.at;

  // Screen time runs whether or not you are in frame. That is the whole point.
  s.screenMs += dtMs;

  if (!reading.faceVisible) {
    s.awayMs += dtMs;
    if (T.away.on && s.awayMs >= T.away.ms && canNag(s, "away", at)) {
      events.push(event("away", at));
      s.lastNagAt.away = at;
      s.mood -= RULES.awayHit;
      s.awayMs = 0;
    }
  } else {
    const wasGone = T.away.on && s.awayMs >= T.away.ms;
    s.awayMs = 0;
    if (wasGone) {
      events.push(event("back", at));
      s.mood += RULES.backBoost;
    }

    // Drinking: a held signal, not a single frame, so a yawn cannot fool it.
    if (isDrink(reading, baseline)) s.drinkHoldMs += dtMs;
    else s.drinkHoldMs = 0;

    // Only counts once Gerald has nagged about thirst and no sip has answered it yet.
    const thirstNagOpen = (s.lastNagAt.thirst ?? -Infinity) > s.lastDrinkAt;
    if (
      thirstNagOpen &&
      s.drinkHoldMs >= RULES.drinkHoldMs &&
      at - s.lastDrinkAt >= RULES.drinkCooldownMs
    ) {
      countDrink(s, at, events);
    } else {
      s.dryMs += dtMs;
    }

    const hs = habitSignals(reading, baseline);
    s.habitMs = { ...s.habitMs };
    s.habitOkMs = { ...s.habitOkMs };
    s.habitNagged = { ...s.habitNagged };
    for (const h of HABITS) {
      if (!T[h].on) {
        s.habitMs[h] = 0;
        s.habitNagged[h] = false;
        continue;
      }
      if (hs[h]) {
        s.habitMs[h] = (s.habitMs[h] ?? 0) + dtMs;
        s.habitOkMs[h] = 0;
        if ((s.habitMs[h] ?? 0) >= T[h].ms && canNag(s, h, at)) {
          events.push(event(h, at));
          s.lastNagAt[h] = at;
          s.habitNagged[h] = true;
          s.mood -= RULES.habitHit;
        }
      } else {
        s.habitMs[h] = 0;
        s.habitOkMs[h] = (s.habitOkMs[h] ?? 0) + dtMs;
        // a blink ends a stare at once; everything else must stop for a moment
        const okFor = h === "stare" ? 0 : RULES.habitOkMs;
        if (s.habitNagged[h] && (s.habitOkMs[h] ?? 0) >= okFor) {
          s.habitNagged[h] = false;
          events.push({ kind: "fixed", at, of: h });
          s.mood += RULES.fixedBoost / 2;
        }
      }
    }

    if (T.slouch.on && isSlouch(reading, baseline)) {
      s.slouchMs += dtMs;
      s.uprightMs = 0;
    } else {
      s.slouchMs = 0;
      s.uprightMs += dtMs;
      if (s.slouchNagged && s.uprightMs >= RULES.uprightConfirmMs) {
        s.slouchNagged = false;
        events.push({ kind: "fixed", at, of: "slouch" });
        s.mood += RULES.fixedBoost;
      }
      s.mood += (dtMs / 60_000) * RULES.uprightRecoveryPerMin;
    }
  }

  // Slouch and thirst timers keep growing after a nag, so an ongoing slouch
  // earns a fresh, increasingly unhinged line every cooldown window instead
  // of the plant silently forgiving you.
  if (T.slouch.on && s.slouchMs >= T.slouch.ms && canNag(s, "slouch", at)) {
    events.push(event("slouch", at));
    s.lastNagAt.slouch = at;
    s.mood -= RULES.slouchHit;
    s.slouchCount += 1;
    s.slouchNagged = true;
    s.drinkStreak = 0;
  }

  if (T.thirst.on && s.dryMs >= T.thirst.ms && canNag(s, "thirst", at)) {
    events.push(event("thirst", at));
    s.lastNagAt.thirst = at;
    s.mood -= RULES.thirstHit;
    s.drinkStreak = 0;
  }

  if (T.screen.on && s.screenMs >= T.screen.ms && canNag(s, "screen", at)) {
    events.push(event("screen", at));
    s.lastNagAt.screen = at;
    s.mood -= RULES.screenHit;
    s.screenMs = 0;
  }

  s.mood = clamp(s.mood, RULES.moodMin, RULES.moodMax);

  if (at - s.lastTrailAt >= RULES.trailEveryMs) {
    s.trail = [
      ...s.trail,
      { at, mood: s.mood, drinks: s.drinkCount, slouches: s.slouchCount },
    ].slice(-RULES.trailMax);
    s.lastTrailAt = at;
  }

  return { state: s, events };
}
