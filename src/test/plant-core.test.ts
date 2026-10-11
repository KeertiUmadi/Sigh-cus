import { describe, expect, it } from "vitest";
import {
  RULES,
  calibrate,
  createState,
  isDrink,
  isSlouch,
  logDrink,
  tick,
  type PlantEvent,
  type PlantState,
  type Reading,
} from "@/lib/plant-core";

/** A calibrated "sitting properly" face, and the readings the plant reacts to. */
const upright: Reading = {
  at: 0,
  faceVisible: true,
  pitch: 0.8,
  frameY: 0.35,
  eyeDist: 0.18,
  mouthGap: 0.12,
};

const baseline = calibrate([upright]);
const slouching: Reading = { ...upright, pitch: 1.2 };
const drinking: Reading = { ...upright, pitch: 0.6, mouthGap: 0.3 };
const gone: Reading = {
  ...upright,
  faceVisible: false,
  pitch: 0,
  frameY: 0,
  eyeDist: 0,
  mouthGap: 0,
};

function advance(
  state: PlantState,
  reading: Reading,
  count: number,
  dt = 1000,
): { state: PlantState; events: PlantEvent[] } {
  let s = state;
  const events: PlantEvent[] = [];
  for (let i = 0; i < count; i++) {
    const out = tick(s, { ...reading, at: s.startedAt + (i + 1) * dt }, dt, baseline);
    s = out.state;
    events.push(...out.events);
  }
  return { state: s, events };
}

describe("posture and drink detection", () => {
  it("counts a dropped head as a slouch but not good posture", () => {
    expect(isSlouch(slouching, baseline)).toBe(true);
    expect(isSlouch(upright, baseline)).toBe(false);
    expect(isSlouch(gone, baseline)).toBe(false);
  });

  it("counts an open mouth with a lifted chin as a drink", () => {
    expect(isDrink(drinking, baseline)).toBe(true);
    expect(isDrink(upright, baseline)).toBe(false);
    // a wide-open mouth without the chin lift (a yawn) is not a drink
    expect(isDrink({ ...upright, mouthGap: 0.6 }, baseline)).toBe(false);
    // a wide-open mouth with the head dropped is not a drink either
    expect(isDrink({ ...upright, pitch: 1.1, mouthGap: 0.6 }, baseline)).toBe(false);
  });

  it("counts the chin tipped right back as a drink even when the bottle hides the mouth", () => {
    expect(isDrink({ ...upright, pitch: 0.45 }, baseline)).toBe(true);
    // a small chin lift with a closed mouth is just looking up
    expect(isDrink({ ...upright, pitch: 0.6 }, baseline)).toBe(false);
  });

  it("does not call a lifted chin a slouch", () => {
    expect(isSlouch({ ...upright, pitch: 0.45 }, baseline)).toBe(false);
  });

  it("lets you log a missed sip by hand, once per cooldown", () => {
    const first = logDrink(createState(0), 1000);
    expect(first.events.map((e) => e.kind)).toEqual(["drink"]);
    expect(first.state.drinkCount).toBe(1);
    expect(first.state.dryMs).toBe(0);
    const again = logDrink(first.state, 1000 + RULES.drinkCooldownMs - 1);
    expect(again.events).toEqual([]);
    expect(again.state.drinkCount).toBe(1);
  });

  it("refuses to calibrate when no face is in frame", () => {
    expect(() => calibrate([gone])).toThrow(/No face found/);
  });
});

describe("the two minute slouch rule", () => {
  it("says nothing while the slouch is under two minutes", () => {
    const { state, events } = advance(createState(0), slouching, RULES.slouchMs / 1000 - 1);
    expect(events).toEqual([]);
    expect(state.slouchMs).toBe(RULES.slouchMs - 1000);
  });

  it("sighs and wilts the moment the slouch passes two minutes", () => {
    const { state, events } = advance(createState(0), slouching, RULES.slouchMs / 1000);
    expect(events.map((e) => e.kind)).toEqual(["slouch"]);
    expect(state.slouchCount).toBe(1);
    expect(state.mood).toBe(RULES.moodStart - RULES.slouchHit);
  });

  it("keeps nagging while you stay slouched, but not more than once a cooldown", () => {
    const under = advance(createState(0), slouching, (RULES.slouchMs + RULES.nagCooldownMs - 1000) / 1000);
    expect(under.events.map((e) => e.kind)).toEqual(["slouch"]);

    const over = advance(createState(0), slouching, (RULES.slouchMs + RULES.nagCooldownMs) / 1000);
    expect(over.events.map((e) => e.kind)).toEqual(["slouch", "slouch"]);
  });
});

