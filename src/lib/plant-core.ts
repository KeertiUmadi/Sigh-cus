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
  /** nose tip below the eye line, divided by eye distance. Smaller = head tilted down. */
  pitch: number;
  /** eye line height in the frame, 0 = top, 1 = bottom. Larger = you sank down. */
  frameY: number;
  /** distance between the eyes relative to frame width. Larger = closer to the camera. */
  eyeDist: number;
  /** mouth opening relative to eye distance */
  mouthGap: number;
};

export type Baseline = {
  /** what "sitting properly" looks like for this person, on this camera */
  pitch: number;
  frameY: number;
  eyeDist: number;
  mouthGap: number;
};

export const RULES = {
  /** "Slouch for more than 2 minutes, and the plant sighs." */
  slouchMs: 120_000,
  /** no drink for this long -> thirst nag */
  thirstMs: 45 * 60_000,
  /** this much screen time -> eye-rest nag */
  screenMs: 60 * 60_000,
  /** face gone for this long -> abandonment nag */
  awayMs: 20_000,
  /** mouth open + chin up held this long counts as a drink */
  drinkHoldMs: 900,
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
  drinkBoost: 14,
  backBoost: 6,
  /** mood regained per minute spent sitting up straight */
  uprightRecoveryPerMin: 3,
  trailEveryMs: 5_000,
  trailMax: 400,
} as const;

/**
 * How much worse than your own good posture counts as slouching. Exposed to
 * the UI as sensitivity, because every webcam and chair is different.
 */
export const SENSITIVITY = {
  slouchPitchRatio: 0.78,
  slouchFrameY: 0.07,
  slouchEyeRatio: 1.25,
  drinkGapAdd: 0.35,
  drinkPitchRatio: 1.05,
};

export type NagKind = "slouch" | "thirst" | "screen" | "away";
export type EventKind = NagKind | "drink" | "back";
export type Delivery = "sigh" | "scold" | "gospel" | "whisper";
export type Leaf = "wither" | "perk" | "droop";

export type PlantEvent = { kind: EventKind; at: number };

export const FLAVOR: Record<EventKind, { delivery: Delivery; leaf: Leaf }> = {
  slouch: { delivery: "sigh", leaf: "wither" },
  thirst: { delivery: "whisper", leaf: "droop" },
  screen: { delivery: "scold", leaf: "droop" },
  away: { delivery: "whisper", leaf: "droop" },
  drink: { delivery: "gospel", leaf: "perk" },
  back: { delivery: "whisper", leaf: "perk" },
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
  lastNagAt: Partial<Record<NagKind, number>>;
  startedAt: number;
  lastTrailAt: number;
  trail: TrailPoint[];
};

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
  };
}

/**
 * Two signals must agree (head dropped, sunk lower in frame, leaned in), or one
 * must be extreme. A single mild signal is usually just a glance or a shift.
 */
export function isSlouch(r: Reading, b: Baseline) {
  if (!r.faceVisible) return false;
  const pitchDrop = r.pitch < b.pitch * SENSITIVITY.slouchPitchRatio;
  const sunk = r.frameY > b.frameY + SENSITIVITY.slouchFrameY;
  const leaned = r.eyeDist > b.eyeDist * SENSITIVITY.slouchEyeRatio;
  const hits = Number(pitchDrop) + Number(sunk) + Number(leaned);
  if (hits >= 2) return true;
  return (
    r.pitch < b.pitch * (SENSITIVITY.slouchPitchRatio - 0.15) ||
    r.frameY > b.frameY + SENSITIVITY.slouchFrameY * 2 ||
    r.eyeDist > b.eyeDist * (SENSITIVITY.slouchEyeRatio + 0.2)
  );
}

/** Mouth open wider than your resting face, with the chin tipped up. */
export function isDrink(r: Reading, b: Baseline) {
  if (!r.faceVisible) return false;
  return (
    r.mouthGap > b.mouthGap + SENSITIVITY.drinkGapAdd &&
    r.pitch > b.pitch * SENSITIVITY.drinkPitchRatio
  );
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
): { state: PlantState; events: PlantEvent[] } {
  const events: PlantEvent[] = [];
  const s: PlantState = { ...state, lastNagAt: { ...state.lastNagAt } };
  const at = reading.at;

  // Screen time runs whether or not you are in frame. That is the whole point.
  s.screenMs += dtMs;

  if (!reading.faceVisible) {
    s.awayMs += dtMs;
    if (s.awayMs >= RULES.awayMs && canNag(s, "away", at)) {
      events.push(event("away", at));
      s.lastNagAt.away = at;
      s.mood -= RULES.awayHit;
      s.awayMs = 0;
    }
  } else {
    const wasGone = s.awayMs >= RULES.awayMs;
    s.awayMs = 0;
    if (wasGone) {
      events.push(event("back", at));
      s.mood += RULES.backBoost;
    }

    // Drinking: a held signal, not a single frame, so a yawn cannot fool it.
    if (isDrink(reading, baseline)) s.drinkHoldMs += dtMs;
    else s.drinkHoldMs = 0;

    if (
      s.drinkHoldMs >= RULES.drinkHoldMs &&
      at - s.lastDrinkAt >= RULES.drinkCooldownMs
    ) {
      events.push(event("drink", at));
      s.drinkHoldMs = 0;
      s.lastDrinkAt = at;
      s.drinkCount += 1;
      s.drinkStreak += 1;
      s.mood += RULES.drinkBoost;
      s.dryMs = 0;
      s.slouchMs = 0;
    } else {
      s.dryMs += dtMs;
    }

    if (isSlouch(reading, baseline)) {
      s.slouchMs += dtMs;
    } else {
      s.slouchMs = 0;
      s.mood += (dtMs / 60_000) * RULES.uprightRecoveryPerMin;
    }
  }

  // Slouch and thirst timers keep growing after a nag, so an ongoing slouch
  // earns a fresh, increasingly unhinged line every cooldown window instead
  // of the plant silently forgiving you.
  if (s.slouchMs >= RULES.slouchMs && canNag(s, "slouch", at)) {
    events.push(event("slouch", at));
    s.lastNagAt.slouch = at;
    s.mood -= RULES.slouchHit;
    s.slouchCount += 1;
    s.drinkStreak = 0;
  }

  if (s.dryMs >= RULES.thirstMs && canNag(s, "thirst", at)) {
    events.push(event("thirst", at));
    s.lastNagAt.thirst = at;
    s.mood -= RULES.thirstHit;
    s.drinkStreak = 0;
  }

  if (s.screenMs >= RULES.screenMs && canNag(s, "screen", at)) {
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
