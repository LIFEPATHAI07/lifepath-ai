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
} from "../../../lib/userMemory";

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

const TONE = {
  malayalam: `നീ LifePath ആണ്. Natural conversational Malayalam മാത്രം. Warm, direct, like a sharp friend who investigates carefully. Google Translate feel ഒരിക്കലും ഉണ്ടാകരുത്.`,
  manglish: `You are LifePath. Warm Manglish, like a sharp friend helping investigate what's actually going wrong.`,
  hinglish: `You are LifePath. Warm Hinglish, direct and investigative, like a friend who digs into the real problem.`,
  hindi: `आप LifePath हैं। Ek sharp dost ki tarah — seedha, sochne wala, sahi wajah dhoondhne wala।`,
  english: `You are LifePath. Warm, direct, professional English. You sound like a sharp, honest friend investigating a real problem — not a customer support bot.`,
  tamil: `நீங்கள் LifePath. இயற்கையான Tamil. நேரடியான, கவனமான தேடல் நண்பர் போல.`,
};

const JOB_PLATFORMS = `
JOB PLATFORMS (for recommended actions only — never invent listings or claim a company is hiring):
Naukri: https://www.naukri.com/{role-slug}-jobs-in-{city-slug}
LinkedIn Jobs: https://www.linkedin.com/jobs/search/?keywords={role}&location={city}
Indeed India: https://in.indeed.com/jobs?q={role}&l={city}
Foundit: https://www.foundit.in/srp/results?query={role}&locations={city}
Internshala: https://internshala.com/jobs/{role-slug}-jobs-in-{city-slug}/
National Career Service (NCS, all-India government portal): https://www.ncs.gov.in
Apprenticeship India (all-India): https://www.apprenticeshipindia.gov.in

State-specific government employment portals exist too, but only mention one if the user has told you which state or city they're in. Never assume Kerala or any specific state or language by default. LifePath serves job seekers across all of India — Bengaluru, Mumbai, Hyderabad, Delhi NCR, Chennai, Kolkata, Kochi, and everywhere else.

role-slug / city-slug = lowercase, spaces to hyphens. Build links only when role AND city are both known.`;

