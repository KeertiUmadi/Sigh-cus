import { createMiddleware } from "@tanstack/react-start";

/**
 * Light protection for Gerald's paid calls (Gemini, voice, memory) without
 * requiring logins: same-site requests only, plus per-visitor and daily caps.
 * Counters live in memory per server instance, so this is best effort.
 */
const ALLOWED_HOSTS = [/^sigh-cus\.design$/, /^www\.sigh-cus\.design$/, /^sigh-cus\.lovable\.app$/, /\.lovable\.app$/, /^localhost$/, /^127\.0\.0\.1$/];

const minute = new Map<string, { n: number; t: number }>();
const day = new Map<string, { n: number; t: number }>();

function bump(map: Map<string, { n: number; t: number }>, key: string, windowMs: number, max: number) {
  const now = Date.now();
  const cur = map.get(key);
  if (!cur || now - cur.t > windowMs) {
    map.set(key, { n: 1, t: now });
    if (map.size > 5000) map.clear();
    return true;
  }
  cur.n += 1;
  return cur.n <= max;
}

export function guard(name: string, perMinute: number, perDay: number) {
  return createMiddleware({ type: "function" }).server(async ({ next }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const origin = req.headers.get("origin");
    let host = "";
    try {
      host = origin ? new URL(origin).hostname : "";
    } catch {
      host = "";
    }
    if (!host || !ALLOWED_HOSTS.some((re) => re.test(host))) {
      throw new Response("Forbidden", { status: 403 });
    }
    const ip =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    if (
      !bump(minute, `${name}:${ip}`, 60_000, perMinute) ||
      !bump(day, `${name}:${ip}`, 86_400_000, perDay) ||
      !bump(day, `${name}:*`, 86_400_000, perDay * 20)
    ) {
      throw new Response("Too many requests", { status: 429 });
    }
    return next();
  });
}
