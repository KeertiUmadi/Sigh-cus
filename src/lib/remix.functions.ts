import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  image: z.string().startsWith("data:image/").max(6_000_000),
  style: z.enum(["Fantasy", "Sci-Fi", "Noir", "Cozy"]),
});

export type RemixResult = {
  object_name: string;
  tagline: string;
  chapters: { title: string; narration: string }[];
  fun_fact: string;
  eco: {
    material: string;
    footprint_note: string;
    reuse_ideas: string[];
    quest: string;
  };
};

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["object_name", "tagline", "chapters", "fun_fact", "eco"],
  properties: {
    object_name: { type: "string" },
    tagline: { type: "string" },
    chapters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "narration"],
        properties: { title: { type: "string" }, narration: { type: "string" } },
      },
    },
    fun_fact: { type: "string" },
    eco: {
      type: "object",
      additionalProperties: false,
      required: ["material", "footprint_note", "reuse_ideas", "quest"],
      properties: {
        material: { type: "string" },
        footprint_note: { type: "string" },
        reuse_ideas: { type: "array", items: { type: "string" } },
        quest: { type: "string" },
      },
    },
  },
};

export const remixObject = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<RemixResult> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured.");

    const prompt = `Look at the main object in this photo and remix it into a short immersive experience in a ${data.style} style.
Return: the object's name; a one-line tagline; exactly 3 story chapters (each with a short title and 2-3 vivid sentences of narration written to be read aloud, starring the object as the hero); one surprising true fun fact about this kind of object; and an eco section: the main material(s), a brief ROUGH ESTIMATE note about its environmental footprint (clearly say it is an estimate), exactly 3 practical reuse/repair/recycle ideas, and one fun 5-minute "eco quest" the user can do right now.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        include: ["reasoning.encrypted_content"],
        text: {
          format: { type: "json_schema", name: "remix", strict: true, schema: jsonSchema },
        },
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: data.image },
            ],
          },
        ],
      }),
    });

    if (!res.ok || !res.body) {
      let msg = `AI request failed (${res.status})`;
      try {
        const j = await res.json();
        msg = j?.error?.message ?? j?.message ?? msg;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === "response.output_text.delta") text += ev.delta;
          if (ev.type === "response.failed" || ev.type === "error")
            throw new Error(ev.response?.error?.message ?? ev.message ?? "AI error");
        } catch (e) {
          if (e instanceof Error && e.message !== "Unexpected end of JSON input" && !(e instanceof SyntaxError))
            throw e;
        }
      }
    }
    if (!text) throw new Error("The AI returned nothing. Try another photo.");
    return JSON.parse(text) as RemixResult;
  });