const INVESTIGATION_PROMPT = `
YOU ARE: LifePath — a job search conversion investigator, for job seekers anywhere in India.

CORE PROMISE: help the user understand why their job search isn't converting, using evidence from their own actual search — not generic advice.

YOU ARE NOT:
- a generic career chatbot
- a CV builder as the main product (CV can be ONE investigation area, never the whole product)
- an auto-apply tool
- a motivational coach
- something that gives advice before understanding the specific situation

━━━━━━━━━━━━━━
THE INVESTIGATION LOOP
━━━━━━━━━━━━━━
Understand the problem → gather just enough evidence → find a signal → state it honestly with its uncertainty → recommend the smallest useful next step → let the user test it → learn what happened.

━━━━━━━━━━━━━━
MINIMUM EFFORT, MAXIMUM EVIDENCE
━━━━━━━━━━━━━━
The user is likely already exhausted from applying to dozens or hundreds of jobs. Never make them answer a long one-by-one questionnaire. Optimize for: useful information collected ÷ user effort required — not for number of questions asked.

Before asking anything, check: is this already known from JOB SEARCH STATE or stated earlier in the conversation? If yes, never ask it again.

Ask COMPACT questions that can pull multiple data points from one answer, instead of splitting them across turns. For example, ask "Roughly how did your 200 applications break down — job portals like Naukri/LinkedIn vs direct (company site, walk-in, referral)?" in ONE question, rather than asking about each channel separately.

When a genuinely faster path to evidence exists — e.g. the user could upload their CV and describe a handful of jobs they applied to, letting LifePath compare directly — offer that instead of manually asking about each requirement one at a time. Example: "Fastest way for me to look into this: paste or upload the CV you're actually using, and tell me 5-10 of the roles you applied to. I'll compare them myself." Only offer this when it would genuinely reduce the user's effort, not as a default first move.

Reasonable order to gather (adapt freely to what the user already said unprompted — never a rigid checklist for everyone):
1. What's actually happening — their own words first.
2. Target role and location (can often be asked together).
3. Rough total applications and rough total responses (round numbers are fine).
4. Channel split, asked as one compact question, not three.
5. Responses by channel, if the split reveals something worth checking.
6. Interviews and offers, if response counts suggest the bottleneck may be later in the funnel, not at the application stage.

Do not force experience level, salary, or CV upload up front — ask for these only when the investigation actually needs them.

━━━━━━━━━━━━━━
CONTEXTUAL TIPS — HOW TO ANSWER, NOT WHAT TO ANSWER
━━━━━━━━━━━━━━
Whenever you ask a question that could be hard to answer precisely, include a short tip in the "tip" field explaining what LEVEL of answer is good enough. The tip must never hint at what answer you're hoping for or bias the user's response. It must be plain informational text — never suggest what the answer should be.
Good tip: "An estimate is enough — e.g. '190 Naukri/LinkedIn and 10 direct.'"
Bad tip: "Tip: if most jobs required more experience than you have, let me know" (this leads the answer).
Leave "tip" empty if the question is already simple enough not to need one.

━━━━━━━━━━━━━━
NEVER DIAGNOSE FROM THE OPENING STATEMENT ALONE
━━━━━━━━━━━━━━
"200 applications, no responses" does NOT mean the CV is the problem. It does not mean anything specific yet. Never converge on a cause until the evidence you've actually collected points there.

Hold multiple explanations open at once and let evidence rule them out. Realistic competing explanations include: application channel, role/experience mismatch, location mismatch, CV-role fit, application quality, or simply that the volume is too new to judge yet. Different users with the same opening sentence can have completely different real causes.

Do NOT let "0 professional experience" or "3 months experience" alone trigger an experience-mismatch diagnosis. A user with 0 professional experience, 1,000+ applications, and many personal projects has NOT given you enough to say experience is the bottleneck — you have not seen what roles they actually targeted or whether those roles required experience at all. Experience level is a FACT, not a HYPOTHESIS you're entitled to act on until you've checked it against the actual job requirements or the CV itself.

When new evidence weakens a hypothesis, say so plainly and move attention elsewhere. Example: if the user says most jobs they applied to were fresher-level roles, that weakens (not eliminates) an experience-mismatch explanation — acknowledge that directly rather than continuing to probe experience as if nothing changed. Never claim a hypothesis is fully ruled out from one data point — only that it currently looks less or more likely.

Avoid overstating what a raw number proves. Do NOT say "200 applications with zero response is a clear signal that something specific is blocking you" — that overstates it. Instead: "200 applications with no response gives us enough reason to investigate, but not enough evidence yet to know what's causing it."

Ask whichever next question would most reduce uncertainty given what's already known:
- If channel split reveals direct vs portal performed differently → investigate why those direct ones worked before touching CV or targeting at all.
- If both channels performed equally poorly → channel is likely not the issue; investigate role/experience fit next.
- If response/interview numbers are actually reasonable for the volume applied → there may not be a serious problem at all; say so honestly.

━━━━━━━━━━━━━━
THE HARD REASONING MODEL — FACT → SIGNAL → HYPOTHESIS → INVESTIGATION → EVIDENCE → CONFIDENCE → DIAGNOSIS → ACTION
━━━━━━━━━━━━━━
This is not prose styling — it is the actual order you must reason in, every turn. The chat is only the interface; the "hypotheses" and "diagnosis" fields you output ARE the intelligence layer, and they persist across turns via JOB SEARCH STATE. Never skip a stage.

1. FACT — only what the user actually told you or what real evidence (CV, job descriptions) showed. Store in facts_update.
2. SIGNAL — a mathematically/logically observable pattern in the facts that does NOT yet explain causality. E.g. "0 offers from 6 reported interviews" or "500 applications, ~2% response." A signal is not a cause.
3. HYPOTHESIS — a possible explanation for the signal. Several can coexist. Track each as an object: { id, label, status, confidence, supportingEvidence, contradictingEvidence, missingEvidence }.
   - status: "untested" | "investigating" | "weak" | "plausible" | "supported" | "confirmed"
   - confidence: "low" | "medium" | "high"
   - Never set status "confirmed" unless the evidence genuinely, specifically supports it — not merely because nothing has disproven it yet.
4. INVESTIGATION — figure out what evidence would actually distinguish between the live hypotheses, and ask for (or infer) exactly that — nothing more, nothing padded.
5. EVIDENCE — only real evidence (what the user reported, what a CV/job-description comparison actually showed) can move a hypothesis forward. Confidence must be proportional to the quality, relevance and completeness of that evidence — never to sample size alone.
6. CONFIDENCE — update every live hypothesis's confidence and status each turn based on what changed. New evidence must be allowed to LOWER a hypothesis's confidence, not just raise it. Do not defend a hypothesis just because you stated it earlier — if disconfirming evidence shows up, say so plainly and downgrade it.
7. DIAGNOSIS — only fill in the "diagnosis" field (bottleneck + confidence + reasoning bullets) once ALL of these are true: (a) at least one hypothesis has reached status "supported" or "confirmed" on its own specific merits, (b) the other live hypotheses have actually been investigated and are now weaker by comparison — not simply unexamined, (c) the reasoning you'd give is about that specific hypothesis's evidence, not "it's the last stage with a bad number." If any of this isn't true yet, leave "diagnosis" completely empty (bottleneck: "") — it is always fine, and often correct, to say "we don't have enough evidence to determine the bottleneck yet."
8. ACTION — only once a diagnosis is genuinely earned, recommend the smallest next action tied specifically to that diagnosis.

HYPOTHESIS BOOKKEEPING: once hypotheses exist, output the FULL current list every turn (not just the ones that changed), carrying forward every hypothesis already named in JOB SEARCH STATE — never silently drop one. Update statuses/confidence in light of this turn's new facts. Only retire a hypothesis when it is genuinely disproven, not merely unexamined.

━━━━━━━━━━━━━━
ABSOLUTE RULES (hard constraints, not suggestions)
━━━━━━━━━━━━━━
- Never label something "the bottleneck" just because it is the latest funnel stage with a poor conversion number.
- "0 offers from N interviews" is a SIGNAL, not an automatic interview-stage bottleneck.
- "N applications, ~0 responses" is a SIGNAL, not an automatic CV bottleneck.
- Never diagnose a CV problem without having actually seen the CV.
- Never claim an ATS/keyword mismatch without comparing the actual CV against representative job descriptions the user provided.
- Never call evidence strength "high" merely because the sample size is large — quality, relevance, completeness, and whether alternative explanations were investigated all matter more than volume.
- Never infer causality from correlation alone.
- "Same CV for every application" is a FACT worth investigating, not evidence the CV is bad.
- "0 offers" is an OUTCOME requiring investigation, not evidence that interview performance was bad.
- "Another candidate was selected" is NOT evidence the user's interview performance was poor — it's largely uninformative about the user specifically; treat it as such.
- "Company ghosted after the interview" is NOT evidence the user failed — the outcome is UNKNOWN, not a rejection. Never convert an unknown outcome into an assumed rejection.
- Do not defend a previously stated hypothesis or diagnosis just because you said it earlier in the conversation — actively look for evidence that would weaken it.
- If evidence genuinely is insufficient, say so directly: "We don't have enough evidence to determine the bottleneck yet." That is a completely acceptable answer — do not manufacture certainty to feel satisfying.

━━━━━━━━━━━━━━
THE FUNNEL — DO NOT COLLAPSE STAGES
━━━━━━━━━━━━━━
Applications → Contacts/Responses → Interviews → Technical/HR/Final rounds → Offers → Accepted/Rejected/Unknown.
Interview outcomes you should recognize as DIFFERENT evidence, not one undifferentiated "rejected" bucket: technical rejection, HR rejection, final-round rejection, another candidate selected, salary mismatch, user withdrew, company cancelled, ghosted/unknown, still pending, offer, accepted.

The moment the user reports having had interviews (however many), do NOT jump to "your bottleneck is interview conversion." Ask ONE compact question covering their 3-5 MOST RECENT interviews (recent ones are cheapest to recall and most informative) — what happened to each. Offer the categories so they can answer fast: rejected, ghosted, still waiting, final round, offer, technical test (pass/fail), HR round (pass/fail), salary/location mismatch, other. Map each outcome to the hypothesis it actually informs: a technical rejection is evidence for a technical-performance hypothesis; an HR rejection is evidence for a communication/fit hypothesis; "selected another candidate" or "ghosted" barely move any hypothesis at all — say so rather than treating them as proof of a weakness. Only narrow toward a specific interview-stage diagnosis once the outcomes actually point somewhere specific; if they're mixed or mostly unknown/pending, say that honestly.

━━━━━━━━━━━━━━
CV — ONLY REASON ABOUT WHAT YOU'VE ACTUALLY SEEN
━━━━━━━━━━━━━━
Before the CV is uploaded, a CV-fit hypothesis can exist and be discussed as a hypothesis, but never as a finding. Only once the user has actually attached/pasted CV content may you analyze the CV itself. Only once representative job descriptions are also available may you make specific CV-to-job or keyword claims. "I use the same CV for every application" is a fact worth investigating, never a stated conclusion.

━━━━━━━━━━━━━━
SAMPLE SIZE ≠ CERTAINTY
━━━━━━━━━━━━━━
A large number attached to a poor outcome (500 applications with almost no response; 6 interviews with 0 offers) justifies "this is worth investigating further." It does NOT by itself justify naming that stage the bottleneck. Confidence comes from the specificity and relevance of the evidence gathered about WHY, not from how big the denominator is.

━━━━━━━━━━━━━━
STATE CONSISTENCY — NEWER, MORE SPECIFIC FACTS WIN
━━━━━━━━━━━━━━
The user's opening phrasing (e.g. "nobody is responding") is a first impression, not a permanent fact. Once more specific numbers arrive later (e.g. "actually about 10 companies contacted me"), treat the newer figures as authoritative for your reasoning and your reply — do not keep leaning on the earlier vague wording as if it still holds. JOB SEARCH STATE always reflects the latest known values; reason from that, not from what was said several turns ago.

━━━━━━━━━━━━━━
RESPONSE LANGUAGE
━━━━━━━━━━━━━━
Prefer: "interesting signal", "worth investigating", "we don't know yet", "possible explanation", "the evidence is limited so far", "this hypothesis is looking less likely", "this hypothesis has real evidence behind it now".
Avoid (unless the evidence threshold above is genuinely met): "this is definitely the bottleneck", "we found the problem", "your CV is the problem", "your interviews are the problem".

━━━━━━━━━━━━━━
RESPONSE MODE — PICK ONE PER TURN
━━━━━━━━━━━━━━
1. CLARIFY — you need one more piece of information before you can reason further.
2. INVESTIGATE — you've spotted something worth checking, but haven't confirmed it.
3. STATE UNCERTAINTY — be explicit that the evidence doesn't yet support a conclusion.
4. DIAGNOSE — you have genuinely earned a diagnosis per the model above; the "diagnosis" field is filled in and feedback_mode is "diagnosis".
5. RECOMMEND — only after a diagnose step, suggest the smallest next action tied to that specific diagnosis.

Do not skip straight to DIAGNOSE or RECOMMEND just because the conversation has gone on for a few turns, or because a number looks bad, or because you already floated a hypothesis earlier — earn it with actual evidence first.

━━━━━━━━━━━━━━
EVIDENCE-FIRST — NEVER INVENT, NEVER OVER-CLAIM
━━━━━━━━━━━━━━
Distinguish internally: FACT (what the user told you), SIGNAL (a pattern the facts suggest), UNCERTAINTY (what's still unclear), RECOMMENDATION (the smallest next useful action — never "apply to 100 more").

Never say a channel or approach is "better" from a tiny sample without naming the uncertainty. Never invent a statistic, a company's hiring status, a salary figure, or a success rate. Never claim a CV was analyzed if none was actually provided. Never assume the CV or ATS formatting is the problem just because responses are low — that is one of several competing hypotheses and needs its own evidence (e.g. seeing the CV, or a channel/role comparison that points there), not an assumption from silence alone. Never tell the user to stop or pause a job-search channel (e.g. "stop applying on portals") until the investigation has actually gathered enough evidence that the channel itself — not something else — is the cause; a small or early sample is not enough to recommend abandoning a channel.

━━━━━━━━━━━━━━
GIVE VALUE EARLY — DON'T INTERROGATE ENDLESSLY
━━━━━━━━━━━━━━
The moment the evidence supports ONE real, honest insight — even a small one — say it. A user should be able to leave after 3-4 exchanges and feel it was worth their time. After giving an insight, ask permission before digging deeper.

━━━━━━━━━━━━━━
RECOMMENDATION STYLE
━━━━━━━━━━━━━━
Never recommend "apply to more jobs" as the fix. The philosophy is: better applications, not more applications.

━━━━━━━━━━━━━━
TONE
━━━━━━━━━━━━━━
Talk like a sharp, honest friend who is actually investigating — not a chatbot reciting tips. Concise. No long walls of text. Same language as the user.

━━━━━━━━━━━━━━
RESPONSE JSON — OUTPUT ONLY THIS, NOTHING ELSE
━━━━━━━━━━━━━━
{
  "reply": "the natural conversational message to show the user",
  "facts_update": {
    "problemStatement": "",
    "roleTarget": "",
    "location": "",
    "experienceLevel": "",
    "applicationsTotal": null,
    "responses": null,
    "interviews": null,
    "channels": { "portals": null, "direct": null },
    "channelResponses": { "portals": null, "direct": null },
    "cvProvided": false,
    "recentInterviewOutcomes": []
  },
  "signal": "the raw, causally-neutral pattern you're currently looking at, e.g. '0 offers from 6 interviews reported so far' — empty string if there's no new signal this turn",
  "hypotheses": [
    {
      "id": "short_snake_case_id",
      "label": "short human label, e.g. 'Technical round performance'",
      "status": "untested",
      "confidence": "low",
      "supportingEvidence": "",
      "contradictingEvidence": "",
      "missingEvidence": ""
    }
  ],
  "insight": "one honest, evidence-scoped insight IF the evidence currently supports one, else empty string",
  "uncertainty": "what's still unclear or why the evidence is limited, else empty string",
  "diagnosis": {
    "bottleneck": "short label of the earned diagnosis — leave as empty string unless it is genuinely earned per the reasoning model above",
    "confidence": "low",
    "reasoning": []
  },
  "recommended_action": "the smallest useful next step, else empty string",
  "next_question": "the single next question to ask, if still gathering, else empty string",
  "tip": "a short hint on HOW to answer well, only if useful, else empty string",
  "ready_to_investigate_deeper": false,
  "feedback_mode": "none"
}

Rules for facts_update: only include a field if the user stated it THIS turn or it changed. Set cvProvided to true only if the user actually attached/pasted CV content this turn. For recentInterviewOutcomes, include the FULL updated list of short outcome entries (e.g. ["Interview 1 (TechCorp): ghosted", "Interview 2: rejected after technical round", "Interview 3: still waiting"]) whenever the user gives or updates this information — each entry should be a short human-readable outcome, not a raw category word alone.

Rules for hypotheses: once any hypothesis exists, output the FULL current array every turn (carry forward ones from JOB SEARCH STATE, update their status/confidence/evidence fields in light of this turn, never silently drop one). Leave the array empty ONLY before any hypothesis is worth naming yet.

Rules for diagnosis: leave bottleneck as "" unless it is genuinely earned (see THE HARD REASONING MODEL above). "reasoning" is a short array of specific evidence bullets for that diagnosis — not generic restatement of the signal.

Rules for feedback_mode — this is what the backend uses to decide what kind of feedback control (if any) to show the user, so answer honestly, not optimistically:
- "none" — an ordinary clarifying/investigating turn. No meaningful signal or diagnosis this turn.
- "signal" — you surfaced a genuine, evidence-based signal or partial insight (the "insight" or "signal" field is non-empty) but have NOT earned a full diagnosis yet.
- "diagnosis" — you have genuinely earned a full diagnosis this turn per the reasoning model (the "diagnosis.bottleneck" field is filled in with real, specific reasoning).
This is a signal to the backend, not a final decision — the backend independently re-verifies the evidence before honoring "diagnosis" or "signal".

CRITICAL: Output ONLY the JSON object. Nothing before or after. No backticks. No markdown.`;

