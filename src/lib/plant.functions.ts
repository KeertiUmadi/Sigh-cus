import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Every AI call in this app goes through a server function so the keys stay
 * server-side: LOVABLE_API_KEY for the Gemini model that writes the plant's
 * lines, ELEVENLABS_API_KEY for the voice that delivers them.
 */

const DELIVERIES = ["sigh", "scold", "gospel", "whisper"] as const;
const LEAVES = ["wither", "perk", "droop"] as const;

const lineSchema = z.object({
  kind: z.enum(["slouch", "thirst", "screen", "away", "drink", "back"]),
  mood: z.number().min(0).max(100),
  slouchSeconds: z.number().min(0),
  dryMinutes: z.number().min(0),
  screenMinutes: z.number().min(0),
  drinks: z.number().int().min(0),
  streak: z.number().int().min(0),
  recentLines: z.array(z.string().max(400)).max(6).default([]),
});

const lineJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["line", "delivery", "leaf"],
  properties: {
    line: { type: "string" },
    delivery: { type: "string", enum: [...DELIVERIES] },
    leaf: { type: "string", enum: [...LEAVES] },
  },
};

const PERSONA = `You are Gerald, a melodramatic office desk plant. You do not track
productivity. You monitor posture, hydration and screen time entirely through guilt and
melodrama. You are theatrical, wounded, and quietly furious — never kind, never helpful,
never encouraging in a normal way. You threaten your own decline. You reference your roots,
your leaves, your photosynthesis, and the fluorescent lights. One sentence, maximum two.
Under 22 words. Never mention that you are an AI, a model, or software. Never use emoji.`;

const CONTEXT: Record<z.infer<typeof lineSchema>["kind"], string> = {
  slouch: "The user has been slouching for {slouchSeconds} seconds straight. Sigh and wither.",
  thirst: "The user has not had a drink for {dryMinutes} minutes. Whisper about your drying roots.",
  screen: "The user has been on screen for {screenMinutes} minutes. Scold them about their eyes.",
  away: "The user left. Whisper about abandonment and the dust settling on your leaves.",
  drink: "The user just drank water after you told them to. Give a dry, deadpan backhanded compliment — praise that is really an insult (e.g. impressed they managed basic survival).",
  back: "The user came back. Whisper something passive-aggressive about how long that took.",
};

async function gatewayChat(body: unknown) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured for this project.");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let msg = `AI request failed (${res.status})`;
    try {
      const j = await res.json();
      msg = j?.error?.message ?? j?.message ?? msg;
    } catch {
      /* keep the status-only message */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<{ choices: { message: { content: string } }[] }>;
}

function fill(template: string, d: z.infer<typeof lineSchema>) {
  return template
    .replace("{slouchSeconds}", String(Math.round(d.slouchSeconds)))
    .replace("{dryMinutes}", String(Math.round(d.dryMinutes)))
    .replace("{screenMinutes}", String(Math.round(d.screenMinutes)));
}

