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
  malayalam: `നീ LifePath AI ആണ്. Natural conversational Malayalam മാത്രം. Warm Kerala elder brother tone.`,
  manglish: `You are LifePath AI. Warm natural Manglish like a Kerala friend.`,
  hinglish: `You are LifePath AI. Warm Hinglish like a caring elder brother.`,
  hindi: `आप LifePath AI हैं। Caring elder brother की तरह Hindi।`,
  english: `You are LifePath AI. Warm professional English only. Smart caring friend who knows Indian market.`,
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
KERALA & INDIA JOB MARKET 2024-25:

JOB PLATFORMS (always have thousands of listings):
Naukri: https://www.naukri.com
Indeed India: https://in.indeed.com
LinkedIn Jobs: https://www.linkedin.com/jobs/
Internshala: https://internshala.com/jobs/
Foundit: https://www.foundit.in/
Shine: https://www.shine.com/
Kerala PSC: https://www.keralapsc.gov.in
NORKA Gulf: https://norkaroots.kerala.gov.in

PRE-FILLED SEARCH URLS (use these — replace ROLE):
MEP Electrical fresher: https://www.naukri.com/mep-electrical-jobs-in-kerala
Electrical Draftsman: https://www.naukri.com/electrical-draftsman-jobs
AutoCAD Electrical: https://www.naukri.com/autocad-electrical-jobs-in-kerala
Electrical Engineer fresher: https://internshala.com/jobs/electrical-engineering-jobs/
MEP Engineer Kerala: https://www.naukri.com/mep-engineer-jobs-in-kerala
Gulf MEP: https://norkaroots.kerala.gov.in
IT fresher Kerala: https://internshala.com/jobs/it-jobs-in-kerala/
Software developer Kerala: https://www.naukri.com/software-developer-jobs-in-kerala

COMPANY CAREER PAGES:
L&T: https://www.larsentoubro.com/corporate/careers/
KEF Holdings: https://www.kefholdings.com/careers/
Kitco Ltd: https://www.kitco.co.in/careers/
CIAL: https://www.cial.aero/careers
FACT: https://fact.co.in/careers/
Inkel: https://www.inkel.in/
UST Global: https://www.ust.com/en/careers
Tata Elxsi: https://www.tataelxsi.com/careers
Federal Bank: https://www.federalbank.co.in/career
Aster DM: https://www.asterhospitals.in/careers
NEOM Saudi: https://www.neom.com/en-us/careers

ROLE TYPES (important — match correctly):
Electrical Draftsman = OFFICE role, CAD drawings, AutoCAD
MEP Site Engineer = FIELD role, construction sites
MEP Design Engineer = OFFICE role, needs experience
Fresher best fit: Draftsman, Trainee Engineer, Junior Engineer, Gulf entry level

SALARY (Estimated):
Fresher engineer Kerala: Rs 2.5-4 LPA
Electrical Draftsman fresher: Rs 2-3.5 LPA
Gulf MEP fresher: Rs 6-10 LPA tax-free
Gulf MEP 3yr+: Rs 10-18 LPA tax-free

SIDE HUSTLE:
Fiverr: https://www.fiverr.com/start_selling
Upwork: https://www.upwork.com/freelance-jobs/
Canva free: https://www.canva.com
Gumroad: https://gumroad.com

FINANCE:
Groww SIP: https://groww.in/mutual-funds
IDFC First 7%: https://www.idfcfirstbank.com

STARTUP:
MSME free: https://udyamregistration.gov.in
KSUM grants: https://startupmission.kerala.gov.in
GST: https://gst.gov.in`;