const buildSystem = (language, searchContext = "", name = "") => {
  const tone = TONE[language] || TONE.english;
  const nameCtx = name ? `\nThe user's name is ${name} — use it naturally, not in every message.` : "";

  return `${tone}${nameCtx}
${searchContext}
${JOB_PLATFORMS}
${INVESTIGATION_PROMPT}`;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const callGemini = async (systemPrompt, messages) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error("No Gemini key");
    err.code = "INVALID_API_KEY";
    throw err;
  }

  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: messages.map(m => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
          generationConfig: { maxOutputTokens: 1200, temperature: 0.7 },
        }),
      }
    );
  } catch (networkErr) {
    console.error("[chat] provider failed", { provider: "gemini", status: null, statusText: null, body: null, message: networkErr?.message });
    const err = new Error("Gemini network error");
    err.code = "PROVIDER_TIMEOUT";
    throw err;
  }

  if (!res.ok) {
    let errorBody = "";
    try { errorBody = await res.text(); } catch {}
    console.error("[chat] provider failed", { provider: "gemini", status: res.status, statusText: res.statusText, body: errorBody.slice(0, 500), message: null });

    if (res.status === 429) { const err = new Error("RATE_LIMITED"); err.code = "RATE_LIMIT"; throw err; }
    if (res.status === 408 || res.status === 504) { const err = new Error("TIMEOUT"); err.code = "PROVIDER_TIMEOUT"; throw err; }
    if (res.status === 400 || res.status === 401 || res.status === 403) { const err = new Error(`Gemini auth/request error ${res.status}`); err.code = "INVALID_API_KEY"; throw err; }
    const err = new Error(`Gemini ${res.status}`); err.code = "SERVER_ERROR"; throw err;
  }

  const data = await res.json();
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) {
    const err = new Error("Empty Gemini response");
    err.code = "BAD_PROVIDER_RESPONSE";
    throw err;
  }
  return reply;
};

