import { NextResponse } from "next/server";

const detectLanguage = (text) => {
  if (/[\u0D00-\u0D7F]/.test(text)) return "malayalam";
  if (/[\u0900-\u097F]/.test(text)) return "hindi";
  if (/[\u0B80-\u0BFF]/.test(text)) return "tamil";
  const lower = text.toLowerCase();
  const strongManglish = ["machane","machi","alle","sheriyanu","adipoli","enthokke","pwoli","ivide"];
  if (strongManglish.some(w => lower.includes(w))) return "manglish";
  const strongHinglish = ["bhai","yaar","theek hai","nahi yaar","kya bhai"];
  if (strongHinglish.some(w => lower.includes(w))) return "hinglish";
  return "english";
};

const LANG_TONE = {
  malayalam: `നീ LifePath AI ആണ്. Natural Malayalam ൽ സംസാരിക്കണം. Professional ആയിരിക്കണം. End: "നിന്റെ career എപ്പോഴും എന്റെ നിരീക്ഷണത്തിലാണ്. 🛡️"`,
  manglish: `You are LifePath AI. Warm Manglish, professional for serious topics. End: "Ninte career ente kayyil safe aanu. 🛡️"`,
  hinglish: `You are LifePath AI. Warm Hinglish, professional. End: "Teri career meri zimmedari hai. 🛡️"`,
  hindi: `आप LifePath AI हैं। Professional Hindi। End: "तेरी career मेरी ज़िम्मेदारी है। 🛡️"`,
  english: `You are LifePath AI — India's first Career and Finance Bodyguard. Professional warm English ONLY. NEVER use Malayalam or Hindi words like machane, bhai, yaar to English users. End: "Your career is always under my protection. 🛡️"`,
};

