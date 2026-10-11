import { createFileRoute, Link } from "@tanstack/react-router";

const TITLE = "Our tracks — Sigh-cus";
const DESC =
  "Which CodeRED Orion and MLH tracks the Sigh-cus desk plant is going for, and where each one stands.";

export const Route = createFileRoute("/tracks")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TracksPage,
});

type Item = { name: string; note: string; status: string };

const MAIN: Item[] = [
  { name: "Best Overall ($1000)", note: "Our main target. A webcam plant that guilts you into sitting up straight.", status: "Going for it" },
  { name: "Best Pitch ($500)", note: "The plant's passive-aggressive personality makes the demo memorable.", status: "Strong fit" },
  { name: "Most Immersive Hack", note: "Live webcam, spoken sighs and a gospel fanfare when you drink water.", status: "Strong fit" },
  { name: "Best Environment Hack ($500)", note: "Only counts with a real eco habit; this is a wellness app.", status: "Not pursuing" },
  { name: "Best Hardware", note: "The project is software only.", status: "Not pursuing" },
];

const MLH: Item[] = [
  { name: "Gemini API", note: "Writes Gerald's guilt lines and judges posture from camera frames.", status: "Working" },
  { name: "ElevenLabs", note: "Gerald's voice (Daniel, dry British). The key works; the app runs text-only for now until we lock in the lines.", status: "Key working, voice paused" },
  { name: "Backboard.io", note: "Planned: memory so Gerald remembers your past slouching.", status: "Waiting on API key" },
  { name: "Tiger Data", note: "Planned: store guilt streaks long term.", status: "Not started" },
  { name: "GoDaddy Registry", note: "Domain sigh-cus.design claimed with the event promo code and connected to the app.", status: "Done" },
  { name: "Solana", note: "Doesn't fit the idea.", status: "Dropped" },
  { name: "Vultr", note: "Doesn't fit the idea.", status: "Dropped" },
];

function Section({ title, items }: { title: string; items: Item[] }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold">{title}</h2>
      <ul className="mt-4 grid gap-3">
        {items.map((i) => (
          <li key={i.name} className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{i.name}</span>
              <span className="text-sm text-muted-foreground">{i.status}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{i.note}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TracksPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <Link to="/" className="text-sm text-muted-foreground underline">
        ← Meet Gerald the plant
      </Link>
      <h1 className="mt-4 text-3xl font-bold">Our tracks</h1>
      <p className="mt-2 text-muted-foreground">
        CodeRED Orion, 24 hours. Here is what we are going for and how far along each piece is.
      </p>
      <Section title="CodeRED Orion" items={MAIN} />
      <Section title="MLH challenges" items={MLH} />
    </main>
  );
}