const callGroq = async (systemPrompt, messages) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) { const err = new Error("No Groq key"); err.code = "INVALID_API_KEY"; throw err; }

  let res;
  try {
    res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map(m => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })),
        ],
        max_tokens: 1200,
        temperature: 0.7,
      }),
    });
  } catch (networkErr) {
    console.error("[chat] provider failed", { provider: "groq", status: null, statusText: null, body: null, message: networkErr?.message });
    const err = new Error("Groq network error");
    err.code = "PROVIDER_TIMEOUT";
    throw err;
  }

  if (!res.ok) {
    let errorBody = "";
    try { errorBody = await res.text(); } catch {}
    console.error("[chat] provider failed", { provider: "groq", status: res.status, statusText: res.statusText, body: errorBody.slice(0, 500), message: null });

    if (res.status === 429) { const err = new Error("RATE_LIMITED"); err.code = "RATE_LIMIT"; throw err; }
    if (res.status === 408 || res.status === 504) { const err = new Error("TIMEOUT"); err.code = "PROVIDER_TIMEOUT"; throw err; }
    if (res.status === 400 || res.status === 401 || res.status === 403) { const err = new Error(`Groq auth/request error ${res.status}`); err.code = "INVALID_API_KEY"; throw err; }
    const err = new Error(`Groq ${res.status}`); err.code = "SERVER_ERROR"; throw err;
  }

  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content;
  if (!reply) {
    const err = new Error("Empty Groq response");
    err.code = "BAD_PROVIDER_RESPONSE";
    throw err;
  }
  return reply;
};

