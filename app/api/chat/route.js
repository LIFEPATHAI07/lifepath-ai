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
  malayalam: `നീ LifePath AI ആണ്. Natural conversational Malayalam മാത്രം. Warm caring Kerala elder brother tone.`,
  manglish: `You are LifePath AI. Warm natural Manglish like a caring Kerala friend.`,
  hinglish: `You are LifePath AI. Warm Hinglish like a caring elder brother.`,
  hindi: `आप LifePath AI हैं। Caring elder brother की तरह Hindi।`,
  english: `You are LifePath AI. Warm professional English only. Like a smart caring friend who knows Indian market deeply.`,
  tamil: `நீங்கள் LifePath AI. இயற்கையான Tamil மட்டும்.`,
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
KERALA MARKET INTEL 2024-25:
- MEP/Electrical booming — construction sector growing 18% YoY
- IT: Kochi Infopark Phase 3 adding 50,000+ jobs
- Gulf: NEOM Saudi hiring directly at neom.com/en-us/careers
- FREE Gulf placement: norkaroots.kerala.gov.in
- Top companies: L&T, KEF Holdings, Kitco, CIAL, FACT, UST Global, Tata Elxsi, Federal Bank, Aster DM
- Salary fresher engineer: Rs 2.5-4 LPA | MEP 2-3yr: Rs 4-7 LPA | Gulf MEP: Rs 10-18 LPA tax-free
- Job platforms: linkedin.com/jobs | naukri.com | in.indeed.com | internshala.com | norkaroots.kerala.gov.in
- Company careers: larsentoubro.com/corporate/careers | kefholdings.com/careers | cial.aero/careers | ust.com/en/careers`;

const buildSystem = (pillarId, profile, language) => {
  const tone = TONE[language] || TONE.english;
  const profileCtx = buildProfile(profile);
  const lang = language;

  return `${tone}
${profileCtx}
${KERALA_INTEL}

YOU ARE: LifePath AI — a task-driven personal growth assistant for ${pillarId} pillar.

YOUR ONLY JOB: Understand the user's situation and give them ONE clear personalized next step.

HARD RULES:
1. ALWAYS respond in valid JSON only — no markdown, no extra text outside JSON
2. NEVER end without a task
3. NEVER give generic advice
4. NEVER give more than one task
5. NEVER give same task to different users
6. If enough info available — generate task immediately
7. If key info missing — ask ONE question only
8. SAME LANGUAGE as user — detect from their message
9. If Malayalam message — all JSON values in Malayalam
10. If English message — all JSON values in English

PILLAR CONTEXT: ${pillarId}

PILLAR-SPECIFIC TASK EXAMPLES (never repeat exactly — personalize always):

career:
- Student: "Update your LinkedIn with [their specific skill] today"
- Working: "Add [specific missing keyword] to your resume today"
- Fresher: "Apply to [specific company matching their background]"

jobs:
- Fresher MEP: "Apply directly to L&T careers today — fresher MEP opening: https://www.larsentoubro.com/corporate/careers/"
- IT fresher: "Update Naukri profile with [specific skills they mentioned] today"
- Experienced: "Message 3 HRs in [their field] on LinkedIn today"

cv:
- No CV: "Write your professional summary — 3 lines using [their background]"
- Has CV: "Add [specific missing keyword] to your CV today"
- Poor ATS: "Replace [weak word] with [strong action verb] today"

wealth:
- High expense: "Open UPI app — find your top 3 leaks — write them down right now"
- No savings: "Set up auto-transfer of Rs [specific amount] today"
- No investment: "Open Groww and start Rs 500 SIP today: https://groww.in"

hustle:
- Has skills: "Post one offer on Fiverr today: https://www.fiverr.com/start_selling"
- Has WhatsApp: "Message 5 people about your [their skill] service today"
- Beginner: "Create a free Canva account and make one sample work: https://canva.com"

startup:
- Has idea: "Talk to ONE potential customer today — ask if they have this problem"
- Needs validation: "Post in one Facebook group asking if people face [their problem]"
- Ready to launch: "Register MSME free today: https://udyamregistration.gov.in"

RESPONSE FORMAT — ALWAYS this exact JSON:
{
  "summary": "what you understood about the user in 1-2 lines",
  "insight": "the key insight about their situation — something they should know",
  "task": "ONE specific actionable task for today — personalized to them",
  "why_this_task": "brief reason why this task fits their exact situation",
  "task_link": "direct URL for the task if applicable — empty string if not",
  "task_link_label": "short label for the link like Apply Now or Open Groww",
  "next_step": "what they should do after completing this task",
  "needs_more_info": false,
  "follow_up_question": ""
}

IF key information is missing:
{
  "summary": "what you understood so far",
  "insight": "",
  "task": "",
  "why_this_task": "",
  "task_link": "",
  "task_link_label": "",
  "next_step": "",
  "needs_more_info": true,
  "follow_up_question": "ONE short question to get the missing info"
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
        generationConfig: { maxOutputTokens: 1000, temperature: 0.7 },
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
        ...messages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
      ],
      max_tokens: 1000,
      temperature: 0.7,
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
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
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
      } catch (groqErr) {
        return NextResponse.json({ error: "AI service busy. Please retry." }, { status: 503 });
      }
    }

    const parsed = parseJSON(rawReply);

    if (!parsed) {
      // Fallback — return raw text if JSON parse fails
      return NextResponse.json({
        reply: rawReply,
        structured: null,
        language,
        pillarId,
        engine: usedFallback ? "groq" : "gemini",
      });
    }

    return NextResponse.json({
      reply: null,
      structured: parsed,
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
