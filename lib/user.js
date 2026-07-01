// lib/user.js
//
// Single source of truth for the anonymous user ID.
// Same localStorage key ("lp_uid") and same ID format already used by
// the feedback system — extracted here so it's defined in exactly one place.

const S = {
  get: (k, fb = null) => {
    try {
      const d = localStorage.getItem(k);
      return d ? JSON.parse(d) : fb;
    } catch {
      return fb;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

export const getUserId = () => {
  if (typeof window === "undefined") return "ssr";
  let uid = S.get("lp_uid", null);
  if (!uid) {
    uid = `user_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    S.set("lp_uid", uid);
  }
  return uid;
};