describe("drinking water", () => {
  it("counts a drink held long enough and wipes the slouch timer", () => {
    const warmed = advance(createState(0), slouching, 60);
    expect(warmed.state.slouchMs).toBe(60_000);

    const { state, events } = advance(warmed.state, drinking, 3, 500);
    expect(events.map((e) => e.kind)).toEqual(["drink"]);
    expect(state.drinkCount).toBe(1);
    expect(state.drinkStreak).toBe(1);
    expect(state.slouchMs).toBe(0);
    expect(state.dryMs).toBe(0);
  });

  it("counts one sip as one drink, even while the mouth stays open", () => {
    const first = advance(createState(0), drinking, 3, 500);
    expect(first.state.drinkCount).toBe(1);

    // a minute of the same open-mouthed reading only earns the next two sips,
    // one per cooldown window — not one per frame
    const later = advance(first.state, drinking, 60, 1000);
    expect(later.state.drinkCount).toBe(3);
  });

  it("is not fooled by a single open-mouthed frame", () => {
    const { state, events } = advance(createState(0), drinking, 1, 300);
    expect(events).toEqual([]);
    expect(state.drinkCount).toBe(0);
    expect(state.drinkHoldMs).toBe(300);
  });

  it("never lets the mood rise past one hundred", () => {
    const { state } = advance(createState(0), drinking, 400, 1000);
    expect(state.mood).toBe(RULES.moodMax);
  });
});

describe("thirst, screen time and abandonment", () => {
  it("nags once you have gone forty five minutes without water", () => {
    const { state, events } = advance(createState(0), upright, RULES.thirstMs / 1000);
    expect(events.map((e) => e.kind)).toContain("thirst");
    expect(state.dryMs).toBe(RULES.thirstMs);
  });

  it("nags about your eyes after an hour on screen", () => {
    const { events } = advance(createState(0), upright, RULES.screenMs / 1000);
    expect(events.map((e) => e.kind)).toContain("screen");
  });

  it("mourns you after twenty seconds out of frame and stops counting the slouch", () => {
    const { state, events } = advance(createState(0), gone, RULES.awayMs / 1000);
    expect(events.map((e) => e.kind)).toEqual(["away"]);
    expect(state.mood).toBe(RULES.moodStart - RULES.awayHit);
    expect(state.slouchMs).toBe(0);
  });

  it("resets a good streak when it catches you slouching", () => {
    const drank = advance(createState(0), drinking, 3, 500);
    expect(drank.state.drinkStreak).toBe(1);

    const after = advance(drank.state, slouching, RULES.slouchMs / 1000);
    expect(after.state.slouchCount).toBe(1);
    expect(after.state.drinkStreak).toBe(0);
  });

  it("confirms posture once you sit up after a slouch nag, only once", () => {
    const nagged = advance(createState(0), slouching, RULES.slouchMs / 1000);
    expect(nagged.state.slouchNagged).toBe(true);
    const fixed = advance(nagged.state, upright, 6, 1000);
    expect(fixed.events.filter((e) => e.kind === "fixed")).toHaveLength(1);
    expect(fixed.state.slouchNagged).toBe(false);
  });
});

describe("face habits", () => {
  const calm: Reading = { ...upright, blink: 0.6 };
  it("nags about each habit after its time and confirms the fix", () => {
    const cases: [Partial<Reading>, string, number][] = [
      [{ browDown: 0.8 }, "frown", 5],
      [{ blink: 0 }, "stare", 10],
      [{ eyeDist: 0.25 }, "close", 10],
      [{ handAtMouth: true }, "nails", 5],
      [{ jawOpen: 0.8 }, "yawn", 5],
    ];
    for (const [patch, kind, secs] of cases) {
      const early = advance(createState(0), { ...calm, ...patch }, secs - 1);
      expect(early.events.some((e) => e.kind === kind)).toBe(false);
      const on = advance(createState(0), { ...calm, ...patch }, secs);
      expect(on.events.some((e) => e.kind === kind)).toBe(true);
      const off = advance(on.state, calm, 3);
      expect(off.events.some((e) => e.kind === "fixed" && e.of === kind)).toBe(true);
    }
  });
});
