import { NextResponse } from "next/server";
import {
  ensureSearchState,
  getSearchState,
  updateSearchState,
  addSearchFact,
  buildSearchContext,
  setActiveSearchTask,
  completeActiveSearchTask,
  resetSearchState,
  computeFunnelBreak,
  computeCaseCompleteness,
  getEffectivePhase,
  logEvent,
} from "../../../lib/userMemory";
import {
  applyUpdatesToState,
  sanitizeTopicUpdates,
  sanitizeQuestion,
  sanitizeSignals,
  applyTopicUpdates,
  verifyMainTopics,
  inferQuestionTopic,
  reconcileDerived,
  markCorrection,
  recordAsked,
  noteExtractionAttempts,
  evaluateQuestion,
  composeReply,
  topicsNeedingExtraction,
  filterExtractedFacts,
  sanitizeExtractedTopics,
  repairText,
  groundingNote,
  buildKnownSummary,
  fallbackAcknowledgement,
  isRepeat,
  dedupeHypotheses,
  isGrounded,
  sanitizeComparison,
  limitQuestions,
  sanitizeFocus,
  stripFiller,
  enforceAddressStyle,
  allowFamiliarAddress,
  unverifiedNote,
} from "../../../lib/caseLedger";
import { WARNING_SIGNS, WARNING_CARD_TITLE, VERIFICATION_NOTE, verifyWarningSigns } from "../../../lib/warningSigns";

import { buildSystem, buildCompactSystem, buildExtractionSystemPrompt } from "../../../lib/prompts";
import { authenticateRequest } from "../../../lib/auth";
import { summarizeCaseFacts, summarizeCaseOverview } from "../../../lib/caseSummary";
import { sanitizeStage, stageOf, deriveOutcomeStage, computeReadiness, limitationsText, validateTask, fallbackTask, stripCompletenessClaims, TOPIC_REASONS, MAX_QUESTIONS, wantsAssessment, mentionsHavingCv, planEvidence, canonicalQuestion, isNeverAsked, sanitizeTaskKind } from "../../../lib/readiness";
import { stripQuestionSentences, stripPluralAttribution, stripBlanketCauses, stripNoResponseClaims, stripResearchClaims, stripStaleUnknowns, cleanOutput, detectResearchRequest, mentionsNoBrowsing, NO_BROWSING_NOTICE } from "../../../lib/outputGuards";
import { sanitizeCvFindings, sanitizeFeedbackItems, sanitizeUserAssumptions, mergeCvProfile, mergeList, countFeedbackSources } from "../../../lib/evidence";
import { decideCaseAction, activateCase, sanitizeCaseId, hasCaseContent } from "../../../lib/userMemory";
import { normalizeMessages, createRateLimiter } from "../../../lib/requestGuards";
import { STATUS_RANK, CONFIDENCE_RANK, enforceHypothesisEvidenceLadder, limitPromotion } from "../../../lib/evidenceGate";

// Explicit Vercel function duration budget. Without this, the platform's
// default (often as low as 10s) silently kills the function if any call
// below runs long — which produces "stuck on INVESTIGATING" or an untraceable
// generic failure, because the kill happens outside our own error handling.
//
// Every blocking stage is individually timeout-bounded. Absolute worst case
// with every conditional stage firing AND timing out: state_load(3s) +
// phase_transition_persist(3s) + gemini(9s) + groq_fallback(9s) +
// retry_sleep(2s) + groq_retry(9s) = 35s of provider path; the targeted
// extraction (5s) is skipped once 25s have elapsed, so at most +5s on the
// fast path; then the combined facts save (3s + one 3s retry) +
// hypotheses_persist(3s) + diagnosis_persist(3s). The longest realistic
// combination stays under ~52s; the pure worst case (35s provider path with
// extraction skipped) is 35 + 12 = 47s. fact_log/task_set are fire-and-forget.
//
// IMPORTANT: confirm your Vercel plan actually honors maxDuration=55 for
// this route (Hobby plans have historically capped lower than Pro) — if your
// plan caps it, Vercel's own platform default still applies underneath.
export const maxDuration = 55;

const detectLanguage = (text) => {
  if (/[\u0D00-\u0D7F]/.test(text)) return "malayalam";
  if (/[\u0900-\u097F]/.test(text)) return "hindi";
  if (/[\u0B80-\u0BFF]/.test(text)) return "tamil";
  const lower = text.toLowerCase();
  const manglish = ["machane","machi","alle","sheriyanu","adipoli","enthokke","pwoli","ivide","chetta","appo","pinne","eda"];
  if (manglish.some(w => lower.includes(w))) return "manglish";
  const hinglish = ["bhai","yaar","theek hai","nahi yaar","kya bhai","bol bhai"];
  if (hinglish.some(w => lower.includes(w))) return "hinglish";
  return "english";
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Per-provider-call hard timeout. This is the actual fix for "stuck on
// INVESTIGATING": previously NEITHER provider fetch had any timeout at all,
// so a slow (not erroring) response was bounded only by Vercel's own opaque
// platform-level function timeout — which silently kills the whole request
// outside our error handling, producing exactly this symptom. Now a slow
// provider deterministically fails fast, inside our own code, with a clean
// loggable error instead.
const PROVIDER_TIMEOUT_MS = 9000;

// Firestore calls (ensureSearchState/updateSearchState/etc.) had ZERO
// timeout protection — unlike the provider fetch calls above, a slow or
// hanging Firestore call here was bounded by nothing at all. This is a
// genuine, code-provable gap (not a guess about what's failing live): the
// existing try/catch around state loading only helps if Firestore actually
// throws — it does nothing if the call simply never resolves. Promise.race
// doesn't cancel the underlying Firestore call, it just stops the request
// from waiting on it — safe, since these are idempotent read/update
// operations. 3s is generous — Firestore reads/writes are normally well
// under 500ms — but kept tight because this budget is summed across up to
// 5 blocking stages in the worst case (see maxDuration comment above). The
// two lowest-stakes writes (fact_log, task_set) are NOT wrapped with this —
// they're fire-and-forget instead, since losing one bookkeeping entry is
// far cheaper than making the user wait on it.
const FIRESTORE_TIMEOUT_MS = 3000;

// Targeted extraction budget: one short call, one provider, never on ordinary turns.
const EXTRACTION_TIMEOUT_MS = 5000;
const EXTRACTION_MAX_ELAPSED_MS = 25000;

// Model name is configurable so it can be pinned without a code change
// (set GEMINI_MODEL in Vercel). Default keeps the previous behaviour.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
// Lower than before (was 0.7): fewer invented specifics, steadier JSON.
const CHAT_TEMPERATURE = Number.isFinite(Number(process.env.CHAT_TEMPERATURE)) && process.env.CHAT_TEMPERATURE !== undefined && process.env.CHAT_TEMPERATURE !== ""
  ? Number(process.env.CHAT_TEMPERATURE)
  : 0.5;

function withTimeout(promise, timeoutMs, stage, requestId) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      console.error("[chat] state operation timed out", { requestId, stage, timeoutMs });
      const err = new Error(`${stage} timed out after ${timeoutMs}ms`);
      err.code = "STATE_TIMEOUT";
      reject(err);
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

// For bookkeeping writes that must NEVER block the user's response (same
// category as logEvent): fire it, log if it eventually fails, but don't
// make the request wait on it either way.
function fireAndForget(promise, stage, requestId) {
  promise.catch((err) => {
    console.error("[chat] background write failed (non-blocking)", { requestId, stage, message: err?.message });
  });
}

async function fetchWithTimeout(url, options, timeoutMs, { requestId, provider, stage }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    if (err?.name === "AbortError") {
      console.error("[chat] provider call timed out", { requestId, provider, stage, elapsedMs: elapsed, timeoutMs });
      const timeoutErr = new Error(`${provider} timed out after ${elapsed}ms`);
      timeoutErr.code = "PROVIDER_TIMEOUT";
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const callGemini = async (systemPrompt, messages, ctx = {}) => {
  const { requestId, stage = "gemini", attempt = 1 } = ctx;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error("No Gemini key");
    err.code = "INVALID_API_KEY";
    throw err;
  }

  let res;
  try {
    res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: messages.map(m => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
          generationConfig: { maxOutputTokens: ctx.maxTokens || 2600, temperature: ctx.temperature ?? CHAT_TEMPERATURE },
        }),
      },
      ctx.timeoutMs || PROVIDER_TIMEOUT_MS,
      { requestId, provider: "gemini", stage }
    );
  } catch (networkErr) {
    if (networkErr.code === "PROVIDER_TIMEOUT") throw networkErr; // already logged in fetchWithTimeout
    console.error("[chat] provider failed", { requestId, provider: "gemini", stage, attempt, status: null, errorCategory: "network", message: networkErr?.message });
    const err = new Error("Gemini network error");
    err.code = "PROVIDER_TIMEOUT";
    throw err;
  }

  if (!res.ok) {
    let errorBody = "";
    try { errorBody = await res.text(); } catch {}
    console.error("[chat] provider failed", { requestId, provider: "gemini", stage, attempt, status: res.status, errorCategory: "http", body: errorBody.slice(0, 300) });

    if (res.status === 429) { const err = new Error("RATE_LIMITED"); err.code = "RATE_LIMIT"; throw err; }
    if (res.status === 408 || res.status === 504) { const err = new Error("TIMEOUT"); err.code = "PROVIDER_TIMEOUT"; throw err; }
    if (res.status === 413) { const err = new Error(`Gemini request too large (${res.status})`); err.code = "REQUEST_TOO_LARGE"; throw err; }
    if (res.status === 400 || res.status === 401 || res.status === 403) { const err = new Error(`Gemini auth/request error ${res.status}`); err.code = "INVALID_API_KEY"; throw err; }
    const err = new Error(`Gemini ${res.status}`); err.code = "SERVER_ERROR"; throw err;
  }

  const data = await res.json();
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) {
    console.error("[chat] provider returned empty reply", { requestId, provider: "gemini", stage, attempt });
    const err = new Error("Empty Gemini response");
    err.code = "BAD_PROVIDER_RESPONSE";
    throw err;
  }
  return reply;
};