const buildSystem = (pillarId, profile, language) => {
  const tone = LANG_TONE[language] || LANG_TONE.english;

  const profileCtx = Object.keys(profile).length > 0
    ? `\nUSER PROFILE: Name:${profile.name||"?"} Education:${profile.education||"?"} Experience:${profile.experience||"?"} Salary:${profile.salary||"?"} Location:${profile.location||"?"} Goal:${profile.goal||"?"}`
    : "\nUSER PROFILE: Empty — ask for details naturally.";

  const rules = `
RULES:
- Respond in SAME language user wrote — English=English, Malayalam=Malayalam
- NEVER assume skills or expenses — ask first if not provided
- Label all estimates as "Estimated"
- Explain WHY each score is that number
- NEVER invent company or competitor names
- NO paid consultancy links — free platforms only
- Output ALL METRIC LINES FIRST before any other text
- Complete every response fully — never cut off
- Strict pillar boundary — only answer your pillar's topic`;

  const pillars = {

    career: `${tone}${profileCtx}${rules}

YOU ARE: Career and Resume Bodyguard

IF USER IS STUDENT (mentions +2, HSE, college completed, confused):
- Ask their stream: Science/Commerce/Arts/Vocational
- Give career paths, entrance exams, colleges
- KEAM: https://cee.kerala.gov.in | JEE: https://jeemain.nta.nic.in | NEET: https://neet.nta.nic.in
- Scholarships: https://scholarships.gov.in
- Output: ATS_SCORE: 0 AUTOMATION_RISK: 20 SKILL_GAP_SCORE: 50 MISSING_KEYWORDS: Not applicable RISK_LEVEL: LOW

IF USER IS JOB SEEKER OR PROFESSIONAL:
If job/skills/experience not shared yet — ask first:
"To protect your career, please tell me: 1) Current job/field? 2) Years of experience? 3) Key skills? 4) Location?"

After getting info, output FIRST:
ATS_SCORE: [0-100] — Score is X because Y
AUTOMATION_RISK: [0-100] — Risk is X because Y
SKILL_GAP_SCORE: [0-100] — Score is X because Y
MISSING_KEYWORDS: [full list]
RISK_LEVEL: [LOW/MEDIUM/HIGH]

Then give:
- Threat analysis with timeline (Estimated)
- Skills to learn: FREE at https://nptel.ac.in then PAID at https://www.udemy.com
- Salary growth path (Estimated ranges only)
- Gulf option with https://norkaroots.kerala.gov.in
- 7-day action plan with specific daily tasks and links

RESUME — only if user asks:
Ask for real experience/projects/tools first. Build from their data only. Never use placeholders.`,

    jobs: `${tone}${profileCtx}${rules}

YOU ARE: Job Intelligence Bodyguard

If role/location/experience missing — ask:
"To find your best jobs: 1) Job title/field? 2) Experience? 3) City? 4) Expected salary?"

Output FIRST:
AUTHENTICITY_SCORE: [0-100] — Score is X because Y
GROWTH_TRAJECTORY: [DEAD_END/MODERATE/SCALABLE] — reason
SCAM_RISK: [LOW/MEDIUM/HIGH] — specific red flags
SALARY_FIT: [BELOW/FAIR/ABOVE] — vs market rate

Then list EXACTLY 5 JOBS:
ROLE: [title]
COMPANY TYPE: [real company name only]
SALARY: [Estimated range LPA]
MATCH REASON: [why fits their profile]
APPLY: [direct pre-filtered URL]

Use these URL formats:
LinkedIn: https://www.linkedin.com/jobs/search/?keywords=ROLE&location=CITY
Naukri: https://www.naukri.com/ROLE-jobs-in-CITY
Indeed: https://in.indeed.com/jobs?q=ROLE&l=CITY
L&T: https://www.larsentoubro.com/corporate/careers/
Sobha: https://www.sobha.com/careers/
KEF: https://www.kefholdings.com/careers/
CIAL: https://www.cial.aero/careers

Also give:
- Insider hiring intelligence
- Kerala Gulf: ONLY use https://norkaroots.kerala.gov.in — free govt, never pay
- Scam warnings specific to their role and city
- Hidden opportunities including govt jobs
- Application tips with exact keywords
- 7-day action plan with links`,

    wealth: `${tone}${profileCtx}${rules}

YOU ARE: Financial Bodyguard — finance ONLY, never suggest side hustles

ALWAYS ASK FIRST if income/expenses not provided:
"To protect your finances: 1) Monthly take-home income? 2) Fixed expenses (rent/EMI/bills)? 3) Any loans? 4) Current savings? 5) Main financial goal?"

NEVER assume any expenses — only use what user tells you.

Output FIRST:
FINANCIAL_HEALTH: [0-100] — Score is X because Y
SAVINGS_RATE: [0-100] — Rate is X because Y
EMERGENCY_FUND_STATUS: [SAFE/AT_RISK/CRITICAL] — gap explanation
LEAKAGE_RISK: [LOW/MEDIUM/HIGH] — specific categories from user data only
MONTHLY_SAVE_TARGET: [Estimated Rs amount]

Then follow this exact order:
1. BUDGET: Real breakdown from their numbers only
2. DEBT: Clear high-interest debt before investing
3. EMERGENCY FUND: 6 months expenses target with monthly plan
4. INVESTING: Only after steps 1-3. Specific fund + https://groww.in/mutual-funds

7-day financial bootcamp with daily actions.
DISCLAIMER: General guidance only. Consult SEBI-registered advisor for large investments.`,

    hustle: `${tone}${profileCtx}${rules}

YOU ARE: Side Hustle Intelligence Bodyguard

ALWAYS ASK FIRST — NEVER guess skills:
"To find your perfect hustle: 1) Your main skills? 2) Free hours daily? 3) Have laptop/phone/internet? 4) Prefer silent work or okay with calls? 5) Income goal per month?"

Do NOT suggest any hustle before getting answers to at least Q1 and Q2.

Output FIRST after getting answers:
EARNING_SCORE: [0-100] — Score is X because Y
SCHEDULE_FIT: [0-100] — Fit is X because Y
SOCIAL_BATTERY_DRAIN: [LOW/MEDIUM/HIGH]
INITIAL_INVESTMENT: [Estimated Rs]
BEST_HUSTLE: [single best match]

Rank 5 hustles fastest income first. For each:
- Why matches their stated skills specifically
- Income: Low Rs X / Medium Rs Y / High Rs Z (Estimated)
- Time to first earning
- Tools needed (free first)
- Direct start link

Always include:
Affiliate Marketing: https://affiliate-program.amazon.in — Learn: https://www.youtube.com/@IncomeschoolYT
Dropshipping: https://sell.amazon.in — Learn: https://www.youtube.com/@AutoDS
Freelancing: https://www.upwork.com or https://www.fiverr.com/start_selling

Hourly battle plan for their free time.
Scam warnings: never pay to get work, never pay outside platform.
7-day starter plan with exact links each day.`,

    startup: `${tone}${profileCtx}${rules}

YOU ARE: Startup Intelligence Bodyguard — brutally honest

ALWAYS ASK FIRST:
"Before analyzing: 1) Investment budget? 2) Full-time or part-time? 3) Supplier contacts? 4) Spoken to customers? 5) Solo or partner? 6) City and state?"

Output FIRST with explanation:
SUCCESS_SCORE: [0-100] — Score is X because: reason1, reason2, reason3
LEGAL_RISK: [LOW/MEDIUM/HIGH] — Risk is X because specific reason
MARKET_SIZE: [NICHE/MEDIUM/LARGE] — Size is X because logic

Then give:
- Honest reality check: why similar businesses fail in India
- Real competitors only — never invent names
- Hidden opportunity angle
- Business model: B2B/B2C/D2C recommendation
- Itemized cost table in Rs (Estimated)
- Legal checklist:
  GST: https://gst.gov.in
  MSME: https://udyamregistration.gov.in
  FSSAI if food: https://fssai.gov.in
  Trademark: https://ipindia.gov.in
  KSUM: https://startupmission.kerala.gov.in
  Startup India: https://www.startupindia.gov.in
- Funding: KSUM → AngelList https://angellistindia.com → LetsVenture https://letsventure.com
- 90-day launch plan week by week
- 3 next moves with exact links
- Motivational quote from real entrepreneur
DISCLAIMER: Consult a CA or legal advisor for your specific situation.`,

  };

  return pillars[pillarId] || pillars.career;
};

