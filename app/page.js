"use client";
import { useState, useRef, useEffect, useCallback } from "react";

const S = {
  get: (k, fb = null) => { try { const d = localStorage.getItem(k); return d ? JSON.parse(d) : fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const FREE_LIMIT = 100;
const getUsage = () => {
  const today = new Date().toDateString();
  const u = S.get("lp_usage", { date: today, count: 0 });
  if (u.date !== today) { const f = { date: today, count: 0 }; S.set("lp_usage", f); return f; }
  return u;
};

const assignPillar = (stage, goal) => {
  if (goal === "get_job" || stage === "looking_job") return "jobs";
  if (goal === "side_hustle" || stage === "side_income") return "hustle";
  if (goal === "startup" || stage === "business") return "startup";
  if (goal === "money" || stage === "money") return "wealth";
  return "career";
};

const getStreak = () => S.get("lp_streak", { count: 0, lastDate: null });
const updateStreak = () => {
  const today = new Date().toDateString();
  const s = getStreak();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (s.lastDate === today) return s;
  const c = s.lastDate === yesterday ? s.count + 1 : 1;
  const u = { count: c, lastDate: today };
  S.set("lp_streak", u);
  return u;
};

const PILLARS = [
  { id: "career", icon: "🛡️", label: "Career Guard", sub: "AI Threats · Skill Gaps · Growth", color: "#6366f1", rgb: "99,102,241" },
  { id: "cv", icon: "📄", label: "CV Builder", sub: "ATS Score · Build · Upload", color: "#06b6d4", rgb: "6,182,212" },
  { id: "jobs", icon: "🔍", label: "Job Finder", sub: "Real Jobs · Direct Apply · Scam Check", color: "#f59e0b", rgb: "245,158,11" },
  { id: "wealth", icon: "💰", label: "Wealth Guard", sub: "Budget · Save · Invest Smart", color: "#10b981", rgb: "16,185,129" },
  { id: "hustle", icon: "💸", label: "Side Hustle", sub: "Extra Income · A to Z Guide", color: "#a855f7", rgb: "168,85,247" },
  { id: "startup", icon: "🚀", label: "Startup Validator", sub: "Honest Score · Strengths · Red Flags", color: "#ec4899", rgb: "236,72,153" },
];

const AFFS = [
  { icon: "🎯", title: "Udemy Courses", desc: "Boost skills. Get hired faster.", tag: "From ₹449", url: "https://www.udemy.com", color: "#a855f7" },
  { icon: "📈", title: "Groww SIP", desc: "Start investing from ₹100/month.", tag: "Free Account", url: "https://groww.in", color: "#10b981" },
  { icon: "🌍", title: "NORKA Gulf Jobs", desc: "Free govt Gulf placement.", tag: "100% Free", url: "https://norkaroots.kerala.gov.in", color: "#06b6d4" },
  { icon: "💻", title: "Upwork Freelance", desc: "Earn dollars from your skills.", tag: "Free Join", url: "https://www.upwork.com", color: "#6366f1" },
  { icon: "🚀", title: "KSUM Startup Grant", desc: "Kerala govt funding up to ₹10L.", tag: "Free Apply", url: "https://startupmission.kerala.gov.in", color: "#ec4899" },
  { icon: "⚡", title: "Fiverr Freelance", desc: "Sell your skills globally.", tag: "Free Join", url: "https://www.fiverr.com/start_selling", color: "#f59e0b" },
];

// ── TASK CARD ──────────────────────────────────────────────────
const TaskCard = ({ data, pillar, onShare, onTaskDone }) => {
  const [done, setDone] = useState(false);
  if (!data) return null;

  const renderGuidance = (guidance) => {
    if (!guidance) return null;
    const lines = guidance.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    return lines.map((line, i) => {
      const isNumbered = /^\d+[.)]\s/.test(line);
      const num = isNumbered ? line.match(/^\d+/)?.[0] : null;
      const text = isNumbered ? line.replace(/^\d+[.)]\s/, "") : line;
      const isSuccess = line.toLowerCase().startsWith("success");
      return (
        <div key={i} style={{ display: "flex", gap: 12, marginBottom: 14, alignItems: "flex-start" }}>
          {isNumbered ? (
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: `rgba(${pillar.rgb},.15)`, border: `1px solid rgba(${pillar.rgb},.35)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
              <span style={{ color: pillar.color, fontSize: 11, fontWeight: 800 }}>{num}</span>
            </div>
          ) : isSuccess ? (
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(16,185,129,.15)", border: "1px solid rgba(16,185,129,.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
              <span style={{ fontSize: 11 }}>✅</span>
            </div>
          ) : (
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#334155", flexShrink: 0, marginTop: 8 }} />
          )}
          <div style={{ color: isSuccess ? "#10b981" : "#94a3b8", fontSize: 13, lineHeight: 1.7, flex: 1, fontWeight: isSuccess ? 600 : 400 }}>
            {text}
          </div>
        </div>
      );
    });
  };

  return (
    <div style={{ background: "rgba(255,255,255,.025)", border: `1px solid rgba(${pillar.rgb},.2)`, borderRadius: 20, overflow: "hidden", marginBottom: 4 }}>

      {/* Header */}
      <div style={{ background: `rgba(${pillar.rgb},.08)`, padding: "14px 16px", borderBottom: `1px solid rgba(${pillar.rgb},.12)` }}>
        <div style={{ color: pillar.color, fontSize: 9, fontWeight: 700, letterSpacing: 2.5, marginBottom: 6 }}>
          🛡️ LIFEPATH AI · {pillar.label.toUpperCase()}
        </div>
        <div style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 700, lineHeight: 1.5 }}>
          {data.summary}
        </div>
      </div>

      {/* Context */}
      {data.context && (
        <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
          <div style={{ color: "#475569", fontSize: 9, fontWeight: 700, letterSpacing: 2, marginBottom: 8 }}>
            📊 WHAT YOU SHOULD KNOW
          </div>
          <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.8 }}>
            {data.context}
          </div>
        </div>
      )}

      {/* Insight */}
      {data.insight && (
        <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.05)", background: "rgba(6,182,212,.03)" }}>
          <div style={{ color: "#475569", fontSize: 9, fontWeight: 700, letterSpacing: 2, marginBottom: 6 }}>
            💡 KEY INSIGHT
          </div>
          <div style={{ color: "#06b6d4", fontSize: 13, lineHeight: 1.7, fontWeight: 500 }}>
            {data.insight}
          </div>
        </div>
      )}

      {/* Task */}
      {data.task && (
        <div style={{ padding: "16px 16px", borderBottom: "1px solid rgba(255,255,255,.05)", background: `rgba(${pillar.rgb},.04)` }}>
          <div style={{ color: pillar.color, fontSize: 9, fontWeight: 700, letterSpacing: 2, marginBottom: 8 }}>
            ⚡ YOUR TASK TODAY
          </div>
          <div style={{ color: "#fff", fontSize: 15, fontWeight: 800, lineHeight: 1.5, marginBottom: 8 }}>
            {data.task}
          </div>
          {data.why_this_task && (
            <div style={{ color: "#64748b", fontSize: 12, lineHeight: 1.6 }}>
              <span style={{ color: "#475569", fontWeight: 600 }}>Why for you: </span>
              {data.why_this_task}
            </div>
          )}
        </div>
      )}

      {/* Guidance — HOW TO DO IT */}
      {data.guidance && (
        <div style={{ padding: "16px 16px", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
          <div style={{ color: "#475569", fontSize: 9, fontWeight: 700, letterSpacing: 2, marginBottom: 14 }}>
            📋 HOW TO DO IT
          </div>
          {renderGuidance(data.guidance)}
          {data.task_link && (
            <div style={{ marginTop: 6 }}>
              <a href={data.task_link} target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "11px 22px", background: `linear-gradient(135deg,${pillar.color},${pillar.color}99)`, borderRadius: 100, color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none", boxShadow: `0 4px 16px rgba(${pillar.rgb},.3)` }}>
                {data.task_link_label || "Do This Now"} →
              </a>
            </div>
          )}
        </div>
      )}

      {/* Motivation */}
      {data.motivation && (
        <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.05)", background: "rgba(16,185,129,.03)" }}>
          <div style={{ color: "#10b981", fontSize: 13, fontWeight: 600, lineHeight: 1.6, fontStyle: "italic" }}>
            💪 {data.motivation}
          </div>
        </div>
      )}

      {/* Done */}
      {data.task && (
        <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
          {!done ? (
            <button
              onClick={() => { setDone(true); onTaskDone?.(); }}
              style={{ width: "100%", padding: "13px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, color: "#64748b", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              ✓ Mark as Done
            </button>
          ) : (
            <div>
              <div style={{ padding: "11px", background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.2)", borderRadius: 12, color: "#10b981", fontWeight: 700, fontSize: 13, textAlign: "center", marginBottom: 10 }}>
                ✅ Task Completed! Amazing work! 🔥
              </div>
              <div style={{ padding: "13px 14px", background: "rgba(6,182,212,.05)", border: "1px solid rgba(6,182,212,.15)", borderRadius: 12 }}>
                <div style={{ color: "#06b6d4", fontSize: 11, fontWeight: 700, marginBottom: 5 }}>💬 Tell me how it went</div>
                <div style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.6 }}>
                  What happened when you tried? Type below — I'll give you your next task.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Next step */}
      {data.next_step && (
        <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
          <div style={{ color: "#475569", fontSize: 9, fontWeight: 700, letterSpacing: 2, marginBottom: 5 }}>📅 NEXT STEP</div>
          <div style={{ color: "#64748b", fontSize: 12, lineHeight: 1.6 }}>{data.next_step}</div>
        </div>
      )}

      {/* Follow up */}
      {data.needs_more_info && data.follow_up_question && (
        <div style={{ padding: "14px 16px", background: "rgba(6,182,212,.04)", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
          <div style={{ color: "#06b6d4", fontSize: 9, fontWeight: 700, letterSpacing: 2, marginBottom: 6 }}>❓ QUICK QUESTION</div>
          <div style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>{data.follow_up_question}</div>
        </div>
      )}

      {/* Share */}
      <div style={{ padding: "10px 16px", display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onShare}
          style={{ padding: "6px 13px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 100, color: "#64748b", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          📤 Share this
        </button>
      </div>
    </div>
  );
};

// ── SHARE CARD ─────────────────────────────────────────────────
const ShareCard = ({ pillar, task, streak, onClose }) => {
  const streakText = streak > 0 ? `🔥 ${streak} day streak!\n` : "";
  const shareText = `🛡️ LifePath AI gave me my task for today!\n\n⚡ "${task || "Personal growth task"}"\n\n${streakText}\nIndia's first AI Growth Companion — FREE!\nWorks in Malayalam + English 🇮🇳\n\nTry: lifepath-ai-ovrt.vercel.app\n\n#LifePathAI #Growth #Kerala #CareerAdvice`;

  const handleShare = async () => {
    try {
      if (navigator.share) await navigator.share({ title: "LifePath AI", text: shareText, url: "https://lifepath-ai-ovrt.vercel.app" });
      else { await navigator.clipboard?.writeText(shareText); alert("✅ Copied! Paste on WhatsApp."); }
    } catch (err) { if (err.name !== "AbortError") alert(shareText); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 300, display: "flex", alignItems: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#0a1020", borderRadius: "22px 22px 0 0", padding: "24px 20px 44px", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 18, marginBottom: 5 }}>📤 Share Your Progress</div>
        <div style={{ color: "#64748b", fontSize: 12, marginBottom: 18 }}>Help your friends discover LifePath AI!</div>
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "14px", marginBottom: 16 }}>
          <div style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.85, whiteSpace: "pre-line" }}>{shareText}</div>
        </div>
        <button onClick={handleShare} style={{ width: "100%", padding: 14, background: `linear-gradient(135deg,${pillar.color},${pillar.color}99)`, border: "none", borderRadius: 12, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", marginBottom: 10, fontFamily: "inherit" }}>
          Share on WhatsApp / Instagram 📱
        </button>
        <button onClick={onClose} style={{ width: "100%", padding: 11, background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, color: "#64748b", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          Cancel
        </button>
      </div>
    </div>
  );
};

// ── MAIN APP ───────────────────────────────────────────────────
export default function LifePathAI() {
  const [screen, setScreen] = useState("splash");
  const [pillar, setPillar] = useState(null);
  const [messages, setMessages] = useState(() => S.get("lp_chat_history", {}));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState(0);
  const [profile, setProfile] = useState(() => S.get("lp_profile", {}));
  const [accepted, setAccepted] = useState(() => S.get("lp_accepted", false));
  const [onboarded, setOnboarded] = useState(() => S.get("lp_onboarded", false));
  const [onboardStep, setOnboardStep] = useState(0);
  const [onboardData, setOnboardData] = useState({ name: "", stage: "", goal: "" });
  const [analyzing, setAnalyzing] = useState(false);
  const [streak, setStreak] = useState(() => getStreak().count);
  const [shareData, setShareData] = useState(null);
  const [toast, setToast] = useState("");
  const [cvFile, setCvFile] = useState(null);
  const [showAllPillars, setShowAllPillars] = useState(false);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  const pdfJsLoaded = useRef(false);

  const fireToast = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); }, []);

  useEffect(() => {
    const ts = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1100),
      setTimeout(() => setPhase(3), 2200),
      setTimeout(() => {
        if (!accepted) setScreen("welcome");
        else if (!onboarded) setScreen("onboard");
        else setScreen("home");
      }, 3300),
    ];
    return () => ts.forEach(clearTimeout);
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => { if (Object.keys(messages).length > 0) S.set("lp_chat_history", messages); }, [messages]);

  const completeOnboarding = async () => {
    setAnalyzing(true);
    await new Promise(r => setTimeout(r, 2500));
    const assignedId = assignPillar(onboardData.stage, onboardData.goal);
    const ap = PILLARS.find(p => p.id === assignedId) || PILLARS[0];
    const newProfile = { name: onboardData.name, stage: onboardData.stage, goal: onboardData.goal, assignedPillar: assignedId };
    setProfile(newProfile);
    S.set("lp_profile", newProfile);
    S.set("lp_onboarded", true);
    setOnboarded(true);
    const ns = updateStreak();
    setStreak(ns.count);
    setAnalyzing(false);
    setPillar(ap);
    const opening = {
      role: "assistant", content: null,
      structured: {
        summary: `Hi ${onboardData.name}! Welcome to ${ap.label} 🛡️`,
        context: "", insight: "", task: null, guidance: null,
        why_this_task: null, task_link: null, task_link_label: null,
        motivation: null, next_step: null, needs_more_info: true,
        follow_up_question: `Tell me about yourself — why did you choose ${ap.label}? What's your situation right now?\n\nThe more you share, the more personal my help will be. 🙏`,
      }
    };
    setMessages(m => ({ ...m, [assignedId]: [opening] }));
    setScreen("chat");
  };

  const loadPdfJs = async () => {
    if (pdfJsLoaded.current && window.pdfjsLib) return true;
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; pdfJsLoaded.current = true; resolve(true); };
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = "";
    if (file.name.toLowerCase().endsWith(".pdf")) {
      fireToast("📄 Reading PDF...");
      try {
        const loaded = await loadPdfJs();
        if (!loaded || !window.pdfjsLib) throw new Error("unavailable");
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = "";
        for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          fullText += content.items.map(item => item.str).join(" ") + "\n";
        }
        if (fullText.trim().length > 80) { setCvFile({ name: file.name }); setInput(`Please analyze this CV:\n\n${fullText.substring(0, 3000)}`); fireToast("✅ PDF read! Press send."); }
        else throw new Error("failed");
      } catch { fireToast("⚠️ Can't read PDF. Please paste CV text."); setInput("My CV:\nName: \nEducation: \nExperience: \nSkills: \nTarget Job: "); }
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      if (!text || text.startsWith("%PDF") || text.trim().length < 30) { fireToast("⚠️ Can't read. Paste CV text."); return; }
      setCvFile({ name: file.name }); setInput(`Analyze this CV:\n\n${text.substring(0, 3000)}`); fireToast("✅ Loaded!");
    };
    reader.onerror = () => fireToast("⚠️ File error. Paste CV text.");
    reader.readAsText(file);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading || !pillar) return;
    const usage = getUsage();
    if (usage.count >= FREE_LIMIT) { fireToast("Daily limit reached. Come back tomorrow! 🌅"); return; }
    const userMsg = input.trim();
    setInput(""); setCvFile(null);
    const prev = messages[pillar.id] || [];
    const apiMessages = prev
      .filter(m => m.content || m.structured)
      .map(m => ({
        role: m.role,
        content: m.content || (m.structured ? `[AI: summary="${m.structured.summary || ""}" task="${m.structured.task || ""}" question="${m.structured.follow_up_question || ""}"]` : ""),
      }))
      .filter(m => m.content);
    apiMessages.push({ role: "user", content: userMsg });
    const newMsgs = [...prev, { role: "user", content: userMsg }];
    setMessages(m => ({ ...m, [pillar.id]: newMsgs }));
    setLoading(true);
    S.set("lp_usage", { ...usage, count: usage.count + 1 });
    const ns = updateStreak();
    setStreak(ns.count);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, pillarId: pillar.id, profile }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const aiMsg = { role: "assistant", content: data.reply || null, structured: data.structured || null };
      setMessages(m => ({ ...m, [pillar.id]: [...newMsgs, aiMsg] }));
    } catch (err) {
      setMessages(m => ({ ...m, [pillar.id]: [...newMsgs, { role: "assistant", content: `⚠️ ${err.message || "Connection error. Please retry."}`, structured: null }] }));
    }
    setLoading(false);
  };

  const handleKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

  const clearChat = () => {
    if (!pillar) return;
    setMessages(m => { const u = { ...m }; delete u[pillar.id]; S.set("lp_chat_history", u); return u; });
    fireToast("💬 Chat cleared");
    setTimeout(() => {
      const opening = {
        role: "assistant", content: null,
        structured: {
          summary: `Fresh start! Let's keep going. 🛡️`, context: "", insight: "",
          task: null, guidance: null, why_this_task: null, task_link: null, task_link_label: null,
          motivation: null, next_step: null, needs_more_info: true,
          follow_up_question: `What's your situation with ${pillar.label} right now? Tell me anything — the more you share, the better I can help. 🙏`,
        }
      };
      setMessages(m => ({ ...m, [pillar.id]: [opening] }));
    }, 100);
  };

  const switchPillar = (p) => {
    setPillar(p); setShowAllPillars(false);
    if (!messages[p.id] || messages[p.id].length === 0) {
      const opening = {
        role: "assistant", content: null,
        structured: {
          summary: `Switched to ${p.label}! 🛡️`, context: "", insight: "",
          task: null, guidance: null, why_this_task: null, task_link: null, task_link_label: null,
          motivation: null, next_step: null, needs_more_info: true,
          follow_up_question: `Tell me about yourself — why ${p.label}? What's your situation right now? The more you share, the more specific I can be. 🙏`,
        }
      };
      setMessages(m => ({ ...m, [p.id]: [opening] }));
    }
    setScreen("chat");
  };

  const handleTaskDone = (pillarId) => {
    const followUp = {
      role: "assistant", content: null,
      structured: {
        summary: "Amazing — you completed your task! 🎉", context: "", insight: "",
        task: null, guidance: null, why_this_task: null, task_link: null, task_link_label: null,
        motivation: null, next_step: null, needs_more_info: true,
        follow_up_question: "Tell me how it went — what happened when you tried? Good or bad — I'll give you your next personalized task based on your experience. 💪",
      }
    };
    setMessages(m => ({ ...m, [pillarId]: [...(m[pillarId] || []), followUp] }));
  };

  const curMsgs = pillar ? (messages[pillar.id] || []) : [];
  const STREAK_MILESTONES = [3, 5, 7, 14, 30];
  const nextMilestone = STREAK_MILESTONES.find(m => m > streak) || 30;

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#060b14;overscroll-behavior:none}
    ::-webkit-scrollbar{width:2px}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}
    textarea,input,button{font-family:'Syne',sans-serif!important}
    textarea::placeholder,input::placeholder{color:#334155!important}
    a{text-decoration:none}a:hover{opacity:.85}
    @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes pulse{0%,100%{opacity:.2}50%{opacity:1}}
    @keyframes dot{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
    @keyframes brandIn{from{opacity:0;transform:scale(.85) translateY(16px)}to{opacity:1;transform:scale(1) translateY(0)}}
    @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(-12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
    @keyframes scan{0%{transform:translateY(-100%)}100%{transform:translateY(700%)}}
    @keyframes glow{0%,100%{opacity:.25}50%{opacity:.65}}
    @keyframes analyzing{0%{width:0%}100%{width:100%}}
    .card{transition:transform .12s;cursor:pointer}.card:active{transform:scale(.96)}
    .btn{transition:all .15s;cursor:pointer}.btn:active{transform:scale(.95)}
    .sx{overflow-x:auto;scrollbar-width:none}.sx::-webkit-scrollbar{display:none}
    .opt{transition:all .15s;cursor:pointer;border-radius:14px;padding:14px 16px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.03);color:#94a3b8;font-size:13px;text-align:left;width:100%;margin-bottom:9px}
    .opt:active{transform:scale(.98)}.opt.sel{border-color:#06b6d4;background:rgba(6,182,212,.08);color:#06b6d4}
  `;

  return (
    <div style={{ minHeight: "100vh", background: "#060b14", fontFamily: "'Syne','Segoe UI',sans-serif", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", position: "relative", overflowX: "hidden" }}>
      <style>{CSS}</style>

      {toast && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: "rgba(6,11,20,.96)", border: "1px solid rgba(6,182,212,.4)", backdropFilter: "blur(20px)", borderRadius: 100, padding: "9px 22px", color: "#06b6d4", fontSize: 12, fontWeight: 700, zIndex: 700, whiteSpace: "nowrap", animation: "toastIn .3s both" }}>
          {toast}
        </div>
      )}

      {shareData && pillar && <ShareCard pillar={pillar} task={shareData} streak={streak} onClose={() => setShareData(null)} />}

      {/* SPLASH */}
      {screen === "splash" && (
        <div style={{ position: "fixed", inset: 0, background: "#060b14", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 300 }}>
          <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
            <div style={{ position: "absolute", left: 0, right: 0, height: 1, background: "linear-gradient(90deg,transparent,rgba(6,182,212,.5),transparent)", animation: phase >= 1 ? "scan 2.8s linear infinite" : "none" }} />
          </div>
          <div style={{ position: "absolute", width: 360, height: 360, borderRadius: "50%", background: "radial-gradient(circle,rgba(6,182,212,.06) 0%,transparent 70%)", animation: phase >= 1 ? "glow 3s ease infinite" : "none" }} />
          <div style={{ animation: phase >= 1 ? "brandIn .9s cubic-bezier(.34,1.4,.64,1) both" : "none", textAlign: "center", zIndex: 1, marginBottom: 12 }}>
            <div style={{ fontSize: 52, fontWeight: 900, color: "#fff", letterSpacing: "-2px" }}>LifePath <span style={{ color: "#06b6d4" }}>AI</span></div>
          </div>
          <div style={{ animation: phase >= 2 ? "fadeUp .6s both" : "none", opacity: phase >= 2 ? 1 : 0, zIndex: 1 }}>
            <div style={{ color: "#0d2535", fontSize: 11, letterSpacing: "0.2em", fontFamily: "'JetBrains Mono',monospace" }}>YOUR GROWTH COMPANION · ALWAYS WITH YOU</div>
          </div>
          <div style={{ marginTop: 70, display: "flex", gap: 9, animation: phase >= 1 ? "fadeIn .5s 1s both" : "none" }}>
            {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "#06b6d4", animation: `dot 1.5s ${i*.25}s infinite` }} />)}
          </div>
        </div>
      )}

      {/* WELCOME */}
      {screen === "welcome" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", zIndex: 1 }}>
          <div style={{ width: "100%", background: "#0a1020", borderRadius: "24px 24px 0 0", padding: "32px 22px 48px", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize: 38, marginBottom: 14, textAlign: "center" }}>🛡️</div>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: 22, marginBottom: 8, textAlign: "center" }}>Welcome to LifePath AI</div>
            <div style={{ color: "#64748b", fontSize: 13, lineHeight: 1.7, marginBottom: 22, textAlign: "center" }}>
              Your daily AI growth companion 🇮🇳<br />Free forever · Malayalam + English
            </div>
            <div style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 14, padding: "14px 16px", marginBottom: 22 }}>
              <div style={{ color: "#f59e0b", fontSize: 11, fontWeight: 700, marginBottom: 7 }}>⚠️ DISCLAIMER</div>
              <div style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.7 }}>General guidance only — not professional financial, legal, or career advice. Always consult qualified professionals for major decisions.</div>
            </div>
            <div style={{ color: "#475569", fontSize: 11, marginBottom: 22, textAlign: "center" }}>
              Continuing means you agree to our <a href="/terms" style={{ color: "#06b6d4" }}>Terms</a> and <a href="/privacy" style={{ color: "#06b6d4" }}>Privacy Policy</a>
            </div>
            <button className="btn" onClick={() => { setAccepted(true); S.set("lp_accepted", true); setScreen("onboard"); }}
              style={{ width: "100%", padding: 16, background: "linear-gradient(135deg,#06b6d4,#0891b2)", border: "none", borderRadius: 14, color: "#fff", fontWeight: 800, fontSize: 16 }}>
              Start My Growth Journey 🚀
            </button>
          </div>
        </div>
      )}

      {/* ONBOARDING */}
      {screen === "onboard" && !analyzing && (
        <div style={{ flex: 1, overflowY: "auto", padding: "40px 20px 60px", zIndex: 1 }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>{onboardStep === 0 ? "👋" : onboardStep === 1 ? "📍" : "🎯"}</div>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: 20, marginBottom: 6 }}>
              {onboardStep === 0 ? "What's your name?" : onboardStep === 1 ? "What stage are you at?" : "What's your biggest goal?"}
            </div>
            <div style={{ color: "#334155", fontSize: 11, marginBottom: 16 }}>Step {onboardStep + 1} of 3</div>
            <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 100, height: 3, overflow: "hidden" }}>
              <div style={{ height: 3, borderRadius: 100, width: `${((onboardStep+1)/3)*100}%`, background: "linear-gradient(90deg,#06b6d4,#6366f1)", transition: "width .4s ease" }} />
            </div>
          </div>

          {onboardStep === 0 && (
            <div>
              <input value={onboardData.name} onChange={e => setOnboardData(d => ({ ...d, name: e.target.value }))}
                placeholder="Type your name..." autoFocus
                onKeyDown={e => { if (e.key === "Enter" && onboardData.name.trim()) setOnboardStep(1); }}
                style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(6,182,212,0.3)", borderRadius: 14, padding: "16px 18px", color: "#e2e8f0", fontSize: 16, outline: "none", marginBottom: 20 }} />
              <button className="btn" onClick={() => { if (onboardData.name.trim()) setOnboardStep(1); }}
                disabled={!onboardData.name.trim()}
                style={{ width: "100%", padding: 15, background: onboardData.name.trim() ? "linear-gradient(135deg,#06b6d4,#0891b2)" : "rgba(255,255,255,0.05)", border: "none", borderRadius: 14, color: onboardData.name.trim() ? "#fff" : "#334155", fontWeight: 700, fontSize: 15 }}>
                Next →
              </button>
            </div>
          )}

          {onboardStep === 1 && (
            <div>
              {[
                { id: "studying", label: "🎓 Still studying", desc: "School, college, or diploma" },
                { id: "looking_job", label: "🔍 Looking for first job", desc: "Fresher, ready to work" },
                { id: "working_grow", label: "💼 Working, want to grow", desc: "Employed, want more" },
                { id: "side_income", label: "💸 Want side income", desc: "Earn extra alongside main work" },
                { id: "business", label: "🚀 Starting a business", desc: "Have an idea, want to launch" },
                { id: "money", label: "💰 Manage money better", desc: "Save, invest, financial freedom" },
              ].map(opt => (
                <button key={opt.id} className={`opt ${onboardData.stage === opt.id ? "sel" : ""}`}
                  onClick={() => { setOnboardData(d => ({ ...d, stage: opt.id })); setTimeout(() => setOnboardStep(2), 250); }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{opt.label}</div>
                  <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          )}

          {onboardStep === 2 && (
            <div>
              {[
                { id: "get_job", label: "🎯 Get a good job", desc: "Find the right job fast" },
                { id: "earn_more", label: "📈 Earn more money", desc: "Grow salary or income" },
                { id: "side_hustle", label: "💸 Start side hustle", desc: "Extra income from skills" },
                { id: "startup", label: "🚀 Build a startup", desc: "Launch my business idea" },
                { id: "money", label: "💰 Manage money better", desc: "Save, invest, grow wealth" },
                { id: "protect_career", label: "🛡️ Protect career from AI", desc: "Stay relevant and secure" },
              ].map(opt => (
                <button key={opt.id} className={`opt ${onboardData.goal === opt.id ? "sel" : ""}`}
                  onClick={() => { setOnboardData(d => ({ ...d, goal: opt.id })); setTimeout(completeOnboarding, 250); }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{opt.label}</div>
                  <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ANALYZING */}
      {analyzing && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 1, padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 20 }}>🛡️</div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 20, marginBottom: 8, textAlign: "center" }}>Analyzing your profile...</div>
          <div style={{ color: "#475569", fontSize: 13, marginBottom: 30, textAlign: "center" }}>Finding your perfect growth path</div>
          {["Reading your goals...", "Finding your best pillar...", "Preparing your experience..."].map((txt, i) => (
            <div key={i} style={{ color: "#06b6d4", fontSize: 12, marginBottom: 8, animation: `fadeIn .5s ${i*.6}s both`, opacity: 0 }}>✓ {txt}</div>
          ))}
          <div style={{ width: "100%", maxWidth: 280, background: "rgba(255,255,255,0.05)", borderRadius: 100, height: 4, overflow: "hidden", marginTop: 20 }}>
            <div style={{ height: 4, borderRadius: 100, background: "linear-gradient(90deg,#06b6d4,#6366f1)", animation: "analyzing 2.5s ease forwards" }} />
          </div>
        </div>
      )}

      {/* HOME */}
      {screen === "home" && (
        <div style={{ flex: 1, overflowY: "auto", zIndex: 1 }}>
          <div style={{ position: "fixed", top: -100, left: "50%", transform: "translateX(-50%)", width: 500, height: 500, borderRadius: "50%", pointerEvents: "none", background: "radial-gradient(circle,rgba(6,182,212,.035) 0%,transparent 65%)" }} />

          <div style={{ padding: "20px 18px 0", display: "flex", justifyContent: "space-between", alignItems: "center", animation: "fadeUp .4s both" }}>
            <div>
              <span style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "-0.8px" }}>LifePath </span>
              <span style={{ fontSize: 22, fontWeight: 900, color: "#06b6d4", letterSpacing: "-0.8px" }}>AI</span>
              <div style={{ color: "#1e3a4a", fontSize: 8, letterSpacing: 2.5, fontFamily: "'JetBrains Mono',monospace", marginTop: 1 }}>GROWTH COMPANION 🛡️</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {streak > 0 && (
                <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 100, padding: "5px 12px", display: "flex", alignItems: "center", gap: 5 }}>
                  <span>🔥</span><span style={{ color: "#f59e0b", fontWeight: 700, fontSize: 13 }}>{streak}</span>
                </div>
              )}
              <button className="btn"
                onClick={() => { S.set("lp_onboarded", false); setOnboarded(false); setOnboardStep(0); setOnboardData({ name: "", stage: "", goal: "" }); setScreen("onboard"); }}
                style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 100, padding: "7px 14px", color: "#94a3b8", fontSize: 11 }}>
                👤 {profile.name?.split(" ")[0] || "Profile"}
              </button>
            </div>
          </div>

          {profile.assignedPillar && (() => {
            const ap = PILLARS.find(p => p.id === profile.assignedPillar) || PILLARS[0];
            return (
              <div style={{ margin: "16px 18px 0", animation: "fadeUp .5s .1s both" }}>
                <div style={{ color: "#64748b", fontSize: 13, marginBottom: 12 }}>
                  Welcome back, <strong style={{ color: "#e2e8f0" }}>{profile.name?.split(" ")[0]}</strong>! 👋
                </div>
                <div style={{ padding: "18px 16px", background: `linear-gradient(135deg,rgba(${ap.rgb},.1),rgba(${ap.rgb},.05))`, border: `1px solid rgba(${ap.rgb},.25)`, borderRadius: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                    <div>
                      <div style={{ color: ap.color, fontSize: 9, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>YOUR ACTIVE SHIELD</div>
                      <div style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>{ap.icon} {ap.label}</div>
                      <div style={{ color: "#475569", fontSize: 11, marginTop: 3 }}>{ap.sub}</div>
                    </div>
                    {streak > 0 && (
                      <div style={{ textAlign: "right", background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.2)", borderRadius: 12, padding: "8px 12px" }}>
                        <div style={{ color: "#f59e0b", fontSize: 22, fontWeight: 800, lineHeight: 1 }}>🔥 {streak}</div>
                        <div style={{ color: "#64748b", fontSize: 9, marginTop: 2 }}>day streak</div>
                      </div>
                    )}
                  </div>
                  {streak > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ color: "#64748b", fontSize: 10 }}>Progress to {nextMilestone} days</span>
                        <span style={{ color: ap.color, fontSize: 10, fontWeight: 600 }}>{streak}/{nextMilestone}</span>
                      </div>
                      <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 100, height: 5 }}>
                        <div style={{ height: 5, borderRadius: 100, width: `${Math.min((streak/nextMilestone)*100,100)}%`, background: `linear-gradient(90deg,${ap.color}88,${ap.color})`, transition: "width .8s ease", boxShadow: `0 0 8px ${ap.color}66` }} />
                      </div>
                    </div>
                  )}
                  <button className="btn" onClick={() => { setPillar(ap); setScreen("chat"); }}
                    style={{ width: "100%", padding: "12px", background: ap.color, border: "none", borderRadius: 12, color: "#fff", fontWeight: 700, fontSize: 13, boxShadow: `0 4px 16px rgba(${ap.rgb},.3)` }}>
                    Continue My Journey →
                  </button>
                </div>
              </div>
            );
          })()}

          {streak > 0 && STREAK_MILESTONES.includes(streak) && (
            <div style={{ margin: "12px 18px 0", padding: "16px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 16 }}>
              <div style={{ color: "#f59e0b", fontWeight: 800, fontSize: 16, marginBottom: 4 }}>🎉 {streak} Day Milestone!</div>
              <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 12, lineHeight: 1.6 }}>Incredible consistency! Share your achievement!</div>
              <button className="btn" onClick={() => {
                const text = `🔥 I've used LifePath AI for ${streak} days straight!\n\nMy career is growing daily 📈\n\nTry free: lifepath-ai-ovrt.vercel.app\n\n#LifePathAI #Growth #Kerala`;
                if (navigator.share) navigator.share({ title: "LifePath AI", text });
                else navigator.clipboard?.writeText(text).then(() => fireToast("Copied! Share on WhatsApp 📱"));
              }} style={{ padding: "9px 18px", background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 100, color: "#f59e0b", fontSize: 12, fontWeight: 700 }}>
                Share Streak 📤
              </button>
            </div>
          )}

          <div style={{ padding: "20px 18px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 13 }}>
              <div style={{ color: "#1e293b", fontSize: 9, fontWeight: 700, letterSpacing: 3 }}>SWITCH GOAL</div>
              <button className="btn" onClick={() => setShowAllPillars(v => !v)}
                style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 100, padding: "4px 12px", color: "#475569", fontSize: 10 }}>
                {showAllPillars ? "Hide" : "Show all 6 shields"}
              </button>
            </div>
            {showAllPillars && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {PILLARS.map((p, i) => (
                  <div key={p.id} className="card" onClick={() => switchPillar(p)}
                    style={{ background: profile.assignedPillar === p.id ? `rgba(${p.rgb},.12)` : "rgba(255,255,255,.022)", border: `1px solid ${profile.assignedPillar === p.id ? `rgba(${p.rgb},.4)` : "rgba(255,255,255,.055)"}`, borderRadius: 18, padding: "15px 13px", position: "relative", overflow: "hidden", animation: `fadeUp .4s ${i*.06}s both` }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: `rgba(${p.rgb},.09)`, border: `1px solid rgba(${p.rgb},.2)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, marginBottom: 8 }}>{p.icon}</div>
                    <div style={{ color: "#dde4ee", fontSize: 11, fontWeight: 700, marginBottom: 3 }}>{p.label}</div>
                    <div style={{ color: "#475569", fontSize: 9 }}>{p.sub}</div>
                    {profile.assignedPillar === p.id && <div style={{ position: "absolute", top: 8, right: 8, background: p.color, borderRadius: 100, padding: "1px 7px", fontSize: 7, color: "#fff", fontWeight: 700 }}>ACTIVE</div>}
                    {messages[p.id]?.filter(m => m.role === "user").length > 0 && profile.assignedPillar !== p.id && (
                      <div style={{ position: "absolute", top: 8, right: 8, background: "#334155", borderRadius: 100, padding: "1px 7px", fontSize: 7, color: "#94a3b8", fontWeight: 700 }}>
                        {messages[p.id].filter(m => m.role === "user").length}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ padding: "22px 0 0" }}>
            <div style={{ padding: "0 18px 11px", color: "#1e293b", fontSize: 9, fontWeight: 700, letterSpacing: 3 }}>RECOMMENDED FOR YOU</div>
            <div className="sx" style={{ paddingLeft: 18 }}>
              <div style={{ display: "flex", gap: 11, paddingRight: 18, width: "max-content" }}>
                {AFFS.map((a, i) => (
                  <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", background: "rgba(255,255,255,.022)", border: "1px solid rgba(255,255,255,.065)", borderRadius: 16, width: 230, flexShrink: 0 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: `${a.color}18`, border: `1px solid ${a.color}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{a.icon}</div>
                    <div>
                      <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 11, marginBottom: 2 }}>{a.title}</div>
                      <div style={{ color: "#475569", fontSize: 9, lineHeight: 1.4, marginBottom: 4 }}>{a.desc}</div>
                      <span style={{ padding: "2px 7px", borderRadius: 100, fontSize: 8, fontWeight: 700, color: a.color, background: `${a.color}18`, border: `1px solid ${a.color}33` }}>{a.tag}</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div style={{ margin: "20px 18px", padding: 16, background: "rgba(255,255,255,.012)", border: "1px dashed rgba(255,255,255,.05)", borderRadius: 14, textAlign: "center", minHeight: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div><div style={{ color: "#1e293b", fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>ADVERTISEMENT</div><div style={{ color: "#0f172a", fontSize: 9 }}>Google AdSense · 320×90</div></div>
          </div>

          <div style={{ textAlign: "center", padding: "0 18px 10px", display: "flex", justifyContent: "center", gap: 20 }}>
            <a href="/privacy" style={{ color: "#334155", fontSize: 9 }}>Privacy Policy</a>
            <a href="/terms" style={{ color: "#334155", fontSize: 9 }}>Terms of Service</a>
          </div>
          <div style={{ textAlign: "center", padding: "4px 18px 40px", color: "#1e293b", fontSize: 9, letterSpacing: 2, fontFamily: "'JetBrains Mono',monospace" }}>
            LIFEPATH AI · POWERED BY GEMINI · 🇮🇳
          </div>
        </div>
      )}

      {/* CHAT */}
      {screen === "chat" && pillar && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", zIndex: 1 }}>
          <div style={{ padding: "11px 14px", background: "rgba(6,11,20,.97)", borderBottom: "1px solid rgba(255,255,255,.05)", backdropFilter: "blur(24px)", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 10 }}>
            <button className="btn" onClick={() => setScreen("home")}
              style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 11, width: 34, height: 34, color: "#64748b", fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: `rgba(${pillar.rgb},.1)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{pillar.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#dde4ee", fontWeight: 700, fontSize: 12 }}>{pillar.label}</div>
              <div style={{ color: "#334155", fontSize: 9 }}>{pillar.sub}</div>
            </div>
            {streak > 0 && (
              <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 100, padding: "3px 9px", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 12 }}>🔥</span>
                <span style={{ color: "#f59e0b", fontWeight: 700, fontSize: 11 }}>{streak}</span>
              </div>
            )}
            <button className="btn" onClick={clearChat}
              style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 9, padding: "5px 9px", color: "#475569", fontSize: 9 }}>Clear</button>
            <div style={{ background: "rgba(6,182,212,.07)", border: "1px solid rgba(6,182,212,.2)", borderRadius: 100, padding: "3px 9px", display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#06b6d4", animation: "pulse 2s infinite" }} />
              <span style={{ color: "#06b6d4", fontSize: 9, fontWeight: 700 }}>LIVE</span>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "16px 13px" }}>
            {curMsgs.map((msg, i) => {
              const isAI = msg.role === "assistant";
              if (!isAI) return (
                <div key={i} style={{ marginBottom: 14, display: "flex", justifyContent: "flex-end", animation: "fadeUp .3s both" }}>
                  <div style={{ background: `linear-gradient(135deg,${pillar.color},${pillar.color}bb)`, borderRadius: "16px 16px 4px 16px", padding: "11px 15px", maxWidth: "82%", color: "#fff", fontSize: 13, lineHeight: 1.65 }}>
                    {msg.content?.length > 500 ? msg.content.substring(0, 500) + "..." : msg.content}
                  </div>
                </div>
              );
              return (
                <div key={i} style={{ marginBottom: 16, animation: "fadeUp .3s both" }}>
                  {msg.structured ? (
                    <TaskCard
                      data={msg.structured}
                      pillar={pillar}
                      onShare={() => setShareData(msg.structured?.task || "")}
                      onTaskDone={() => handleTaskDone(pillar.id)}
                    />
                  ) : msg.content ? (
                    <div style={{ background: "rgba(255,255,255,.022)", border: "1px solid rgba(255,255,255,.065)", borderRadius: "4px 16px 16px 16px", padding: "14px", maxWidth: "98%" }}>
                      <div style={{ color: "#06b6d4", fontSize: 9, letterSpacing: 2.5, fontWeight: 700, marginBottom: 10, fontFamily: "'JetBrains Mono',monospace" }}>🛡️ LIFEPATH AI</div>
                      <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{msg.content}</div>
                    </div>
                  ) : null}
                </div>
              );
            })}

            {loading && (
              <div style={{ background: "rgba(255,255,255,.022)", border: "1px solid rgba(255,255,255,.065)", borderRadius: "4px 16px 16px 16px", padding: "12px 16px", display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={{ color: "#06b6d4", fontSize: 9, letterSpacing: 2, fontFamily: "'JetBrains Mono',monospace" }}>ANALYZING</span>
                {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "#06b6d4", animation: `dot 1.3s ${i*.22}s infinite` }} />)}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div style={{ padding: "10px 13px 28px", background: "rgba(6,11,20,.97)", borderTop: "1px solid rgba(255,255,255,.04)", backdropFilter: "blur(24px)" }}>
            {cvFile && (
              <div style={{ marginBottom: 9, padding: "7px 13px", background: "rgba(6,182,212,.07)", border: "1px solid rgba(6,182,212,.2)", borderRadius: 10, color: "#06b6d4", fontSize: 11, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>📎 {cvFile.name}</span>
                <button onClick={() => { setCvFile(null); setInput(""); }} style={{ background: "none", border: "none", color: "#ef4444", fontSize: 13, cursor: "pointer" }}>✕</button>
              </div>
            )}
            <div style={{ display: "flex", gap: 9, alignItems: "flex-end" }}>
              {pillar?.id === "cv" && (
                <>
                  <input ref={fileRef} type="file" accept=".txt,.doc,.docx,.pdf" onChange={handleFileUpload} style={{ display: "none" }} />
                  <button className="btn" onClick={() => fileRef.current?.click()}
                    style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0, background: "rgba(6,182,212,.08)", border: "1px solid rgba(6,182,212,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>📎</button>
                </>
              )}
              <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
                placeholder="Tell me about yourself or ask anything..."
                rows={2}
                style={{ flex: 1, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: "11px 13px", color: "#e2e8f0", fontSize: 13, resize: "none", lineHeight: 1.55, transition: "border-color .2s" }}
                onFocus={e => e.target.style.borderColor = pillar.color + "66"}
                onBlur={e => e.target.style.borderColor = "rgba(255,255,255,.07)"} />
              <button className="btn" onClick={sendMessage} disabled={loading || !input.trim()}
                style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0, background: loading || !input.trim() ? "rgba(255,255,255,.04)" : `linear-gradient(135deg,${pillar.color},${pillar.color}88)`, border: "none", cursor: loading || !input.trim() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, boxShadow: !loading && input.trim() ? `0 4px 16px rgba(${pillar.rgb},.3)` : "none" }}>
                {loading ? "⏳" : "↑"}
              </button>
            </div>
            <div style={{ color: "#1e293b", fontSize: 8, textAlign: "center", marginTop: 6, letterSpacing: 2, fontFamily: "'JetBrains Mono',monospace" }}>
              LIFEPATH AI · YOUR GROWTH COMPANION 🛡️
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
