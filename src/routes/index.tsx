import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { remixObject, type RemixResult } from "@/lib/remix.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Reality Remix — turn any object into an experience" },
      {
        name: "description",
        content:
          "Snap a photo of any object and get a narrated story, a surprising fact and an eco quest to reuse it.",
      },
      { property: "og:title", content: "Reality Remix — turn any object into an experience" },
      {
        property: "og:description",
        content: "Snap any object. Get a narrated adventure, a fun fact and an eco quest.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const STYLES = ["Fantasy", "Sci-Fi", "Noir", "Cozy"] as const;

function resize(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 1024;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Could not read that image."));
    img.src = url;
  });
}

function Index() {
  const [image, setImage] = useState<string | null>(null);
  const [style, setStyle] = useState<(typeof STYLES)[number]>("Fantasy");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RemixResult | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setError(null);
    setResult(null);
    try {
      setImage(await resize(f));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remix() {
    if (!image) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await remixObject({ data: { image, style } }));
    } catch (e) {
      setError((e as Error).message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function speak(text: string, idx: number) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    if (playing === idx) {
      setPlaying(null);
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.onend = () => setPlaying(null);
    setPlaying(idx);
    window.speechSynthesis.speak(u);
  }

  function playAll() {
    if (!result || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setPlaying(-1);
    result.chapters.forEach((c, i) => {
      const u = new SpeechSynthesisUtterance(`${c.title}. ${c.narration}`);
      u.rate = 0.95;
      if (i === result.chapters.length - 1) u.onend = () => setPlaying(null);
      window.speechSynthesis.speak(u);
    });
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-12">
      <header className="mb-10 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Reality Remix</p>
        <h1 className="mt-3 font-display text-5xl leading-tight sm:text-6xl">
          Turn any object into an experience
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Snap a mug, a shoe, a plastic bottle. Get a narrated adventure, a surprising fact and an
          eco quest to give it a second life.
        </p>
      </header>

      <section className="rounded-2xl border bg-card p-5">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="flex h-64 w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          {image ? (
            <img src={image} alt="Your object" className="h-full w-full object-contain" />
          ) : (
            <span>Tap to take or upload a photo</span>
          )}
        </button>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm text-muted-foreground">Style</span>
          {STYLES.map((s) => (
            <button
              key={s}
              onClick={() => setStyle(s)}
              className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                style === s
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:border-primary"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <button
          onClick={remix}
          disabled={!image || loading}
          className="mt-5 w-full rounded-xl bg-primary py-3 font-medium text-primary-foreground transition-opacity disabled:opacity-40"
        >
          {loading ? "Remixing reality…" : "Remix it"}
        </button>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </section>

      {result && (
        <article className="mt-10 space-y-8">
          <div className="text-center">
            <h2 className="font-display text-4xl">{result.object_name}</h2>
            <p className="mt-2 italic text-muted-foreground">{result.tagline}</p>
            <button
              onClick={playAll}
              className="mt-4 rounded-full border border-primary px-5 py-2 text-sm text-primary hover:bg-primary hover:text-primary-foreground"
            >
              {playing === -1 ? "Playing…" : "Play the full story aloud"}
            </button>
          </div>

          <div className="space-y-4">
            {result.chapters.map((c, i) => (
              <div key={i} className="rounded-2xl border bg-card p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-primary">
                      Chapter {i + 1}
                    </p>
                    <h3 className="mt-1 font-display text-2xl">{c.title}</h3>
                  </div>
                  <button
                    onClick={() => speak(`${c.title}. ${c.narration}`, i)}
                    className="shrink-0 rounded-full border px-3 py-1 text-sm hover:border-primary"
                  >
                    {playing === i ? "Stop" : "Listen"}
                  </button>
                </div>
                <p className="mt-3 leading-relaxed">{c.narration}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border bg-secondary p-6">
            <p className="text-xs uppercase tracking-widest text-primary">Did you know</p>
            <p className="mt-2">{result.fun_fact}</p>
          </div>

          <div className="rounded-2xl border border-primary/40 bg-card p-6">
            <p className="text-xs uppercase tracking-widest text-primary">Eco remix</p>
            <p className="mt-3 text-sm text-muted-foreground">Made of: {result.eco.material}</p>
            <p className="mt-1 text-sm text-muted-foreground">{result.eco.footprint_note}</p>
            <ul className="mt-4 list-inside list-disc space-y-1">
              {result.eco.reuse_ideas.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            <div className="mt-5 rounded-xl bg-primary/10 p-4">
              <p className="text-xs uppercase tracking-widest text-primary">5-minute eco quest</p>
              <p className="mt-1">{result.eco.quest}</p>
            </div>
          </div>
        </article>
      )}
    </main>
  );
}