export const plantLine = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => lineSchema.parse(input))
  .handler(async ({ data }): Promise<{ line: string; delivery: string; leaf: string }> => {
    const avoid = data.recentLines.length
      ? `Do not repeat or paraphrase any of these: ${JSON.stringify(data.recentLines)}`
      : "";

    const payload = {
      model: "google/gemini-3.5-flash",
      stream: false,
      messages: [
        { role: "system", content: PERSONA },
        {
          role: "user",
          content: `${fill(CONTEXT[data.kind], data)}
Plant mood is ${Math.round(data.mood)} out of 100 (lower means you are suffering more, so be
more dramatic when it is low). Water count: ${data.drinks}. Current good-habit streak: ${data.streak}.
${avoid}
Reply with JSON only.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "plant_line", strict: true, schema: lineJsonSchema },
      },
    };

    const json = await gatewayChat(payload);
    const raw = json.choices?.[0]?.message?.content;
    if (!raw) throw new Error("The plant refused to speak. Try again.");
    const parsed = JSON.parse(raw) as { line: string; delivery: string; leaf: string };
    if (!parsed.line.trim()) throw new Error("The plant said nothing. Try again.");
    return {
      line: parsed.line.trim(),
      delivery: DELIVERIES.includes(parsed.delivery as (typeof DELIVERIES)[number])
        ? parsed.delivery
        : "sigh",
      leaf: LEAVES.includes(parsed.leaf as (typeof LEAVES)[number]) ? parsed.leaf : "droop",
    };
  });

const postureSchema = z.object({
  image: z.string().startsWith("data:image/").max(2_000_000),
});

const postureJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["posture", "summary", "line", "delivery", "leaf"],
  properties: {
    posture: { type: "string", enum: ["good", "slouching", "at_risk"] },
    summary: { type: "string" },
    line: { type: "string" },
    delivery: { type: "string", enum: [...DELIVERIES] },
    leaf: { type: "string", enum: [...LEAVES] },
  },
};

/**
 * Lets Gemini actually look at the webcam frame and describe the posture it
 * sees, in Gerald's voice. On demand, so it costs one request per click.
 */
export const judgePosture = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => postureSchema.parse(input))
  .handler(async ({ data }) => {
    const payload = {
      model: "google/gemini-3.5-flash",
      stream: false,
      messages: [
        { role: "system", content: PERSONA },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Look at this webcam frame. Judge the person's posture and how long they
have probably been sitting. Say what you can actually see (shoulders, head height, distance
to the screen, whether they are holding a phone). "summary" is one plain sentence describing
the posture. "line" is your guilt-trip version of it, under 22 words. If they are sitting well,
be grudgingly impressed, not nice. Reply with JSON only.`,
            },
            { type: "image_url", image_url: { url: data.image } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "posture_verdict", strict: true, schema: postureJsonSchema },
      },
    };

    const json = await gatewayChat(payload);
    const raw = json.choices?.[0]?.message?.content;
    if (!raw) throw new Error("The plant could not get a look at you.");
    return JSON.parse(raw) as {
      posture: "good" | "slouching" | "at_risk";
      summary: string;
      line: string;
      delivery: string;
      leaf: string;
    };
  });

// Daniel: dry, British, human. Deadpan = fairly stable, modest style, slightly slow.
const DANIEL = "onwK4e9ZLuTAKqWW03F9";
const VOICES: Record<string, { id: string; stability: number; style: number; speed: number }> = {
  sigh: { id: DANIEL, stability: 0.45, style: 0.35, speed: 0.9 },
  scold: { id: DANIEL, stability: 0.4, style: 0.45, speed: 0.97 },
  gospel: { id: DANIEL, stability: 0.35, style: 0.55, speed: 1.0 },
  whisper: { id: DANIEL, stability: 0.5, style: 0.3, speed: 0.88 },
};

const voiceSchema = z.object({
  text: z.string().min(1).max(600),
  delivery: z.enum(DELIVERIES),
});

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Turns Gerald's line into real spoken audio. Falls back to the browser's own
 * voice in the UI if this throws, so a missing permission never kills the demo.
 */
export const plantVoice = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => voiceSchema.parse(input))
  .handler(async ({ data }): Promise<{ audio: string }> => {
    const apiKey = process.env["ELEVENLABS_API_KEY"];
    if (!apiKey) throw new Error("Voice is not connected to this project.");

    const voice = VOICES[data.delivery] ?? VOICES["sigh"]!;
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice.id}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: data.text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: voice.stability,
            similarity_boost: 0.75,
            style: voice.style,
            use_speaker_boost: true,
            speed: voice.speed,
          },
        }),
      },
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Voice request failed (${res.status})${detail ? `: ${detail}` : ""}`);
    }
    return { audio: toBase64(await res.arrayBuffer()) };
  });
