import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { guard } from "./guard";

/**
 * Every AI call in this app goes through a server function so the keys stay
 * server-side: LOVABLE_API_KEY for the Gemini model that writes the plant's
 * lines, ELEVENLABS_API_KEY for the voice that delivers them.
 */

const DELIVERIES = ["sigh", "scold", "gospel", "whisper"] as const;
const LEAVES = ["wither", "perk", "droop"] as const;

const lineSchema = z.object({
  kind: z.enum([
    "slouch",
    "thirst",
    "screen",
    "away",
    "drink",
    "back",
    "fixed",
    "frown",
    "stare",
    "close",
    "nails",
    "yawn",
    "phone",
  ]),
  fixedOf: z.enum(["slouch", "frown", "stare", "close", "nails", "yawn", "phone"]).optional(),
  mood: z.number().min(0).max(100),
  slouchSeconds: z.number().min(0),
  dryMinutes: z.number().min(0),
  screenMinutes: z.number().min(0),
  drinks: z.number().int().min(0),
  streak: z.number().int().min(0),
  recentLines: z.array(z.string().max(400)).max(12).default([]),
  memories: z.array(z.string().max(300)).max(8).default([]),
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
melodrama. You are dry, sarcastic and believable — like a real coworker who is tired of this,
not a cartoon. Speak in plain, natural, specific sentences with a deadpan tone. Never kind or
encouraging in a normal way. Only sometimes mention your leaves or roots; do not lean on the same
imagery every time, and never reuse an opening phrase. One sentence, maximum two. Under 22 words. Write for the ear: use commas, dashes and ellipses for pauses, and an occasional
question or short fragment so the delivery rises and falls naturally. Mix weary disbelief with dry sarcasm, not a flat monotone. Sometimes open with "Oh my god!!", "Are you serious?", "You have got to be kidding me!", "Oh, for heaven's sake", or "Really? Again?" then a specific observation or backhanded compliment. Rotate these with other openings; never force an exclamation into every line or repeat recent ones. Never mention that you are an AI, a model, or software. Never use emoji.`;

const CONTEXT: Record<z.infer<typeof lineSchema>["kind"], string> = {
  slouch: "The user has been slouching for {slouchSeconds} seconds straight. Sigh and wither.",
  thirst: "The user has not had a drink for {dryMinutes} minutes. Whisper about your drying roots.",
  screen: "The user has been on screen for {screenMinutes} minutes. Scold them about their eyes.",
  away: "The user left. Whisper about abandonment and the dust settling on your leaves.",
  drink:
    "The user just drank water after you told them to. Give a dry, deadpan backhanded compliment — praise that is really an insult (e.g. impressed they managed basic survival).",
  fixed:
    "The user was slouching, you told them off, and they finally sat up straight. Confirm their posture is now correct, but as a dry backhanded compliment (e.g. astonished they remembered they have a spine).",
  frown:
    "The user has been frowning or squinting at the screen for a while. Tell them to relax their face, deadpan (e.g. it's only a spreadsheet).",
  stare:
    "The user has stared at the screen without blinking for ages. Remind them eyelids exist, dryly.",
  close: "The user is leaning way too close to the screen. Tell them to back up, sarcastically.",
  nails: "The user is biting their nails. Express incredulous disgust and tell them to stop.",
  yawn: "The user keeps yawning. Suggest sleep with theatrical pity.",
  phone: "The user has been looking down at their phone instead of working. Call it out, deadpan.",
  back: "The user came back. Whisper something passive-aggressive about how long that took.",
};

const ANGLES = [
  "Lead with a specific, mundane observation about their desk or day.",
  "Be coldly polite, like an email from HR.",
  "Use a short, flat understatement.",
  "Compare them to a coworker or a houseplant that is doing better.",
  "Sound exhausted, not angry.",
  "Ask a rhetorical question.",
  "Mention a real-sounding time of day or Monday-meeting detail.",
  "Be oddly specific with a number from the stats given.",
  "Fake-concern that is obviously an insult.",
  "Speak as if narrating a nature documentary about them.",
];

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

const FIXED: Record<string, string> = {
  frown:
    "The user finally stopped frowning and relaxed their face after you told them to. Confirm it with a backhanded compliment.",
  stare:
    "The user finally blinked after you told them to. Confirm it with a backhanded compliment.",
  close:
    "The user finally leaned back to a sane distance from the screen. Confirm it with a backhanded compliment.",
  nails: "The user finally stopped biting their nails. Confirm it with a backhanded compliment.",
  yawn: "The user stopped yawning. Confirm it with a backhanded compliment about looking marginally alive.",
  phone:
    "The user put the phone down and looked back at the screen. Confirm it with a backhanded compliment.",
};

function fill(template: string, d: z.infer<typeof lineSchema>) {
  if (d.kind === "fixed" && d.fixedOf && FIXED[d.fixedOf]) template = FIXED[d.fixedOf]!;
  return template
    .replace("{slouchSeconds}", String(Math.round(d.slouchSeconds)))
    .replace("{dryMinutes}", String(Math.round(d.dryMinutes)))
    .replace("{screenMinutes}", String(Math.round(d.screenMinutes)));
}

export const plantLine = createServerFn({ method: "POST" })
  .middleware([guard("line", 12, 300)])
  .inputValidator((input: unknown) => lineSchema.parse(input))
  .handler(async ({ data }): Promise<{ line: string; delivery: string; leaf: string }> => {
    const avoid = data.recentLines.length
      ? `Do not repeat or paraphrase any of these: ${JSON.stringify(data.recentLines)}`
      : "";

    const payload = {
      model: "google/gemini-3.5-flash",
      stream: false,
      temperature: 1.2,
      messages: [
        { role: "system", content: PERSONA },
        {
          role: "user",
          content: `${fill(CONTEXT[data.kind], data)}
Plant mood is ${Math.round(data.mood)} out of 100 (lower means you are suffering more, so be
more dramatic when it is low). Water count: ${data.drinks}. Current good-habit streak: ${data.streak}.
${data.memories.length ? `Things you remember about this person from past sessions (reference one only if it fits, e.g. "again?"): ${JSON.stringify(data.memories)}` : ""}
Style for this line: ${ANGLES[Math.floor(Math.random() * ANGLES.length)]}
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
  .middleware([guard("posture", 12, 300)])
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

const vesselJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["holdingDrink"],
  properties: { holdingDrink: { type: "boolean" } },
};

/**
 * Second opinion on a sip: is a cup, bottle, mug or can held at or near the
 * person's face? One small request, only when the head-tilt check fires.
 */
export const checkDrinkVessel = createServerFn({ method: "POST" })
  .middleware([guard("vessel", 6, 150)])
  .inputValidator((input: unknown) => postureSchema.parse(input))
  .handler(async ({ data }): Promise<{ holdingDrink: boolean }> => {
    const json = await gatewayChat({
      model: "google/gemini-3.5-flash",
      stream: false,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Is the person in this webcam frame drinking, or holding a cup, mug, bottle, can or glass at or near their mouth? Answer true only if you can see such a container near the face or being tipped to drink. Reply with JSON only.",
            },
            { type: "image_url", image_url: { url: data.image } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "drink_check", strict: true, schema: vesselJsonSchema },
      },
    });
    const raw = json.choices?.[0]?.message?.content;
    if (!raw) throw new Error("No answer from the drink check.");
    return { holdingDrink: Boolean((JSON.parse(raw) as { holdingDrink: boolean }).holdingDrink) };
  });

