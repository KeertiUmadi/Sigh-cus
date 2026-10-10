/**
 * A short gospel-ish rise played on drink detection, built from oscillators so
 * there is no audio file to ship.
 */
export function playFanfare() {
  if (typeof window === "undefined") return;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;

  const ctx = new Ctor();
  const now = ctx.currentTime;
  // IV -> V -> I in C, arpeggiated, with a shimmer on top
  const chords = [
    [349.23, 440.0, 523.25],
    [392.0, 493.88, 587.33],
    [523.25, 659.25, 783.99],
  ];

  chords.forEach((chord, i) => {
    chord.forEach((freq, j) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i === 2 ? "triangle" : "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.16 + j * 0.04;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(i === 2 ? 0.16 : 0.1, start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.7);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.8);
    });
  });

  window.setTimeout(() => ctx.close().catch(() => undefined), 1600);
}
