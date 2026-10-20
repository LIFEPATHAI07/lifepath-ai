// lib/caseLedger.js
//
// Pure logic (no Firebase, no network) for LifePath's conversation memory:
//
//  - the CASE LEDGER: which topics the user has answered, declined, or said
//    they cannot provide, and how often we have already asked about each;
//  - the QUESTION GATE: stops repeated questions without ever closing a topic
//    to a later answer, correction or attachment;
//  - CONSERVATIVE EXTRACTION checks: every extracted value must come with a
//    quote that really appears in the user's own messages;
//  - SENTENCE-LEVEL REPAIR of unsupported statements (never whole-reply
//    deletion);
//  - small deterministic helpers (known-facts summary, ledger context).
//
// Everything here is deterministic so it can be unit-tested without a model.

export const TOPIC_IDS = [
  "role", "location", "experience", "education", "skills", "applications",
  "outcomes", "channels", "same_cv", "cv", "job_descriptions", "interviews", "duplicates",
];
export const REQUIRED_TOPICS = ["role", "location", "experience", "outcomes"];
// After this many unanswered asks, we PAUSE asking about a topic. This is a
// limit on our questions only — it never closes the topic to the user.
export const ASK_LIMIT = 2;
// Max targeted-extraction attempts per topic.
export const EXTRACTION_ATTEMPT_LIMIT = 2;

const TERMINAL = ["answered", "declined", "unavailable"];
const EMOTIONS = ["none", "mild", "strong"];

const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);

// ── facts ───────────────────────────────────────────────────────────────

// A saved experienceLevel carries information if it is a non-empty string or
// a finite number (0 = "no experience" must not be lost to a truthiness check).
export function hasExperienceFact(value) {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return false;
}

export function topicHasFact(topic, state) {
  if (!state) return false;
  switch (topic) {
    case "role": return !!state.roleTarget;
    case "location": return !!state.location;
    case "experience": return hasExperienceFact(state.experienceLevel);
    case "applications": return state.applicationsTotal != null;
    case "outcomes": return state.responses != null || state.viewedCount != null || state.interviews != null;
    case "channels": return state.channels?.portals != null || state.channels?.direct != null;
    case "same_cv": return state.sameCvForEveryApplication != null;
    case "cv": return state.cvProvided === true;
    case "job_descriptions": return state.jobDescriptionsProvided === true;
    case "interviews": return state.interviews != null;
    case "duplicates": return state.uniqueOpportunityCount != null || state.uniqueCompanyCount != null;
    default: return false; // education / skills have no structured fact field
  }
}

// Apply dot-path updates ("channels.portals": 70) to a copy of a state, so we
// can reason about what the state WILL look like before it is saved.
export function applyUpdatesToState(state, updates) {
  const s = JSON.parse(JSON.stringify(state || {}));
  for (const [path, value] of Object.entries(updates || {})) {
    const parts = path.split(".");
    let o = s;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!isObj(o[parts[i]])) o[parts[i]] = {};
      o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = value;
  }
  return s;
}

// ── sanitizers for model output ──────────────────────────────────────────

export function sanitizeTopicUpdates(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!isObj(item)) continue;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const status = typeof item.status === "string" ? item.status.trim() : "";
    if (!TOPIC_IDS.includes(id) || !TERMINAL.includes(status) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, status });
    if (out.length >= 12) break;
  }
  return out;
}

export function sanitizeQuestion(q) {
  if (!isObj(q)) return null;
  const text = typeof q.text === "string" ? q.text.trim().slice(0, 400) : "";
  if (!text) return null;
  const topic = typeof q.topic === "string" && TOPIC_IDS.includes(q.topic.trim()) ? q.topic.trim() : "";
  return { topic, text };
}

export function sanitizeSignals(s) {
  const src = isObj(s) ? s : {};
  const correction = typeof src.correction_of === "string" ? src.correction_of.trim() : "";
  return {
    emotion: EMOTIONS.includes(src.emotion) ? src.emotion : "none",
    tired: src.tired === true,
    direct_answer: src.direct_answer === true,
    correction_of: correction === "any" || TOPIC_IDS.includes(correction) ? correction : "",
    market_claim: src.market_claim === true,
  };
}

// ── ledger ───────────────────────────────────────────────────────────────

export function isTerminal(ledger, topic) {
  return TERMINAL.includes(ledger?.[topic]?.status);
}

