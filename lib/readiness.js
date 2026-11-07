// lib/readiness.js
// Pure rules for (1) when LifePath has enough reliable evidence to start the
// investigation by itself, (2) which single piece of evidence is most worth
// asking for next, (3) which outcome stage the user is in, and (4) whether a
// "next task" is concrete enough to show. Nothing here calls a model or the
// database, and every reader treats missing fields (older saved cases) as empty.
//
// The question target is a SOFT budget, never a quota: if the facts already
// support an investigation after one or two answers, it starts then.

import { topicHasFact, isPaused } from "./caseLedger";

// ── outcome stages (starting points for the investigation, not diagnoses) ──
export const OUTCOME_STAGES = [
  "find_jobs", "no_responses", "rejected", "viewed_no_response", "recruiter_no_interview",
  "interviews_no_progress", "final_no_offer", "unsuitable_offers", "scam_suspected", "other",
];
export const STAGE_INFO = {
  find_jobs: { letter: "A", label: "can't find suitable jobs to apply for" },
  no_responses: { letter: "B", label: "applying but getting no responses" },
  rejected: { letter: "C", label: "applications being rejected" },
  viewed_no_response: { letter: "D", label: "applications show as viewed but nobody replies" },
  recruiter_no_interview: { letter: "E", label: "recruiters contact them but interviews don't happen" },
  interviews_no_progress: { letter: "F", label: "getting interviews but not progressing" },
  final_no_offer: { letter: "G", label: "reaching final rounds but no offer" },
  unsuitable_offers: { letter: "H", label: "receiving offers that don't suit them" },
  scam_suspected: { letter: "I", label: "suspected fake job or recruitment scam" },
  other: { letter: "J", label: "another problem in the user's own words" },
};
export const sanitizeStage = (s) => (typeof s === "string" && OUTCOME_STAGES.includes(s.trim()) ? s.trim() : "");

// The numbers alone can suggest a stage. The model's own stage wins when valid.
export function deriveOutcomeStage(state) {
  const s = state || {};
  if (s.focus === "job_offer_check") return "scam_suspected";
  const n = (v) => (typeof v === "number" ? v : null);
  const responses = n(s.responses), interviews = n(s.interviews), viewed = n(s.viewedCount), apps = n(s.applicationsTotal);
  if (interviews != null && interviews > 0) return "interviews_no_progress";
  if (responses != null && responses > 0 && interviews === 0) return "recruiter_no_interview";
  if (viewed != null && viewed > 0 && (responses === 0 || responses == null)) return "viewed_no_response";
  if ((responses === 0 || interviews === 0) && apps != null && apps > 0) return "no_responses";
  return "";
}
export const stageOf = (state) => sanitizeStage(state?.outcomeStage) || deriveOutcomeStage(state);

// ── readiness ──
export const QUESTION_TARGET = 5; // a soft budget, not a quota

export const TOPIC_REASONS = {
  role: "so I look at the right kind of jobs",
  experience: "because what counts as a good fit depends on your level",
  outcomes: "because what happened after you applied shows where the search is stalling",
  location: "because the job market and your options differ by place",
  applications: "because the number and period of applications changes how to read the results",
  channels: "because where you applied changes what is worth testing",
  same_cv: "because it shows whether your applications were tailored",
  cv: "so I can compare it with what real jobs ask for",
  job_descriptions: "so I can compare your background with what employers actually ask for",
  interviews: "to see where in the process it stalls",
  duplicates: "because repeated listings can make the numbers look bigger than they are",
  targeting: "because applying above or below your level changes how to read the silence",
  direct_outreach: "because direct contact and referrals work differently from portals",
  rejection_stage: "because when the rejection comes shows where the problem is",
  interview_stage: "because the round where it stops shows what to work on",
  company_identity: "to see which job-offer warning signs apply",
  recruiter_identity: "to see which job-offer warning signs apply",
  interview_address: "to see which job-offer warning signs apply",
  payment_request: "to see which job-offer warning signs apply",
  education: "because your qualifications decide which roles fit",
  skills: "because the skills you can show decide which roles fit",
};

const FACT_LABELS = { role: "the role you're aiming for", experience: "your experience level", outcomes: "what happened after you applied", location: "where you're applying" };

