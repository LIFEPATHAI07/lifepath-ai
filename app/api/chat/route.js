import { NextResponse } from "next/server";
import {
  ensureSearchState,
  getSearchState,
  updateSearchState,
  addSearchFact,
  buildSearchContext,
  setActiveSearchTask,
  completeActiveSearchTask,
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
National Career Service (NCS): https://www.ncs.gov.in
Apprenticeship India: https://www.apprenticeshipindia.gov.in
Kerala Employment Exchange: https://www.eemployment.kerala.gov.in

role-slug / city-slug = lowercase, spaces to hyphens. Build links only when role AND city are both known.`;

const INVESTIGATION_PROMPT = `
YOU ARE: LifePath — a job search conversion investigator.

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
GATHER PROGRESSIVELY, NOT ALL AT ONCE
━━━━━━━━━━━━━━
Ask ONE question at a time. Never a list of questions. Never a form.
Only ask something if the answer would materially change what you investigate or recommend next.
If the JOB SEARCH STATE below already shows a fact, do NOT ask for it again.

Reasonable order (adapt to what the user already said unprompted):
1. What's actually happening — their own words first.
2. Target role.
3. Location.
4. Rough total applications and rough total responses (round numbers are fine — "about 200", not exact).
5. Channel split — roughly how many were through job portals vs direct (company site, walk-in, referral, contact).
6. Responses by channel, if the split reveals something worth checking.

Do not force experience level, salary, or CV upload up front — ask for these only when the investigation actually needs them (e.g. checking an experience-requirement mismatch).

━━━━━━━━━━━━━━
EVIDENCE-FIRST — NEVER INVENT, NEVER OVER-CLAIM
━━━━━━━━━━━━━━
Distinguish clearly in your own reasoning (not necessarily as literal labels in your reply, but the DISCIPLINE must show):
- FACT: what the user actually told you.
- SIGNAL: a pattern the facts suggest.
- UNCERTAINTY: what's still unclear, especially small sample sizes.
- RECOMMENDATION: the smallest next useful action — never "apply to 100 more."

Never say a channel or approach is "better" from a tiny sample without naming the uncertainty. Never invent a statistic, a company's hiring status, a salary figure, or a success rate. If you don't have enough evidence yet, say so plainly and ask the one question that would help most.

━━━━━━━━━━━━━━
GIVE VALUE EARLY — DON'T INTERROGATE ENDLESSLY
━━━━━━━━━━━━━━
The moment the evidence supports ONE real, honest insight — even a small one — say it. Don't keep collecting facts past the point where you already have something useful to say. A user should be able to leave after 3-4 exchanges and feel it was worth their time.
After giving an insight, ask permission before digging deeper: "Want me to look closer at X?" — don't just barrel into more questions.

━━━━━━━━━━━━━━
RECOMMENDATION STYLE
━━━━━━━━━━━━━━
Never recommend "apply to more jobs" as the fix. The philosophy is: better applications, not more applications.
When you do recommend an action, make it the smallest testable next step tied to what the evidence actually showed — not generic advice.

━━━━━━━━━━━━━━
TONE
━━━━━━━━━━━━━━
Talk like a sharp, honest friend who is actually investigating — not a chatbot reciting tips. Concise. No long walls of text. No fake enthusiasm. Same language as the user.

━━━━━━━━━━━━━━
RESPONSE JSON — OUTPUT ONLY THIS, NOTHING ELSE
━━━━━━━━━━━━━━
{
  "reply": "the natural conversational message to show the user — this is what they actually read",
  "facts_update": {
    "problemStatement": "" ,
    "roleTarget": "",
    "location": "",
    "experienceLevel": "",
    "applicationsTotal": null,
    "responses": null,
    "interviews": null,
    "channels": { "portals": null, "direct": null },
    "channelResponses": { "portals": null, "direct": null }
  },
  "insight": "one honest insight IF evidence currently supports one, else empty string",
  "uncertainty": "what's still unclear or why the evidence is limited, if relevant, else empty string",
  "recommended_action": "the smallest useful next step, only if you actually have one to give, else empty string",
  "next_question": "the single next question to ask, if still gathering, else empty string",
  "ready_to_investigate_deeper": false
}

Rules for facts_update: only include a field if the user stated it THIS turn or it changed. Leave everything else as "" or null — the backend merges this with what's already known, so do not restate old facts here, and never guess a number the user didn't give.

Rules for insight vs next_question: these are usually mutually exclusive within one turn — either you have something to say, or you're still asking. It's fine to have both a small insight AND a next question in the same turn if it flows naturally (e.g. "here's what I'm seeing so far — can I also check X?").

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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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
    console.error("[chat] provider failed", {
      provider: "gemini", status: null, statusText: null, body: null,
      message: networkErr?.message,
    });
    const err = new Error("Gemini network error");
    err.code = "PROVIDER_TIMEOUT";
    throw err;
  }

  if (!res.ok) {
    let errorBody = "";
    try { errorBody = await res.text(); } catch {}
    console.error("[chat] provider failed", {
      provider: "gemini", status: res.status, statusText: res.statusText,
      body: errorBody.slice(0, 500), message: null,
    });

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
        model: "llama-3.3-70b-versatile",
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
    console.error("[chat] provider failed", {
      provider: "groq", status: null, statusText: null, body: null,
      message: networkErr?.message,
    });
    const err = new Error("Groq network error");
    err.code = "PROVIDER_TIMEOUT";
    throw err;
  }

  if (!res.ok) {
    let errorBody = "";
    try { errorBody = await res.text(); } catch {}
    console.error("[chat] provider failed", {
      provider: "groq", status: res.status, statusText: res.statusText,
      body: errorBody.slice(0, 500), message: null,
    });

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
  },
  insight: "",
  uncertainty: "",
  recommended_action: "",
  next_question: "",
  ready_to_investigate_deeper: false,
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

  const ch = factsUpdate.channels || {};
  if (ch.portals != null || ch.direct != null) {
    updates.channels = {
      portals: ch.portals != null ? ch.portals : null,
      direct: ch.direct != null ? ch.direct : null,
    };
  }

  const chr = factsUpdate.channelResponses || {};
  if (chr.portals != null || chr.direct != null) {
    updates.channelResponses = {
      portals: chr.portals != null ? chr.portals : null,
      direct: chr.direct != null ? chr.direct : null,
    };
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

    const { messages, profile = {}, userId } = body;

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

    const structured = sanitizeStructured(parsed);

    let verifiedStats = null;
    if (userId) {
      try {
        const updates = extractNonEmptyUpdates(structured.facts_update);
        if (Object.keys(updates).length > 0) {
          searchState = await updateSearchState(userId, updates);
        }

        verifiedStats = computeVerifiedStats(searchState);

        if (structured.insight) {
          await addSearchFact(userId, structured.insight);
        }

        if (structured.recommended_action) {
          await setActiveSearchTask(userId, structured.recommended_action);
        }
      } catch (err) {
        console.error("[chat] search state update failed (non-fatal):", err?.message);
      }
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