// Paused = we've asked enough times without an answer. The topic is NOT
// closed: facts and statuses for it are still accepted at any time.
export function isPaused(ledger, topic) {
  return !isTerminal(ledger, topic) && (ledger?.[topic]?.asked || 0) >= ASK_LIMIT;
}

function touch(touched, topic) { if (touched) touched.add(topic); }

// Explicit statuses from the user's latest message. A later explicit status
// always overrides an earlier one (e.g. "unavailable" -> "answered").
export function applyTopicUpdates(ledger, updates, now, touched) {
  const next = { ...(isObj(ledger) ? ledger : {}) };
  for (const u of updates || []) {
    next[u.id] = { ...(next[u.id] || {}), status: u.status, asked: 0, updatedAt: now };
    touch(touched, u.id);
  }
  return next;
}

// A topic whose fact now exists is answered — and an answer (or attachment)
// reopens anything that was paused, declined or unavailable.
export function reconcileDerived(ledger, state, now, touched) {
  const next = { ...(isObj(ledger) ? ledger : {}) };
  for (const topic of TOPIC_IDS) {
    if (topicHasFact(topic, state) && next[topic]?.status !== "answered") {
      next[topic] = { ...(next[topic] || {}), status: "answered", asked: 0, updatedAt: now };
      touch(touched, topic);
    }
  }
  return next;
}

// The user complained that we asked/assumed something they already covered.
// Remember it: extraction may then look for that answer, and we won't ask again.
export function markCorrection(ledger, topicOrAny, now, touched) {
  if (!topicOrAny) return ledger;
  const next = { ...(isObj(ledger) ? ledger : {}) };
  const targets = topicOrAny === "any"
    ? TOPIC_IDS.filter((t) => (next[t]?.asked || 0) > 0 && !isTerminal(next, t))
    : [topicOrAny];
  for (const t of targets) {
    if (!TOPIC_IDS.includes(t)) continue;
    next[t] = { ...(next[t] || {}), corrected: now, updatedAt: now };
    touch(touched, t);
  }
  return next;
}

export function recordAsked(ledger, topic, now, touched) {
  if (!TOPIC_IDS.includes(topic) || isTerminal(ledger, topic)) return ledger;
  const old = ledger?.[topic] || {};
  const next = { ...(isObj(ledger) ? ledger : {}) };
  next[topic] = { ...old, status: "asked", asked: (old.asked || 0) + 1, updatedAt: now };
  touch(touched, topic);
  return next;
}

export function noteExtractionAttempts(ledger, topics, now, touched) {
  const next = { ...(isObj(ledger) ? ledger : {}) };
  for (const t of topics || []) {
    const old = next[t] || {};
    next[t] = { ...old, extractAttempts: (old.extractAttempts || 0) + 1, updatedAt: now };
    touch(touched, t);
  }
  return next;
}

// ── question gate ────────────────────────────────────────────────────────

// Decide whether the model's question may be shown. Only ever drops the
// QUESTION — the caller always keeps the rest of the reply.
export function evaluateQuestion(ledger, question, signals) {
  if (!question || !question.text) return { allow: false, reason: "none" };
  const sig = signals || {};
  if (sig.emotion === "strong") return { allow: false, reason: "emotion" };
  if (sig.tired) return { allow: false, reason: "tired" };
  if (sig.direct_answer) return { allow: false, reason: "direct_answer" };
  if (question.topic) {
    if (isTerminal(ledger, question.topic)) return { allow: false, reason: "closed" };
    if (isPaused(ledger, question.topic)) return { allow: false, reason: "paused" };
    return { allow: true, reason: "ok" };
  }
  return { allow: true, reason: "no_topic" };
}

