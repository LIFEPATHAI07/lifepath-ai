import { NextResponse } from "next/server";

const PROVIDER_TIMEOUT_MS = 25000;
const RETRY_DELAY_MS = 2000;

const detectLanguage = (text) => {
  if (/[\u0D00-\u0D7F]/.test(text)) return "malayalam";
  if (/[\u0900-\u097F]/.test(text)) return "hindi";
  if (/[\u0B80-\u0BFF]/.test(text)) return "tamil";

  const lower = text.toLowerCase();
  const manglish = [
    "machane", "machi", "alle", "sheriyanu", "adipoli",
    "enthokke", "pwoli", "ivide", "chetta", "appo", "pinne", "eda",
  ];

  if (manglish.some((word) => lower.includes(word))) return "manglish";

  const hinglish = [
    "bhai", "yaar", "theek hai", "nahi yaar", "kya bhai", "bol bhai",
  ];

  if (hinglish.some((word) => lower.includes(word))) return "hinglish";

  return "english";
};

const TONE = {
  malayalam: "നീ LifePath AI ആണ്. Natural conversational Malayalam മാത്രം. Warm Kerala elder brother. Google Translate feel ഒരിക്കലും ഉണ്ടാകരുത്.",
  manglish: "You are LifePath AI. Warm Manglish like a caring Kerala friend.",
  hinglish: "You are LifePath AI. Warm Hinglish like a caring elder brother.",
  hindi: "आप LifePath AI हैं। Caring elder brother की तरह Hindi।",
  english: "You are LifePath AI. Warm professional English only. Smart caring friend who knows Indian market deeply.",
  tamil: "நீங்கள் LifePath AI. இயற்கையான Tamil மட்டும். Warm and caring.",
};

const buildProfile = (profile) => {
  if (!profile || Object.keys(profile).length === 0) return "";

  return `
USER PROFILE (already known — do not ask for this again, use it directly):
Name: ${profile.name || "?"}
Stage: ${profile.stage || "?"}
Goal: ${profile.goal || "?"}
Selected Goal: ${profile.selectedGoal || "?"}
Education: ${profile.education || "?"}
Experience: ${profile.experience || "?"}
Skills: ${profile.skills || "?"}
Location: ${profile.location || "?"}
Last Task: ${profile.lastTask || "?"}`;
};

const MARKET_INTEL = `
KERALA & INDIA MARKET:

JOB PLATFORMS:
Naukri: https://www.naukri.com
Indeed India: https://in.indeed.com
LinkedIn Jobs: https://www.linkedin.com/jobs/
Internshala: https://internshala.com/jobs/
Foundit: https://www.foundit.in/
Kerala PSC: https://www.keralapsc.gov.in
NORKA Gulf: https://norkaroots.kerala.gov.in
National Career Service (NCS): https://www.ncs.gov.in
Apprenticeship India: https://www.apprenticeshipindia.gov.in
Kerala Employment Exchange: https://www.eemployment.kerala.gov.in

SEARCH LINK PATTERNS — build using user's exact role and one city:
Naukri: https://www.naukri.com/{role-slug}-jobs-in-{city-slug}
LinkedIn: https://www.linkedin.com/jobs/search/?keywords={role}&location={city}
Indeed: https://in.indeed.com/jobs?q={role}&l={city}
Foundit: https://www.foundit.in/srp/results?query={role}&locations={city}
Internshala: https://internshala.com/jobs/{role-slug}-jobs-in-{city-slug}/

COMPANY CAREER PAGES — UNVERIFIED, optional extra only, never "apply here":
L&T: https://www.larsentoubro.com/corporate/careers/
KEF Holdings: https://www.kefholdings.com/careers/
Kitco Ltd: https://www.kitco.co.in/careers/
CIAL: https://www.cial.aero/careers
FACT: https://fact.co.in/careers/
UST Global: https://www.ust.com/en/careers
Tata Elxsi: https://www.tataelxsi.com/careers
Federal Bank: https://www.federalbank.co.in/career
Aster DM: https://www.asterhospitals.in/careers
NEOM Saudi: https://www.neom.com/en-us/careers
These are static links only — never confirmed vacancies. Never say a company is hiring.

FINANCE:
Groww SIP: https://groww.in/mutual-funds
IDFC First: https://www.idfcfirstbank.com
Zerodha: https://coin.zerodha.com

SIDE HUSTLE:
Meesho: https://supplier.meesho.com
Fiverr: https://www.fiverr.com/start_selling
Upwork: https://www.upwork.com/freelance-jobs/
Canva: https://www.canva.com

STARTUP:
MSME free: https://udyamregistration.gov.in
KSUM: https://startupmission.kerala.gov.in
GST: https://gst.gov.in
Startup India: https://www.startupindia.gov.in`;

