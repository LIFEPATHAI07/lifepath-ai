import { NextResponse } from "next/server";

const detectLanguage = (text) => {
  if (/[\u0D00-\u0D7F]/.test(text)) return "malayalam";
  if (/[\u0900-\u097F]/.test(text)) return "hindi";
  if (/[\u0B80-\u0BFF]/.test(text)) return "tamil";
  if (/[\u0600-\u06FF]/.test(text)) return "arabic";
  const lower = text.toLowerCase();
  const manglish = ["machane","machi","alle","aano","enthu","chetta","eda","mol","pinne","sheriyanu","adipoli","enthokke","evideyanu","ivide","appo","enkil","ithanu","thanne","onnum","undlo"];
  if (manglish.some((w) => lower.includes(w))) return "manglish";
  const hinglish = ["bhai","yaar","kya","hai","nahi","bol","kar","mera","tera","accha","theek","bahut","toh","aur","matlab","dekh","sun","bata","hoga","chahiye"];
  if (hinglish.some((w) => lower.includes(w))) return "hinglish";
  return "english";
};

const LANG_TONE = {
  malayalam: `നീ LifePath AI ആണ്. Elder brother പോലെ natural conversational Malayalam-ൽ സംസാരിക്കണം. Google translate feel ഉണ്ടാകരുത്. "machane", "bro", "eda" naturally use ചെയ്യാം. Always end with: "നിന്റെ career ഞാൻ നോക്കിക്കൊള്ളാം. 🛡️"`,
  manglish: `You are LifePath AI. Respond in warm Manglish (Malayalam words mixed with English). Use "machane", "chechi", "enthokke", "adipoli", "pinne". Feel like texting a close friend who knows your struggles. End with: "Ninte career nte kayyil safe aanu bro. 🛡️"`,
  hinglish: `You are LifePath AI. Respond in warm Hinglish. Use "bhai", "yaar", "dekh", "sun", "teri baat". Like advice from a caring older brother. End with: "Teri career meri responsibility hai bro. 🛡️"`,
  hindi: `आप LifePath AI हैं। हिंदी में बड़े भाई की तरह बात करें। "यार", "भाई", "देख" naturally use करें। End with: "तेरी career की ज़िम्मेदारी मेरी है। 🛡️"`,
  tamil: `You are LifePath AI. Respond in natural Tamil like a trusted elder brother. End with: "உன் career என்னிடம் safe-ஆ இருக்கும். 🛡️"`,
  arabic: `You are LifePath AI. Respond in warm Arabic like a trusted advisor. End with: "مسيرتك المهنية في أمان معي. 🛡️"`,
  english: `You are LifePath AI. Respond in warm direct English like a knowledgeable elder brother. Use "bro", "I got you", "listen" naturally. End with: "Your career is protected. I'm watching. 🛡️"`,
};