// A refusal only settles a topic when the user's own words backed it up.
const refused = (ledger, topic) => {
  const e = ledger?.[topic];
  return (e?.status === "declined" || e?.status === "unavailable") && e?.verified === true;
};

function coreTopicsFor(stage) {
  if (stage === "find_jobs") return ["role", "experience", "location"];
  return ["role", "outcomes", "experience"]; // asked in this order of value
}

export function computeReadiness(state, opts = {}) {
  const s = state || {};
  const ledger = s.ledger && typeof s.ledger === "object" ? s.ledger : {};
  const stage = stageOf(s);
  const asked = Number.isFinite(opts.questionsAsked) ? opts.questionsAsked : (Number.isFinite(s.questionsAsked) ? s.questionsAsked : 0);
  const budgetReached = asked >= QUESTION_TARGET;
  const warningIds = Array.isArray(opts.warningIds) ? opts.warningIds : Object.keys(s.warningSigns && typeof s.warningSigns === "object" ? s.warningSigns : {});

  // A suspected scam needs the warning signs the user described, not a profile.
  if (stage === "scam_suspected") {
    const ready = warningIds.length > 0 || budgetReached;
    return {
      ready, provisional: ready && warningIds.length === 0, stage, budgetReached, missing: [],
      limitations: ready && warningIds.length === 0 ? ["I haven't been told any specific warning signs about the offer"] : [],
      nextEvidence: ready ? null : { topic: "payment_request", reason: TOPIC_REASONS.payment_request },
    };
  }

  const status = coreTopicsFor(stage).map((topic) => {
    if (topicHasFact(topic, s)) return { topic, st: "known" };
    if (refused(ledger, topic)) return { topic, st: "refused" };
    if (isPaused(ledger, topic)) return { topic, st: "paused" }; // asked twice, no answer: stop waiting
    return { topic, st: "missing" };
  });
  const missing = status.filter((x) => x.st === "missing").map((x) => x.topic);
  const unresolved = status.filter((x) => x.st === "refused" || x.st === "paused").map((x) => x.topic);

  let ready = missing.length === 0;
  let provisional = ready && unresolved.length > 0;
  // Never stuck: once the soft budget is used up, go ahead with what we have.
  if (!ready && budgetReached) { ready = true; provisional = true; }

  const limitations = [...(ready && budgetReached ? missing : []), ...unresolved].map((t) => `I don't have ${FACT_LABELS[t] || t}`);
  const first = missing[0];
  return {
    ready, provisional, stage, budgetReached, missing, limitations,
    nextEvidence: !ready && first ? { topic: first, reason: TOPIC_REASONS[first] || "" } : null,
  };
}

// The honest sentence used when an assessment is provisional but the model
// forgot to say what it can't tell. Built only from what is actually missing.
export function limitationsText(state, readiness) {
  const s = state || {};
  const ledger = s.ledger && typeof s.ledger === "object" ? s.ledger : {};
  const parts = [...(readiness?.limitations || [])];
  if (!s.cvProvided) parts.push("I haven't seen your CV");
  if (!s.jobDescriptionsProvided) parts.push("I haven't seen the job descriptions you applied for");
  void ledger;
  const uniq = [...new Set(parts)].slice(0, 3);
  return uniq.length ? `This is a provisional read, not a final answer: ${uniq.join(", and ")}, so other explanations are still possible.` : "This is a provisional read, not a final answer, so other explanations are still possible.";
}

// Context lines for the model (kept short: the Groq fallback has a small budget).
export function buildReadinessContext(state) {
  const s = state || {};
  const stage = stageOf(s);
  const r = computeReadiness(s);
  const lines = [];
  if (stage) lines.push(`OUTCOME STAGE (a starting point, not a diagnosis): ${STAGE_INFO[stage].letter} — ${STAGE_INFO[stage].label}`);
  const phaseUnderstand = !(s.phase === "investigate");
  if (phaseUnderstand) {
    const asked = Number.isFinite(s.questionsAsked) ? s.questionsAsked : 0;
    lines.push(`QUESTIONS ASKED SO FAR: ${asked} (a soft target of 3–5, never a quota — if the answer wouldn't change what you say, ask nothing)`);
    if (r.nextEvidence) lines.push(`MOST VALUABLE MISSING EVIDENCE: ${FACT_LABELS[r.nextEvidence.topic] || r.nextEvidence.topic} — ${r.nextEvidence.reason}. Ask only for this, with a short reason.`);
  } else if (r.provisional || r.limitations.length) {
    lines.push(`EVIDENCE LIMITS: ${r.limitations.join("; ") || "some evidence is still missing"}. Say what you can't tell, give a provisional assessment, never call the investigation complete.`);
  }
  return lines.join("\n");
}

