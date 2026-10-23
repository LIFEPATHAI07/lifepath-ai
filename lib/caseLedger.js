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
  "targeting", "direct_outreach",
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

const ATTRIBUTION_PATTERN = /\b(you (said|mentioned|told|noted|shared|described|saw|found|asked|wrote|wondered)|as you (said|mentioned|noted)|according to you|in your (message|words|experience|postings|ads))\b/i;

// Claims about what recruiters/employers actually did with an application.
// Nobody (including this app) can know that from "viewed" or "no reply".
export const RECRUITER_BEHAVIOR_PATTERN = /\b(recruiters?|employers?|hiring managers?|hr teams?|hr|companies|company|hirers?|screeners?)\b[^.!?]{0,45}\b(?:open\w*|view\w*|look\w*|read\w*|review\w*|skipp\w*|reject\w*|ignor\w*|filter\w*|screen\w*|consider\w*|evaluat\w*|assess\w*|scan\w*|shortlist\w*|notic\w*|overlook\w*|dismiss\w*|discard\w*|declin\w*|skim\w*|pass(?:ed|ing)? on|turn(?:ed|ing)? down|chos\w*|choos\w*|prefer\w*|pick\w*|move\w* on|felt|thought|decided|judg\w*|not finding|aren'?t finding|don'?t see|didn'?t see|may not see|might not see|see no|saw no|found no)\b/i;
const PASSIVE_REVIEW_PATTERN = /\b(?:profile|cv|resume|résumé|applications?)\b[^.!?]{0,20}\b(?:was|were|got|has been|have been)\b[^.!?]{0,10}\b(?:opened|considered|reviewed|read|evaluated|looked at|seen|shortlisted|screened|assessed|rejected|ignored|skipped)\b/i;

// "viewed" is a portal status. Reading it as proof of human attention is wrong.
const VIEWED_INTERPRETATION_PATTERN = /\bviewed\b[^.!?]{0,60}\b(?:mean\w*|show\w*|prove\w*|indicat\w*|suggest\w*|confirm\w*|impl\w*|demonstrat\w*|tells? us)\b|\b(?:mean\w*|show\w*|prove\w*|indicat\w*|suggest\w*|confirm\w*|impl\w*)\b[^.!?]{0,50}\bviewed\b/i;
const VIEWED_EXEMPT_PATTERN = /\b(?:not|\w+n't|only|merely|just a|status|no proof|cannot|can't|doesn'?t)\b/i;

// A scam/fraud VERDICT about a listing. Warning signs may be described; a verdict may not.
export const FRAUD_VERDICT_PATTERN = /\b(this|that|the|it|these|those)\b[^.!?]{0,40}\b(is|are|looks|look|seems|seem|sounds|sound)\b[^.!?]{0,15}\b(a |an )?(scams?|fraud|fraudulent|fake|bogus)\b/i;

// Advice that jumps to "rewrite the CV / write a cover letter / apply to more
// jobs" before anything has been investigated. Verb STEMS are matched so
// "updating", "rewriting", "applying", "sending out" are all caught.
const QTY = "(?:more|another|additional|extra|new|five|ten|few|several|a few|[1-9]|1[0-5])";
export const CV_ACTION_PATTERN = /\b(?:rewrit\w*|re-writ\w*|revis\w*|edit\w*|updat\w*|tailor\w*|improv\w*|polish\w*|redo\w*|overhaul\w*|restructur\w*|reformat\w*|refresh\w*|optimi[sz]\w*|strengthen\w*|enhanc\w*|rework\w*|customi[sz]\w*)\b[^.!?]{0,50}\b(?:cv|resume|résumé|profile)\b/i;
export const COVER_LETTER_ACTION_PATTERN = /\b(?:write|writing|add|adding|attach|attaching|include|including|send|sending|use|using|create|creating|prepare|preparing|draft|drafting)\b[^.!?]{0,30}\bcover letters?\b/i;
export const APPLY_MORE_PATTERN = new RegExp(`\\b(?:apply\\w*|submit\\w*|send\\w*(?:\\s+out)?)\\b[^.!?]{0,25}\\b${QTY}\\b[^.!?]{0,25}\\b(?:jobs|roles|positions|openings|companies|applications|postings)\\b`, "i");

// Sentences that postpone or negate advice are fine.
const NEGATION_PATTERN = /\b(?:not|\w+n't|no need|rather than|instead of|hold off|without|never|avoid)\b/i;
// Honest "I can't verify this" markers. A hedged hypothesis that carries one is allowed during INVESTIGATE.
const HONEST_FLAG_PATTERN = /\b(?:haven'?t seen|have not seen|can'?t tell|cannot tell|don'?t know|do not know|not sure|unclear|unverified|unconfirmed|one possibility|possible that|worth checking|to check|need to see|would need to see|until (?:i|we) (?:see|check|know)|only a guess|a guess)\b/i;

// Hedged or confident statements that a cause lies in the user's CV/profile/skills.
const CV_SUBJECTS = "(?:cv|resume|résumé|profile|applications?|skills?|experience|qualifications?|portfolio)";
const NEG_TERMS = "(?:not|\\w+n't|lack\\w*|weak\\w*|mismatch\\w*|insufficient|inadequate|fail\\w*|fall\\w* short|poorly|unclear|generic|missing|gap\\w*|too (?:few|little|junior|basic))";
const MODALS = "(?:may|might|could|seems?|appears?|probably|likely|perhaps|possibly|possibilit\\w*|possible|maybe|chance that)";
export const CAUSE_FRAME_PATTERNS = [
  new RegExp(`\\b(?:your|the)\\s+${CV_SUBJECTS}\\b[^.!?]{0,60}\\b${MODALS}\\b[^.!?]{0,60}\\b${NEG_TERMS}\\b`, "i"),
  new RegExp(`\\b${MODALS}\\b[^.!?]{0,40}\\b(?:your|the)\\s+${CV_SUBJECTS}\\b[^.!?]{0,60}\\b${NEG_TERMS}\\b`, "i"),
  /\b(?:could|may|might|would|probably|likely)\b[^.!?]{0,30}\b(?:explain|account for|be (?:the )?(?:reason|cause)|be (?:why|due to|because))\b[^.!?]{0,40}\b(?:silence|no repl\w+|zero repl\w+|lack of repl\w+|not hearing|no responses?|no calls?|rejections?|low response|not (?:getting|hearing))\b/i,
  /\b(?:the|your|main|real|likely)\s+(?:issue|problem|reason|cause|bottleneck)\s+(?:is|are|may be|might be|could be|seems|appears)\b/i,
];

// Statements about the job market that nobody here has data for.
const MARKET_WORDS = "(?:market|field|industry|sector|competition|demand|hiring|openings|vacancies)";
export const MARKET_STATE_PATTERN = new RegExp(`\\b${MARKET_WORDS}\\b[^.!?]{0,40}\\b(?:is|are|remains|looks|seems|tends to be)\\b[^.!?]{0,20}\\b(?:small|limited|competitive|saturated|tough|slow|high|low|weak|crowded|tight|poor|scarce)\\b|\\bnot (?:many|enough) (?:openings|vacancies|jobs|opportunities)\\b`, "i");

// Software common in electrical/MEP drafting. Suggesting one the user never
// mentioned risks inventing a skill or a requirement.
const TOOL_NAMES = ["revit", "navisworks", "autocad mep", "bim", "dialux", "relux", "etap", "etabs", "staad", "solidworks", "sketchup", "primavera", "eplan", "caneco", "ecodial"];
const toolRegex = (name) => new RegExp(`\\b${name.replace(/ /g, "\\s+")}\\b`, "i");
// "learn / add / highlight … <Product>": a capitalised product-like name the
// user never wrote is treated as an unverified skill.
const LEARN_CUE = /\b(?:learn\w*|master\w*|add\w*|includ\w*|highlight\w*|list\w*|upskill\w*|study\w*|practi[sc]e\w*|train\w*|certif\w*|familiari[sz]\w*|pick(?:ing|ed)? up|take (?:a )?(?:course|class)|(?:tools?|software|programs?|packages?|skills?)\s+(?:like|such as)|such as|e\.g\.)\b/i;
const PRODUCT_STOP = new Set(["CV", "Naukri", "LinkedIn", "Indeed", "Foundit", "Internshala", "India", "Indian", "English", "Google", "WhatsApp", "Gmail", "Word", "Excel", "PDF", "Apprenticeship", "National"]);
function mentionsUnverifiedProduct(sentence, known) {
  if (TOOL_NAMES.some((n) => toolRegex(n).test(sentence) && !toolRegex(n).test(known))) return true;
  if (!LEARN_CUE.test(sentence)) return false;
  const tokens = sentence.match(/\b[A-Z][A-Za-z0-9+#.\-]{2,}\b/g) || [];
  const first = sentence.trim().split(/\s+/)[0].replace(/[^A-Za-z0-9+#.\-]/g, "");
  const knownLower = known.toLowerCase();
  return tokens.some((tok, i) => !(i === 0 && tok === first) && !PRODUCT_STOP.has(tok) && !knownLower.includes(tok.toLowerCase()));
}

// A sentence is a question only if it ends with "?" AND its quotation marks
// balance. A fragment cut out of the middle of a quotation (e.g. one half of
// "Why am I getting no replies? Nobody wants me," you said.) is NOT ours to
// treat as a question, so quoted text is never deleted.
const isQuestion = (s) => {
  if (!/\?\s*$/.test(s)) return false;
  const straight = (s.match(/"/g) || []).length;
  const curlyOpen = (s.match(/[\u201C\u00AB]/g) || []).length;
  const curlyClose = (s.match(/[\u201D\u00BB]/g) || []).length;
  return straight % 2 === 0 && curlyOpen === curlyClose;
};

function classifySentence(s, { phase, evidenceComplete, speculativeApplies, marketApplies, known }) {
  const attributed = ATTRIBUTION_PATTERN.test(s);
  if (isQuestion(s)) {
    // Questions are not claims or advice, but a leading/speculative or
    // verdict-style question is still removed.
    if (speculativeApplies && SPECULATIVE_CAUSE_PATTERN.test(s)) return "speculative_cause";
    if (FRAUD_VERDICT_PATTERN.test(s)) return "fraud_verdict";
    return "";
  }
  if (speculativeApplies && !attributed && SPECULATIVE_CAUSE_PATTERN.test(s)) return "speculative_cause";
  if (!attributed && (RECRUITER_BEHAVIOR_PATTERN.test(s) || PASSIVE_REVIEW_PATTERN.test(s))) return "recruiter_behavior";
  if (VIEWED_INTERPRETATION_PATTERN.test(s) && !VIEWED_EXEMPT_PATTERN.test(s)) return "viewed_as_proof";
  if (marketApplies && !attributed && (UNSUPPORTED_MARKET_PATTERN.test(s) || MARKET_STATE_PATTERN.test(s))) return "market_claim";
  if (FRAUD_VERDICT_PATTERN.test(s)) return "fraud_verdict";
  if (mentionsUnverifiedProduct(s, known)) return "unverified_tool";
  if (!attributed && CAUSE_FRAME_PATTERNS.some((re) => re.test(s))) {
    if (phase === "understand") return "hedged_cause";
    if (!evidenceComplete && !HONEST_FLAG_PATTERN.test(s)) return "hedged_cause";
  }
  if (!evidenceComplete && !NEGATION_PATTERN.test(s) &&
      (CV_ACTION_PATTERN.test(s) || COVER_LETTER_ACTION_PATTERN.test(s) || APPLY_MORE_PATTERN.test(s))) return "unearned_action";
  return "";
}

// Sentence-level repair. Never deletes a whole reply on purpose: it removes
// only the offending sentences (keeping paragraph breaks) and reports why, so
// the caller can keep the rest and add one honest flag.
export function repairText(text, { phase, hasCv, hasJds, knownText = "" } = {}) {
  if (!text) return { text: text || "", removed: 0, reasons: [] };
  const evidenceComplete = !!(hasCv && hasJds);
  const ctx = {
    phase,
    evidenceComplete,
    speculativeApplies: phase === "understand" || !evidenceComplete,
    marketApplies: !hasJds,
    known: String(knownText || ""),
  };
  const reasons = [];
  const paragraphs = [];
  for (const para of String(text).split(/\n{2,}/)) {
    const kept = [];
    for (const s of splitSentences(para)) {
      const why = classifySentence(s, ctx);
      if (why) reasons.push(why); else kept.push(s);
    }
    const joined = kept.join(" ").trim();
    if (joined) paragraphs.push(joined);
  }
  return { text: paragraphs.join("\n\n"), removed: reasons.length, reasons };
}

// One question per reply. With `dropAll`, every question sentence in the body
// is removed (the gated question field carries the single question); otherwise
// only the first is kept.
export function limitQuestions(text, { dropAll = false } = {}) {
  if (!text) return { text: text || "", dropped: 0 };
  let seen = 0, dropped = 0;
  const paragraphs = [];
  for (const para of String(text).split(/\n{2,}/)) {
    const kept = [];
    for (const s of splitSentences(para)) {
      if (isQuestion(s)) {
        if (dropAll || seen >= 1) { dropped++; continue; }
        seen++;
      }
      kept.push(s);
    }
    const joined = kept.join(" ").trim();
    if (joined) paragraphs.push(joined);
  }
  return { text: paragraphs.join("\n\n"), dropped };
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


// ── repetition / duplicates ───────────────────────────────────────────────

const tokens = (text) => new Set(norm(text).split(" ").filter((w) => w.length >= 3));

// True when `text` says (nearly) the same thing as something already said.
export function isRepeat(text, previous) {
  const a = tokens(text);
  if (a.size < 4) return false;
  for (const prev of previous || []) {
    if (!prev) continue;
    const b = tokens(prev);
    if (b.size < 4) continue;
    let inter = 0;
    for (const w of a) if (b.has(w)) inter++;
    const union = a.size + b.size - inter;
    if (union > 0 && inter / union >= 0.7) return true;
  }
  return false;
}

export function dedupeHypotheses(list) {
  const seen = new Set();
  const out = [];
  for (const h of list || []) {
    const key = norm(h.label) || norm(h.id);
    const idKey = `id:${norm(h.id)}`;
    if (seen.has(key) || seen.has(idKey)) continue;
    seen.add(key); seen.add(idKey);
    out.push(h);
  }
  return out;
}

// ── provenance: does a model-reported fact appear in the user's own words? ──
// Returns true / false / null (null = can't tell, e.g. a count of zero, or a
// value the model translated into English). Used only to RECORD provenance —
// never to discard a fact.
export function isGrounded(field, value, userTexts) {
  const text = norm((userTexts || []).join(" "));
  if (!text) return null;
  if (typeof value === "number") {
    if (value === 0) return null;
    return new RegExp(`(^|\\s)${value}(\\s|$)`).test(text) ? true : false;
  }
  if (typeof value === "string") {
    const v = norm(value);
    if (!v) return null;
    if (text.includes(v)) return true;
    const words = v.split(" ").filter((w) => w.length >= 4);
    if (words.length === 0) return null;
    if (words.some((w) => text.includes(w))) return true;
    // Non-Latin text vs an English value: can't judge.
    return /[^\u0000-\u024f]/.test(text) ? null : false;
  }
  return null;
}

// ── CV-to-job comparison: every row must be backed by verifiable quotes ──────

export function sanitizeComparison(raw, userTexts) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw) {
    if (!isObj(row)) continue;
    const requirement = typeof row.requirement === "string" ? row.requirement.trim().slice(0, 160) : "";
    if (!requirement) continue;
    // The requirement must really be quoted from text the user supplied.
    if (!verifyQuote(row.requirement_quote, userTexts)) continue;
    const kind = row.kind === "preferred" ? "preferred" : "required";
    let status = ["met", "gap", "unknown"].includes(row.status) ? row.status : "unknown";
    let cvQuote = typeof row.cv_quote === "string" ? row.cv_quote.trim().slice(0, 200) : "";
    // "Met" needs a verifiable CV quote; otherwise it is only "unknown".
    if (status === "met" && !verifyQuote(cvQuote, userTexts)) { status = "unknown"; cvQuote = ""; }
    if (status !== "met") cvQuote = "";
    out.push({ requirement, kind, status, cv_quote: cvQuote });
    if (out.length >= 12) break;
  }
  return out;
}