// Groq's token-per-minute budget for this model is tight (a real production
// request hit 413 "Limit 8000, Requested 9281"). Defense in depth beyond the
// compact prompt: cap history length and output budget specifically for
// Groq, regardless of what was passed in — Gemini keeps the full history
// and MAX_TOKENS since it has no such ceiling.
const GROQ_MAX_HISTORY_MESSAGES = 6;
const GROQ_MAX_TOKENS = 1800;

const callGroq = async (systemPrompt, messages, ctx = {}) => {
  const { requestId, stage = "groq", attempt = 1 } = ctx;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) { const err = new Error("No Groq key"); err.code = "INVALID_API_KEY"; throw err; }

  const trimmedMessages = messages.slice(-GROQ_MAX_HISTORY_MESSAGES);

  let res;
  try {
    res = await fetchWithTimeout(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          messages: [
            { role: "system", content: systemPrompt },
            ...trimmedMessages.map(m => ({
              role: m.role === "assistant" ? "assistant" : "user",
              content: m.content,
            })),
          ],
          max_tokens: ctx.maxTokens || GROQ_MAX_TOKENS,
          temperature: ctx.temperature ?? CHAT_TEMPERATURE,
        }),
      },
      ctx.timeoutMs || PROVIDER_TIMEOUT_MS,
      { requestId, provider: "groq", stage }
    );
  } catch (networkErr) {
    if (networkErr.code === "PROVIDER_TIMEOUT") throw networkErr; // already logged in fetchWithTimeout
    console.error("[chat] provider failed", { requestId, provider: "groq", stage, attempt, status: null, errorCategory: "network", message: networkErr?.message });
    const err = new Error("Groq network error");
    err.code = "PROVIDER_TIMEOUT";
    throw err;
  }

  if (!res.ok) {
    let errorBody = "";
    try { errorBody = await res.text(); } catch {}
    console.error("[chat] provider failed", { requestId, provider: "groq", stage, attempt, status: res.status, errorCategory: "http", body: errorBody.slice(0, 300) });

    if (res.status === 429) { const err = new Error("RATE_LIMITED"); err.code = "RATE_LIMIT"; throw err; }
    if (res.status === 408 || res.status === 504) { const err = new Error("TIMEOUT"); err.code = "PROVIDER_TIMEOUT"; throw err; }
    // 413 = request too large (Groq's TPM budget exceeded by this specific
    // request). This is NEVER transient for an identical payload — retrying
    // the same size request will always fail the same way. Distinct code,
    // deliberately excluded from the retry-eligible set below.
    if (res.status === 413) { const err = new Error(`Groq request too large (${res.status})`); err.code = "REQUEST_TOO_LARGE"; throw err; }
    if (res.status === 400 || res.status === 401 || res.status === 403) { const err = new Error(`Groq auth/request error ${res.status}`); err.code = "INVALID_API_KEY"; throw err; }
    const err = new Error(`Groq ${res.status}`); err.code = "SERVER_ERROR"; throw err;
  }

  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content;
  if (!reply) {
    console.error("[chat] provider returned empty reply", { requestId, provider: "groq", stage, attempt });
    const err = new Error("Empty Groq response");
    err.code = "BAD_PROVIDER_RESPONSE";
    throw err;
  }
  return reply;
};

const parseJSON = (text) => {
  const clean = text.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(clean);
  } catch {}

  const match = clean.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }

  // Last resort: the response may have been cut off mid-JSON (e.g. hit a
  // token limit). Walk the text tracking string/bracket state, truncate at
  // the last structurally-safe point, and close any still-open
  // braces/brackets so we can recover the partial object rather than
  // failing the whole turn.
  const repaired = repairTruncatedJSON(match ? match[0] : clean);
  if (repaired) return repaired;

  return null;
};

function repairTruncatedJSON(text) {
  let s = text.trim();
  const start = s.indexOf("{");
  if (start === -1) return null;
  s = s.slice(start);

  let inString = false;
  let escape = false;
  let lastSafeIndex = -1;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "," || ch === "}" || ch === "]") lastSafeIndex = i;
  }

  if (lastSafeIndex === -1) return null;

  let truncated = s.slice(0, lastSafeIndex + 1).replace(/,\s*$/, "");

  const closeStack = [];
  inString = false;
  escape = false;
  for (let i = 0; i < truncated.length; i++) {
    const ch = truncated[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") closeStack.push("}");
    else if (ch === "[") closeStack.push("]");
    else if (ch === "}" || ch === "]") closeStack.pop();
  }

  const candidate = truncated + closeStack.reverse().join("");
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

const SAFE_DEFAULTS = {
  reply: "",
  facts_update: {
    problemStatement: "", roleTarget: "", location: "", experienceLevel: "",
    applicationsTotal: null, responses: null, interviews: null, viewedCount: null,
    channels: { portals: null, direct: null },
    channelResponses: { portals: null, direct: null },
    cvProvided: false,
    jobDescriptionsProvided: false,
    sameCvForEveryApplication: null,
    employmentStatus: "",
    uniqueOpportunityCount: null,
    uniqueCompanyCount: null,
    recentInterviewOutcomes: [],
  },
  signal: "",
  hypotheses: [],
  insight: "",
  uncertainty: "",
  diagnosis: { bottleneck: "", confidence: "low", reasoning: [] },
  recommended_action: "",
  action_basis: "",
  success_check: "",
  action_how: "",
  action_why: "",
  action_done: "",
  action_minutes: null,
  outcome_stage: "",
  action_kind: "",
  new_problem: false,
  cv_findings: null,
  feedback_items: [],
  user_assumptions: [],
  next_question: "",
  question: null,
  comparison: [],
  case_focus: "",
  warning_signs: [],
  topics: [],
  signals: { emotion: "none", tired: false, direct_answer: false, correction_of: "", market_claim: false },
  tip: "",
  ready_to_investigate_deeper: false,
  case_facts: [],
  feedback_mode: "none",
};

const VALID_HYPOTHESIS_STATUS = ["untested", "investigating", "weak", "plausible", "supported", "confirmed"];
const VALID_CONFIDENCE = ["low", "medium", "high"];
const VALID_FEEDBACK_MODE = ["none", "signal", "diagnosis"];
const MAX_HYPOTHESES = 4;
// Clamp one model-supplied hypothesis object down to a safe, well-typed shape.
// Never trust the model's status/confidence strings blindly — fall back to
// conservative defaults ("untested" / "low") on anything unrecognized.
function sanitizeHypothesis(h, i) {
  if (!h || typeof h !== "object") return null;
  const id = typeof h.id === "string" && h.id.trim() ? h.id.trim().slice(0, 40) : `hypothesis_${i}`;
  const label = typeof h.label === "string" ? h.label.slice(0, 120) : "";
  if (!label) return null;
  const status = VALID_HYPOTHESIS_STATUS.includes(h.status) ? h.status : "untested";
  const confidence = VALID_CONFIDENCE.includes(h.confidence) ? h.confidence : "low";
  return {
    id,
    label,
    status,
    confidence,
    supportingEvidence: typeof h.supportingEvidence === "string" ? h.supportingEvidence.slice(0, 300) : "",
    contradictingEvidence: typeof h.contradictingEvidence === "string" ? h.contradictingEvidence.slice(0, 300) : "",
    missingEvidence: typeof h.missingEvidence === "string" ? h.missingEvidence.slice(0, 300) : "",
  };
}

function sanitizeDiagnosis(d) {
  if (!d || typeof d !== "object") return { bottleneck: "", confidence: "low", reasoning: [] };
  const bottleneck = typeof d.bottleneck === "string" ? d.bottleneck.slice(0, 160) : "";
  const confidence = VALID_CONFIDENCE.includes(d.confidence) ? d.confidence : "low";
  const reasoning = Array.isArray(d.reasoning)
    ? d.reasoning.filter((r) => typeof r === "string" && r.trim()).slice(0, 6).map((r) => r.slice(0, 220))
    : [];
  return { bottleneck, confidence, reasoning };
}

