import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { guard } from "./guard";

/**
 * Gerald's long-term memory, kept in Backboard. Each browser gets its own
 * Backboard assistant (id stored client-side) so memories stay per person.
 * BACKBOARD_API_KEY is only ever read inside the handlers.
 */

const BASE = "https://app.backboard.io/api";

const rememberSchema = z.object({
  assistantId: z.string().max(100).optional(),
  text: z.string().min(1).max(300),
});

const recallSchema = z.object({
  assistantId: z.string().max(100).optional(),
});

export const rememberHabit = createServerFn({ method: "POST" })
  .middleware([guard("remember", 20, 500)])
  .inputValidator((input: unknown) => rememberSchema.parse(input))
  .handler(async ({ data }): Promise<{ assistantId: string | null }> => {
    const key = process.env["BACKBOARD_API_KEY"];
    if (!key) return { assistantId: null };
    const headers = { "X-API-Key": key, "Content-Type": "application/json" };
    try {
      let id = data.assistantId;
      if (!id) {
        const res = await fetch(`${BASE}/assistants`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: "Gerald",
            system_prompt: "Gerald is a sarcastic desk plant who remembers his human's bad habits.",
          }),
        });
        if (!res.ok) return { assistantId: null };
        const made = (await res.json()) as { assistant_id?: string; id?: string };
        id = made.assistant_id ?? made.id;
        if (!id) return { assistantId: null };
      }
      const res = await fetch(`${BASE}/assistants/${id}/memories`, {
        method: "POST",
        headers,
        body: JSON.stringify({ content: data.text, metadata: { source: "sigh-cus" } }),
      });
      if (!res.ok) console.error("Backboard memory write failed", res.status);
      return { assistantId: id };
    } catch (e) {
      console.error("Backboard error", e);
      return { assistantId: null };
    }
  });

export const recallHabits = createServerFn({ method: "POST" })
  .middleware([guard("recall", 20, 500)])
  .inputValidator((input: unknown) => recallSchema.parse(input))
  .handler(async ({ data }): Promise<{ memories: string[] }> => {
    const key = process.env["BACKBOARD_API_KEY"];
    if (!key || !data.assistantId) return { memories: [] };
    try {
      const res = await fetch(`${BASE}/assistants/${data.assistantId}/memories`, {
        headers: { "X-API-Key": key },
      });
      if (!res.ok) return { memories: [] };
      const json = (await res.json()) as { memories?: { content?: string }[] };
      const all = (json.memories ?? []).map((m) => m.content ?? "").filter(Boolean);
      return { memories: all.slice(-8) };
    } catch {
      return { memories: [] };
    }
  });
