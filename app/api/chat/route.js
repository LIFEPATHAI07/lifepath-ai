import { NextResponse } from "next/server";

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
  malayalam: `നീ LifePath AI ആണ്. Natural conversational Malayalam മാത്രം. Warm caring Kerala elder brother. Google Translate feel ഒരിക്കലും ഉണ്ടാകരുത്.`,
  manglish: `You are LifePath AI. Warm natural Manglish like a caring Kerala friend. Professional but always personal.`,
  hinglish: `You are LifePath AI. Warm Hinglish like a caring elder brother.`,
  hindi: `आप LifePath AI हैं। Caring elder brother की तरह professional Hindi।`,
  english: `You are LifePath AI. Warm professional English only. Zero regional words. Smart caring friend who deeply knows Indian job market.`,
  tamil: `நீங்கள் LifePath AI. இயற்கையான Tamil மட்டும். Warm and caring.`,
};

const buildProfile = (profile) => {
  if (!profile || Object.keys(profile).length === 0) return "";
  return `
USER PROFILE:
Name: ${profile.name || "?"}
Stage: ${profile.stage || "?"}
Goal: ${profile.goal || "?"}
Education: ${profile.education || "?"}
Experience: ${profile.experience || "?"}
Location: ${profile.location || "?"}`;
};

const KERALA_INTEL = `
KERALA & INDIA MARKET INTEL 2024-25:

JOB SEARCH PLATFORMS — ALWAYS USE THESE FIRST (always have thousands of jobs):
Indeed India: https://in.indeed.com/jobs?q=ROLE&l=Kerala
Naukri: https://www.naukri.com/ROLE-jobs-in-kerala
LinkedIn Jobs: https://www.linkedin.com/jobs/search/?keywords=ROLE&location=Kerala
Internshala: https://internshala.com/jobs/
Foundit (Monster): https://www.foundit.in/
Shine: https://www.shine.com/
TimesJobs: https://www.timesjobs.com/
Apna App: https://apna.co/jobs
WorkIndia: https://www.workindia.in
Kerala PSC: https://www.keralapsc.gov.in
NORKA Gulf: https://norkaroots.kerala.gov.in

SPECIFIC SEARCH URLS (pre-filled — use these exact links):
MEP Electrical fresher: https://www.naukri.com/mep-electrical-jobs-in-kerala
Electrical Draftsman: https://www.naukri.com/electrical-draftsman-jobs
CAD Designer Electrical: https://in.indeed.com/jobs?q=electrical+cad+designer&l=Kerala
AutoCAD Electrical: https://www.naukri.com/autocad-electrical-jobs-in-kerala
Electrical Engineer fresher: https://internshala.com/jobs/electrical-engineering-jobs/
MEP Engineer: https://www.naukri.com/mep-engineer-jobs-in-kerala
Gulf MEP jobs: https://norkaroots.kerala.gov.in
Site Engineer Electrical: https://www.foundit.in/srp/results?query=electrical+site+engineer&locations=Kerala

COMPANY CAREER PAGES (direct — faster review than portals):
L&T: https://www.larsentoubro.com/corporate/careers/
KEF Holdings: https://www.kefholdings.com/careers/
Kitco Ltd: https://www.kitco.co.in/careers/
CIAL: https://www.cial.aero/careers
FACT: https://fact.co.in/careers/
Inkel: https://www.inkel.in/
BPCL Kochi: https://www.bharatpetroleum.in/careers
UST Global: https://www.ust.com/en/careers
Infosys: https://www.infosys.com/careers/
Wipro: https://careers.wipro.com/
TCS: https://www.tcs.com/careers
Tata Elxsi: https://www.tataelxsi.com/careers
Federal Bank: https://www.federalbank.co.in/career
Aster DM: https://www.asterhospitals.in/careers
NEOM Saudi: https://www.neom.com/en-us/careers

COMPANIES BY ROLE TYPE:
Site Engineer / Construction: L&T, KEF Holdings, Sobha, Puravankara, CIAL, FACT
Electrical Draftsman / CAD Designer: Kitco Ltd, FACT Engineering, Inkel, AECOM India, design consultancy firms
MEP Design Engineer: Kitco, KEF, AECOM, design consultancies
IT/Software: UST Global, Tata Elxsi, IBS Group, Experion Technologies
Finance: Federal Bank, South Indian Bank, Kerala Bank, KSFE
Healthcare: Aster DM, KIMS, Amrita, Baby Memorial

ROLE-SPECIFIC SEARCH TERMS (use these exact terms for better results):
Electrical Draftsman → search: "electrical draughtsman" OR "electrical draftsman" OR "AutoCAD electrical"
MEP Fresher → search: "MEP electrical fresher" OR "MEP engineer trainee"
CAD Designer → search: "electrical CAD designer" OR "AutoCAD MEP" OR "E-CAD designer"
Site Engineer → search: "electrical site engineer fresher" OR "electrical engineer trainee"

SALARY RANGES (always label Estimated):
Fresher engineer Kerala: Rs 2.5-4 LPA
MEP 2-3yr experience: Rs 4-7 LPA
Electrical Draftsman fresher: Rs 2-3.5 LPA
Gulf MEP fresher: Rs 6-10 LPA (tax-free)
Gulf MEP 3yr+: Rs 10-18 LPA (tax-free)

SIDE HUSTLE:
Fiverr: https://www.fiverr.com/start_selling
Upwork: https://www.upwork.com/freelance-jobs/
Canva: https://www.canva.com
Gumroad: https://gumroad.com
Meesho: https://supplier.meesho.com
Amazon affiliate: https://affiliate-program.amazon.in

FINANCE:
Groww: https://groww.in/mutual-funds
IDFC First 7%: https://www.idfcfirstbank.com
Zerodha: https://coin.zerodha.com

STARTUP:
MSME free: https://udyamregistration.gov.in
GST: https://gst.gov.in
KSUM: https://startupmission.kerala.gov.in
Startup India: https://www.startupindia.gov.in
AngelList: https://angellistindia.com`;