// ── THE MAIN SERVER-SIDE FIX ────────────────────────────────────────────
// The model's claimed status/confidence for a hypothesis is a PROPOSAL,
// never a fact. This deterministically re-derives the maximum status/
// confidence a hypothesis is allowed to have, purely from which of its own
// evidence fields are actually populated — the server can only ever
// downgrade what the model claims, never upgrade it. This directly fixes
// the repeated failure of "we still don't know X" being paired with
// "confidence: medium" in the same turn: if missingEvidence is non-empty,
// confidence is structurally capped below medium, full stop.
const sanitizeStructured = (parsed) => {
  if (!parsed || typeof parsed !== "object") return null;
  // Only fields the app knows about are taken from the model's output; any
  // other key it invents (cards, labels, old field names) is dropped here, so
  // it can never reach the API response or the UI.
  const known = Object.fromEntries(Object.entries(parsed).filter(([k]) => k in SAFE_DEFAULTS));
  const merged = {
    ...SAFE_DEFAULTS,
    ...known,
    facts_update: { ...SAFE_DEFAULTS.facts_update, ...(parsed.facts_update || {}) },
  };
  merged.facts_update.channels = { ...SAFE_DEFAULTS.facts_update.channels, ...(parsed.facts_update?.channels || {}) };
  merged.facts_update.channelResponses = { ...SAFE_DEFAULTS.facts_update.channelResponses, ...(parsed.facts_update?.channelResponses || {}) };

  // Every field the UI renders as text must actually be a string — a model
  // that returns an object/number/null here would otherwise crash the card
  // (and break the server-side text checks below).
  for (const key of ["reply", "insight", "uncertainty", "recommended_action", "action_basis", "success_check", "action_how", "action_why", "action_done", "next_question", "tip"]) {
    merged[key] = typeof parsed[key] === "string" ? parsed[key] : "";
  }

  merged.topics = sanitizeTopicUpdates(parsed.topics);
  merged.question = sanitizeQuestion(parsed.question);
  merged.signals = sanitizeSignals(parsed.signals);

  merged.hypotheses = Array.isArray(parsed.hypotheses)
    ? dedupeHypotheses(parsed.hypotheses.map(sanitizeHypothesis).filter(Boolean)).map(enforceHypothesisEvidenceLadder).slice(0, MAX_HYPOTHESES)
    : [];
  // Raw rows only; the route verifies every quote against the user's own text.
  merged.comparison = Array.isArray(parsed.comparison) ? parsed.comparison.slice(0, 20) : [];
  // Raw proposals only: a warning sign is kept solely when its quote is really
  // in the user's own words, and only the seven known ids are accepted.
  merged.warning_signs = Array.isArray(parsed.warning_signs) ? parsed.warning_signs.slice(0, 12) : [];
  merged.case_focus = sanitizeFocus(parsed.case_focus);
  merged.outcome_stage = sanitizeStage(parsed.outcome_stage);
  merged.action_kind = sanitizeTaskKind(parsed.action_kind);
  merged.new_problem = parsed.new_problem === true;
  merged.cv_findings = parsed.cv_findings && typeof parsed.cv_findings === "object" && !Array.isArray(parsed.cv_findings) ? parsed.cv_findings : null;
  merged.feedback_items = Array.isArray(parsed.feedback_items) ? parsed.feedback_items.slice(0, 8) : [];
  merged.user_assumptions = Array.isArray(parsed.user_assumptions) ? parsed.user_assumptions.slice(0, 6) : [];
  { const m = Number(parsed.action_minutes); merged.action_minutes = parsed.action_minutes != null && parsed.action_minutes !== "" && Number.isFinite(m) ? Math.round(m) : null; }
  merged.diagnosis = sanitizeDiagnosis(parsed.diagnosis);
  merged.signal = typeof parsed.signal === "string" ? parsed.signal.slice(0, 300) : "";
  merged.feedback_mode = VALID_FEEDBACK_MODE.includes(parsed.feedback_mode) ? parsed.feedback_mode : "none";

  return merged;
};

// fullSystemPrompt goes to Gemini (large context window, no evidence of a
// token-budget problem there). compactSystemPrompt goes to Groq — see
// COMPACT_INVESTIGATION_PROMPT above for why: a real production request
// exceeded Groq's token-per-minute limit using the full prompt.
const getAiReply = async (fullSystemPrompt, compactSystemPrompt, messages, ctx = {}) => {
  const { requestId, attempt = 1 } = ctx;
  console.log("[chat] gemini attempt", { requestId, attempt });
  try {
    const rawReply = await callGemini(fullSystemPrompt, messages, { requestId, stage: "gemini_primary", attempt });
    console.log("[chat] success", { requestId, provider: "gemini", attempt });
    return { rawReply, usedFallback: false };
  } catch (geminiErr) {
    console.log("[chat] groq fallback attempt", { requestId, attempt, geminiErrorCode: geminiErr.code });
    const rawReply = await callGroq(compactSystemPrompt, messages, { requestId, stage: "groq_fallback", attempt });
    console.log("[chat] success", { requestId, provider: "groq", attempt });
    return { rawReply, usedFallback: true };
  }
};

function extractNonEmptyUpdates(factsUpdate) {
  const updates = {};
  if (factsUpdate.problemStatement) updates.problemStatement = factsUpdate.problemStatement;
  if (factsUpdate.roleTarget) updates.roleTarget = factsUpdate.roleTarget;
  if (factsUpdate.location) updates.location = factsUpdate.location;
  // Accept a non-empty string ("fresher", "3 months") or a finite number
  // (0 for "no experience" would be lost by a plain truthiness check).
  // Stored as a short trimmed string. The server never derives experience
  // from anything else — it only saves what the model extracted from the
  // user's own statement about their work experience.
  const exp = factsUpdate.experienceLevel;
  if ((typeof exp === "string" && exp.trim()) || (typeof exp === "number" && Number.isFinite(exp))) {
    updates.experienceLevel = String(exp).trim().slice(0, 120);
  }
  if (factsUpdate.applicationsTotal != null) updates.applicationsTotal = factsUpdate.applicationsTotal;
  if (factsUpdate.responses != null) updates.responses = factsUpdate.responses;
  if (factsUpdate.interviews != null) updates.interviews = factsUpdate.interviews;
  if (factsUpdate.viewedCount != null) updates.viewedCount = factsUpdate.viewedCount;
  if (factsUpdate.cvProvided === true) updates.cvProvided = true;
  if (factsUpdate.jobDescriptionsProvided === true) updates.jobDescriptionsProvided = true;
  if (factsUpdate.sameCvForEveryApplication != null) updates.sameCvForEveryApplication = factsUpdate.sameCvForEveryApplication;
  if (factsUpdate.employmentStatus) updates.employmentStatus = factsUpdate.employmentStatus;
  if (factsUpdate.uniqueOpportunityCount != null) updates.uniqueOpportunityCount = factsUpdate.uniqueOpportunityCount;
  if (factsUpdate.uniqueCompanyCount != null) updates.uniqueCompanyCount = factsUpdate.uniqueCompanyCount;
  if (Array.isArray(factsUpdate.recentInterviewOutcomes) && factsUpdate.recentInterviewOutcomes.length > 0) {
    updates.recentInterviewOutcomes = factsUpdate.recentInterviewOutcomes.slice(0, 5);
  }

  // Per-key dot paths: reporting only "portals" must never wipe a known
  // "direct" value (the old code replaced the whole object with nulls).
  const ch = factsUpdate.channels || {};
  const chr = factsUpdate.channelResponses || {};
  for (const key of ["portals", "direct"]) {
    if (Number.isFinite(ch[key])) updates[`channels.${key}`] = ch[key];
    if (Number.isFinite(chr[key])) updates[`channelResponses.${key}`] = chr[key];
  }

  return updates;
}

function computeVerifiedStats(state) {
  const portals = state.channels?.portals;
  const direct = state.channels?.direct;
  const portalResp = state.channelResponses?.portals;
  const directResp = state.channelResponses?.direct;

  if (portals == null && direct == null) return null;

  const stats = {};
  if (portals > 0 && portalResp != null) {
    stats.portalRate = Math.round((portalResp / portals) * 1000) / 10;
    stats.portalApplications = portals;
    stats.portalResponses = portalResp;
  }
  if (direct > 0 && directResp != null) {
    stats.directRate = Math.round((directResp / direct) * 1000) / 10;
    stats.directApplications = direct;
    stats.directResponses = directResp;
  }

  return Object.keys(stats).length > 0 ? stats : null;
}

// The one thing that's actually allowed to look like "we're onto
// something": pick the single strongest currently-tracked hypothesis (by
// status, then confidence) so the UI can show confidence in THAT specific
// claim — never a generic, volume-derived number. Reuses STATUS_RANK /
// CONFIDENCE_RANK defined above (enforceHypothesisEvidenceLadder) rather
// than a second copy of the same table.
function leadingHypothesis(hypotheses) {
  if (!Array.isArray(hypotheses) || hypotheses.length === 0) return null;
  let best = null;
  for (const h of hypotheses) {
    if (!h?.label) continue;
    if (!best) { best = h; continue; }
    const statusDelta = (STATUS_RANK[h.status] ?? 0) - (STATUS_RANK[best.status] ?? 0);
    if (statusDelta > 0) { best = h; continue; }
    if (statusDelta === 0 && (CONFIDENCE_RANK[h.confidence] ?? 0) > (CONFIDENCE_RANK[best.confidence] ?? 0)) {
      best = h;
    }
  }
  if (!best) return null;
  // A hypothesis that's still merely "untested" isn't worth surfacing as a
  // confidence badge at all — that would just recreate the same bug in a
  // new shape.
  if (best.status === "untested") return null;
  return { label: best.label, status: best.status, confidence: best.confidence };
}

// Server-side gate: never trust the model's own feedback_mode/diagnosis blindly.
// Require real evidence — some combination of application volume, channel
// data, CV evidence, or a genuinely sufficient set of known interview
// outcomes — before a "diagnosis" is allowed to render at all.
const CV_RELATED_PATTERN = /\b(cv|resume|résumé|ats|keyword|formatting|template)\b/i;

