import type { TrailPoint } from "@/lib/plant-core";

/**
 * The guilt-streak chart: Gerald's mood over the session, with every drink
 * and every slouch nag marked on the line.
 */
export function StreakChart({ trail }: { trail: TrailPoint[] }) {
  const W = 620;
  const H = 150;
  const pad = 8;

  if (trail.length < 2) {
    return (
      <div className="flex h-[150px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        The chart fills in as the plant watches you.
      </div>
    );
  }

  const first = trail[0].at;
  const last = trail[trail.length - 1].at || first + 1;
  const span = Math.max(1, last - first);
  const x = (at: number) => pad + ((at - first) / span) * (W - pad * 2);
  const y = (mood: number) => H - pad - (Math.max(0, Math.min(100, mood)) / 100) * (H - pad * 2);

  const line = trail.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.at).toFixed(1)} ${y(p.mood).toFixed(1)}`).join(" ");
  const area = `${line} L${x(last).toFixed(1)} ${H - pad} L${x(first).toFixed(1)} ${H - pad} Z`;
  const minutes = Math.round(span / 60_000);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Plant mood over the session">
        <path d={area} fill="var(--color-primary)" opacity="0.1" />
        <path d={line} fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinejoin="round" />

        {trail.map((p, i) =>
          p.slouches > (trail[i - 1]?.slouches ?? -1) ? (
            <circle key={`s${i}`} cx={x(p.at)} cy={y(p.mood)} r="4.5" fill="var(--color-destructive)" />
          ) : null,
        )}
        {trail.map((p, i) =>
          p.drinks > (trail[i - 1]?.drinks ?? -1) ? (
            <circle key={`d${i}`} cx={x(p.at)} cy={y(p.mood)} r="4.5" fill="var(--color-plant-leaf)" />
          ) : null,
        )}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-plant-leaf" />
          drank water
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-destructive" />
          caught slouching
        </span>
        <span className="ml-auto">last {minutes} min</span>
      </div>
    </div>
  );
}
