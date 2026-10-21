// Shared test harness: tiny assertion runner, in-memory Firestore controls and
// a scripted AI-provider mock. NOTHING here calls a real model or database.
export const results = { pass: 0, fail: 0, fails: [] };
export const t = (name, ok) => {
  ok ? results.pass++ : (results.fail++, results.fails.push(name));
  console.log((ok ? "PASS " : "FAIL ") + name);
};
export const finish = (label) => {
  console.log(`\n${label}: ${results.pass} passed, ${results.fail} failed`);
  if (results.fail) console.log("FAILED: " + results.fails.join(" | "));
  process.exit(results.fail ? 1 : 0);
};

export function silenceLogs() {
  const keep = { log: console.log, error: console.error, warn: console.warn };
  console.error = console.warn = () => {};
  // Keep console.log for test output; route logs go through console.log too,
  // so wrap: only let lines starting with PASS/FAIL/blank/summary through.
  const origLog = console.log;
  console.log = (...a) => {
    const s = String(a[0] ?? "");
    if (/^(PASS|FAIL|\n|=== )/.test(s) || /passed, \d+ failed/.test(s) || s.startsWith("FAILED") || s.startsWith("INFO")) origLog(...a);
  };
  return keep;
}

// ── Firestore controls (fake lives in node_modules/firebase/firestore.js) ──
export const store = () => globalThis.__store;
export const fs = {
  reset() {
    globalThis.__store.clear();
    globalThis.__failReads = false; globalThis.__failWrites = false;
    globalThis.__failReadsCount = 0; globalThis.__failWritesCount = 0;
    globalThis.__writeLog = [];
  },
  failReadsOnce() { globalThis.__failReadsCount = 1; },
  failWritesNext(n) { globalThis.__failWritesCount = n; },
  writeLog: () => globalThis.__writeLog,
};

// ── provider mock ──
// main(i, body) -> object the main chat call should return (i = 0,1,2…)
// extract(body)  -> object | Error the extraction call returns/throws
export const calls = { main: 0, extract: 0, other: 0, urls: [] };
const okGemini = (obj) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: typeof obj === "string" ? obj : JSON.stringify(obj) }] } }] }), text: async () => "" });
const okGroq = (obj) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: typeof obj === "string" ? obj : JSON.stringify(obj) } }] }), text: async () => "" });
const httpErr = (status) => ({ ok: false, status, json: async () => ({}), text: async () => "err" });

export function mockProvider({ main, extract, identity } = {}) {
  calls.main = 0; calls.extract = 0; calls.other = 0; calls.urls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    calls.urls.push(u);
    if (u.includes("identitytoolkit")) {
      if (!identity) return httpErr(400);
      return identity(JSON.parse(init.body));
    }
    const body = JSON.parse(init.body);
    const sys = u.includes("groq") ? (body.messages?.[0]?.content || "") : (body.system_instruction?.parts?.[0]?.text || "");
    const isExtract = sys.startsWith("You extract facts");
    const groq = u.includes("groq");
    const wrap = groq ? okGroq : okGemini;
    if (isExtract) {
      calls.extract++;
      if (!extract) return httpErr(500);
      const r = await extract(body);
      if (r instanceof Error) throw r;
      if (r && r.__http) return httpErr(r.__http);
      return wrap(r);
    }
    const i = calls.main++;
    const r = typeof main === "function" ? await main(i, body) : main;
    if (r && r.__http) return httpErr(r.__http);
    return wrap(r);
  };
}

export const msgs = (...c) => c.map((content, i) => ({ role: i % 2 ? "assistant" : "user", content }));
export const hyp = (id, label, status, extra = {}) => ({ id, label, status, confidence: "high", supportingEvidence: "x", contradictingEvidence: "", missingEvidence: "", ...extra });

export const FULL_FACTS = { roleTarget: "Electrical Draftsman", location: "Calicut", experienceLevel: "3 months", responses: 0 };
export function seed(uid, searchOverrides = {}, topLevel = {}) {
  globalThis.__store.set(`user_memory/${uid}`, {
    userId: uid, shared: {}, pillars: {}, ...topLevel,
    search: {
      phase: "understand", roleTarget: "", location: "", experienceLevel: "", applicationsTotal: null, responses: null, interviews: null, viewedCount: null,
      channels: { portals: null, direct: null }, channelResponses: { portals: null, direct: null },
      cvProvided: false, jobDescriptionsProvided: false, sameCvForEveryApplication: null, employmentStatus: "",
      uniqueOpportunityCount: null, uniqueCompanyCount: null, recentInterviewOutcomes: [], hypotheses: [], diagnosis: null,
      facts: [], insightsGiven: [], activeTask: null, updatedAt: null, ...searchOverrides,
    },
  });
  return globalThis.__store.get(`user_memory/${uid}`);
}
export const saved = (uid) => globalThis.__store.get(`user_memory/${uid}`)?.search;
export const headersOf = (obj) => ({ get: (k) => obj[k.toLowerCase()] ?? null });