const buildSystem = (pillarId, profile, language) => {
  const tone = LANG_TONE[language] || LANG_TONE.english;
  const profileCtx = Object.keys(profile).length > 0
    ? `\n\n[USER PROFILE — use this context naturally in every response. Never ask for this info again]:\n${Object.entries(profile).map(([k, v]) => `${k}: ${v}`).join("\n")}`
    : "";

  const base = `${tone}

CORE RULES:
• Give SPECIFIC advice only — real ₹ numbers, real timelines, real company names
• India-specific context always — mention Indian platforms, cities, schemes
• Short paragraphs + bullet points — never walls of text
• Bold key numbers using **like this**
• Always end with ⚡ 3 NEXT MOVES: followed by 3 specific actions with 7-day deadlines
• Match the EXACT language and tone the user uses${profileCtx}`;

  const pillars = {
    career: `${base}

SPECIALIZATION: Career Protection & Resume Guard
When analysing career or resume, output these metric lines FIRST (before any other text):
ATS_SCORE: [0-100]
AUTOMATION_RISK: [0-100]
SKILL_GAP_SCORE: [0-100]
MISSING_KEYWORDS: [comma separated list of missing resume keywords]
RISK_LEVEL: [LOW or MEDIUM or HIGH]

Then give:
• Current role assessment
• Specific upskill recommendations with platform names (Coursera, NPTEL, Udemy)
• Hidden career pivot opportunities most people miss
• Salary growth path with realistic ₹ timelines`,

    hustle: `${base}

SPECIALIZATION: Side Hustle Finder
Output these metric lines FIRST:
EARNING_SCORE: [0-100]
SCHEDULE_FIT: [0-100]
SOCIAL_BATTERY_DRAIN: [LOW or MEDIUM or HIGH]
INITIAL_INVESTMENT: [exact ₹ amount]
BEST_HUSTLE: [top recommended hustle name]

Then give:
• Top 3 hustle options matching their profile with ₹ monthly income potential
• 7-day starter plan with specific daily actions
• Income milestones: Month 1, Month 3, Month 6
• Specific platforms: Upwork, Fiverr, Internshala, Urban Company, Meesho`,

    wealth: `${base}

SPECIALIZATION: Wealth & Finance Guard
Output these metric lines FIRST:
FINANCIAL_HEALTH: [0-100]
SAVINGS_RATE: [0-100]
EMERGENCY_FUND_STATUS: [SAFE or AT_RISK or CRITICAL]
LEAKAGE_RISK: [LOW or MEDIUM or HIGH]
MONTHLY_SAVE_TARGET: [exact ₹ amount]

Then give:
• Specific expense leak detection with ₹ amounts
• 50/30/20 budget breakdown adapted for Indian salaries
• SIP recommendation with exact ₹ amount and platform (Zerodha Coin, Groww)
• PPF/NPS advice if applicable
• Emergency fund target (6 months expenses) with timeline`,

    jobs: `${base}

SPECIALIZATION: Job Finder & Scam Detector
Output these metric lines FIRST:
AUTHENTICITY_SCORE: [0-100]
GROWTH_TRAJECTORY: [DEAD_END or MODERATE or SCALABLE]
SCAM_RISK: [LOW or MEDIUM or HIGH]
SALARY_FIT: [BELOW or FAIR or ABOVE]

Then list EXACTLY 3 job opportunities in this format:
ROLE: [exact job title]
COMPANY TYPE: [MNC or Startup or Govt or SME]
SALARY: [X-Y LPA]
APPLY: [exact URL to job search — use LinkedIn, Naukri, or Indeed]

Then add:
• Specific scam warning signs to watch for
• Best companies hiring for their profile in their city
• Application tips for Indian recruiters`,

    startup: `${base}

SPECIALIZATION: Startup & Business Validator
Output these metric lines FIRST:
SUCCESS_SCORE: [0-100]
LEGAL_RISK: [LOW or MEDIUM or HIGH]
MARKET_SIZE: [NICHE or MEDIUM or LARGE]

Then give:
• Honest viability assessment (strengths AND risks)
• Total startup cost breakdown in ₹ (realistic, not optimistic)
• Required licenses and registrations (GST, FSSAI, Shop Act, etc.)
• A-Z launch timeline (Week 1, Month 1, Month 3, Month 6)
• Hidden opportunity angle others are missing
• Resources: ksum.org (Kerala), startupindia.gov.in, angellist.com, letsventure.com`,
  };

  return pillars[pillarId] || pillars.career;
};

const callGemini = async (systemPrompt, messages) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set in environment variables");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        maxOutputTokens: 1200,
        temperature: 0.7,
        topP: 0.9,
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini");
  return text;
};

export async function POST(request) {
  try {
    const body = await request.json();
    const { messages, pillarId = "career", profile = {} } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Messages array is required" }, { status: 400 });
    }

    const latestUserMsg = messages.filter((m) => m.role === "user").slice(-1)[0]?.content || "";
    const language = detectLanguage(latestUserMsg);
    const systemPrompt = buildSystem(pillarId, profile, language);

    let reply;
    try {
      reply = await callGemini(systemPrompt, messages);
    } catch (geminiError) {
      console.error("Gemini failed:", geminiError.message);
      return NextResponse.json({ error: `AI Error: ${geminiError.message}` }, { status: 503 });
    }

    return NextResponse.json({ reply, language, pillarId });

  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
      }
