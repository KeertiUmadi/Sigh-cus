# Sigh-cus

A passive-aggressive office desk plant that watches how you sit and whether you've had any water — and makes you feel about it.

It is deliberately **not** a productivity tracker. No goals, no focus score, no dashboard. It just sits on your desk, droops when you slouch, and says something theatrical about your lower spine. Drink water and it breaks into gospel.

Live at https://sigh-cus.design (https://www.sigh-cus.design forwards there).

## What it does

- **Watches you through your webcam.** MediaPipe FaceLandmarker runs in the browser and measures the geometry of your face frame by frame. A Gemini call turns what it sees into a verdict and a fresh guilt line. Only a small, downscaled snapshot is sent for a verdict — never a video stream.
- **Confirms when you fix it.** Sit up straight for 3 seconds after a slouch nag and Gerald admits it, backhanded: *"Oh, a straight spine, look at you doing the bare minimum."*
- **Notices water.** Tip your chin up with a bottle or cup for a moment and Gerald celebrates like you've just saved the rainforest. Gemini double-checks the frame for a cup or bottle before counting it, and there's an **"I just drank water"** button for when the camera misses a sip.
- **Keeps score.** A mood trail runs across the session with a marker on every sip and every slouch.
- **Follows you out of the tab.** "Float Gerald over other windows" pops the plant into a small always-on-top window (Document Picture-in-Picture) so he keeps reacting while you work somewhere else. Desktop Chrome and Edge.
- **Demo mode.** No camera needed — press a habit button and watch it react.

## What Gerald watches

| Habit | Nagged after | Confirmed fixed when |
| --- | --- | --- |
| Slouching (head dropped, sunk in frame, or leaned in) | 5 seconds | sitting up straight instantly |
| Thirst (no sip) | 1 minute | a sip |
| Staring without blinking | 5 seconds | a blink |
| Leaning too close to the screen | 5 seconds | leaning back instantly |
| Frowning or squinting | 5 seconds | relaxing the face instantly |
| Finger at the mouth (nail-biting) | 5 seconds | hand away instantly |
| Yawning | 5 seconds | jaw closed instantly |
| Looking down at a phone | 5 seconds | looking back up instantly |
| Screen time | 60 minutes | only a break resets it |
| Walking away (no face in frame) | 5 seconds | coming back |

A slouch needs two signals agreeing, or one extreme reading, so a glance at a colleague doesn't set it off. The same habit nags again every 45 seconds while it keeps going.

## Voice

Gerald keeps typing until you press **"Fine, I'll Speak"** under the pot. Then he talks out loud with ElevenLabs, and the button turns into **"That's Enough, Gerald"** to send him back to typing. Nothing is spoken until you press it — and if the spoken voice can't be reached, the browser's own voice reads the line instead.

## The rules it lives by

| Rule | Value |
| --- | --- |
| First slouch nag | after 5 seconds |
| Repeat nag | every 45 seconds while you keep at it |
| Thirst nag | after 1 minute without a sip |
| Screen-time nag | after 60 minutes |
| "You left" detection | after 5 seconds with no face in frame |
| A sip looks like | chin tipped up, held 1.2 seconds |
| One sip counts as one | 20-second cooldown |
| Sitting up confirms | 3 seconds upright |
| Stopping a habit confirms | 2 seconds (a blink ends a stare at once) |

## Run it

```bash
bun install
bun run dev
```

Then open http://localhost:8080 and press **Start the camera** (allow camera access, sit up straight, then **"I am sitting up straight — remember this"** to calibrate) or **Run in demo mode**. A local clone needs its own server-side keys for Gemini and ElevenLabs; the hosted app already has them.

## Tests

```bash
bunx vitest run
```

20 tests cover the posture, drink, away, habit and nag rules in `src/lib/plant-core.ts`.

## Where the code lives

| File | Job |
| --- | --- |
| `src/lib/plant-core.ts` | The rules and state machine — pure, no browser APIs, fully tested |
| `src/lib/use-face-sensor.ts` | Webcam and face landmarks; loaded only after you press Start the camera |
| `src/lib/plant.functions.ts` | Server functions for Gemini (guilt lines, posture verdicts, cup-or-bottle check) and ElevenLabs (voice); keys stay server-side |
| `src/components/Plant.tsx` | The plant: leaves brown and drop with mood, the pot squints, eye-rolls, presses its lips and shakes like a head |
| `src/components/StreakChart.tsx` | The mood trail |
| `src/lib/fanfare.ts` | The WebAudio celebration when you drink |
| `src/routes/index.tsx` | The app shell — calibration, demo mode, quiet mode, the floating window, the tick loop |
| `src/routes/tracks.tsx` | The public page listing which hackathon tracks this is going for |
| `src/test/plant-core.test.ts` | The rule tests |

## Built for

CodeRED Orion hackathon. Uses the Gemini API and ElevenLabs MLH challenges.