function computeDiagnosisEligibility(state, diagnosis) {
  if (!state) return false;

  const hasRoleAndLocation = !!state.roleTarget && !!state.location;
  if (!hasRoleAndLocation) return false;

  const hasChannelData =
    (state.channels?.portals != null || state.channels?.direct != null) &&
    (state.channelResponses?.portals != null || state.channelResponses?.direct != null);
  const hasCv = state.cvProvided === true;
  const hasJobDescriptions = state.jobDescriptionsProvided === true;
  const interviewOutcomeCount = Array.isArray(state.recentInterviewOutcomes) ? state.recentInterviewOutcomes.length : 0;
  // "0 offers from 6 interviews" alone is a SIGNAL, not enough for a
  // diagnosis — require that at least a handful of the actual outcomes are
  // known (technical rejection vs. ghosted vs. still-pending are very
  // different evidence) before an interview-stage diagnosis is eligible.
  const hasSufficientInterviewEvidence = interviewOutcomeCount >= 3;

  // Application volume ALONE is never enough — it's a sample-size fact,
  // not evidence for any cause. Only channel-level data (which carries an
  // actual response comparison), real CV evidence, or known interview
  // outcomes count toward eligibility. (A bare applicationsTotal used to be
  // accepted here on its own — that was the exact bug: "diagnose from
  // application count alone" is explicitly forbidden.)
  const hasBaseEvidence = hasChannelData || hasCv || hasSufficientInterviewEvidence;
  if (!hasBaseEvidence) return false;

  // Hard block: raw interview/offer counts with fewer than 3 known specific
  // outcomes are never, on their own, enough to diagnose an interview-stage
  // bottleneck — regardless of what the model claims.
  const onlyRawInterviewSignal = state.interviews != null && state.interviews > 0 && !hasSufficientInterviewEvidence;
  if (onlyRawInterviewSignal && !hasChannelData && !hasCv) return false;

  // A diagnosis must be anchored to a hypothesis that has actually reached
  // "supported" or "confirmed" status under the evidence ladder above — not
  // merely asserted in the diagnosis object this turn, disconnected from
  // any tracked hypothesis.
  const hypotheses = Array.isArray(state.hypotheses) ? state.hypotheses : [];
  const qualifying = hypotheses.filter((h) => h.status === "supported" || h.status === "confirmed");
  if (qualifying.length === 0) return false;

  // "Primary bottleneck" requires that competing explanations were actually
  // investigated, not just that one hypothesis happened to look good in
  // isolation — require at least 2 tracked hypotheses so a single
  // unopposed idea can never become a diagnosis on its own.
  if (hypotheses.length < 2) return false;
  // At least one competing explanation must have been examined (weakened,
  // contradicted or flagged with missing evidence), not just left untested.
  const examinedRivals = hypotheses.filter((h) => !qualifying.includes(h) && (h.status !== "untested" || h.contradictingEvidence || h.missingEvidence));
  if (examinedRivals.length === 0) return false;

  if (diagnosis?.bottleneck) {
    // Loose word-overlap check that the diagnosis is actually ABOUT one of
    // the qualifying hypotheses — exact semantic matching isn't possible
    // server-side, so this only catches a diagnosis that rides on a
    // completely unrelated hypothesis's earned confidence.
    const bottleneckWords = diagnosis.bottleneck.toLowerCase().match(/[a-z]{4,}/g) || [];
    const linked = qualifying.some((h) => {
      const labelWords = (h.label || "").toLowerCase().match(/[a-z]{4,}/g) || [];
      return labelWords.some((w) => bottleneckWords.includes(w));
    });
    if (!linked) return false;

    // CV/ATS-worded diagnoses specifically require having actually compared
    // the real CV against real job descriptions — never allowed just from
    // response counts or "same CV every time" alone.
    if (CV_RELATED_PATTERN.test(diagnosis.bottleneck) && !(hasCv && hasJobDescriptions)) return false;
  }

  return true;
}

// Backend, not the frontend, decides what feedback control (if any) renders.
// The model's own feedback_mode is a claim, not a fact — downgrade it
// whenever the server-verified state doesn't actually back it up.
function computeFeedbackMode(structured, state) {
  const claimed = structured.feedback_mode;

  if (claimed === "diagnosis") {
    const eligible = computeDiagnosisEligibility(state, structured.diagnosis) && !!structured.diagnosis?.bottleneck;
    if (eligible) return "diagnosis";
    // Not earned yet — fall through to "signal" if there's at least a real
    // insight/signal to show, otherwise "none".
    return structured.insight || structured.signal ? "signal" : "none";
  }

  if (claimed === "signal") {
    return structured.insight || structured.signal ? "signal" : "none";
  }

  return "none";
}

const EMPTY_DIAGNOSIS = () => ({ bottleneck: "", confidence: "low", reasoning: [] });

// ── helpers used by the request pipeline ────────────────────────────────
const isObjectLike = (x) => x && typeof x === "object" && !Array.isArray(x);

// The user's own recent messages (used to verify extraction quotes).
function recentUserTexts(messages) {
  const last = messages
    .filter((m) => m?.role === "user" && typeof m.content === "string")
    .slice(-6);
  // The latest message may carry a whole CV or pasted job postings, so keep
  // it (almost) intact for quote verification; older ones are shortened.
  return last.map((m, i) => m.content.slice(0, i === last.length - 1 ? 12000 : 1500));
}

// ── request validation and a best-effort rate limit (see lib/requestGuards.js)
const baseLimit = Number(process.env.LIFEPATH_RATE_LIMIT) > 0 ? Number(process.env.LIFEPATH_RATE_LIMIT) : 20;
const userLimiter = createRateLimiter({ limit: baseLimit });
// The user id comes from the browser and can be changed on every request, so
// the network address gets its own, wider limit that rotating ids cannot dodge.
const ipLimiter = createRateLimiter({ limit: baseLimit * 3 });
const isRateLimited = (userKey, ip) => userLimiter(userKey || "anonymous") || (ip ? ipLimiter(ip) : false);