const PILLAR_ADDONS = {
  career: `
CAREER GUARD PILLAR — STRICT SCOPE:
ONLY handles career stability, career direction, career growth, skill gaps, career switching, and AI risk.

HARD REDIRECT FIRST:
Job search / no job / applying for jobs → redirect to Job Finder.
CV / resume → redirect to CV Builder.
Saving / investing → redirect to Wealth Guard.
Extra income / freelancing → redirect to Side Hustle.
Business idea / startup → redirect to Startup Validator.

MINIMUM CONTEXT: current role or field + specific worry.
If missing, ask only one question. Never give a task before both are known.
TASKS: LinkedIn improvement, skill-gap mapping, learning plan, career path planning, automation-risk check.
Never give job application, resume, or portal-search tasks.`,

  jobs: `
JOB FINDER PILLAR — STRICT SCOPE:
ONLY handles job searching, freshers, changing companies, applying, follow-ups, and interview preparation.

HARD REDIRECT FIRST:
CV / resume help → CV Builder.
Career confusion → Career Guard.
Saving money → Wealth Guard.
Side income → Side Hustle.
Business idea → Startup Validator.

CONTEXT GATE — HIGHEST PRIORITY:
Before any task, all three must be known:
1. Exact target role
2. One priority city
3. Fresher or experience level

Ask exactly one question at a time:
Role missing → "What role are you looking for?"
Location missing → "Which city do you want to work in?"
Status missing → "Are you a fresher or do you have experience?"

When context is missing: no task, no platform, no company, no link.
After all three are known: give exactly one task using the user's exact role and city.
Never claim a company is hiring unless verified.

CHANNEL ROTATION:
Naukri → LinkedIn Jobs → Indeed India → Foundit/Internshala → NCS → Apprenticeship India → Kerala Employment Exchange.

If applied but no response: follow up only after 3–5 working days through the official channel.
If no openings: move to next unused channel and suggest related titles.
If no jobs in city: ask permission before widening location.`,

  cv: `
CV BUILDER PILLAR — STRICT SCOPE:
ONLY handles CV building, CV improvement, ATS keywords, formatting, summary, and bullet points.

HARD REDIRECT FIRST:
Job search → Job Finder.
Career confusion → Career Guard.
Saving → Wealth Guard.
Side income → Side Hustle.
Business idea → Startup Validator.

MINIMUM CONTEXT:
1. Target job role
2. Existing CV or from scratch
3. What feels weak or missing

If missing, ask one question only. No task until all are known.
When user provides a job description, extract 8–10 keywords and say exactly where each belongs in the CV.`,

  wealth: `
WEALTH GUARD PILLAR — STRICT SCOPE:
ONLY handles expenses, savings, emergency fund, debt, and basic investing after savings are stable.

HARD REDIRECT FIRST:
Side income → Side Hustle.
Job search → Job Finder.
Business idea → Startup Validator.
CV → CV Builder.
Career confusion → Career Guard.

MINIMUM CONTEXT:
1. Monthly income
2. Biggest money worry
3. Savings status

Ask one question only when context is missing. No task until all are known.
Order: expenses → leaks → emergency fund → savings habit → investing.
Never suggest investing to someone with no savings.`,

  hustle: `
SIDE HUSTLE PILLAR — STRICT SCOPE:
ONLY handles extra income alongside work/study, freelancing, and selling existing skills.

HARD REDIRECT FIRST:
Startup/business → Startup Validator.
Full-time job change → Job Finder.
Saving → Wealth Guard.
CV → CV Builder.
Career confusion → Career Guard.

CONTEXT GATE:
Before any task, all three must be known:
1. Specific skills
2. Free hours daily
3. Fast money or long-term income preference

Ask exactly one missing question only.
No platform or task before all three are known.
Canva/design → local business Instagram content.
Video editing → Reels editing.
Writing → content writing.
AutoCAD/coding → Fiverr/Upwork.
Fast money → local service using existing skill.
Long-term → portfolio and recurring clients.`,

  startup: `
STARTUP VALIDATOR PILLAR — STRICT SCOPE:
ONLY handles business idea validation, customer discovery, willingness to pay, competitor scan, MVP, and grants research.

HARD REDIRECT FIRST:
Side income → Side Hustle.
Job search → Job Finder.
Saving → Wealth Guard.
CV → CV Builder.
Career confusion → Career Guard.

MINIMUM CONTEXT:
1. Exact idea
2. Who it helps
3. Current stage

Ask one question only when context is missing.
Order: customer discovery → problem validation → willingness to pay → competitor scan → MVP → registration/legal.
Never start with registration.
Customer discovery should include who to speak with, 3–4 questions, at least 5 people, and what to look for.`,
};