const parseJSON = (text) => {
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    return null;
  }
};

const SAFE_DEFAULTS = {
  reply: "",
  facts_update: {
    problemStatement: "", roleTarget: "", location: "", experienceLevel: "",
    applicationsTotal: null, responses: null, interviews: null,
    channels: { portals: null, direct: null },
    channelResponses: { portals: null, direct: null },
    cvProvided: false,
    recentInterviewOutcomes: [],
  },
  signal: "",
  hypotheses: [],
  insight: "",
  uncertainty: "",
  diagnosis: { bottleneck: "", confidence: "low", reasoning: [] },
  recommended_action: "",
  next_question: "",
  tip: "",
  ready_to_investigate_deeper: false,
  feedback_mode: "none",
};

const VALID_HYPOTHESIS_STATUS = ["untested", "investigating", "weak", "plausible", "supported", "confirmed"];
const VALID_CONFIDENCE = ["low", "medium", "high"];
const VALID_FEEDBACK_MODE = ["none", "signal", "diagnosis"];
const MAX_HYPOTHESES = 6;

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

const sanitizeStructured = (parsed) => {
  if (!parsed || typeof parsed !== "object") return null;
  const merged = {
    ...SAFE_DEFAULTS,
    ...parsed,
    facts_update: { ...SAFE_DEFAULTS.facts_update, ...(parsed.facts_update || {}) },
  };
  merged.facts_update.channels = { ...SAFE_DEFAULTS.facts_update.channels, ...(parsed.facts_update?.channels || {}) };
  merged.facts_update.channelResponses = { ...SAFE_DEFAULTS.facts_update.channelResponses, ...(parsed.facts_update?.channelResponses || {}) };

  merged.hypotheses = Array.isArray(parsed.hypotheses)
    ? parsed.hypotheses.map(sanitizeHypothesis).filter(Boolean).slice(0, MAX_HYPOTHESES)
    : [];
  merged.diagnosis = sanitizeDiagnosis(parsed.diagnosis);
  merged.signal = typeof parsed.signal === "string" ? parsed.signal.slice(0, 300) : "";
  merged.feedback_mode = VALID_FEEDBACK_MODE.includes(parsed.feedback_mode) ? parsed.feedback_mode : "none";

  return merged;
};

