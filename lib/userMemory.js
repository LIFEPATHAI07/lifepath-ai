// lib/userMemory.js
//
// User Memory system — one document per user in the "user_memory" Firestore
// collection.

import { db } from "./firebase";
import { doc, getDoc, setDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { getUserId } from "./user";

const COLLECTION = "user_memory";
const SCHEMA_VERSION = 1;

const PILLAR_IDS = ["jobs", "career", "cv", "wealth", "hustle", "startup"];

function memoryRef(userId) {
  return doc(db, COLLECTION, userId);
}

function createEmptyPillarSection() {
  return {
    completedTasks: [],
    updatedAt: null,
  };
}

function createEmptyUserMemory(userId) {
  const now = Date.now();
  const pillars = {};
  PILLAR_IDS.forEach((id) => {
    pillars[id] = createEmptyPillarSection();
  });

  pillars.jobs.platformsUsed = [];
  pillars.jobs.companiesApplied = [];

  return {
    userId,
    version: SCHEMA_VERSION,
    shared: {
      name: "",
      currentPillar: "",
      streak: 0,
      lastActiveDate: "",
      lastPillarUsed: "",
      activeTask: {
        id: "",
        pillar: "",
        title: "",
        status: "pending",
      },
    },
    pillars,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getUserMemory(userId) {
  const uid = userId || getUserId();
  const snap = await getDoc(memoryRef(uid));
  if (!snap.exists()) return null;
  return snap.data();
}

export async function ensureUserMemory(userId) {
  const uid = userId || getUserId();
  const existing = await getUserMemory(uid);
  if (existing) return existing;

  const fresh = createEmptyUserMemory(uid);
  await setDoc(memoryRef(uid), fresh);
  return fresh;
}

export async function getPillarMemory(userId, pillarId) {
  const uid = userId || getUserId();
  const memory = await ensureUserMemory(uid);
  return memory.pillars[pillarId] || createEmptyPillarSection();
}

export async function updatePillarMemory(userId, pillarId, updates) {
  const uid = userId || getUserId();
  await ensureUserMemory(uid);

  const now = Date.now();
  const fieldPath = `pillars.${pillarId}`;

  const dotUpdates = {};
  Object.entries(updates).forEach(([key, value]) => {
    dotUpdates[`${fieldPath}.${key}`] = value;
  });
  dotUpdates[`${fieldPath}.updatedAt`] = now;
  dotUpdates.updatedAt = now;

  await updateDoc(memoryRef(uid), dotUpdates);
  return getPillarMemory(uid, pillarId);
}

export async function addCompletedTask(userId, pillarId, task, platform = "") {
  const uid = userId || getUserId();
  await ensureUserMemory(uid);

  const newTask = {
    id: `task_${Date.now()}`,
    task,
    platform,
    date: new Date().toISOString().split("T")[0],
    status: "completed",
  };

  const now = Date.now();

  await updateDoc(memoryRef(uid), {
    [`pillars.${pillarId}.completedTasks`]: arrayUnion(newTask),
    [`pillars.${pillarId}.updatedAt`]: now,
    "shared.activeTask.pillar": pillarId,
    "shared.activeTask.status": "completed",
    "shared.lastPillarUsed": pillarId,
    updatedAt: now,
  });

  return newTask;
}

export async function updateSharedMemory(userId, updates) {
  const uid = userId || getUserId();
  await ensureUserMemory(uid);

  const now = Date.now();
  const dotUpdates = {
    "shared.lastActiveDate": new Date().toISOString().split("T")[0],
  };
  Object.entries(updates).forEach(([key, value]) => {
    dotUpdates[`shared.${key}`] = value;
  });
  dotUpdates.updatedAt = now;

  await updateDoc(memoryRef(uid), dotUpdates);
  return getUserMemory(uid);
}

export async function getActiveTask(userId, pillarId) {
  const memory = await getUserMemory(userId);

  const activeTask = memory?.shared?.activeTask;

  if (!activeTask) {
    return null;
  }

  if (activeTask.pillar !== pillarId) {
    return null;
  }

  return activeTask;
}

// ============================================================
// LIGHTWEIGHT VALIDATION-SIGNAL LOGGING
// ============================================================
// This is deliberately simple — a bounded event list on the user's own doc,
// not a real analytics pipeline. It exists to answer demand-validation
// questions (did people start, give evidence, reach a real finding) during
// the 10-20 person test, not to power a dashboard. Best-effort: a logging
// failure must never break an actual chat turn.
const EVENTS_CAP = 200;

export async function logEvent(userId, type, meta = {}) {
  const uid = userId || getUserId();
  try {
    await ensureUserMemory(uid);
    const now = Date.now();
    await updateDoc(memoryRef(uid), {
      events: arrayUnion({ type, meta, at: now }),
      updatedAt: now,
    });
  } catch (err) {
    console.error("[userMemory] logEvent failed (non-fatal):", err?.message);
  }
}

// ============================================================
// V2 — JOB SEARCH CONVERSION INTELLIGENCE
// ============================================================

const MAX_SEARCH_CONTEXT_CHARS = 2800;

function createEmptySearchState() {
  return {
    phase: "understand",
    problemStatement: "",
    roleTarget: "",
    location: "",
    experienceLevel: "",
    applicationsTotal: null,
    responses: null,
    interviews: null,
    viewedCount: null,
    channels: { portals: null, direct: null },
    channelResponses: { portals: null, direct: null },
    cvProvided: false,
    jobDescriptionsProvided: false,
    sameCvForEveryApplication: null,
    employmentStatus: "",
    uniqueOpportunityCount: null,
    uniqueCompanyCount: null,
    recentInterviewOutcomes: [],
    hypotheses: [],
    diagnosis: null,
    facts: [],
    insightsGiven: [],
    activeTask: null,
    updatedAt: null,
  };
}

export async function ensureSearchState(userId) {
  const uid = userId || getUserId();
  const memory = await ensureUserMemory(uid);

  if (memory.search) return memory.search;

  const fresh = createEmptySearchState();
  await updateDoc(memoryRef(uid), {
    search: fresh,
    updatedAt: Date.now(),
  });
  // First-ever search state for this user = the investigation genuinely
  // starting. Fire-and-forget — never let logging delay or break the turn.
  logEvent(uid, "investigation_started");
  return fresh;
}

export async function getSearchState(userId) {
  const uid = userId || getUserId();
  const state = await ensureSearchState(uid);
  return state;
}

// Replaces ONLY the "search" object with a completely fresh one.
// Leaves "shared" and "pillars" (general/shared memory) untouched.
export async function resetSearchState(userId) {
  const uid = userId || getUserId();
  await ensureUserMemory(uid);

  const fresh = createEmptySearchState();
  const now = Date.now();

  await updateDoc(memoryRef(uid), {
    search: fresh,
    updatedAt: now,
  });

  return fresh;
}

export async function updateSearchState(userId, updates) {
  const uid = userId || getUserId();
  await ensureSearchState(uid);

  const now = Date.now();
  const dotUpdates = {};
  Object.entries(updates).forEach(([key, value]) => {
    dotUpdates[`search.${key}`] = value;
  });
  dotUpdates["search.updatedAt"] = now;
  dotUpdates.updatedAt = now;

  await updateDoc(memoryRef(uid), dotUpdates);
  return getSearchState(uid);
}

export async function addSearchFact(userId, fact) {
  const uid = userId || getUserId();
  await ensureSearchState(uid);

  const now = Date.now();
  await updateDoc(memoryRef(uid), {
    "search.facts": arrayUnion(fact),
    "search.updatedAt": now,
    updatedAt: now,
  });
  return getSearchState(uid);
}

export async function addSearchInsight(userId, insight) {
  const uid = userId || getUserId();
  await ensureSearchState(uid);

  const now = Date.now();
  await updateDoc(memoryRef(uid), {
    "search.insightsGiven": arrayUnion(insight),
    "search.updatedAt": now,
    updatedAt: now,
  });
  return getSearchState(uid);
}

// Deterministic funnel-break locator. This is computed from numbers alone —
// never claimed or asserted by the model — so it can't be over- or
// understated by prompt drift. The point: locate WHERE the search is
// breaking down before any hypothesis about WHY gets investigated (e.g.
// don't reach for CV/ATS causes if the break is actually between interview
// and offer, not between application and response).
export function computeFunnelBreak(state) {
  if (!state || state.applicationsTotal == null) return null;

  const { responses, viewedCount, interviews } = state;
  const outcomes = Array.isArray(state.recentInterviewOutcomes) ? state.recentInterviewOutcomes : [];

  if (responses == null && viewedCount == null && interviews == null) {
    return { stage: "unknown", description: 'Application volume is known, but no response/"viewed"/interview data yet — funnel break location is still unknown.' };
  }

  if (interviews != null && interviews > 0) {
    const hasOfferOutcome = outcomes.some((o) => /offer/i.test(o));
    return hasOfferOutcome
      ? { stage: "offer_or_beyond", description: "At least one offer-related outcome reported — the search has progressed past the interview stage." }
      : { stage: "interview_to_offer", description: "Interviews have happened but no offer reported yet — the break (if there is one) looks like it's between interview and offer, not earlier." };
  }

  if (responses != null && responses > 0) {
    return { stage: "response_to_interview", description: "Responses/recruiter contact happened, but no interviews yet — the break looks like it's between response and interview, not between application and response." };
  }

  // responses === 0 (or still unknown) and no interviews — the break, if
  // there is one, is at or before the application → response stage.
  return { stage: "application_to_response", description: "No recruiter response or interview reported yet — the break (if there is one) is at or before the application → response stage. Investigate causes relevant to THIS stage (targeting, channel, volume vs. market, opportunity authenticity) before reaching for CV/ATS or interview-stage causes." };
}

// Adaptive case-completeness check for the UNDERSTAND → INVESTIGATE gate.
// Deliberately NOT a fixed checklist (no CV, no job descriptions, no
// interview outcomes required here — those are investigation-phase
// evidence) — just enough shape of the actual case to know what's even
// being investigated: who/where, and a rough sense of how the search has
// gone so far. Pure and deterministic so it's testable without the model.
export function computeCaseCompleteness(state) {
  if (!state) return { complete: false, missing: ["target role", "location"] };

  const missing = [];
  if (!state.roleTarget) missing.push("target role");
  if (!state.location) missing.push("location");

  // Deliberately NOT satisfied by applicationsTotal/channels alone — raw
  // input volume tells us nothing about where (if anywhere) the search is
  // actually breaking down, and "diagnose from application count alone" is
  // exactly the anti-pattern this gate exists to prevent one layer up from
  // the diagnosis-eligibility check. At least one OUTCOME-side fact is
  // required — what happened, not just how much was sent.
  const hasOutcomeEvidence =
    state.responses != null ||
    state.viewedCount != null ||
    state.interviews != null;
  if (!hasOutcomeEvidence) missing.push("at least one outcome so far (responses, \"viewed\" status, or interviews — not just application volume)");

  return { complete: missing.length === 0, missing };
}

export function buildSearchContext(state) {
  if (!state) return "";

  const lines = [];

  // Phase line goes first — it's the single most important instruction for
  // how to behave this turn, so it must not get buried or truncated out.
  if (state.phase === "investigate") {
    lines.push(`CASE PHASE: INVESTIGATE — the case is sufficiently understood. You may now present signals, test competing hypotheses, and work toward an earned diagnosis, following all the existing evidence/funnel/CV-causality/diagnosis rules below.`);
  } else {
    const completeness = computeCaseCompleteness(state);
    lines.push(
      `CASE PHASE: UNDERSTAND — the case is NOT yet sufficiently understood. Only collect facts, clarify contradictions, and summarize what's known. Do NOT expose findings, diagnoses, confidence levels, likely causes, or causal interpretations this turn, even hedged ones.` +
      (completeness.missing.length ? ` Still needed: ${completeness.missing.join(", ")}.` : "")
    );
  }

  if (state.problemStatement) lines.push(`Stated problem: ${state.problemStatement}`);
  if (state.roleTarget) lines.push(`Target role: ${state.roleTarget}`);
  if (state.location) lines.push(`Location: ${state.location}`);
  if (state.experienceLevel) lines.push(`Experience level: ${state.experienceLevel}`);
  if (state.applicationsTotal != null) lines.push(`Total applications: ${state.applicationsTotal}`);
  if (state.responses != null) lines.push(`Total responses: ${state.responses}`);
  if (state.interviews != null) lines.push(`Total interviews: ${state.interviews}`);
  if (state.viewedCount != null) lines.push(`Portal-reported "viewed" count: ${state.viewedCount} (a platform status only — NOT evidence of human evaluation).`);
  if (state.employmentStatus) lines.push(`Employment status: ${state.employmentStatus}`);
  if (state.uniqueOpportunityCount != null) lines.push(`Unique opportunities known (distinct from raw application count): ${state.uniqueOpportunityCount}`);
  if (state.uniqueCompanyCount != null) lines.push(`Unique companies applied to: ${state.uniqueCompanyCount}`);

  const funnelBreak = computeFunnelBreak(state);
  if (funnelBreak) {
    lines.push(`FUNNEL BREAK LOCATED SO FAR (computed from the numbers, not a guess): ${funnelBreak.description}`);
  }

  const { portals, direct } = state.channels || {};
  if (portals != null || direct != null) {
    lines.push(`Channel split — portals: ${portals ?? "?"}, direct: ${direct ?? "?"}`);
  }

  const { portals: portalResp, direct: directResp } = state.channelResponses || {};
  if (portalResp != null || directResp != null) {
    lines.push(`Channel responses — portals: ${portalResp ?? "?"}, direct: ${directResp ?? "?"}`);
  }

  if (state.cvProvided) lines.push(`CV evidence: provided by user, available for comparison.`);
  if (state.jobDescriptionsProvided) lines.push(`Job description evidence: representative postings provided, available for CV/JD comparison.`);
  if (state.sameCvForEveryApplication === true) lines.push(`Uses the same CV for every application (a fact worth investigating, not a conclusion).`);
  else if (state.sameCvForEveryApplication === false) lines.push(`Tailors the CV per application.`);

  if (state.recentInterviewOutcomes?.length > 0) {
    lines.push(`Known recent interview outcomes (do not re-ask about these):\n${state.recentInterviewOutcomes.slice(-5).map((o) => `- ${o}`).join("\n")}`);
  }

  if (state.hypotheses?.length > 0) {
    lines.push(
      `Live hypotheses tracked so far (carry these forward — update status/confidence/evidence in light of new facts, never silently drop one, never re-diagnose from scratch):\n` +
      state.hypotheses.map((h) => {
        const bits = [`status: ${h.status}`, `confidence: ${h.confidence}`];
        if (h.supportingEvidence) bits.push(`supports: ${h.supportingEvidence}`);
        if (h.contradictingEvidence) bits.push(`contradicts: ${h.contradictingEvidence}`);
        if (h.missingEvidence) bits.push(`missing: ${h.missingEvidence}`);
        return `- [${h.id}] ${h.label} (${bits.join(", ")})`;
      }).join("\n")
    );
  }

  if (state.diagnosis?.bottleneck) {
    lines.push(
      `Previously earned diagnosis: "${state.diagnosis.bottleneck}" (confidence: ${state.diagnosis.confidence}). ` +
      `This is NOT fixed — if new evidence weakens it, say so and revise or retract it. Do not defend it just because it was said before.`
    );
  }

  if (state.facts?.length > 0) {
    lines.push(`Known facts:\n${state.facts.slice(-6).map((f) => `- ${f}`).join("\n")}`);
  }

  if (state.insightsGiven?.length > 0) {
    lines.push(`Already told the user (do not repeat as if new):\n${state.insightsGiven.slice(-3).map((i) => `- ${i}`).join("\n")}`);
  }

  if (state.activeTask?.status === "pending") {
    lines.push(`Active recommended action (still pending): ${state.activeTask.title}`);
  }

  if (lines.length === 0) return "";

  lines.push(`Note: the numeric/structured facts above are the LATEST known values. If they conflict with the wording of an earlier statement (e.g. an opening "nobody is responding" vs. a later specific number), the latest facts are authoritative — reason from these, not from the earlier phrasing.`);

  let context = `\nJOB SEARCH STATE (read-only — real facts already collected, do not re-ask these):\n${lines.join("\n")}`;

  if (context.length > MAX_SEARCH_CONTEXT_CHARS) {
    context = context.slice(0, MAX_SEARCH_CONTEXT_CHARS) + "...";
  }

  return context;
}

export async function setActiveSearchTask(userId, title) {
  const uid = userId || getUserId();
  await ensureSearchState(uid);

  const now = Date.now();
  await updateDoc(memoryRef(uid), {
    "search.activeTask": {
      id: `action_${now}`,
      title,
      status: "pending",
    },
    "search.updatedAt": now,
    updatedAt: now,
  });
}

export async function completeActiveSearchTask(userId) {
  const uid = userId || getUserId();
  await ensureSearchState(uid);

  const now = Date.now();
  await updateDoc(memoryRef(uid), {
    "search.activeTask.status": "completed",
    "search.updatedAt": now,
    updatedAt: now,
  });
}