const buildSystem = (pillarId, profile, language) => {
  const tone = TONE[language] || TONE.english;
  const profileCtx = buildProfile(profile);
  const pillarAddon = PILLAR_ADDONS[pillarId] || PILLAR_ADDONS.career;

  return `${tone}
${profileCtx}
${MARKET_INTEL}
${pillarAddon}

YOU ARE: LifePath AI — task-driven personal growth companion for India.
ACTIVE PILLAR: ${pillarId}

CORE RULES:
1. Reply in the same language as the user.
2. Keep it short and clean.
3. Give only one task at a time.
4. Check hard redirects before collecting context.
5. Check USER PROFILE before asking anything.
6. Never repeat a question already answered.
7. Never invent jobs, hiring companies, salaries, market demand, contacts, or opportunities.
8. Never claim a company is hiring unless verified.
9. Explain why the task matters for this user.
10. Always add help_hint.

UNDERSTAND FIRST:
Do not give a task until minimum context for the active pillar is known.
When context is missing, ask one question only and stop.

AFTER COMPLETION:
If user says done/completed/applied/finished, say one warm line and ask:
"Tell me how it went — what happened?"
Do not give the next task until they reply.

GUIDANCE FORMAT:
how_to_do must use:
Step 1: [action]
Step 2: [action]
Step 3: [action]
Step 4: [if needed]

OUTPUT ONLY VALID JSON. No markdown. No backticks. No text before or after.

TASK READY JSON:
{
  "summary": "one warm line using name",
  "insight": "one short general guidance",
  "task": "ONE clear task",
  "how_to_do": "Step 1: ...\\nStep 2: ...\\nStep 3: ...",
  "what_to_do": "exactly what to do",
  "where_to_do": "exact URL or place",
  "success": "Success = one measurable result",
  "why_this_task": "one short personal reason",
  "task_link": "direct URL",
  "task_link_label": "short label",
  "motivation": "one short caring line",
  "next_step": "what to tell me next",
  "help_hint": "💡 Tip: To get better help, try saying:\\n→ example 1\\n→ example 2",
  "needs_more_info": false,
  "follow_up_question": ""
}

CONTEXT MISSING OR WRONG PILLAR JSON:
{
  "summary": "one warm line using name",
  "insight": "",
  "task": "",
  "how_to_do": "",
  "what_to_do": "",
  "where_to_do": "",
  "success": "",
  "why_this_task": "",
  "task_link": "",
  "task_link_label": "",
  "motivation": "",
  "next_step": "",
  "help_hint": "💡 Tip: To get better help, try saying:\\n→ example 1\\n→ example 2",
  "needs_more_info": true,
  "follow_up_question": "ONE question or warm redirect"
}`;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const makeError = (message, code) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const fetchWithTimeout = async (url, options, timeoutMs = PROVIDER_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw makeError("Provider request timed out", "PROVIDER_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const logProviderFailure = ({ provider, status, statusText, body, message }) => {
  console.error("[chat] provider failed", {
    provider,
    status: status ?? null,
    statusText: statusText ?? null,
    body: body ?? null,
    message: message ?? null,
  });
};

const getProviderErrorCode = (status) => {
  if (status === 429) return "RATE_LIMIT";
  if (status === 408 || status === 504) return "PROVIDER_TIMEOUT";
  if (status === 400 || status === 401 || status === 403) return "INVALID_API_KEY";
  return "SERVER_ERROR";
};

const callGemini = async (systemPrompt, messages) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw makeError("No Gemini API key configured", "INVALID_API_KEY");
  }

  let response;

  try {
    response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: messages.map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: String(message.content || "") }],
          })),
          generationConfig: {
            maxOutputTokens: 1200,
            temperature: 0.7,
          },
        }),
      }
    );
  } catch (error) {
    const code = error?.code || "PROVIDER_TIMEOUT";

    logProviderFailure({
      provider: "gemini",
      status: null,
      statusText: null,
      body: null,
      message: error?.message,
    });

    throw makeError(error?.message || "Gemini network error", code);
  }

  if (!response.ok) {
    let errorBody = "";

    try {
      errorBody = await response.text();
    } catch {}

    logProviderFailure({
      provider: "gemini",
      status: response.status,
      statusText: response.statusText,
      body: errorBody.slice(0, 500),
      message: null,
    });

    throw makeError(
      `Gemini request failed with ${response.status}`,
      getProviderErrorCode(response.status)
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw makeError("Gemini returned invalid JSON", "BAD_PROVIDER_RESPONSE");
  }

  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!reply || typeof reply !== "string") {
    logProviderFailure({
      provider: "gemini",
      status: response.status,
      statusText: response.statusText,
      body: JSON.stringify(data).slice(0, 500),
      message: "Empty reply",
    });

    throw makeError("Empty Gemini response", "BAD_PROVIDER_RESPONSE");
  }

  return reply;
};