const norm = (s) => String(s || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

export function composeReply(body, question, decision) {
  const base = (body || "").trim();
  if (!decision.allow) return base;
  const q = question.text.trim();
  if (base && norm(base).includes(norm(q))) return base;
  return base ? `${base}\n\n${q}` : q;
}

// Required topics we should try a targeted extraction for: still missing,
// asked about before (or the user said they'd already answered), not closed,
// and not tried too many times.
export function topicsNeedingExtraction(projectedState, ledger) {
  const out = [];
  for (const t of REQUIRED_TOPICS) {
    if (topicHasFact(t, projectedState)) continue;
    if (isTerminal(ledger, t)) continue;
    const e = ledger?.[t] || {};
    if ((e.extractAttempts || 0) >= EXTRACTION_ATTEMPT_LIMIT) continue;
    if ((e.asked || 0) >= 1 || e.corrected) out.push(t);
  }
  return out;
}

// ── extraction verification (conservative) ───────────────────────────────

export const TOPIC_FACT_FIELDS = {
  role: ["roleTarget"],
  location: ["location"],
  experience: ["experienceLevel"],
  outcomes: ["responses", "viewedCount", "interviews"],
};
const STRING_FIELDS = ["roleTarget", "location", "experienceLevel"];
const NUMBER_FIELDS = ["responses", "viewedCount", "interviews"];

// A quote is accepted only if it really appears in something the USER wrote.
export function verifyQuote(quote, userTexts) {
  const nq = norm(quote);
  if (nq.length < 2 || nq.length > 200) return false;
  return (userTexts || []).some((t) => norm(t).includes(nq));
}

// Keep only fields belonging to the wanted topics, with the right type, and
// with a quote that is verifiably the user's own words.
export function filterExtractedFacts(rawFacts, wantedTopics, userTexts) {
  const out = {};
  if (!isObj(rawFacts)) return out;
  const allowed = new Set(wantedTopics.flatMap((t) => TOPIC_FACT_FIELDS[t] || []));
  for (const field of allowed) {
    const item = rawFacts[field];
    if (!isObj(item) || !verifyQuote(item.quote, userTexts)) continue;
    if (STRING_FIELDS.includes(field)) {
      const v = typeof item.value === "string" ? item.value.trim().slice(0, 120) : "";
      if (v) out[field] = v;
    } else if (NUMBER_FIELDS.includes(field)) {
      if (Number.isInteger(item.value) && item.value >= 0 && item.value <= 100000) out[field] = item.value;
    }
  }
  return out;
}

export function sanitizeExtractedTopics(list, wantedTopics, userTexts) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    if (!isObj(item)) continue;
    if (!wantedTopics.includes(item.id)) continue;
    if (item.status !== "declined" && item.status !== "unavailable") continue;
    if (!verifyQuote(item.quote, userTexts)) continue;
    out.push({ id: item.id, status: item.status });
  }
  return sanitizeTopicUpdates(out);
}

// ── sentence-level repair ────────────────────────────────────────────────