const safeName = (name) => String(name || "").replace(/[^\p{L}\p{N} .'-]/gu, "").slice(0, 40);

// Targeted extraction: ONLY called when a required fact is still missing after
// we already asked for it. Conservative by construction — the model must quote
// the user's own words, the server verifies every quote, only fields for the
// wanted topics are accepted, and any failure simply returns null (the normal
// reply is never affected).
async function runTargetedExtraction({ wantedTopics, messages, userTexts, useGroq, requestId }) {
  try {
    const system = buildExtractionSystemPrompt(wantedTopics);
    const recent = messages
      .slice(-7)
      .map((m) => `${m?.role === "assistant" ? "ASSISTANT" : "USER"}: ${String(m?.content || "").slice(0, 600)}`)
      .join("\n");
    const ctx = { requestId, stage: "extraction", attempt: 1, timeoutMs: EXTRACTION_TIMEOUT_MS, maxTokens: 500, temperature: 0 };
    const raw = useGroq
      ? await callGroq(system, [{ role: "user", content: recent }], ctx)
      : await callGemini(system, [{ role: "user", content: recent }], ctx);
    const parsed = parseJSON(raw);
    if (!isObjectLike(parsed)) return null;
    return {
      facts: filterExtractedFacts(parsed.facts, wantedTopics, userTexts),
      topics: sanitizeExtractedTopics(parsed.topics, wantedTopics, userTexts),
    };
  } catch (err) {
    console.error("[chat] targeted extraction failed (non-fatal)", { requestId, code: err?.code });
    return null;
  }
}

// One retry for the single combined save: a transient Firestore hiccup must
// not silently cost the user a fact they already gave. Writes are idempotent.
async function persistStateWithRetry(userId, writes, stage, requestId) {
  try {
    return await withTimeout(updateSearchState(userId, writes), FIRESTORE_TIMEOUT_MS, stage, requestId);
  } catch (firstErr) {
    console.error("[chat] state save failed, retrying once", { requestId, stage, code: firstErr?.code, message: firstErr?.message });
    return await withTimeout(updateSearchState(userId, writes), FIRESTORE_TIMEOUT_MS, `${stage}_retry`, requestId);
  }
}

// What may be shown while the case is still being understood. Findings,
// signals and uncertainty stay hidden. A next step is allowed ONLY when the
// user is tired or asked for a direct answer AND it names the user-stated
// facts it rests on.
function understandGate(structured, signals) {
  const keepAction = (signals.tired || signals.direct_answer) && !!structured.action_basis && !!structured.recommended_action;
  return {
    ...structured,
    insight: "",
    signal: "",
    comparison: [],
    recommended_action: keepAction ? structured.recommended_action : "",
    success_check: keepAction ? structured.success_check : "",
    action_how: keepAction ? structured.action_how : "",
    action_why: keepAction ? structured.action_why : "",
    action_done: keepAction ? structured.action_done : "",
    action_minutes: keepAction ? structured.action_minutes : null,
  };
}

// Requests the server creates itself (the automatic move into the investigation).
const internalTransitions = new WeakSet();

export async function POST(request) {
  // Hoisted OUTSIDE the try block on purpose: a `const`/`let` declared
  // inside a try is NOT visible inside its own catch block, and the catch-all
  // needs the request ID so every failure is traceable.
  let requestId = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  const requestStartedAt = Date.now();
  const elapsed = () => Date.now() - requestStartedAt;

  try {
    let body;
    try {
      body = await request.json();
    } catch (err) {
      console.error("[chat] body parse failed", { requestId, stage: "body_parse", message: err?.message, elapsedMs: elapsed() });
      return NextResponse.json(
        { error: true, code: "INVALID_REQUEST", message: "Malformed request.", requestId },
        { status: 400 }
      );
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: true, code: "INVALID_REQUEST", message: "Malformed request.", requestId }, { status: 400 });
    }
    const isInternal = internalTransitions.has(request);
    const { profile = {}, action } = body;
    let messages = body.messages;
    const isBeginInvestigation = action === "begin_investigation";

    // If NEITHER provider has a key, no request can ever succeed — fail fast
    // with a distinct, honest error.
    if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) {
      console.error("[chat] no provider API keys configured", { requestId });
      return NextResponse.json(
        { error: true, code: "INVALID_API_KEY", message: "The AI service is not configured. Please contact support.", requestId },
        { status: 500 }
      );
    }

    // Identity: a verified sign-in token wins over the browser-supplied ID.
    // (Unchanged legacy behaviour unless LIFEPATH_REQUIRE_AUTH=true — see lib/auth.js.)
    const auth = await authenticateRequest(request, body.userId);
    if (auth.error) {
      return NextResponse.json({ error: true, code: auth.code, message: auth.message, requestId }, { status: auth.status });
    }
    const userId = auth.userId;

    // Best-effort rate limit (see isRateLimited).
    const clientIp = (request?.headers?.get?.("x-forwarded-for") || "").split(",")[0].trim();
    if (!isInternal && isRateLimited(userId || clientIp, clientIp)) {
      return NextResponse.json(
        { error: true, code: "RATE_LIMIT", message: "You're sending messages very quickly. Please wait a moment and try again.", requestId },
        { status: 429 }
      );
    }

    // Handle a direct reset request — does NOT run normal AI processing.
    if (action === "clear_search") {
      if (!userId) {
        return NextResponse.json(
          { error: true, code: "INVALID_REQUEST", message: "userId required to reset.", requestId },
          { status: 400 }
        );
      }
      try {
        await withTimeout(resetSearchState(userId), FIRESTORE_TIMEOUT_MS, "reset_search_state", requestId);
        console.log("[chat] search state reset", { requestId, elapsedMs: elapsed() });
        return NextResponse.json({ success: true });
      } catch (err) {
        console.error("[chat] reset failed", { requestId, message: err?.message, elapsedMs: elapsed() });
        return NextResponse.json(
          { error: true, code: "SERVER_ERROR", message: "Could not reset. Please try again.", requestId },
          { status: 500 }
        );
      }
    }

    const normalizedMessages = normalizeMessages(messages);
    if (normalizedMessages === "too_many" || normalizedMessages === "too_long") {
      return NextResponse.json(
        { error: true, code: "INVALID_REQUEST", message: "That message or conversation is too long to process. Please shorten it or start a new chat.", requestId },
        { status: 413 }
      );
    }
    if (!normalizedMessages || !normalizedMessages.length) {
      return NextResponse.json(
        { error: true, code: "INVALID_REQUEST", message: "Messages required.", requestId },
        { status: 400 }
      );
    }
    messages = normalizedMessages;

    console.log("[chat] request start", {
      requestId,
      authenticated: auth.authenticated === true,
      messageCount: messages.length,
      totalChars: messages.reduce((sum, m) => sum + m.content.length, 0),
    });

    // Starting the investigation is a phase change on SAVED state, so it
    // can't be validated (or honored) without a user to load that state for.
    if (isBeginInvestigation && !userId) {
      return NextResponse.json(
        { error: true, code: "INVALID_REQUEST", message: "We couldn't identify your session, so the investigation can't start. Please refresh the page and try again.", requestId },
        { status: 400 }
      );
    }

    const rawLatest = messages.filter(m => m?.role === "user").slice(-1)[0]?.content || "";
    const latestMsg = (isBeginInvestigation ? "Begin the investigation using the facts already gathered. Do not ask the user to confirm this button click." : rawLatest).trim().replace(/[<>&"']/g, "");

    if (!latestMsg) {
      return NextResponse.json(
        { error: true, code: "INVALID_REQUEST", message: "Invalid message.", requestId },
        { status: 400 }
      );
    }

    // Language comes from what the USER actually wrote, never from the
    // internal English button instruction.
    const language = detectLanguage(rawLatest || latestMsg);
    if (isBeginInvestigation) {
      messages.push({ role: "user", content: latestMsg });
    }

    const reqCaseId = sanitizeCaseId(body.caseId);
    let searchState = null;
    let searchContext = "";
    // The phase in effect for THIS turn, frozen once and used both to build
    // the prompt and to gate the response. Defaults to the restrictive phase,
    // so if saved state can't be loaded the response is still fully gated.
    let turnPhase = "understand";
    if (userId) {
      try {
        searchState = await withTimeout(ensureSearchState(userId), FIRESTORE_TIMEOUT_MS, "state_load", requestId);
        console.log("[chat] state loaded", { requestId, elapsedMs: elapsed() });

        // Each conversation is its own investigation. A different conversation
        // archives the active case and loads/starts its own, so nothing from
        // another case can reach this one.
        if (reqCaseId) {
          const caseAction = decideCaseAction(searchState, reqCaseId, messages.filter((m) => m?.role === "user").length);
          if (caseAction !== "same") {
            searchState = await withTimeout(activateCase(userId, reqCaseId, caseAction, searchState), FIRESTORE_TIMEOUT_MS, "case_switch", requestId);
            console.log("[chat] case", { requestId, action: caseAction });
          }
        }

        // Phase changes only after an explicit button action.
        if (isBeginInvestigation) {
          if (getEffectivePhase(searchState) === "investigate") {
            return NextResponse.json({
              error: true,
              code: "ALREADY_INVESTIGATING",
              message: "The investigation has already started. Just keep chatting below and I'll continue from here.",
              requestId,
            }, { status: 409 });
          }
          const completeness = computeCaseCompleteness(searchState);
          if (!completeness.complete) {
            return NextResponse.json({
              error: true,
              code: "CASE_INCOMPLETE",
              message: `We still need: ${completeness.missing.join(", ")}. Please share that first, then start the investigation.`,
              requestId,
            }, { status: 409 });
          }
          searchState = await withTimeout(updateSearchState(userId, { phase: "investigate" }), FIRESTORE_TIMEOUT_MS, "phase_transition_persist", requestId);
          logEvent(userId, "phase_transition", { to: "investigate" });
        }
        turnPhase = getEffectivePhase(searchState);

        searchContext = buildSearchContext(searchState);

        const RETURN_GAP_MS = 6 * 60 * 60 * 1000;
        if (searchState.updatedAt && Date.now() - searchState.updatedAt > RETURN_GAP_MS) {
          logEvent(userId, "user_returned", { gapHours: Math.round((Date.now() - searchState.updatedAt) / 3600000) });
        }
      } catch (memErr) {
        console.error("[chat] search state load failed", { requestId, code: memErr?.code, message: memErr?.message, isBeginInvestigation, elapsedMs: elapsed() });
        // Whatever was half-loaded must not be trusted for ledger writes.
        searchState = null;
        if (isBeginInvestigation) {
          return NextResponse.json({
            error: true,
            code: "STATE_UNAVAILABLE",
            message: "We couldn't load your saved progress, so the investigation hasn't started yet. Your conversation is safe — please tap the button again in a moment.",
            requestId,
          }, { status: 503 });
        }
      }
    }

    if (detectResearchRequest(rawLatest)) {
      searchContext += "\nCAPABILITY LIMIT: the user asked you to look something up (vacancies, an employer or the market). You CANNOT browse or search the web. Say so plainly in your first sentence, never claim to have searched or checked anything, and ask them to paste the posting or message so you can work from it.";
    }
    console.log("[chat] search context chars:", searchContext.length);

    const systemPrompt = buildSystem(language, searchContext, safeName(profile?.name));
    const compactSystemPrompt = buildCompactSystem(language, searchContext, safeName(profile?.name));
    console.log("[chat] prompt sizes", { requestId, fullChars: systemPrompt.length, compactChars: compactSystemPrompt.length });

    let rawReply;
    let usedFallback = false;
    let lastErrorCode = "SERVER_ERROR";

    try {
      const result = await getAiReply(systemPrompt, compactSystemPrompt, messages, { requestId, attempt: 1 });
      rawReply = result.rawReply;
      usedFallback = result.usedFallback;
      console.log("[chat] provider responded", { requestId, provider: usedFallback ? "groq" : "gemini", elapsedMs: elapsed() });
    } catch (firstErr) {
      lastErrorCode = firstErr.code || "SERVER_ERROR";
      console.error("[chat] first attempt failed", { requestId, code: lastErrorCode, message: firstErr?.message, elapsedMs: elapsed() });
      // REQUEST_TOO_LARGE is deliberately NOT retried — an identical payload
      // fails identically (the original Groq 413 production bug).
      if (lastErrorCode === "RATE_LIMIT" || lastErrorCode === "PROVIDER_TIMEOUT" || lastErrorCode === "SERVER_ERROR") {
        console.log("[chat] transient error, retrying once after 2s", { requestId, code: lastErrorCode });
        await sleep(2000);
        try {
          const retryReply = await callGroq(compactSystemPrompt, messages, { requestId, stage: "groq_retry", attempt: 2 });
          rawReply = retryReply;
          usedFallback = true;
          console.log("[chat] provider responded on retry", { requestId, provider: "groq", elapsedMs: elapsed() });
        } catch (secondErr) {
          lastErrorCode = secondErr.code || "SERVER_ERROR";
          console.error("[chat] retry also failed", { requestId, code: lastErrorCode, message: secondErr?.message, elapsedMs: elapsed() });
        }
      } else if (lastErrorCode === "REQUEST_TOO_LARGE") {
        console.error("[chat] request too large for Groq, not retrying", { requestId, compactChars: compactSystemPrompt.length, messageCount: messages.length });
      }
    }

    if (!rawReply) {
      const messagesByCode = {
        RATE_LIMIT: "The AI service is temporarily busy. Please retry in a moment.",
        PROVIDER_TIMEOUT: "The AI service took too long to respond. Please retry.",
        INVALID_API_KEY: "There is a configuration problem with the AI service.",
        BAD_PROVIDER_RESPONSE: "The AI service gave an unexpected response. Please retry.",
        REQUEST_TOO_LARGE: "That conversation has gotten too long for me to process. Try starting a new chat.",
        SERVER_ERROR: "The AI service had a problem. Please retry in a moment.",
      };
      console.error("[chat] request failed, returning error to client", { requestId, finalCode: lastErrorCode, elapsedMs: elapsed() });
      return NextResponse.json(
        { error: true, code: lastErrorCode, message: messagesByCode[lastErrorCode] || messagesByCode.SERVER_ERROR, requestId },
        { status: lastErrorCode === "RATE_LIMIT" ? 429 : lastErrorCode === "REQUEST_TOO_LARGE" ? 413 : 503 }
      );
    }

    const parsed = parseJSON(rawReply);
    if (!parsed) {
      console.error("[chat] validation error: AI response was not valid JSON", { requestId, stage: "parse", elapsedMs: elapsed(), rawChars: typeof rawReply === "string" ? rawReply.length : 0 });
      return NextResponse.json(
        { error: true, code: "BAD_PROVIDER_RESPONSE", message: "Could not understand the AI response. Please retry.", requestId },
        { status: 502 }
      );
    }

    let structured = sanitizeStructured(parsed);
    const signals = structured.signals;

    // The user has started describing a DIFFERENT problem in this same chat
    // (for example from a recruitment fee to an unpaid-salary dispute). Start a
    // separate case and answer again from a clean slate, so facts, warnings
    // and hypotheses from the first problem cannot leak into the second.
    if (structured.new_problem === true && userId && searchState && !isInternal && !isBeginInvestigation && hasCaseContent(searchState)) {
      const lastUser = [...messages].reverse().find((m) => m?.role === "user");
      if (lastUser) {
        const newId = `case_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        const separate = { json: async () => ({ ...body, caseId: newId, messages: [{ role: "user", content: lastUser.content }] }), headers: request.headers };
        internalTransitions.add(separate);
        try {
          const second = await POST(separate);
          if ((second?.status || 200) < 400) return second;
        } catch (e) {
          console.error("[chat] new-case reply failed; continuing in the current case", { requestId, message: e?.message });
        }
      }
    }
// ════════════════════════════════════════════════════════════════════
    // CONVERSATION MEMORY PIPELINE. Everything here is computed in memory;
    // nothing is saved until the single combined write further down.
    // ════════════════════════════════════════════════════════════════════
    const nowTs = Date.now();
    const stateKnown = !!(userId && searchState);
    const ledgerBefore = stateKnown && isObjectLike(searchState.ledger) ? searchState.ledger : {};
    const touched = new Set();
    const userTexts = recentUserTexts(messages);
    const attachedCv = !isBeginInvestigation && /\[CV attached:/.test(rawLatest);
    const attachedJd = !isBeginInvestigation && /\[Job post attached:/.test(rawLatest);

    // ── Job-offer warning signs: only the seven in lib/warningSigns.js, each
    // backed by a verbatim quote of the user's own words. No risk score, no
    // verdict, and nothing is verified externally (LifePath can't look up
    // companies or recruiters). Saved ids are re-checked against the allowlist.
    const newWarnings = verifyWarningSigns(structured.warning_signs, userTexts);
    const savedWarnings = stateKnown
      ? Object.keys(isObjectLike(searchState.warningSigns) ? searchState.warningSigns : {}).filter((id) => id in WARNING_SIGNS)
      : [];
    const allWarnings = [...new Set([...savedWarnings, ...newWarnings])];
    const focus = sanitizeFocus(structured.case_focus) || (stateKnown ? sanitizeFocus(searchState.focus) : "");
    // What the CV shows, what employers actually said, and what the user only
    // believes: each kept only if backed by the user's own words or CV text.
    const cvFindings = sanitizeCvFindings(structured.cv_findings, userTexts);
    const feedbackNew = sanitizeFeedbackItems(structured.feedback_items, userTexts);
    const assumptionsNew = sanitizeUserAssumptions(structured.user_assumptions, userTexts);
    const feedbackNow = mergeList(stateKnown ? searchState.feedbackItems : [], feedbackNew, 8);

    // 1. Facts the model reported (per-key, so one channel never wipes the other).
    const factUpdates = extractNonEmptyUpdates(structured.facts_update);
    const factSources = {};
    for (const k of Object.keys(factUpdates)) factSources[k.split(".")[0]] = "model_extracted";
    // An attached CV is detected deterministically — it doesn't depend on the model.
    if (attachedCv && !(stateKnown && searchState.cvProvided === true)) {
      factUpdates.cvProvided = true;
      factSources.cvProvided = "attachment";
    }
    if (attachedJd && !(stateKnown && searchState.jobDescriptionsProvided === true)) {
      factUpdates.jobDescriptionsProvided = true;
      factSources.jobDescriptionsProvided = "attachment";
    }

    // 2. Statuses the user settled this turn, and corrections.
    let ledger = applyTopicUpdates(ledgerBefore, verifyMainTopics(structured.topics, userTexts), nowTs, touched);
    ledger = markCorrection(ledger, signals.correction_of, nowTs, touched);
    let projected = applyUpdatesToState(stateKnown ? searchState : {}, factUpdates);
    ledger = reconcileDerived(ledger, projected, nowTs, touched);

    // 3. Targeted extraction — only if a required fact is still missing after
    //    we asked for it (or the user said they already answered), and the
    //    request isn't already slow. Never on ordinary turns.
    if (stateKnown && !isBeginInvestigation && elapsed() < EXTRACTION_MAX_ELAPSED_MS) {
      const wanted = topicsNeedingExtraction(projected, ledger);
      if (wanted.length > 0) {
        const extraction = await runTargetedExtraction({ wantedTopics: wanted, messages, userTexts, useGroq: usedFallback, requestId });
        ledger = noteExtractionAttempts(ledger, wanted, nowTs, touched);
        if (extraction) {
          let filled = 0;
          for (const [field, value] of Object.entries(extraction.facts)) {
            // Fill-only: never overwrite anything already known or already
            // reported this turn.
            if (projected[field] == null || projected[field] === "") {
              factUpdates[field] = value;
              factSources[field] = "targeted_extraction";
              filled++;
            }
          }
          ledger = applyTopicUpdates(ledger, extraction.topics, nowTs, touched);
          projected = applyUpdatesToState(searchState, factUpdates);
          ledger = reconcileDerived(ledger, projected, nowTs, touched);
          console.log("[chat] targeted extraction done", { requestId, wanted, filled, statuses: extraction.topics.length });
        }
      }
    }

    // 3b. Automatic readiness. The server decides when the facts are enough to
    //     start the investigation (no button). It is computed from the facts as
    //     they will be saved, BEFORE the question is counted, so a reply that
    //     is about to be replaced never uses up the question budget.
    const stageNow = sanitizeStage(structured.outcome_stage) || (stateKnown ? (sanitizeStage(searchState.outcomeStage) || deriveOutcomeStage({ ...projected, focus })) : "");
    const questionsBefore = stateKnown && Number.isFinite(searchState.questionsAsked) ? searchState.questionsAsked : 0;
    const readinessNow = stateKnown && turnPhase === "understand" && !isInternal
      ? computeReadiness({ ...projected, ledger, focus, outcomeStage: stageNow, questionsAsked: questionsBefore }, { warningIds: allWarnings, forceReady: wantsAssessment(rawLatest) })
      : null;
    const willTransition = !!readinessNow?.ready;

    // 4. Question gate — only the QUESTION can be dropped, never the reply.
    // Questions the assistant already asked earlier in this chat (the browser sends
    // earlier replies as text), so the same question is never asked twice.
    const previousQuestions = normalizedMessages
      .filter((m) => m.role === "assistant")
      .slice(-6)
      .flatMap((m) => m.content.split(/(?<=[?.!])\s+/).filter((x) => x.includes("?")));
    let decision = evaluateQuestion(ledger, structured.question, signals, { state: projected, previousQuestions });
    // Every question needs a reason (the model's own, or the standard one for
    // its topic). One with no reason and no known topic is not shown.
    const questionTopic = structured.question?.topic || inferQuestionTopic(structured.question?.text);
    const questionWhy = structured.question ? (structured.question.why || TOPIC_REASONS[questionTopic] || "") : "";
    if (decision.allow && structured.question && !questionWhy) decision = { allow: false, reason: "no_reason" };
    if (willTransition && structured.question) decision = { allow: false, reason: "transitioning" };
    // HARD ceiling on information-gathering questions per case. Never a target.
    const questionsSoFar = Math.max(questionsBefore, stateKnown ? 0 : previousQuestions.length);
    const capReached = questionsSoFar >= MAX_QUESTIONS;
    if (decision.allow && structured.question) {
      if (capReached) decision = { allow: false, reason: "cap" };
      else if (isNeverAsked(questionTopic, stageNow)) decision = { allow: false, reason: "not_relevant" };
    }
    // Ask for the CV early when it matters, and never leave the user without a
    // next step in the information-gathering phase: if the model asked nothing
    // useful, the server asks the single most valuable missing thing itself.
    const userWantsAnswer = wantsAssessment(rawLatest);
    if (decision.allow && structured.question && userWantsAnswer) decision = { allow: false, reason: "user_wants_answer" };
    const stopAsking = signals.emotion === "strong" || signals.tired || signals.direct_answer || userWantsAnswer;
    const isOpening = userTexts.length <= 1 && !hasCaseContent(projected);
    let questionWhyFinal = questionWhy;
    if (!capReached && !willTransition && !stopAsking && !isBeginInvestigation && !isOpening) {
      const evState = { ...projected, ledger, focus, outcomeStage: stageNow };
      const cvFirst = mentionsHavingCv(userTexts.join(" "));
      const planNow = planEvidence(evState, { cvFirst });
      const nxt = planNow.next;
      if (nxt) {
        const modelShown = decision.allow && !!structured.question;
        const modelCoreMissing = modelShown && planNow.items.some((i) => i.topic === questionTopic && i.st === "missing" && i.core);
        const cvNext = nxt.topic === "cv";
        const replaceModel = modelShown && cvNext && questionTopic !== "cv" && !modelCoreMissing;
        if ((!modelShown || replaceModel) && (turnPhase === "understand" || cvNext)) {
          const cq = canonicalQuestion(nxt.topic, evState);
          if (cq) {
            structured = { ...structured, question: { topic: cq.topic, text: cq.text, why: cq.why } };
            decision = { allow: true, reason: "injected" };
            questionWhyFinal = cq.why;
            console.log("[chat] question supplied by the server", { requestId, topic: cq.topic, replacedModelQuestion: replaceModel });
          }
        }
      }
    }
    if (structured.question && !decision.allow) {
      console.log("[chat] question not shown", { requestId, topic: structured.question.topic || null, reason: decision.reason });
    }
    if (structured.question && !structured.question.topic) {
      console.log("[chat] question without a topic id (cannot be gated)", { requestId });
    }
    if (decision.allow && structured.question?.topic) {
      ledger = recordAsked(ledger, structured.question.topic, nowTs, touched);
    }

    // 5. Repair unsupported statements sentence by sentence (never wipe a reply).
    const repairCtx = {
      phase: turnPhase,
      hasCv: projected.cvProvided === true,
      hasJds: projected.jobDescriptionsProvided === true,
      // Everything the user actually said — a tool or skill named by the AI
      // but absent from this text is treated as unverified.
      knownText: [...userTexts, projected.roleTarget, projected.experienceLevel, projected.problemStatement].filter(Boolean).join(" "),
    };
    const fixedReply = repairText(structured.reply, repairCtx);
    const fixedInsight = repairText(structured.insight, repairCtx);
    const fixedAction = repairText(structured.recommended_action, repairCtx);
    const fixedTip = repairText(structured.tip, repairCtx);
    const fixedUncertainty = repairText(structured.uncertainty, repairCtx);
    const fixedCheck = repairText(structured.success_check, repairCtx);
    // Further checks on the wording itself (all replies, normal or fallback model):
    // research that never happened, feedback attributed to too many sources,
    // one weak spot blamed for everything, "no responses" for someone who never
    // applied, "we still don't know X" when X is known, and cut-off output.
    const guardCtx = {
      userText: userTexts.join(" "),
      feedbackSources: countFeedbackSources(feedbackNow),
      neverApplied: projected.applicationsTotal === 0 || stageNow === "find_jobs" || stageNow === "not_applied",
      canBrowse: false,
    };
    // `clean` (cut-off sentences, empty lists) is for prose only: a task title
    // such as "Note what each posting asks for" is complete without a full stop.
    const guardText = (text, { clean = true } = {}) => {
      let x = String(text || "");
      for (const f of [stripResearchClaims, stripPluralAttribution, stripBlanketCauses, stripNoResponseClaims]) x = f(x, guardCtx).text;
      x = stripStaleUnknowns(x, projected).text;
      return clean ? cleanOutput(x).text : x;
    };
    fixedReply.text = guardText(fixedReply.text);
    fixedInsight.text = guardText(fixedInsight.text);
    fixedUncertainty.text = guardText(fixedUncertainty.text);
    fixedAction.text = guardText(fixedAction.text, { clean: false });
    const removedTotal = fixedReply.removed + fixedInsight.removed + fixedAction.removed + fixedTip.removed + fixedUncertainty.removed;
    const removedReasons = [...fixedReply.reasons, ...fixedInsight.reasons, ...fixedAction.reasons, ...fixedTip.reasons, ...fixedUncertainty.reasons];
    if (removedTotal > 0) {
      console.warn("[chat] unsupported statements removed", { requestId, count: removedTotal, reasons: removedReasons, phase: turnPhase });
    }

    // Never repeat advice or an insight the user has already been given.
    const alreadySaid = stateKnown
      ? [searchState.activeTask?.title, ...(Array.isArray(searchState.facts) ? searchState.facts.slice(-6) : [])]
      : [];
    let insightText = fixedInsight.text;
    let actionText = fixedAction.text;
    if (insightText && isRepeat(insightText, alreadySaid)) { console.log("[chat] repeated insight dropped", { requestId }); insightText = ""; }
    if (actionText && isRepeat(actionText, alreadySaid)) { console.log("[chat] repeated next step dropped", { requestId }); actionText = ""; }

    // A next task is shown only when it is concrete: what, how, why and what
    // done looks like, small enough to finish, and not generic advice.
    let taskCheck = null;
    if (actionText) {
      const how = repairText(structured.action_how, repairCtx).text;
      const why = repairText(structured.action_why || structured.action_basis, repairCtx).text;
      const done = repairText(structured.action_done, repairCtx).text;
      taskCheck = validateTask({ what: actionText, how, why, done, minutes: structured.action_minutes, kind: structured.action_kind }, { state: { ...projected, ledger }, ledger, hypotheses: structured.hypotheses });
      if (!taskCheck.ok) {
        console.log("[chat] next task withheld (not concrete enough)", { requestId, missing: taskCheck.missing });
        actionText = "";
        taskCheck = null;
      }
    }
    // Provisional answers still get the best available next step: a small
    // evidence-gathering task, only when nothing else is pending or being asked.
    const questionShown = decision.allow && !!structured.question;
    if (!taskCheck && turnPhase === "investigate" && stateKnown && !questionShown && !signals.action_reported && !(searchState.activeTask?.status === "pending")) {
      const fb = fallbackTask({ ...projected, outcomeStage: stageNow });
      taskCheck = validateTask(fb);
      actionText = fb.what;
    }

    // One question per reply. If the model also supplied the gated `question`
    // field, every question sentence in the body is dropped (otherwise a
    // body question could slip past the repeat-question gate); if it didn't,
    // only the first body question is kept. Quoted questions are untouched.
    const questionCap = limitQuestions(fixedReply.text, { dropAll: true });
    if (questionCap.dropped > 0) {
      console.log("[chat] extra questions in reply body dropped", { requestId, count: questionCap.dropped, hadGatedQuestion: !!structured.question });
    }

    let replyBody = questionCap.text;
    // Natural voice: no stock "thank you for sharing" openers, and "bro"/"bhai"
    // only when the user talks that way themselves (never to formal users).
    replyBody = stripFiller(replyBody);
    replyBody = enforceAddressStyle(replyBody, allowFamiliarAddress(userTexts, signals.register));
    if (!replyBody) {
      // Nothing usable left: say what we actually know instead of going silent.
      replyBody = [signals.emotion !== "none" ? fallbackAcknowledgement() : "", buildKnownSummary(projected)].filter(Boolean).join(" ");
    }
    const needsGroundingNote = removedReasons.some((r) => r === "market_claim" || r === "speculative_cause" || r === "recruiter_behavior")
      || (signals.market_claim && !repairCtx.hasJds);
    if (needsGroundingNote) {
      const note = groundingNote(language);
      replyBody = replyBody ? `${replyBody}\n\n${note}` : note;
    }
    if (removedReasons.some((r) => r === "claimed_verification" || r === "legitimacy_verdict")) {
      const note = unverifiedNote(language);
      replyBody = replyBody ? `${replyBody}\n\n${note}` : note;
    }
    const noClaims = stripCompletenessClaims(replyBody);
    if (noClaims.removed > 0) console.log("[chat] completeness claim removed", { requestId, count: noClaims.removed });
    replyBody = noClaims.text;
    if (detectResearchRequest(rawLatest) && !mentionsNoBrowsing(replyBody)) {
      replyBody = replyBody ? `${NO_BROWSING_NOTICE}\n\n${replyBody}` : NO_BROWSING_NOTICE;
    }
    const finalReply = composeReply(replyBody, structured.question, decision) || "Thanks for sharing that.";
    const actionFlag = actionText && !structured.action_basis ? "general" : "";
    // Comparison rows count only if their quotes are really in the user's own
    // text, and only once the investigation has started.
    const comparison = turnPhase === "investigate" ? sanitizeComparison(structured.comparison, userTexts) : [];

    structured = {
      ...structured,
      reply: finalReply,
      insight: insightText,
      recommended_action: actionText,
      comparison,
      uncertainty: fixedUncertainty.text,
      success_check: actionText ? fixedCheck.text : "",
      action_how: taskCheck ? taskCheck.how : "",
      action_why: taskCheck ? taskCheck.why : "",
      action_done: taskCheck ? taskCheck.done : "",
      action_minutes: taskCheck ? taskCheck.minutes : null,
      question_why: decision.allow ? questionWhyFinal : "",
      outcome_stage: stageNow,
      tip: fixedTip.text,
      question: undefined,
      topics: undefined,
      signals: undefined,
    };

    // 6. What will be saved (one combined write, changed fields only).
    const writes = { ...factUpdates };
    if (stateKnown) {
      // Only when saved state really loaded: otherwise we could overwrite a
      // ledger we never saw.
      for (const t of touched) writes[`ledger.${t}`] = ledger[t];
    }
    for (const [field, source] of Object.entries(factSources)) {
      // grounded = does the value appear in the user's own words? (recorded
      // only; a fact is never discarded because we couldn't confirm it).
      let grounded = null;
      if (source === "attachment" || source === "targeted_extraction") grounded = true;
      else {
        const v = factUpdates[field] !== undefined ? factUpdates[field] : (factUpdates[`${field}.portals`] ?? factUpdates[`${field}.direct`]);
        grounded = isGrounded(field, v, userTexts);
      }
      writes[`provenance.${field}`] = { source, at: nowTs, grounded };
    }
    // Case focus; user-reported warning-sign IDS only (never their words);
    // the most recent fact the user changed; a step the user reported on.
    if (focus && (!stateKnown || focus !== searchState.focus)) writes.focus = focus;
    if (stateKnown && questionShown) writes.questionsAsked = questionsBefore + 1;
    if (stateKnown && cvFindings) writes.cvProfile = mergeCvProfile(searchState.cvProfile, cvFindings);
    if (stateKnown && feedbackNew.length) writes.feedbackItems = feedbackNow;
    if (stateKnown && assumptionsNew.length) writes.userAssumptions = mergeList(searchState.userAssumptions, assumptionsNew, 5);
    if (stateKnown && stageNow && stageNow !== searchState.outcomeStage) writes.outcomeStage = stageNow;
    for (const id of newWarnings) if (!savedWarnings.includes(id)) writes[`warningSigns.${id}`] = { at: nowTs };
    if (stateKnown) {
      for (const field of ["roleTarget", "location", "experienceLevel", "applicationsTotal", "responses", "interviews", "viewedCount"]) {
        const prior = searchState[field];
        const incoming = factUpdates[field];
        if (incoming !== undefined && prior != null && prior !== "" && String(prior) !== String(incoming)) {
          writes.lastChange = { field, from: String(prior).slice(0, 80), to: String(incoming).slice(0, 80), at: nowTs };
          break;
        }
      }
      if (signals.action_reported && searchState.activeTask?.status === "pending") writes["activeTask.status"] = "completed";
    }

    let verifiedStats = null;
    let memorySaved = true;
    // Set to true only once the evidence checks for this turn have actually
    // run to completion. If anything before that point throws, the
    // INVESTIGATE response is forced to its safe form below.
    let evidenceGateCompleted = false;
    if (userId) {
      try {
        if (Object.keys(writes).length > 0) {
          try {
            searchState = await persistStateWithRetry(userId, writes, "facts_persist", requestId);
          } catch (persistErr) {
            memorySaved = false;
            console.error("[chat] facts could not be saved after retry", { requestId, code: persistErr?.code, message: persistErr?.message });
            throw persistErr;
          }
          const factFields = Object.keys(factSources);
          if (factFields.length > 0) logEvent(userId, "evidence_provided", { fields: factFields });
        }

        verifiedStats = computeVerifiedStats(searchState);

        if (Array.isArray(structured.hypotheses) && structured.hypotheses.length > 0) {
          structured = { ...structured, hypotheses: limitPromotion(structured.hypotheses, searchState?.hypotheses, turnPhase) };
          searchState = await withTimeout(updateSearchState(userId, { hypotheses: structured.hypotheses }), FIRESTORE_TIMEOUT_MS, "hypotheses_persist", requestId);
        }

        structured = {
          ...structured,
          leadingHypothesis: turnPhase === "understand" ? null : leadingHypothesis(searchState.hypotheses),
        };

        // HARD UNDERSTAND-PHASE GATE.
        if (turnPhase === "understand") {
          // The investigation now starts by itself (see "automatic readiness"),
          // so no start-button flag is ever sent.
          structured = { ...understandGate(structured, signals), ready_to_investigate_deeper: false, case_facts: [] };
        } else {
          structured = { ...structured, ready_to_investigate_deeper: false };
        }

        const evidenceFeedbackMode = computeFeedbackMode(structured, searchState);
        const finalFeedbackMode = turnPhase === "understand" ? "none" : (isBeginInvestigation && evidenceFeedbackMode === "diagnosis" ? "signal" : evidenceFeedbackMode);
        if (finalFeedbackMode !== structured.feedback_mode) {
          console.log("[chat] feedback_mode downgraded", {
            requestId, claimed: structured.feedback_mode, final: finalFeedbackMode,
            reason: turnPhase === "understand" ? "still in UNDERSTAND phase" : "insufficient server-verified evidence",
          });
        }
        structured = { ...structured, feedback_mode: finalFeedbackMode };
        if (finalFeedbackMode === "signal") {
          logEvent(userId, "useful_finding_produced", {});
        }

        // Never let an unearned diagnosis reach the client. Cleared BEFORE any
        // further write, so a later persistence failure can't resurrect it.
        const diagnosisEarned = !isBeginInvestigation && finalFeedbackMode === "diagnosis" && !!structured.diagnosis?.bottleneck;
        if (!diagnosisEarned) {
          structured = { ...structured, diagnosis: EMPTY_DIAGNOSIS() };
        }
        // Provisional vs earned. Without a diagnosis, an investigate-phase
        // answer is a provisional assessment: it must say what can't be told.
        const hasFinding = !!(structured.insight || structured.signal || structured.leadingHypothesis);
        const assessment = diagnosisEarned ? "diagnosis" : (turnPhase === "investigate" && hasFinding ? "provisional" : "none");
        if (assessment === "provisional" && !structured.uncertainty) {
          structured = { ...structured, uncertainty: limitationsText(searchState, computeReadiness(searchState, { warningIds: allWarnings })) };
        }
        structured = { ...structured, assessment };
        evidenceGateCompleted = true;

        if (diagnosisEarned) {
          searchState = await withTimeout(updateSearchState(userId, { diagnosis: structured.diagnosis }), FIRESTORE_TIMEOUT_MS, "diagnosis_persist", requestId);
          logEvent(userId, "investigation_completed", {});
        }

        // Serverless functions can freeze right after the response, which
        // silently lost these writes. Wait briefly for them instead.
        const bookkeeping = [];
        if (structured.insight) bookkeeping.push(withTimeout(addSearchFact(userId, structured.insight), 1500, "fact_log", requestId));
        if (structured.recommended_action) bookkeeping.push(withTimeout(setActiveSearchTask(userId, structured.recommended_action), 1500, "task_set", requestId));
        if (bookkeeping.length) await Promise.allSettled(bookkeeping);
        console.log("[chat] state persisted", { requestId, elapsedMs: elapsed() });
      } catch (err) {
        console.error("[chat] search state update failed (non-fatal)", { requestId, code: err?.code, message: err?.message, evidenceGateCompleted, elapsedMs: elapsed() });
      }
    } else {
      // No userId means no persisted evidence to verify against.
      structured = {
        ...structured,
        feedback_mode: "none",
        diagnosis: EMPTY_DIAGNOSIS(),
        leadingHypothesis: null,
      };
    }

    // Final fail-closed gate, outside the persistence try/catch.
    if (turnPhase === "understand") {
      structured = {
        ...understandGate(structured, signals),
        hypotheses: [],
        feedback_mode: "none",
        diagnosis: EMPTY_DIAGNOSIS(),
        leadingHypothesis: null,
        ready_to_investigate_deeper: false,
        case_facts: [],
        assessment: "none",
      };
    } else {
      structured = { ...structured, ready_to_investigate_deeper: false };
      if (!evidenceGateCompleted) {
        console.warn("[chat] INVESTIGATE evidence gate did not complete — failing closed", { requestId });
        const hasFinding = !!(structured.insight || structured.signal);
        structured = {
          ...structured,
          diagnosis: EMPTY_DIAGNOSIS(),
          leadingHypothesis: null,
          feedback_mode: hasFinding && structured.feedback_mode !== "none" ? "signal" : "none",
        };
      }
    }

    // ── Automatic start of the investigation (replaces the old button).
    // The facts are saved and enough: move the case into the investigation and
    // answer again in that phase so the user is never left waiting for a click.
    // If the second answer fails, this understand-phase reply is returned and
    // the saved phase makes the NEXT message an investigation turn anyway.
    if (willTransition && stateKnown && userId && memorySaved && !isInternal) {
      let moved = false;
      try {
        await withTimeout(updateSearchState(userId, { phase: "investigate" }), FIRESTORE_TIMEOUT_MS, "phase_auto_transition", requestId);
        logEvent(userId, "phase_transition", { to: "investigate", auto: true, provisional: readinessNow?.provisional === true });
        moved = true;
      } catch (moveErr) {
        console.error("[chat] automatic phase change failed", { requestId, message: moveErr?.message });
      }
      if (moved) {
        const internalReq = { json: async () => ({ ...body }), headers: request.headers };
        internalTransitions.add(internalReq);
        try {
          const second = await POST(internalReq);
          if ((second?.status || 200) < 400) return second;
          console.warn("[chat] investigation reply failed; returning the understand reply", { requestId, status: second?.status });
        } catch (secondErr) {
          console.error("[chat] investigation reply threw; returning the understand reply", { requestId, message: secondErr?.message });
        }
      }
    }

    // Numbers are shown only when they help: a real portal-vs-direct
    // comparison, during investigation, for a user who isn't hurting/tired.
    const showStats = turnPhase !== "understand" && !!verifiedStats &&
      verifiedStats.portalRate != null && verifiedStats.directRate != null &&
      signals.emotion === "none" && !signals.tired;

    // The final action flag must still match what is actually shown.
    const shownActionFlag = structured.recommended_action ? actionFlag : "";

    // One neutral card: the warning signs the user described, plus the note
    // that nothing was verified. No score, no label, no verdict.
    // It appears only when it belongs to THIS situation: a warning sign reported
    // in this message, or a case that is about a suspected offer. An old warning
    // from an unrelated problem never rides along.
    const warningRelevant = newWarnings.length > 0 || focus === "job_offer_check" || stageNow === "scam_suspected";
    const warningCard = allWarnings.length && warningRelevant
      ? { title: WARNING_CARD_TITLE, signs: allWarnings.map((id) => WARNING_SIGNS[id]), note: VERIFICATION_NOTE }
      : null;

    console.log("[chat] request complete", { requestId, elapsedMs: elapsed(), engine: usedFallback ? "groq" : "gemini", phase: turnPhase, memorySaved });
    return NextResponse.json({
      structured: {
        ...structured, phase: turnPhase, show_stats: showStats, action_flag: shownActionFlag, warning_card: warningCard, focus, requestId,
        // The case this answer belongs to, so the browser can keep each chat tied to its own investigation.
        case_id: (stateKnown && searchState.caseId) || reqCaseId || "",
        // What is on file for the case, built from saved facts (never from the model's own summary).
        case_facts: turnPhase === "investigate" && stateKnown ? summarizeCaseOverview({ ...projected, ledger, outcomeStage: stageNow }) : (structured.case_facts || []),
      },
      verified_stats: showStats ? verifiedStats : null,
      memory_saved: memorySaved,
      language,
      engine: usedFallback ? "groq" : "gemini",
      requestId,
    });
  } catch (error) {
    // The one true catch-all for anything not already handled above.
    console.error("[chat] unhandled error", {
      requestId, code: error?.code, message: error?.message, elapsedMs: elapsed(),
      stack: error instanceof Error ? error.stack?.slice(0, 1000) : "no stack",
    });
    return NextResponse.json(
      { error: true, code: error?.code || "SERVER_ERROR", message: `Request failed. Reference: ${requestId}`, requestId },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: "LifePath running — job search conversion intelligence" });
}