const callGroq = async (systemPrompt, messages) => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw makeError("No Groq API key configured", "INVALID_API_KEY");
  }

  let response;

  try {
    response = await fetchWithTimeout(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages.map((message) => ({
              role: message.role === "assistant" ? "assistant" : "user",
              content: String(message.content || ""),
            })),
          ],
          max_tokens: 1200,
          temperature: 0.7,
        }),
      }
    );
  } catch (error) {
    const code = error?.code || "PROVIDER_TIMEOUT";

    logProviderFailure({
      provider: "groq",
      status: null,
      statusText: null,
      body: null,
      message: error?.message,
    });

    throw makeError(error?.message || "Groq network error", code);
  }

  if (!response.ok) {
    let errorBody = "";

    try {
      errorBody = await response.text();
    } catch {}

    logProviderFailure({
      provider: "groq",
      status: response.status,
      statusText: response.statusText,
      body: errorBody.slice(0, 500),
      message: null,
    });

    throw makeError(
      `Groq request failed with ${response.status}`,
      getProviderErrorCode(response.status)
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw makeError("Groq returned invalid JSON", "BAD_PROVIDER_RESPONSE");
  }

  const reply = data?.choices?.[0]?.message?.content;

  if (!reply || typeof reply !== "string") {
    logProviderFailure({
      provider: "groq",
      status: response.status,
      statusText: response.statusText,
      body: JSON.stringify(data).slice(0, 500),
      message: "Empty reply",
    });

    throw makeError("Empty Groq response", "BAD_PROVIDER_RESPONSE");
  }

  return reply;
};

const isTransientError = (error) => {
  return error?.code === "RATE_LIMIT" || error?.code === "PROVIDER_TIMEOUT";
};

const getAiReply = async (systemPrompt, messages) => {
  console.log("[chat] gemini attempt");

  try {
    const rawReply = await callGemini(systemPrompt, messages);

    console.log("[chat] success", { provider: "gemini" });

    return {
      rawReply,
      usedFallback: false,
    };
  } catch (geminiError) {
    console.error("[chat] gemini failed before fallback", {
      code: geminiError?.code,
      message: geminiError?.message,
    });

    console.log("[chat] groq fallback attempt");

    try {
      const rawReply = await callGroq(systemPrompt, messages);

      console.log("[chat] success", { provider: "groq" });

      return {
        rawReply,
        usedFallback: true,
      };
    } catch (groqError) {
      console.error("[chat] groq fallback failed", {
        code: groqError?.code,
        message: groqError?.message,
      });

      // Preserve Gemini's transient reason so POST performs one retry.
      if (isTransientError(geminiError)) {
        throw geminiError;
      }

      throw groqError;
    }
  }
};

const parseJSON = (text) => {
  if (!text || typeof text !== "string") return null;

  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    const match = text.match(/\{[\s\S]*\}/);

    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
};

const SAFE_DEFAULTS = {
  summary: "",
  insight: "",
  task: "",
  how_to_do: "",
  what_to_do: "",
  where_to_do: "",
  success: "",
  why_this_task: "",
  task_link: "",
  task_link_label: "",
  motivation: "",
  next_step: "",
  help_hint: "",
  needs_more_info: true,
  follow_up_question: "",
};

