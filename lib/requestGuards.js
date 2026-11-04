// lib/requestGuards.js
// Request validation and a best-effort rate limiter, kept pure so they can be tested.

export const MAX_MESSAGES = 60;
export const MAX_CONTENT_CHARS = 12000;

// Returns a clean message array, or "too_many" / "too_long" / null.
export function normalizeMessages(raw) {
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_MESSAGES) return "too_many";
  const out = [];
  for (const m of raw) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") continue;
    if (m.content.length > MAX_CONTENT_CHARS) return "too_long";
    if (m.content.trim()) out.push({ role: m.role, content: m.content });
  }
  return out;
}

// In-memory sliding window. Serverless instances don't share memory, so this
// is a speed bump against runaway loops, not a hard guarantee.
export function createRateLimiter({ limit = 20, windowMs = 60000, now = () => Date.now() } = {}) {
  const buckets = new Map();
  return function isLimited(key) {
    const t = now();
    const recent = (buckets.get(key) || []).filter((x) => t - x < windowMs);
    if (recent.length >= limit) { buckets.set(key, recent); return true; }
    recent.push(t);
    buckets.set(key, recent);
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (!v.some((x) => t - x < windowMs)) buckets.delete(k);
    }
    return false;
  };
}