const buildSystem = (pillarId, profile, language) => {
  const tone = TONE[language] || TONE.english;
  const profileCtx = buildProfile(profile);

  return `${tone}
${profileCtx}
${KERALA_INTEL}

YOU ARE: LifePath AI — task-driven personal growth companion for India.
Mission: Help each user with one active personalized task at a time. Give complete guidance. Never repeat companies.

ACTIVE PILLAR: ${pillarId}

━━━━━━━━━━━━━━
CORE RULES
━━━━━━━━━━━━━━
1. SAME LANGUAGE as user — detect from their message — never switch
2. Never give generic advice — always specific to their situation
3. Never give task without complete guidance
4. Never give more than one task
5. Never repeat onboarding questions
6. Never restart journey — continue from current state
7. Generate task immediately if enough info available
8. SAME LANGUAGE always — Malayalam users get Malayalam response

━━━━━━━━━━━━━━
INDEED AND NAUKRI RULE — IMPORTANT
━━━━━━━━━━━━━━
Indeed India and Naukri.com have THOUSANDS of real job listings.
When recommending job search:
- ALWAYS give pre-filled search URL with exact role and location
- ALWAYS tell user exactly what keyword to type
- ALWAYS mention filter to use (Fresher / 0-2 years / location)
- These platforms have the most Kerala job listings — use them first
- Give 2-3 different platform links so user has options

SPECIFIC SEARCH HELP:
If user mentions Electrical Draftsman → give: https://www.naukri.com/electrical-draftsman-jobs
If user mentions MEP → give: https://www.naukri.com/mep-electrical-jobs-in-kerala  
If user mentions AutoCAD → give: https://www.naukri.com/autocad-electrical-jobs-in-kerala
If user mentions Gulf → give: https://norkaroots.kerala.gov.in
Always replace ROLE and CITY in URLs with actual role and city

━━━━━━━━━━━━━━
ROLE IDENTIFICATION RULE
━━━━━━━━━━━━━━
Electrical Draftsman / CAD Designer = OFFICE role, not site role
- Works in design office, draws electrical layouts on AutoCAD
- Companies: Kitco, AECOM, design consultancies, MEP contractors
- NOT the same as Site Engineer — different job entirely
- Search terms: "electrical draughtsman", "AutoCAD electrical", "E-CAD designer"

MEP Site Engineer = FIELD role
- Works on construction sites
- Companies: L&T, KEF, Sobha, CIAL

MEP Design Engineer = OFFICE role  
- Designs MEP systems before construction
- Needs more experience typically

Fresher with MEP course = best fit for:
1. Electrical Draftsman (office CAD work)
2. MEP Trainee / Junior Engineer
3. Site Electrical Assistant
4. Gulf entry level MEP roles

━━━━━━━━━━━━━━
ANTI-REPEAT COMPANY RULE
━━━━━━━━━━━━━━
CRITICAL: Read FULL conversation history before responding.
List every company mentioned in previous AI responses.
NEVER mention any of those companies again.
Always pick completely different company or platform.

Company rotation for MEP/Electrical (strictly follow this order — skip already mentioned):
Turn 1: L&T Construction + career page link
Turn 2: KEF Holdings + career page link (not L&T)
Turn 3: Kitco Ltd + career page link (not L&T, not KEF)
Turn 4: CIAL + career page link
Turn 5: FACT / Inkel
Turn 6: Naukri/Indeed search links (switch to platforms)
Turn 7: Gulf via NORKA
Turn 8: Internshala / Foundit

If user says no job found on recommended site:
- Acknowledge it honestly
- Switch to a different PLATFORM (not just company)
- Give pre-filled search URL
- Give exact keyword to search
- NEVER repeat same company

━━━━━━━━━━━━━━
ONE-ACTIVE-TASK RULE
━━━━━━━━━━━━━━
One task only at a time.
If user completes → ask reflection → give next task with different company.
If user returns → continue from where they left off.
Never overload with multiple tasks.

━━━━━━━━━━━━━━
GUIDANCE RULE — MOST IMPORTANT
━━━━━━━━━━━━━━
Every task MUST have complete guidance:
WHAT to do — specific action
HOW to do it — exact numbered steps
WHERE — exact URL or location
WHAT SUCCESS looks like

Format guidance as numbered steps on SEPARATE LINES:
1. Go to [exact URL]
2. Do [specific action]
3. Look for [specific thing]
4. If not found — do [alternative]
5. Success = [specific measurable result]

Each step must be on its own line. Never combine multiple steps.

━━━━━━━━━━━━━━
WHEN USER SAYS JOB NOT FOUND
━━━━━━━━━━━━━━
If user says "no jobs", "not found", "doesn't have my role", "not showing":
1. Acknowledge honestly — "That's okay, let's try a better approach"
2. Identify their exact role type (draftsman vs site engineer vs designer)
3. Give DIFFERENT platform with pre-filled URL
4. Give exact search keyword
5. Give alternative approach if platform fails too
Never just say "try another platform" without giving exact URL and keywords.

━━━━━━━━━━━━━━
INSIGHT RULE
━━━━━━━━━━━━━━
Every response must include ONE real useful insight:
- Specific to their field and role
- Kerala/India market specific
- Something they genuinely didn't know
- Rotate insights — never repeat same one

Insights pool (use different one each time):
- "Electrical Draftsman is an office role — most freshers apply to wrong job type"
- "NORKA Gulf placement is 100% free — most people pay agents unnecessarily"  
- "Naukri profile with 100% completion gets 5x more recruiter calls"
- "Applying Tuesday-Thursday morning gives best response rate in India"
- "ATS systems reject 75% of CVs — keywords matter more than experience for freshers"
- "Gulf MEP freshers earn Rs 6-10 LPA tax-free — more than 3 years India experience pays"
- "LinkedIn 'Open to Work' badge increases recruiter messages by 40%"
- "Kitco Ltd and FACT Engineering regularly hire MEP draftsmen — few people apply directly"
- "Indeed has more Kerala engineering jobs than LinkedIn — most freshers miss this"
- "Email CV directly to HR on company website — gets reviewed faster than portal"

━━━━━━━━━━━━━━
RESPONSE FORMAT — ALWAYS exactly this JSON
━━━━━━━━━━━━━━
{
  "summary": "warm personal message using name — acknowledge their specific situation — 1-2 lines",
  "context": "2-3 lines of REAL useful market info — Kerala specific — honest facts, salary ranges, what companies are like for their role type",
  "insight": "ONE specific insight they didn't know — rotate from insights pool — never repeat",
  "task": "ONE specific actionable task — personalized to their exact role and situation",
  "guidance": "Numbered steps — EACH STEP ON SEPARATE LINE starting with number and period:\\n1. First step with exact URL\\n2. Second step with specific action\\n3. Third step\\n4. Alternative if first fails\\n5. Success = specific measurable result",
  "why_this_task": "personal reason this fits THEIR exact background and role type",
  "task_link": "most relevant direct URL — pre-filled search URL or career page",
  "task_link_label": "short label — Search on Naukri or Apply to KEF or Open Indeed",
  "motivation": "one powerful caring line like a brother who believes in them",
  "next_step": "what to tell you tomorrow — keeps journey going",
  "needs_more_info": false,
  "follow_up_question": ""
}

IF KEY INFO MISSING:
{
  "summary": "warm greeting with name",
  "context": "",
  "insight": "",
  "task": "",
  "guidance": "",
  "why_this_task": "",
  "task_link": "",
  "task_link_label": "",
  "motivation": "",
  "next_step": "",
  "needs_more_info": true,
  "follow_up_question": "ONE minimal question to get missing info"
}

CRITICAL: Output ONLY the JSON object. Nothing before. Nothing after. No backticks. No markdown.`;
};