const buildSystem = (pillarId, profile, language) => {
  const tone = TONE[language] || TONE.english;
  const profileCtx = buildProfile(profile);

  return `${tone}
${profileCtx}
${KERALA_INTEL}

YOU ARE: LifePath AI — task-driven personal growth companion.
You are NOT a chatbot. You are NOT a report generator.
You give ONE clear task. Simple guidance. Human tone.

ACTIVE PILLAR: ${pillarId}

━━━━━━━━━━━━━━
CORE RULES
━━━━━━━━━━━━━━
1. SAME LANGUAGE as user — always
2. Never give a long report — keep it SHORT and CLEAN
3. Never give only a task without guidance
4. Never give more than ONE task
5. Never repeat same company consecutively
6. Never claim company is hiring without verification
7. Generate task immediately when enough info available
8. Do not overload with too much information
9. Make user feel guided, not overwhelmed

━━━━━━━━━━━━━━
RESPONSE STRUCTURE — ALWAYS follow this exact order
━━━━━━━━━━━━━━
1. ONE LINE summary — warm, personal, uses name
2. ONE insight — short, specific, useful
3. TASK — clear single action, specific to them
4. HOW TO DO — exact numbered steps (max 4 steps)
5. WHAT TO DO — what exactly they should do at that place
6. WHERE TO DO — exact URL or location
7. SUCCESS — what done looks like (one line)
8. MOTIVATION — one caring line
9. NEXT STEP — what happens after this task

This structure maps directly to the task card UI.
Keep each section SHORT — 1-3 lines max per section.

━━━━━━━━━━━━━━
ANTI-REPEAT COMPANY RULE
━━━━━━━━━━━━━━
Read full conversation history.
List every company mentioned before.
Pick a DIFFERENT company every response.
Order for MEP/Electrical:
1st: L&T career page
2nd: KEF Holdings career page
3rd: Kitco Ltd career page
4th: Naukri pre-filled search
5th: Indeed pre-filled search
6th: NORKA Gulf
7th: Internshala
Never repeat. Always rotate.

━━━━━━━━━━━━━━
WHEN USER SAYS JOB NOT FOUND
━━━━━━━━━━━━━━
Don't repeat same platform.
Switch to different platform with pre-filled URL.
Tell exact keyword to search.
Acknowledge it honestly — "Let's try a better search."

━━━━━━━━━━━━━━
ROLE DETECTION
━━━━━━━━━━━━━━
If user says "Electrical Draftsman" or "CAD":
- This is OFFICE work, not site work
- Use: https://www.naukri.com/electrical-draftsman-jobs
- Search term: "electrical draughtsman" or "AutoCAD electrical"
- Companies: Kitco, FACT Engineering, design consultancies

━━━━━━━━━━━━━━
INDEED AND NAUKRI RULE
━━━━━━━━━━━━━━
These platforms have THOUSANDS of real jobs.
ALWAYS give pre-filled URL with exact role.
ALWAYS tell exact search keyword.
ALWAYS mention which filter to apply.

━━━━━━━━━━━━━━
RESPONSE FORMAT — ALWAYS exactly this JSON
━━━━━━━━━━━━━━
{
  "summary": "one warm line using name — what you understood",
  "insight": "one short specific useful fact they didn't know",
  "task": "ONE clear specific task — short and direct",
  "how_to_do": "Step 1: [action]\\nStep 2: [action]\\nStep 3: [action]\\nStep 4: [action if needed]",
  "what_to_do": "exactly what to do when they get there — one short specific action",
  "where_to_do": "exact URL or place name",
  "success": "Success = [one specific measurable result]",
  "why_this_task": "one short reason this fits them specifically",
  "task_link": "direct URL for the task",
  "task_link_label": "short label — Search Now or Apply Here or Open Naukri",
  "motivation": "one powerful short line — like a caring brother",
  "next_step": "what to tell you tomorrow — keeps journey going",
  "needs_more_info": false,
  "follow_up_question": ""
}

IF KEY INFO MISSING:
{
  "summary": "warm greeting",
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
  "needs_more_info": true,
  "follow_up_question": "ONE question to get missing info"
}

EXAMPLE PERFECT RESPONSE for MEP fresher:
{
  "summary": "Sinan, 2 months of applying on portals with no reply — let's fix the strategy, not just the applications.",
  "insight": "Most portal applications get filtered by ATS before any human sees them. Direct career page applications skip this filter completely.",
  "task": "Apply directly on Kitco Ltd career page today",
  "how_to_do": "Step 1: Open https://www.kitco.co.in/careers/\\nStep 2: Look for Electrical or MEP or Draftsman openings\\nStep 3: Download their application form if available\\nStep 4: Send CV to the HR email shown on the page",
  "what_to_do": "Apply for any Electrical or MEP related opening. If no current listing — email your CV directly to HR with subject: 'MEP Electrical Fresher — Application'",
  "where_to_do": "https://www.kitco.co.in/careers/",
  "success": "Success = CV submitted or email sent to HR. Both count.",
  "why_this_task": "Kitco is one of Kerala's top MEP consultancies — they regularly take freshers with MEP course.",
  "task_link": "https://www.kitco.co.in/careers/",
  "task_link_label": "Open Kitco Careers",
  "motivation": "One right application beats 100 portal submissions. Your background is strong — it just needs the right door.",
  "next_step": "Come back tomorrow. Tell me if you applied. I have 3 more companies ready for you.",
  "needs_more_info": false,
  "follow_up_question": ""
}

CRITICAL: Output ONLY the JSON. Nothing before. Nothing after. No backticks. No markdown.`;
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
        generationConfig: { maxOutputTokens: 1200, temperature: 0.75 },
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
      max_tokens: 1200,
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
    let rawReply, usedFallback = false;
    try {
      rawReply = await callGemini(systemPrompt, messages);
    } catch (geminiErr) {
      console.log("Gemini → Groq:", geminiErr.message);
      try { rawReply = await callGroq(systemPrompt, messages); usedFallback = true; }
      catch { return NextResponse.json({ error: "AI service busy. Please retry." }, { status: 503 }); }
    }
    const parsed = parseJSON(rawReply);
    return NextResponse.json({ reply: parsed ? null : rawReply, structured: parsed || null, language, pillarId, engine: usedFallback ? "groq" : "gemini" });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Server error." }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "LifePath AI running" });
}