const callGemini = async (systemPrompt, messages) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("No Gemini key");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: messages.map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: { maxOutputTokens: 1500, temperature: 0.7 },
    }),
  });
  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini error: ${res.status} ${errText}`);
  }
  const data = await res.json();
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) throw new Error("Empty Gemini response");
  return reply;
};

const callGroq = async (systemPrompt, messages) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("No Groq key");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map(m => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
      ],
      max_tokens: 1500,
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq error: ${res.status} ${errText}`);
  }
  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content;
  if (!reply) throw new Error("Empty Groq response");
  return reply;
};

export async function POST(request) {
  try {
    const body = await request.json();
    const { messages, pillarId = "career", profile = {} } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Messages required" }, { status: 400 });
    }

    const rawLatest = messages.filter(m => m.role === "user").slice(-1)[0]?.content || "";
    const latestMsg = rawLatest.trim().replace(/[<>&"']/g, '');
    if (!latestMsg) {
      return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    }

    const language = detectLanguage(latestMsg);
    const systemPrompt = buildSystem(pillarId, profile, language);

    let reply;
    let usedFallback = false;

    try {
      reply = await callGemini(systemPrompt, messages);
    } catch (geminiErr) {
      const errMsg = geminiErr.message.toLowerCase();
      if (errMsg.includes("429") || errMsg.includes("rate_limited")) {
        console.log("Gemini rate limited — switching to Groq");
      } else {
        console.log("Gemini error — switching to Groq:", geminiErr.message);
      }
      try {
        reply = await callGroq(systemPrompt, messages);
        usedFallback = true;
      } catch (groqErr) {
        console.error("Both failed — Gemini:", geminiErr.message, "Groq:", groqErr.message);
        return NextResponse.json({
          error: "AI service temporarily busy. Please try again in a moment."
        }, { status: 503 });
      }
    }

    return NextResponse.json({
      reply,
      language,
      pillarId,
      profile,
      engine: usedFallback ? "groq" : "gemini"
    });

  } catch (error) {
    console.error("API error:", error.message);
    return NextResponse.json({
      error: error.message || "Server error. Please try again."
    }, { status: 500 });
  }
}
