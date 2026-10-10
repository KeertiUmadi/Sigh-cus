# Guilt-Trip Plant

A passive-aggressive office desk plant that watches how you sit and whether you've had any water — and makes you feel about it.

It is deliberately **not** a productivity tracker. No goals, no focus score, no dashboard. It just sits on your desk, droops when you slouch, and says something theatrical about your lower spine. Drink water and it breaks into gospel.

## What it does

- **Watches posture through your webcam.** MediaPipe FaceLandmarker runs in the browser and measures the geometry of your face frame by frame. A Gemini call turns what it sees into a verdict and a fresh guilt line in Gerald's voice. Only a small, downscaled snapshot is sent for a verdict — never a video stream.
- **Notices water.** Raise a bottle or cup to your mouth and hold it for a moment and Gerald celebrates like you've just saved the rainforest.
- **Keeps score.** A mood trail runs across the session with a marker on every sip and every slouch.
- **Talks out loud.** Lines are spoken with ElevenLabs when a key is configured; otherwise the browser's own voice reads them.
- **Demo mode.** No camera needed — press Slouch or Drink and watch it react.

## The rules it lives by

| Rule | Value |
| --- | --- |
| First slouch nag | after 2 minutes |
| Repeat nag | every 45 seconds while you keep slouching |
| Thirst nag | after 45 minutes without a sip |
| Screen-time nag | after 60 minutes |
| "You left" detection | after 20 seconds with no face in frame |
| One sip counts as one | 20-second cooldown |

## Run it

```bash
bun install
bun run dev
```

Then open http://localhost:8080 and press **Start camera** (allow camera access, sit up straight, press **Calibrate**) or **Run in demo mode**.

## Tests

```bash
bunx vitest run
```

14 tests cover the posture, drink, away and nag rules in `src/lib/plant-core.ts`.

## Where the code lives

| File | Job |
| --- | --- |
| `src/lib/plant-core.ts` | The rules and state machine — pure, no browser APIs, fully tested |
| `src/lib/use-face-sensor.ts` | Webcam and face landmarks; loaded only after you press Start camera |
| `src/lib/plant.functions.ts` | Server functions for Gemini (lines, posture verdicts) and ElevenLabs (voice); keys stay server-side |
| `src/components/Plant.tsx` | The plant: leaves droop with mood, stem leans, the pot has a face |
| `src/components/StreakChart.tsx` | The mood trail |
| `src/routes/index.tsx` | The app shell — calibration, demo mode, the tick loop |
| `src/test/plant-core.test.ts` | The rule tests |

## Built for

CodeRED Orion hackathon. Uses the Gemini API and ElevenLabs MLH challenges.