// Daniel: conversational British sarcasm, with moderate expression rather than exaggerated delivery.
const DANIEL = "onwK4e9ZLuTAKqWW03F9";
const VOICES: Record<string, { id: string; stability: number; style: number; speed: number }> = {
  sigh: { id: DANIEL, stability: 0.38, style: 0.35, speed: 0.97 },
  scold: { id: DANIEL, stability: 0.32, style: 0.5, speed: 1.02 },
  gospel: { id: DANIEL, stability: 0.3, style: 0.55, speed: 1.04 },
  whisper: { id: DANIEL, stability: 0.42, style: 0.25, speed: 0.95 },
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
  .middleware([guard("voice", 8, 150)])
  .inputValidator((input: unknown) => voiceSchema.parse(input))
  .handler(
    async ({
      data,
    }): Promise<{ audio: string; error?: never } | { error: string; audio?: never }> => {
      const apiKey = process.env["ELEVENLABS_API_KEY"];
      if (!apiKey?.trim())
        return { error: "ElevenLabs voice is not configured for this local app." };

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
              stability: Math.min(1, Math.max(0, voice.stability + (Math.random() - 0.5) * 0.1)),
              similarity_boost: 0.75,
              style: voice.style,
              use_speaker_boost: true,
              speed: voice.speed,
            },
          }),
        },
      );

      if (!res.ok) {
        const detail = (await res.json().catch(() => null)) as {
          detail?: { status?: string };
        } | null;
        const status = detail?.detail?.status;
        if (status === "missing_permissions") {
          return { error: "The ElevenLabs key does not have permission to generate speech." };
        }
        if (status === "quota_exceeded") {
          return { error: "The ElevenLabs speech quota has been reached." };
        }
        if (res.status === 401) {
          return { error: "ElevenLabs could not authenticate the configured key." };
        }
        return { error: "ElevenLabs could not generate speech right now." };
      }
      return { audio: toBase64(await res.arrayBuffer()) };
    },
  );