export function splitSentences(text) {
  if (!text) return [];
  return text.split(/(?<=[.!?।])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

// Causal/ATS speculation (English). Always removed in UNDERSTAND; in
// INVESTIGATE only until both the CV and real job descriptions were provided.
export const SPECULATIVE_CAUSE_PATTERN = /\b(ats|applicant[- ]tracking|keyword[- ]?(match|matching|filter|filtering|scan|scanning|screen|screening)|auto[- ]?reject(ed|ion|s)?|screened out|filtered out|initial screening|resume screening|cv screening|red flag|biggest issue|probably because|likely because|most likely cause|most plausible (explanation|reason|cause))\b/i;

// Statements about what employers/jobs/the market typically do — facts the
// app has no data for. Removed unless the user supplied job descriptions or
// the sentence clearly attributes the claim to the user.
export const UNSUPPORTED_MARKET_PATTERN = /\b((most|many|majority of|a lot of|lots of)\s+(employers|companies|recruiters|hiring managers|jobs|postings|job (ads|postings|listings))|(employers|companies|recruiters|jobs|job (ads|postings)|roles)\s+(typically|usually|generally|commonly|often|normally)\b|(typically|usually|generally|commonly|normally)\s+(require|requires|required|ask(s)? for|want(s)?|need(s)?|expect(s)?)|(require|requires|required|ask(s)? for|expect(s)?)\s+(at least\s+)?(\d+|one|two|three)(\s*(-|–|to)\s*(\d+|one|two|three))?\+?\s*years?|competitive (market|field|industry)|(market|field|industry) is (very |highly )?(competitive|saturated|small)|few (openings|vacancies|jobs))\b/i;

const ATTRIBUTION_PATTERN = /\b(you (said|mentioned|told|noted|shared|described|saw|found)|as you (said|mentioned|noted)|according to you|in your (message|words|experience|postings|ads))\b/i;

export function repairText(text, { phase, hasCv, hasJds } = {}) {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return { text: text || "", removed: 0 };
  const speculativeApplies = phase === "understand" || !(hasCv && hasJds);
  const marketApplies = !hasJds;
  const kept = [];
  let removed = 0;
  for (const s of sentences) {
    const attributed = ATTRIBUTION_PATTERN.test(s);
    const speculative = speculativeApplies && SPECULATIVE_CAUSE_PATTERN.test(s);
    const market = marketApplies && !attributed && UNSUPPORTED_MARKET_PATTERN.test(s);
    if (speculative || market) removed++;
    else kept.push(s);
  }
  return { text: kept.join(" ").trim(), removed };
}

// Honest flag appended (once) when a claim was removed or the model reports
// it made a market claim without evidence.
const GROUNDING_NOTES = {
  english: "A quick caution: I haven't seen your CV or the actual job ads yet, so anything about what employers usually want is a guess to check, not a fact.",
  hindi: "ध्यान रहे: मैंने अभी आपका CV या असली job ads नहीं देखे हैं, इसलिए employers आम तौर पर क्या चाहते हैं, यह मेरा अनुमान है, पक्का तथ्य नहीं।",
  malayalam: "ശ്രദ്ധിക്കുക: ഞാൻ ഇതുവരെ നിങ്ങളുടെ CV-യോ യഥാർത്ഥ job ad-കളോ കണ്ടിട്ടില്ല, അതിനാൽ employers സാധാരണ എന്താണ് ആവശ്യപ്പെടുന്നത് എന്നത് എന്റെ ഊഹം മാത്രമാണ്, ഉറപ്പുള്ള വസ്തുതയല്ല.",
  tamil: "கவனிக்கவும்: உங்கள் CV அல்லது உண்மையான job ad-களை நான் இன்னும் பார்க்கவில்லை, அதனால் employers பொதுவாக என்ன எதிர்பார்க்கிறார்கள் என்பது என் ஊகம் மட்டுமே, உறுதியான உண்மை அல்ல.",
};
export function groundingNote(language) {
  return GROUNDING_NOTES[language] || GROUNDING_NOTES.english;
}

// ── plain-language summaries (deterministic, facts only) ─────────────────

export function buildKnownSummary(state) {
  if (!state) return "";
  const bits = [];
  if (state.roleTarget && state.location) bits.push(`you're looking for ${state.roleTarget} roles in ${state.location}`);
  else if (state.roleTarget) bits.push(`you're looking for ${state.roleTarget} roles`);
  else if (state.location) bits.push(`you're searching in ${state.location}`);
  if (hasExperienceFact(state.experienceLevel)) bits.push(`your experience is ${state.experienceLevel}`);
  if (state.applicationsTotal != null) bits.push(`you've sent about ${state.applicationsTotal} applications`);
  if (state.responses === 0 && !(state.interviews > 0)) bits.push("nobody has replied so far");
  else if (state.responses != null && state.responses > 0) bits.push(`${state.responses} employer${state.responses === 1 ? "" : "s"} replied`);
  if (state.viewedCount != null) bits.push(`the portal marked about ${state.viewedCount} as viewed (a portal status, not proof anyone read them)`);
  if (state.interviews != null && state.interviews > 0) bits.push(`you've had ${state.interviews} interview${state.interviews === 1 ? "" : "s"}`);
  if (bits.length === 0) return "";
  return `Here's what I have so far: ${bits.join("; ")}.`;
}

export function fallbackAcknowledgement() {
  return "That sounds really draining, and it's understandable to feel that way after putting in this much effort.";
}

// Text added to the AI's context so it never re-asks.
export function buildLedgerContext(ledger) {
  if (!isObj(ledger)) return "";
  const answered = [], cannot = [], paused = [], asked = [];
  for (const t of TOPIC_IDS) {
    const e = ledger[t];
    if (!e) continue;
    if (e.status === "answered") answered.push(t);
    else if (e.status === "declined" || e.status === "unavailable") cannot.push(`${t} (${e.status})`);
    else if ((e.asked || 0) >= ASK_LIMIT) paused.push(t);
    else if ((e.asked || 0) >= 1) asked.push(t);
  }
  const lines = [];
  if (answered.length) lines.push(`ALREADY ANSWERED — never ask again: ${answered.join(", ")}.`);
  if (cannot.length) lines.push(`THE USER CANNOT OR WILL NOT PROVIDE — accept it, never ask again, never ask for a substitute, continue with what you have: ${cannot.join(", ")}.`);
  if (paused.length) lines.push(`ASKED TWICE WITHOUT A USABLE ANSWER — do not ask again; if it still matters, say plainly it is missing and that they can tell you any time: ${paused.join(", ")}.`);
  if (asked.length) lines.push(`ASKED ONCE WITHOUT AN ANSWER — do not repeat it in the same words: ${asked.join(", ")}.`);
  return lines.join("\n");
}
