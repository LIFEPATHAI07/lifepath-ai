// lib/db.js
// The ONLY way server code touches Firestore.
//
//  • "admin" mode (secure): used when FIREBASE_SERVICE_ACCOUNT_JSON (or
//    FIREBASE_SERVICE_ACCOUNT_BASE64) is set. The server talks to Firestore with the
//    Firebase Admin SDK, which is allowed by Google's identity system rather than by
//    security rules. That lets the Firestore rules deny EVERY browser request.
//  • "web" mode (legacy, NOT secure): the old behaviour. It only works if the Firestore
//    rules let browsers read/write, which means anyone with your public Firebase config
//    could read or change data. Kept so the app keeps working until the service account
//    is configured. The server logs a warning when it runs this way.
//
// The functions mirror the few Firestore calls the app already used, so the rest of
// the code did not have to change.

import { db as webDb } from "./firebase";
import {
  doc as wDoc, getDoc as wGetDoc, setDoc as wSetDoc, updateDoc as wUpdateDoc, arrayUnion as wArrayUnion,
  deleteDoc as wDeleteDoc, collection as wCollection, addDoc as wAddDoc, getDocs as wGetDocs,
  query as wQuery, where as wWhere, orderBy as wOrderBy, limit as wLimit, serverTimestamp as wServerTimestamp,
} from "firebase/firestore";

export const adminConfigured = () => !!(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_BASE64);
export const dbMode = () => (adminConfigured() ? "admin" : "web");

function readServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    || Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "", "base64").toString("utf8");
  const sa = JSON.parse(raw);
  if (typeof sa.private_key === "string") sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  return sa;
}

let adminPromise = null;
export function getAdmin() {
  if (!adminPromise) {
    adminPromise = (async () => {
      const appMod = await import("firebase-admin/app");
      const fsMod = await import("firebase-admin/firestore");
      const authMod = await import("firebase-admin/auth");
      const app = appMod.getApps().length ? appMod.getApps()[0] : appMod.initializeApp({ credential: appMod.cert(readServiceAccount()) });
      const firestore = fsMod.getFirestore(app);
      try { firestore.settings({ ignoreUndefinedProperties: true }); } catch { /* already configured */ }
      return { firestore, FieldValue: fsMod.FieldValue, auth: authMod.getAuth(app) };
    })().catch((e) => { adminPromise = null; throw e; });
  }
  return adminPromise;
}

if (!adminConfigured() && typeof process !== "undefined" && process.env.NODE_ENV === "production") {
  console.warn("[db] SECURITY: running in legacy 'web' mode. Firestore is reached with the browser SDK, so your Firestore rules must allow browser access. Set FIREBASE_SERVICE_ACCOUNT_JSON and then deny all browser access in the rules (see docs/security.md).");
}

// A reference is just a place; the right backend is chosen when it is used.
export const doc = (_db, coll, id) => ({ coll, id });
export const arrayUnion = (...items) => ({ __arrayUnion: items });
export const serverTimestamp = () => ({ __serverTimestamp: true });

const mapTop = (obj, fn) => Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [k, fn(v)]));
const toWeb = (v) => (v && typeof v === "object" && v.__arrayUnion ? wArrayUnion(...v.__arrayUnion) : v && typeof v === "object" && v.__serverTimestamp ? wServerTimestamp() : v);
const toAdmin = (FieldValue) => (v) => (v && typeof v === "object" && v.__arrayUnion ? FieldValue.arrayUnion(...v.__arrayUnion) : v && typeof v === "object" && v.__serverTimestamp ? FieldValue.serverTimestamp() : v);

