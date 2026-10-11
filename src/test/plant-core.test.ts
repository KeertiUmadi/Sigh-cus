import { describe, expect, it } from "vitest";
import {
  RULES,
  calibrate,
  createState,
  isDrink,
  isSlouch,
  logDrink,
  tick,
  habitSignals,
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
  it("catches a moderate head drop combined with sinking in the chair", () => {
    expect(isSlouch({ ...upright, pitch: 0.96, frameY: 0.40 }, baseline)).toBe(true);
  });
  it("does not mistake moving closer alone or a small glance for slouching", () => {
    expect(isSlouch({ ...upright, eyeDist: 0.28 }, baseline)).toBe(false);
    expect(isSlouch({ ...upright, pitch: 0.90 }, baseline)).toBe(false);
  });
  it("handles a near-zero calibrated pitch without flagging small movements", () => {
    expect(isSlouch({ ...upright, pitch: 0.03 }, { ...baseline, pitch: 0 })).toBe(false);
  });
  it("ignores a brief slouch then confirms a sustained one and its correction", () => {
    const moderate = { ...upright, pitch: 0.96, frameY: 0.40 };
    const brief = advance(createState(0), moderate, 2);
    expect(brief.events).toEqual([]);
    expect(advance(brief.state, upright, 1).state.slouchMs).toBe(0);
    const nag = advance(createState(0), moderate, 5);
    expect(nag.events.some((e) => e.kind === "slouch")).toBe(true);
    expect(advance(nag.state, upright, 1).events.some((e) => e.kind === "fixed" && e.of === "slouch")).toBe(true);
  });
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

/** A plant that has already nagged about thirst, the only time a sip counts. */
const thirsty = () => advance(createState(0), upright, RULES.thirstMs / 1000).state;

describe("drinking water", () => {
  it("ignores a head tilt until Gerald has nagged about water", () => {
    const { state, events } = advance(createState(0), drinking, 8, 500);
    expect(events.map((e) => e.kind)).not.toContain("drink");
    expect(state.drinkCount).toBe(0);
  });

  it("counts a drink held long enough and wipes the slouch timer", () => {
    const warmed = advance(thirsty(), slouching, 60);
    expect(warmed.state.slouchMs).toBe(60_000);

    const { state, events } = advance(warmed.state, drinking, 8, 500);
    expect(events.map((e) => e.kind)).toContain("drink");
    expect(state.drinkCount).toBe(1);
    expect(state.drinkStreak).toBe(1);
    expect(state.slouchMs).toBe(0);
    expect(state.dryMs).toBeLessThanOrEqual(1000);
  });

  it("counts one sip as one drink, even while the mouth stays open", () => {
    const first = advance(thirsty(), drinking, 8, 500);
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
    const { state } = advance(thirsty(), drinking, 400, 1000);
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
    const drank = advance(thirsty(), drinking, 8, 500);
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
  it("keeps brief camera blinks visible to the slower habit timer", () => {
    let state = createState(0);
    const events: PlantEvent[] = [];
    for (let at = 200; at <= 15_000; at += 200) {
      const result = tick(state, {
        ...upright, at, blink: 0,
        lastBlinkAt: Math.floor(at / 2000) * 2000,
      }, 200, baseline);
      state = result.state;
      events.push(...result.events);
    }
    expect(events.some((e) => e.kind === "stare")).toBe(false);
  });

  it("confirms a stare fix from a blink between timer ticks, then starts a fresh timer", () => {
    const nagged = advance(createState(0), { ...upright, blink: 0 }, 5);
    const fixed = tick(nagged.state, {
      ...upright, at: 5200, blink: 0, lastBlinkAt: 5100,
    }, 200, baseline);
    expect(fixed.events).toContainEqual({ kind: "fixed", at: 5200, of: "stare" });
    expect(fixed.state.habitMs?.stare).toBe(0);
    expect(habitSignals({ ...upright, at: 5600, blink: 0, lastBlinkAt: 5100 }, baseline).stare).toBe(true);
  });

  it("does not treat missing blink measurements as staring", () => {
    expect(habitSignals(upright, baseline).stare).toBe(false);
  });

  it("detects phone-looking posture even when the head drop also counts as slouch", () => {
    const phone = { ...slouching, blink: 0.6, lookDown: 0.45 };
    expect(habitSignals(phone, baseline).phone).toBe(true);
    const nagged = advance(createState(0), phone, 5);
    expect(nagged.events.some((e) => e.kind === "phone")).toBe(true);
    expect(advance(nagged.state, calm, 1).events.some((e) => e.of === "phone" && e.kind === "fixed")).toBe(true);
  });

  it("uses a hand below the face to support a head-down phone signal, not head tilt alone", () => {
    expect(habitSignals({ ...slouching, handBelowFace: true }, baseline).phone).toBe(true);
    expect(habitSignals(slouching, baseline).phone).toBe(false);
    expect(habitSignals({ ...upright, handBelowFace: true }, baseline).phone).toBe(false);
  });
  it("nags about each habit after its time and confirms the fix", () => {
    const cases: [Partial<Reading>, string, number][] = [
      [{ browDown: 0.8 }, "frown", 5],
      [{ blink: 0 }, "stare", 5],
      [{ eyeDist: 0.25 }, "close", 5],
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