// ── next-task quality ──
const GENERIC_TASK = [
  /^\s*(just\s+)?(apply|send)\s+(to\s+)?(\d+\s+|some\s+|a\s+few\s+|more\s+|five\s+|ten\s+)*(more\s+)?(jobs?|applications?)\b/i,
  /^\s*(improve|update|fix|polish|work on|refresh)\s+(your\s+)?(cv|resume|profile|linkedin)\b/i,
  /^\s*(learn|upskill|take|gain)\s+(some\s+|new\s+|more\s+)*skills?\b/i,
  /^\s*(network|do more networking|network more|build your network)\b/i,
  /^\s*(stay|keep)\s+(positive|motivated|hopeful)\b/i,
  /^\s*keep\s+(trying|applying|going)\b/i,
];
// Short and generic = the "apply to five more jobs" kind of advice.
export const isGenericTask = (text) => {
  const t = String(text || "").trim();
  return !!t && t.length < 60 && GENERIC_TASK.some((re) => re.test(t));
};

export const MAX_TASK_MINUTES = 60;
export function validateTask(task) {
  const t = task || {};
  const what = String(t.what || "").trim();
  const how = String(t.how || "").trim();
  const why = String(t.why || "").trim();
  const done = String(t.done || "").trim();
  const rawMin = Number(t.minutes);
  const minutes = Number.isFinite(rawMin) && rawMin >= 5 ? Math.round(rawMin) : null;
  const missing = [];
  if (!what) missing.push("what");
  if (!how) missing.push("how");
  if (!why) missing.push("why");
  if (!done) missing.push("done");
  if (what && isGenericTask(what)) missing.push("specific");
  if (minutes != null && minutes > MAX_TASK_MINUTES) missing.push("small_enough");
  return { ok: missing.length === 0, missing, minutes, what, how, why, done };
}

// A safe evidence-gathering task, used only when the model gave none that
// passed the checks, the assessment is provisional, and nothing is pending.
export function fallbackTask(state) {
  const s = state || {};
  if (!s.jobDescriptionsProvided) {
    return {
      what: "Paste the requirements section of one job you applied for.",
      how: "Open the listing, copy the 'requirements' or 'qualifications' part, and paste it into this chat. If you can, add one more from a job you'd most like.",
      why: "It lets me compare what employers actually ask for with your background, instead of guessing.",
      done: "The requirements text is pasted here.", minutes: 10,
    };
  }
  if (!s.cvProvided) {
    return {
      what: "Paste the text of your CV, or attach it.",
      how: "Open your CV, select all the text, and paste it here. A PDF or TXT file also works.",
      why: "It lets me compare your actual wording with the job requirements you shared.",
      done: "Your CV text is visible in this chat.", minutes: 10,
    };
  }
  return {
    what: "Keep a short log of your next 5 applications.",
    how: "For each one, write the date, the role title, where you applied (portal, company site or a person), and whether anyone replied.",
    why: "It shows which way of applying is actually getting answers, so we compare real results instead of guessing.",
    done: "You have five lines you can paste here.", minutes: 25,
  };
}

// Sentences that claim the investigation is finished or a verdict is final.
const COMPLETE_CLAIM = /\b(investigation (is|has been) (now )?(complete|completed|finished)|(i|we)('ve| have) (now )?(completed|finished) (the|my|our) investigation|(this|that) is (the|your) final (diagnosis|answer|conclusion)|case closed)\b/i;
export function stripCompletenessClaims(text) {
  const parts = String(text || "").split(/(?<=[.!?])\s+/);
  const kept = parts.filter((p) => !COMPLETE_CLAIM.test(p));
  return { text: kept.join(" ").trim(), removed: parts.length - kept.length };
}