const getAiReply = async (systemPrompt, messages) => {
  console.log("[chat] gemini attempt");
  try {
    const rawReply = await callGemini(systemPrompt, messages);
    console.log("[chat] success", { provider: "gemini" });
    return { rawReply, usedFallback: false };
  } catch (geminiErr) {
    console.log("[chat] groq fallback attempt");
    const rawReply = await callGroq(systemPrompt, messages);
    console.log("[chat] success", { provider: "groq" });
    return { rawReply, usedFallback: true };
  }
};

function extractNonEmptyUpdates(factsUpdate) {
  const updates = {};
  if (factsUpdate.problemStatement) updates.problemStatement = factsUpdate.problemStatement;
  if (factsUpdate.roleTarget) updates.roleTarget = factsUpdate.roleTarget;
  if (factsUpdate.location) updates.location = factsUpdate.location;
  if (factsUpdate.experienceLevel) updates.experienceLevel = factsUpdate.experienceLevel;
  if (factsUpdate.applicationsTotal != null) updates.applicationsTotal = factsUpdate.applicationsTotal;
  if (factsUpdate.responses != null) updates.responses = factsUpdate.responses;
  if (factsUpdate.interviews != null) updates.interviews = factsUpdate.interviews;
  if (factsUpdate.cvProvided === true) updates.cvProvided = true;
  if (Array.isArray(factsUpdate.recentInterviewOutcomes) && factsUpdate.recentInterviewOutcomes.length > 0) {
    updates.recentInterviewOutcomes = factsUpdate.recentInterviewOutcomes.slice(0, 5);
  }

  const ch = factsUpdate.channels || {};
  if (ch.portals != null || ch.direct != null) {
    updates.channels = { portals: ch.portals != null ? ch.portals : null, direct: ch.direct != null ? ch.direct : null };
  }

  const chr = factsUpdate.channelResponses || {};
  if (chr.portals != null || chr.direct != null) {
    updates.channelResponses = { portals: chr.portals != null ? chr.portals : null, direct: chr.direct != null ? chr.direct : null };
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

// Evidence strength reflects sample size only — how much data we have,
// not whether a specific diagnosis is correct.
function computeEvidenceStrength(state) {
  const total = state.applicationsTotal;
  if (total == null) return null;
  if (total < 15) return "Low";
  if (total < 50) return "Medium";
  return "High";
}

// Server-side gate: never trust the model's own feedback_mode/diagnosis blindly.
// Require real evidence — some combination of application volume, channel
// data, CV evidence, or a genuinely sufficient set of known interview
// outcomes — before a "diagnosis" is allowed to render at all.
function computeDiagnosisEligibility(state) {
  if (!state) return false;

  const hasVolume = state.applicationsTotal != null && state.applicationsTotal > 0;
  const hasChannelData =
    (state.channels?.portals != null || state.channels?.direct != null) &&
    (state.channelResponses?.portals != null || state.channelResponses?.direct != null);
  const hasCv = state.cvProvided === true;
  const interviewOutcomeCount = Array.isArray(state.recentInterviewOutcomes) ? state.recentInterviewOutcomes.length : 0;
  // "0 offers from 6 interviews" alone is a SIGNAL, not enough for a
  // diagnosis — require that at least a handful of the actual outcomes are
  // known (technical rejection vs. ghosted vs. still-pending are very
  // different evidence) before an interview-stage diagnosis is eligible.
  const hasSufficientInterviewEvidence = interviewOutcomeCount >= 3;
  const hasRoleAndLocation = !!state.roleTarget && !!state.location;

  if (!hasRoleAndLocation) return false;

  const hasBaseEvidence = hasChannelData || hasCv || hasVolume || hasSufficientInterviewEvidence;
  if (!hasBaseEvidence) return false;

  // Hard block: raw interview/offer counts with fewer than 3 known specific
  // outcomes are never, on their own, enough to diagnose an interview-stage
  // bottleneck — regardless of what the model claims.
  const onlyRawInterviewSignal = state.interviews != null && state.interviews > 0 && !hasSufficientInterviewEvidence;
  if (onlyRawInterviewSignal && !hasChannelData && !hasCv) return false;

  return true;
}

// Backend, not the frontend, decides what feedback control (if any) renders.
// The model's own feedback_mode is a claim, not a fact — downgrade it
// whenever the server-verified state doesn't actually back it up.
function computeFeedbackMode(structured, state) {
  const claimed = structured.feedback_mode;

  if (claimed === "diagnosis") {
    const eligible = computeDiagnosisEligibility(state) && !!structured.diagnosis?.bottleneck;
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

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (err) {
      console.error("[chat] body parse failed", err?.message);
      return NextResponse.json(
        { error: true, code: "INVALID_REQUEST", message: "Malformed request." },
        { status: 400 }
      );
    }

    const { messages, profile = {}, userId, action } = body;

    // Handle a direct reset request — does NOT run normal AI processing.
    if (action === "clear_search") {
      if (!userId) {
        return NextResponse.json(
          { error: true, code: "INVALID_REQUEST", message: "userId required to reset." },
          { status: 400 }
        );
      }
      try {
        await resetSearchState(userId);
        console.log("[chat] search state reset", { userId });
        return NextResponse.json({ success: true });
      } catch (err) {
        console.error("[chat] reset failed:", err?.message);
        return NextResponse.json(
          { error: true, code: "SERVER_ERROR", message: "Could not reset. Please try again." },
          { status: 500 }
        );
      }
    }

    console.log("[chat] request start", {
      userId,
      messageCount: messages?.length,
      totalChars: messages?.reduce((sum, m) => sum + (m.content?.length || 0), 0),
    });

    if (!messages?.length) {
      return NextResponse.json(
        { error: true, code: "INVALID_REQUEST", message: "Messages required." },
        { status: 400 }
      );
    }

    const rawLatest = messages.filter(m => m.role === "user").slice(-1)[0]?.content || "";
    const latestMsg = rawLatest.trim().replace(/[<>&"']/g, "");

    if (!latestMsg) {
      return NextResponse.json(
        { error: true, code: "INVALID_REQUEST", message: "Invalid message." },
        { status: 400 }
      );
    }

    const language = detectLanguage(latestMsg);

    let searchState = null;
    let searchContext = "";
    if (userId) {
      try {
        searchState = await ensureSearchState(userId);
        searchContext = buildSearchContext(searchState);
      } catch (memErr) {
        console.error("[chat] search state load failed, continuing without it:", memErr?.message);
      }
    }

    console.log("[chat] search context chars:", searchContext.length);

    const systemPrompt = buildSystem(language, searchContext, profile?.name || "");
    console.log("[chat] system prompt chars:", systemPrompt.length);

    let rawReply;
    let usedFallback = false;
    let lastErrorCode = "SERVER_ERROR";

    try {
      const result = await getAiReply(systemPrompt, messages);
      rawReply = result.rawReply;
      usedFallback = result.usedFallback;
    } catch (firstErr) {
      lastErrorCode = firstErr.code || "SERVER_ERROR";
      if (lastErrorCode === "RATE_LIMIT" || lastErrorCode === "PROVIDER_TIMEOUT") {
        console.log("[chat] transient error, retrying once after 2s:", lastErrorCode);
        await sleep(2000);
        try {
          const retryResult = await getAiReply(systemPrompt, messages);
          rawReply = retryResult.rawReply;
          usedFallback = retryResult.usedFallback;
        } catch (secondErr) {
          lastErrorCode = secondErr.code || "SERVER_ERROR";
          console.error("[chat] retry also failed", { code: lastErrorCode, message: secondErr?.message });
        }
      }
    }

    if (!rawReply) {
      const messagesByCode = {
        RATE_LIMIT: "The AI service is temporarily busy. Please retry in a moment.",
        PROVIDER_TIMEOUT: "The AI service took too long to respond. Please retry.",
        INVALID_API_KEY: "There is a configuration problem with the AI service.",
        BAD_PROVIDER_RESPONSE: "The AI service gave an unexpected response. Please retry.",
        SERVER_ERROR: "The AI service had a problem. Please retry in a moment.",
      };
      return NextResponse.json(
        { error: true, code: lastErrorCode, message: messagesByCode[lastErrorCode] || messagesByCode.SERVER_ERROR },
        { status: lastErrorCode === "RATE_LIMIT" ? 429 : 503 }
      );
    }

    const parsed = parseJSON(rawReply);
    if (!parsed) {
      console.error("[chat] validation error: AI response was not valid JSON. Raw:", rawReply?.slice(0, 300));
      return NextResponse.json(
        { error: true, code: "BAD_PROVIDER_RESPONSE", message: "Could not understand the AI response. Please retry." },
        { status: 502 }
      );
    }

    let structured = sanitizeStructured(parsed);

    let verifiedStats = null;
    if (userId) {
      try {
        const updates = extractNonEmptyUpdates(structured.facts_update);
        if (Object.keys(updates).length > 0) {
          searchState = await updateSearchState(userId, updates);
        }

        verifiedStats = computeVerifiedStats(searchState);
        const evidenceStrength = computeEvidenceStrength(searchState);
        if (verifiedStats) {
          verifiedStats.evidenceStrength = evidenceStrength;
        } else if (evidenceStrength) {
          verifiedStats = { evidenceStrength };
        }

        // Persist hypothesis tracking regardless of feedback_mode, so the
        // reasoning state actually accumulates across turns (this is the
        // "intelligence layer" — not just chat text).
        if (Array.isArray(structured.hypotheses) && structured.hypotheses.length > 0) {
          searchState = await updateSearchState(userId, { hypotheses: structured.hypotheses });
        }

        // Server-side gate — never trust the model's own feedback_mode or
        // diagnosis claim blindly. This can only ever downgrade, never upgrade.
        const finalFeedbackMode = computeFeedbackMode(structured, searchState);
        if (finalFeedbackMode !== structured.feedback_mode) {
          console.log("[chat] feedback_mode downgraded — insufficient server-verified evidence", {
            userId, claimed: structured.feedback_mode, final: finalFeedbackMode,
          });
        }
        structured = { ...structured, feedback_mode: finalFeedbackMode };

        if (finalFeedbackMode === "diagnosis" && structured.diagnosis?.bottleneck) {
          // Only an earned diagnosis is persisted as "the" diagnosis — this is
          // what future turns see as "previously earned diagnosis" and are
          // explicitly told they may revise or retract.
          searchState = await updateSearchState(userId, { diagnosis: structured.diagnosis });
        } else {
          // Never let an unearned diagnosis object reach the client.
          structured = { ...structured, diagnosis: { bottleneck: "", confidence: "low", reasoning: [] } };
        }

        if (structured.insight) {
          await addSearchFact(userId, structured.insight);
        }

        if (structured.recommended_action) {
          await setActiveSearchTask(userId, structured.recommended_action);
        }
      } catch (err) {
        console.error("[chat] search state update failed (non-fatal):", err?.message);
      }
    } else {
      // No userId at all means no persisted evidence to verify against —
      // never allow signal/diagnosis feedback modes without a verifiable state.
      structured = {
        ...structured,
        feedback_mode: "none",
        diagnosis: { bottleneck: "", confidence: "low", reasoning: [] },
      };
    }

    return NextResponse.json({
      structured,
      verified_stats: verifiedStats,
      language,
      engine: usedFallback ? "groq" : "gemini",
    });
  } catch (error) {
    console.error("[chat] full error:", error);
    console.error("[chat] stack:", error instanceof Error ? error.stack : "No stack");
    return NextResponse.json(
      { error: true, code: "SERVER_ERROR", message: error.message || "Server error." },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: "LifePath running — job search conversion intelligence" });
}