export async function getDoc(ref) {
  if (!adminConfigured()) return wGetDoc(wDoc(webDb, ref.coll, ref.id));
  const { firestore } = await getAdmin();
  const snap = await firestore.collection(ref.coll).doc(ref.id).get();
  return { exists: () => snap.exists, data: () => snap.data() };
}
export async function setDoc(ref, data, options) {
  if (!adminConfigured()) return wSetDoc(wDoc(webDb, ref.coll, ref.id), mapTop(data, toWeb), options);
  const { firestore, FieldValue } = await getAdmin();
  return firestore.collection(ref.coll).doc(ref.id).set(mapTop(data, toAdmin(FieldValue)), options);
}
export async function updateDoc(ref, updates) {
  if (!adminConfigured()) return wUpdateDoc(wDoc(webDb, ref.coll, ref.id), mapTop(updates, toWeb));
  const { firestore, FieldValue } = await getAdmin();
  return firestore.collection(ref.coll).doc(ref.id).update(mapTop(updates, toAdmin(FieldValue)));
}
export async function deleteDoc(ref) {
  if (!adminConfigured()) return wDeleteDoc(wDoc(webDb, ref.coll, ref.id));
  const { firestore } = await getAdmin();
  return firestore.collection(ref.coll).doc(ref.id).delete();
}
// Adds a document with a generated id and returns { id }.
export async function addDocTo(coll, data) {
  if (!adminConfigured()) { const r = await wAddDoc(wCollection(webDb, coll), mapTop(data, toWeb)); return { id: r.id }; }
  const { firestore, FieldValue } = await getAdmin();
  const r = await firestore.collection(coll).add(mapTop(data, toAdmin(FieldValue)));
  return { id: r.id };
}
// Newest first: [{ id, data }]
export async function listDocs(coll, { orderField = "timestamp", max = 200 } = {}) {
  if (!adminConfigured()) {
    const snap = await wGetDocs(wQuery(wCollection(webDb, coll), wOrderBy(orderField, "desc"), wLimit(max)));
    const out = []; snap.forEach((d) => out.push({ id: d.id, data: d.data() })); return out;
  }
  const { firestore } = await getAdmin();
  const snap = await firestore.collection(coll).orderBy(orderField, "desc").limit(max).get();
  return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
}
// Deletes every document whose field equals value. Returns how many.
export async function deleteWhere(coll, field, value) {
  if (!adminConfigured()) {
    const snap = await wGetDocs(wQuery(wCollection(webDb, coll), wWhere(field, "==", value)));
    const ids = []; snap.forEach((d) => ids.push(d.id));
    for (const id of ids) await wDeleteDoc(wDoc(webDb, coll, id));
    return ids.length;
  }
  const { firestore } = await getAdmin();
  const snap = await firestore.collection(coll).where(field, "==", value).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
  return snap.docs.length;
}

// ── Is the database really reachable? (used by /api/health) ──────────────────────────
// Turns an error from the Admin SDK into ONE of a few fixed categories. The raw error text
// is never returned or logged by the health route: it can contain project ids or key fragments.
export function classifyDbError(err) {
  const code = err?.code;
  const msg = String(err?.message || err || "");
  // 1. The service account ITSELF is bad: not valid JSON, missing fields, a broken key, or Google
  //    does not recognise it (UNAUTHENTICATED).
  if (err instanceof SyntaxError || code === 16 || code === 401 || code === "app/invalid-credential" || code === "auth/invalid-credential"
    || /private key|PEM|invalid_grant|invalid[_ ]?(jwt|client|credential)|client_email|service account object|must contain a string|could not load the default credentials|unauthenticated|error:0/i.test(msg)) return "credentials_invalid";
  // 2. Firestore (the service) is switched off, missing or can't be reached. A "permission denied"
  //    that really means "the Firestore API is disabled" belongs here, not under permissions.
  if (/has not been used|api .*(is )?(disabled|not enabled)|firestore api|database .*(does not exist|not found)/i.test(msg)
    || code === 14 || code === 4 || code === 5 || /unavailable|deadline|timed? ?out|timeout|enotfound|econnrefused|econnreset|eai_again|network|not[_ ]found/i.test(msg)) return "firestore_unavailable";
  // 3. The credentials are valid and Firestore answered, but this account may not use it.
  if (code === 7 || code === 403 || /permission[_ ]denied|insufficient permission|missing or insufficient|does not have .*permission|forbidden/i.test(msg)) return "permission_denied";
  return "error";
}

const HEALTH_MESSAGES = {
  connected: "The server connected to Firestore with valid Admin SDK credentials.",
  credentials_invalid: "A service account is configured but the credentials are invalid or were rejected.",
  permission_denied: "The credentials were accepted, but this service account is not allowed to use Firestore. Check its Firestore access (IAM role) for the project.",
  firestore_unavailable: "Credentials were accepted but Firestore could not be reached or is not set up.",
  error: "The Admin SDK check failed for an unclassified reason. See the server logs.",
  legacy_web: "No service account is configured: the server uses the legacy browser SDK. Not secure.",
};

// A safe, minimal check: initialise the Admin SDK and READ one document that does not exist.
// That needs valid credentials and a reachable Firestore, and it writes nothing.
export async function checkDatabase({ timeoutMs = 4000 } = {}) {
  if (!adminConfigured()) return { mode: "web", status: "legacy_web", ok: false, secure: false, message: HEALTH_MESSAGES.legacy_web };
  try {
    const { firestore } = await getAdmin();
    await Promise.race([
      firestore.collection("_health").doc("ping").get(),
      new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error("timeout"), { code: 4 })), timeoutMs)),
    ]);
    return { mode: "admin", status: "connected", ok: true, secure: true, message: HEALTH_MESSAGES.connected };
  } catch (e) {
    const status = classifyDbError(e);
    adminPromise = null; // a later check should try again from scratch
    console.error("[health] database check failed:", status); // category only, never the raw error
    return { mode: "admin", status, ok: false, secure: false, message: HEALTH_MESSAGES[status] || HEALTH_MESSAGES.error };
  }
}

// Tests only: forget the cached Admin SDK so a changed credential is picked up.
export function __resetAdminCache() { adminPromise = null; }
