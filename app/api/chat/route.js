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
- If the user reports getting interviews but no offers → the bottleneck is likely at the interview stage, not the application stage. Do not discuss CV or targeting — ask about interview experience instead.
- If response/interview numbers are actually reasonable for the volume applied → there may not be a serious problem at all; say so honestly.

━━━━━━━━━━━━━━
RESPONSE MODE — PICK ONE PER TURN
━━━━━━━━━━━━━━
1. CLARIFY — you need one more piece of information before you can reason further.
2. INVESTIGATE — you've spotted something worth checking, but haven't confirmed it.
3. STATE UNCERTAINTY — be explicit that the evidence doesn't yet support a conclusion.
4. DIAGNOSE — you have enough evidence to name a likely bottleneck, with its actual uncertainty stated.
5. RECOMMEND — only after a diagnose step, suggest the smallest next action tied to that specific diagnosis.

Do not skip straight to DIAGNOSE or RECOMMEND just because the conversation has gone on for a few turns — earn it with actual evidence first.

━━━━━━━━━━━━━━
EVIDENCE-FIRST — NEVER INVENT, NEVER OVER-CLAIM
━━━━━━━━━━━━━━
Distinguish internally: FACT (what the user told you), SIGNAL (a pattern the facts suggest), UNCERTAINTY (what's still unclear), RECOMMENDATION (the smallest next useful action — never "apply to 100 more").

Never say a channel or approach is "better" from a tiny sample without naming the uncertainty. Never invent a statistic, a company's hiring status, a salary figure, or a success rate. Never claim a CV was analyzed if none was actually provided.

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
    "cvProvided": false
  },
  "insight": "one honest insight IF evidence currently supports one, else empty string",
  "uncertainty": "what's still unclear or why the evidence is limited, else empty string",
  "recommended_action": "the smallest useful next step, else empty string",
  "next_question": "the single next question to ask, if still gathering, else empty string",
  "tip": "a short hint on HOW to answer well, only if useful, else empty string",
  "ready_to_investigate_deeper": false,
  "analysis_ready": false
}

Rules for facts_update: only include a field if the user stated it THIS turn or it changed. Set cvProvided to true only if the user actually attached/pasted CV content this turn.

Rules for analysis_ready: set true ONLY when insight contains an actual evidence-backed finding derived from real numbers or evidence the user gave — never for a normal conversational reply or small aside. This is a signal to the backend, not a final decision — the backend independently verifies there is enough real evidence before treating this as true.

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
  },
  insight: "",
  uncertainty: "",
  recommended_action: "",
  next_question: "",
  tip: "",
  ready_to_investigate_deeper: false,
  analysis_ready: false,
};

const sanitizeStructured = (parsed) => {
  if (!parsed || typeof parsed !== "object") return null;
  const merged = {
    ...SAFE_DEFAULTS,
    ...parsed,
    facts_update: { ...SAFE_DEFAULTS.facts_update, ...(parsed.facts_update || {}) },
  };
  merged.facts_update.channels = { ...SAFE_DEFAULTS.facts_update.channels, ...(parsed.facts_update?.channels || {}) };
  merged.facts_update.channelResponses = { ...SAFE_DEFAULTS.facts_update.channelResponses, ...(parsed.facts_update?.channelResponses || {}) };
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

// Server-side gate: never trust the model's own analysis_ready blindly.
// Require real evidence — some combination of application volume, channel
// data, or CV/job evidence — before allowing analysis mode to render.
function hasEnoughEvidenceForAnalysis(state) {
  if (!state) return false;

  const hasVolume = state.applicationsTotal != null && state.applicationsTotal > 0;
  const hasChannelData =
    (state.channels?.portals != null || state.channels?.direct != null) &&
    (state.channelResponses?.portals != null || state.channelResponses?.direct != null);
  const hasCv = state.cvProvided === true;
  const hasRoleAndLocation = !!state.roleTarget && !!state.location;

  // Require basic context (role + location) AND at least one real evidence
  // dimension (channel comparison, CV, or a stated application volume) —
  // never just the opening complaint alone.
  return hasRoleAndLocation && (hasChannelData || hasCv || hasVolume);
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

        // Server-side gate — never trust the model's analysis_ready alone.
        if (structured.analysis_ready === true && !hasEnoughEvidenceForAnalysis(searchState)) {
          console.log("[chat] analysis_ready downgraded — insufficient server-verified evidence", { userId });
          structured = { ...structured, analysis_ready: false };
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
    } else if (structured.analysis_ready === true) {
      // No userId at all means no persisted evidence to verify against —
      // never allow analysis mode without a verifiable state.
      structured = { ...structured, analysis_ready: false };
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

