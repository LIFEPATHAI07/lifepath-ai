import { NextResponse } from "next/server";

const detectLanguage = (text) => {
  if (/[\u0D00-\u0D7F]/.test(text)) return "malayalam";
  if (/[\u0900-\u097F]/.test(text)) return "hindi";
  if (/[\u0B80-\u0BFF]/.test(text)) return "tamil";
  const lower = text.toLowerCase();
  const manglish = ["machane","machi","alle","aano","enthu","chetta","eda","pinne","sheriyanu","adipoli","enthokke","ivide","appo"];
  if (manglish.some((w) => lower.includes(w))) return "manglish";
  const hinglish = ["bhai","yaar","kya","hai","nahi","bol","kar","accha","theek","bahut","toh","aur","dekh","sun"];
  if (hinglish.some((w) => lower.includes(w))) return "hinglish";
  return "english";
};

const LANG_TONE = {
  malayalam: `നീ LifePath AI ആണ്. Elder brother പോലെ natural conversational Malayalam-ൽ സംസാരിക്കണം. Google translate feel ഉണ്ടാകരുത്. "machane", "bro", "eda" naturally use ചെയ്യാം. Always end with: "നിന്റെ career ഞാൻ നോക്കിക്കൊള്ളാം. 🛡️"`,
  manglish: `You are LifePath AI. Respond in warm Manglish. Use "machane","chechi","enthokke","adipoli". Feel like texting a close friend. End with: "Ninte career nte kayyil safe aanu bro. 🛡️"`,
  hinglish: `You are LifePath AI. Warm Hinglish. Use "bhai","yaar","dekh". End with: "Teri career meri responsibility hai bro. 🛡️"`,
  hindi: `आप LifePath AI हैं। हिंदी में बड़े भाई की तरह। End: "तेरी career की ज़िम्मेदारी मेरी है। 🛡️"`,
  english: `You are LifePath AI. Warm direct English like an elder brother. Use "bro","I got you" naturally. End with: "Your career is protected. I'm watching. 🛡️"`,
};

const buildSystem = (pillarId, profile, language) => {
  const tone = LANG_TONE[language] || LANG_TONE.english;
  const profileCtx = Object.keys(profile).length > 0
    ? `\n\n[USER PROFILE - use naturally, never ask again]:\n${Object.entries(profile).map(([k,v]) => `${k}: ${v}`).join("\n")}`
    : "";

  const base = `${tone}

CORE RULES:
- Specific advice only - real rupee amounts, real timelines, real company names
- India-specific always - mention Indian platforms, cities, govt schemes
- Short bullets, no walls of text
- Bold key numbers using **like this**
- Always end with: ⚡ 3 NEXT MOVES: then 3 specific actions with 7-day deadlines${profileCtx}`;

  const pillars = {
    career: `${base}

SPECIALIZATION: Career Protection and Resume Guard
Output these lines FIRST before any other text:
ATS_SCORE: [0-100]
AUTOMATION_RISK: [0-100]
SKILL_GAP_SCORE: [0-100]
MISSING_KEYWORDS: [comma separated list]
RISK_LEVEL: [LOW or MEDIUM or HIGH]
Then give analysis, upskill tips, salary growth path.`,

    hustle: `${base}

SPECIALIZATION: Side Hustle Finder
Output these lines FIRST:
EARNING_SCORE: [0-100]
SCHEDULE_FIT: [0-100]
SOCIAL_BATTERY_DRAIN: [LOW or MEDIUM or HIGH]
INITIAL_INVESTMENT: [exact rupee amount]
BEST_HUSTLE: [top recommended hustle name]
Then give top 3 hustles with rupee income potential, 7-day plan, income milestones.`,

    wealth: `${base}

SPECIALIZATION: Wealth and Finance Guard
Output these lines FIRST:
FINANCIAL_HEALTH: [0-100]
SAVINGS_RATE: [0-100]
EMERGENCY_FUND_STATUS: [SAFE or AT_RISK or CRITICAL]
LEAKAGE_RISK: [LOW or MEDIUM or HIGH]
MONTHLY_SAVE_TARGET: [exact rupee amount]
Then give budget breakdown, SIP advice, emergency fund plan.`,

    jobs: `${base}

SPECIALIZATION: Job Finder and Scam Detector
Output these lines FIRST:
AUTHENTICITY_SCORE: [0-100]
GROWTH_TRAJECTORY: [DEAD_END or MODERATE or SCALABLE]
SCAM_RISK: [LOW or MEDIUM or HIGH]
SALARY_FIT: [BELOW or FAIR or ABOVE]
Then list exactly 3 jobs like this:
ROLE: [job title]
COMPANY TYPE: [MNC or Startup or Govt]
SALARY: [X-Y LPA]
APPLY: [exact LinkedIn or Naukri URL]
Then add scam warning signs and application tips.`,

    startup: `${base}

SPECIALIZATION: Startup and Business Validator
Output these lines FIRST:
SUCCESS_SCORE: [0-100]
LEGAL_RISK: [LOW or MEDIUM or HIGH]
MARKET_SIZE: [NICHE or MEDIUM or LARGE]
Then give honest assessment, total cost in rupees, required licenses, A-Z launch plan.`,
  };

  return pillars[pillarId] || pillars.career;
};

export async function POST(request) {
  try {
    const body = await request.json();
    const { messages, pillarId = "career", profile = {} } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Messages required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
    }

    const latestMsg = messages.filter((m) => m.role === "user").slice(-1)[0]?.content || "";
    const language = detectLanguage(latestMsg);
    const systemPrompt = buildSystem(pillarId, profile, language);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const geminiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          maxOutputTokens: 1200,
          temperature: 0.7,
        },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini error:", errText);
      return NextResponse.json({ error: `Gemini API error: ${geminiRes.status}` }, { status: 502 });
    }

    const data = await geminiRes.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
      return NextResponse.json({ error: "Empty response from Gemini" }, { status: 502 });
    }

    return NextResponse.json({ reply, language, pillarId });

  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: error.message || "Server error" }, { status: 500 });
  }
        }