const isValidUrl = (value) => {
  if (!value || typeof value !== "string") return false;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const sanitizeStructured = (structured) => {
  if (!structured || typeof structured !== "object") return null;

  const merged = {
    ...SAFE_DEFAULTS,
    ...structured,
  };

  merged.needs_more_info = merged.needs_more_info === true;

  if (merged.needs_more_info) {
    merged.insight = "";
    merged.task = "";
    merged.how_to_do = "";
    merged.what_to_do = "";
    merged.where_to_do = "";
    merged.success = "";
    merged.why_this_task = "";
    merged.task_link = "";
    merged.task_link_label = "";
    merged.motivation = "";
    merged.next_step = "";
  }

  if (!merged.needs_more_info && merged.task_link && !isValidUrl(merged.task_link)) {
    merged.task_link = "";
    merged.task_link_label = "";
  }

  return merged;
};

const getErrorMessage = (code) => {
  const messages = {
    RATE_LIMIT: "The AI service is temporarily busy. Please retry in a moment.",
    PROVIDER_TIMEOUT: "The AI service took too long to respond. Please retry.",
    INVALID_API_KEY: "There is a configuration problem with the AI service.",
    BAD_PROVIDER_RESPONSE: "The AI service gave an unexpected response. Please retry.",
    SERVER_ERROR: "The AI service had a problem. Please retry in a moment.",
  };

  return messages[code] || messages.SERVER_ERROR;
};

export async function POST(request) {
  try {
    const body = await request.json();
    const { messages, pillarId = "career", profile = {} } = body;

    console.log("[chat] request start", {
      pillarId,
      messageCount: messages?.length,
      totalChars: messages?.reduce(
        (sum, message) => sum + (message?.content?.length || 0),
        0
      ),
    });

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        {
          error: true,
          code: "INVALID_REQUEST",
          message: "Messages required.",
        },
        { status: 400 }
      );
    }

    const rawLatest =
      messages.filter((message) => message?.role === "user").slice(-1)[0]
        ?.content || "";

    const latestMsg = String(rawLatest)
      .trim()
      .replace(/[<>&"']/g, "");

    if (!latestMsg) {
      return NextResponse.json(
        {
          error: true,
          code: "INVALID_REQUEST",
          message: "Invalid message.",
        },
        { status: 400 }
      );
    }

    const language = detectLanguage(latestMsg);
    const systemPrompt = buildSystem(pillarId, profile, language);

    console.log("[chat] system prompt chars:", systemPrompt.length);

    let rawReply = null;
    let usedFallback = false;
    let lastErrorCode = "SERVER_ERROR";

    try {
      const result = await getAiReply(systemPrompt, messages);

      rawReply = result.rawReply;
      usedFallback = result.usedFallback;
    } catch (firstError) {
      lastErrorCode = firstError?.code || "SERVER_ERROR";

      if (isTransientError(firstError)) {
        console.log(
          "[chat] transient error, retrying once after 2s:",
          lastErrorCode
        );

        await sleep(RETRY_DELAY_MS);

        try {
          const retryResult = await getAiReply(systemPrompt, messages);

          rawReply = retryResult.rawReply;
          usedFallback = retryResult.usedFallback;
        } catch (secondError) {
          lastErrorCode = secondError?.code || "SERVER_ERROR";

          console.error("[chat] retry also failed", {
            code: lastErrorCode,
            message: secondError?.message,
          });
        }
      }
    }

    if (!rawReply) {
      return NextResponse.json(
        {
          error: true,
          code: lastErrorCode,
          message: getErrorMessage(lastErrorCode),
        },
        {
          status: lastErrorCode === "RATE_LIMIT" ? 429 : 503,
        }
      );
    }

    const parsed = parseJSON(rawReply);

    if (!parsed) {
      console.error(
        "[chat] validation error: AI response was not valid JSON. Raw:",
        rawReply.slice(0, 300)
      );

      return NextResponse.json(
        {
          error: true,
          code: "BAD_PROVIDER_RESPONSE",
          message: "Could not understand the AI response. Please retry.",
        },
        { status: 502 }
      );
    }

    const structured = sanitizeStructured(parsed);

    if (!structured) {
      return NextResponse.json(
        {
          error: true,
          code: "BAD_PROVIDER_RESPONSE",
          message: "Could not understand the AI response. Please retry.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      reply: null,
      structured,
      language,
      pillarId,
      engine: usedFallback ? "groq" : "gemini",
    });
  } catch (error) {
    console.error("[chat] full error:", error);
    console.error(
      "[chat] stack:",
      error instanceof Error ? error.stack : "No stack"
    );

    return NextResponse.json(
      {
        error: true,
        code: "SERVER_ERROR",
        message: error?.message || "Server error.",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "LifePath AI running",
  });
}