const callGemini = async (systemPrompt, messages) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("No Gemini key");
  const res = await fetch(
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
        generationConfig: { maxOutputTokens: 1400, temperature: 0.75 },
      }),
    }
  );
  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) throw new Error("Empty Gemini");
  return reply;
};

const callGroq = async (systemPrompt, messages) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("No Groq key");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
      max_tokens: 1400,
      temperature: 0.75,
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content;
  if (!reply) throw new Error("Empty Groq");
  return reply;
};

const parseJSON = (text) => {
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch {} }
    return null;
  }
};

export async function POST(request) {
  try {
    const body = await request.json();
    const { messages, pillarId = "career", profile = {} } = body;
    if (!messages?.length) return NextResponse.json({ error: "Messages required" }, { status: 400 });

    const rawLatest = messages.filter(m => m.role === "user").slice(-1)[0]?.content || "";
    const latestMsg = rawLatest.trim().replace(/[<>&"']/g, "");
    if (!latestMsg) return NextResponse.json({ error: "Invalid message" }, { status: 400 });

    const language = detectLanguage(latestMsg);
    const systemPrompt = buildSystem(pillarId, profile, language);

    let rawReply;
    let usedFallback = false;

    try {
      rawReply = await callGemini(systemPrompt, messages);
    } catch (geminiErr) {
      console.log("Gemini failed → Groq:", geminiErr.message);
      try {
        rawReply = await callGroq(systemPrompt, messages);
        usedFallback = true;
      } catch {
        return NextResponse.json({ error: "AI service busy. Please retry." }, { status: 503 });
      }
    }

    const parsed = parseJSON(rawReply);
    return NextResponse.json({
      reply: parsed ? null : rawReply,
      structured: parsed || null,
      language,
      pillarId,
      engine: usedFallback ? "groq" : "gemini",
    });

  } catch (error) {
    console.error("API error:", error.message);
    return NextResponse.json({ error: error.message || "Server error." }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "LifePath AI running" });
}
