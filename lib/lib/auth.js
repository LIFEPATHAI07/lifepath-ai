// lib/auth.js
//
// Server-side identity for /api/chat.
//
// Today the browser sends its own userId and the server trusts it, so anyone
// who knows or guesses an ID can read/reset that person's investigation.
// This helper lets the browser send a Firebase sign-in token (anonymous
// sign-in is enough — no login screen) which the server verifies with
// Google's own identity API. The verified uid then replaces the browser's ID.
//
// Safe rollout: with LIFEPATH_REQUIRE_AUTH unset (default) behaviour is
// unchanged — a valid token is used when present, otherwise the old
// browser ID is accepted. Set LIFEPATH_REQUIRE_AUTH=true in Vercel only after
// anonymous sign-in is enabled in Firebase, and the API key is available as
// FIREBASE_WEB_API_KEY or NEXT_PUBLIC_FIREBASE_API_KEY.
//
// IMPORTANT LIMIT: this authenticates requests to /api/chat only. It does not
// make Firestore itself private — see the security notes delivered with this
// change (the server currently reads/writes Firestore with the web SDK, so
// the Firestore rules must still allow it).

const LOOKUP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
const VERIFY_TIMEOUT_MS = 4000;

function bearerToken(request) {
  try {
    const h = request?.headers?.get?.("authorization") || "";
    const m = /^Bearer\s+(.+)$/i.exec(h.trim());
    return m ? m[1] : "";
  } catch {
    return "";
  }
}

export async function verifyIdToken(idToken) {
  const apiKey = process.env.FIREBASE_WEB_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) return { ok: false, reason: "no_api_key" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const res = await fetch(`${LOOKUP_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, reason: "rejected" };
    const data = await res.json();
    const uid = data?.users?.[0]?.localId;
    return uid ? { ok: true, uid } : { ok: false, reason: "no_user" };
  } catch {
    return { ok: false, reason: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

// Returns { userId } on success or { error, code, status, message } to send.
export async function authenticateRequest(request, bodyUserId) {
  const required = process.env.LIFEPATH_REQUIRE_AUTH === "true";
  const token = bearerToken(request);

  if (token) {
    const v = await verifyIdToken(token);
    if (v.ok) return { userId: v.uid, authenticated: true };
    if (required) {
      if (v.reason === "no_api_key") {
        return { error: true, code: "AUTH_NOT_CONFIGURED", status: 500, message: "Sign-in checking isn't configured on the server yet. Please contact support." };
      }
      return { error: true, code: "AUTH_REQUIRED", status: 401, message: "We couldn't confirm your session. Please refresh the page and try again." };
    }
    // Not required: fall through to the legacy browser ID.
  } else if (required) {
    return { error: true, code: "AUTH_REQUIRED", status: 401, message: "We couldn't confirm your session. Please refresh the page and try again." };
  }

  return { userId: typeof bodyUserId === "string" ? bodyUserId : undefined, authenticated: false };
}
