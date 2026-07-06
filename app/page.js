"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { db } from "../lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { getUserId } from "../lib/user";

const S = {
  get: (k, fb = null) => { try { const d = localStorage.getItem(k); return d ? JSON.parse(d) : fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};


const saveFeedback = async ({ rating, reason, pillar }) => {
  console.log("=== FEEDBACK DEBUG START ===");
  console.log("1. saveFeedback called with:", { rating, reason, pillar });
  console.log("2. db object:", db);
  console.log("3. userId:", getUserId());

  try {
    const colRef = collection(db, "feedback");
    console.log("4. Collection reference created:", colRef);

    const docData = {
      userId: getUserId(),
      pillar: pillar || "unknown",
      rating,
      reason: reason || "",
      timestamp: serverTimestamp(),
    };
    console.log("5. Document data to save:", docData);

    const docRef = await addDoc(colRef, docData);
    console.log("6. SUCCESS! Document written with ID:", docRef.id);
    console.log("=== FEEDBACK DEBUG END (SUCCESS) ===");
    return { success: true, id: docRef.id };
  } catch (e) {
    console.error("6. FIREBASE ERROR CODE:", e.code);
    console.error("6. FIREBASE ERROR MESSAGE:", e.message);
    console.error("6. FULL ERROR OBJECT:", e);
    console.log("=== FEEDBACK DEBUG END (FAILED) ===");
    return { success: false, error: e.message || "Unknown error" };
  }
};

const FREE_LIMIT = 100;
const getUsage = () => {
  const today = new Date().toDateString();
  const u = S.get("lp_usage", { date: today, count: 0 });
  if (u.date !== today) { const f = { date: today, count: 0 }; S.set("lp_usage", f); return f; }
  return u;
};

const getMemory = () => S.get("lp_memory", {
  name: "", goal: "", pillarId: "", education: "", location: "",
  skills: "", experience: "", selectedGoal: "", goalStep: 1,
  lastTask: "", lastTaskDate: "", companiesApplied: [],
  completedTasks: [], wins: [], failures: [], streak: 0, progress: 0,
});

const updateMemory = (updates) => {
  const current = getMemory();
  const updated = { ...current, ...updates };
  if (updates.companiesApplied?.length) {
    updated.companiesApplied = [...new Set([...current.companiesApplied, ...updates.companiesApplied])];
  }
  if (updates.newWin) {
    updated.wins = [...current.wins, updates.newWin];
  }
  if (updates.newFailure) {
    updated.failures = [...current.failures, updates.newFailure];
  }
  if (updates.lastTask && !current.completedTasks.includes(updates.lastTask)) {
    updated.completedTasks = [...current.completedTasks, updates.lastTask];
  }
  S.set("lp_memory", updated);
  return updated;
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
  { id: "startup", icon: "🚀", label: "Startup Validator", sub: "Validate · Score · Launch", color: "#ec4899", rgb: "236,72,153" },
];

const AFFS = [
  { icon: "🎯", title: "Udemy Courses", desc: "Boost skills. Get hired faster.", tag: "From ₹449", url: "https://www.udemy.com", color: "#a855f7" },
  { icon: "📈", title: "Groww SIP", desc: "Start investing from ₹100/month.", tag: "Free Account", url: "https://groww.in", color: "#10b981" },
  { icon: "🌍", title: "NORKA Gulf Jobs", desc: "Free govt Gulf placement.", tag: "100% Free", url: "https://norkaroots.kerala.gov.in", color: "#06b6d4" },
  { icon: "💻", title: "Upwork Freelance", desc: "Earn dollars from your skills.", tag: "Free Join", url: "https://www.upwork.com", color: "#6366f1" },
  { icon: "🚀", title: "KSUM Startup Grant", desc: "Kerala govt funding up to ₹10L.", tag: "Free Apply", url: "https://startupmission.kerala.gov.in", color: "#ec4899" },
  { icon: "⚡", title: "Meesho Reselling", desc: "Sell from home. UPI payment.", tag: "Zero Investment", url: "https://supplier.meesho.com", color: "#f59e0b" },
];

const PILLAR_REFLECTION = {
  career: "Tell me how it went — what happened?\n\n💬 Share what you did.\n\n→ I updated my LinkedIn and it looks much better\n→ I identified a skill gap I didn't know about\n→ I am still confused about direction",
  jobs: "Tell me how it went — what happened?\n\n💬 Share anything — good or bad.\n\n→ I applied and got a callback\n→ I applied but no response yet\n→ The site had no openings for my role",
  cv: "Tell me how it went — what happened?\n\n💬 Share what you changed.\n\n→ I updated my CV summary — looks stronger\n→ I found my CV was missing important keywords\n→ I am not sure which keywords to add",
  wealth: "Tell me how it went — what happened?\n\n💬 Share what you found.\n\n→ I tracked expenses and found where money goes\n→ I opened a savings account successfully\n→ I am spending more than I thought",
  hustle: "Tell me how it went — what happened?\n\n💬 Share what you did.\n\n→ I approached a local shop and they are interested\n→ I created my profile and published my first gig\n→ I found it hard to decide what service to offer",
  startup: "Tell me how it went — what happened?\n\n💬 Share what you found.\n\n→ I talked to 5 people — they confirmed the problem\n→ I talked to people but nobody seemed interested\n→ I found a competitor I didn't know about",
};

const GOAL_OPTIONS = {
  career: ["Protect job from AI automation", "Get promoted in current role", "Switch to better career field", "Identify and fill skill gaps", "Plan 5-year career path"],
  jobs: ["Get first job within 30 days", "Get first job within 60 days", "Switch to better company", "Get Gulf job", "Get remote job"],
  cv: ["Build first professional CV", "Improve CV to pass ATS", "Tailor CV for specific role", "Get CV score above 80%"],
  wealth: ["Save first Rs 10,000", "Build 3-month emergency fund", "Get out of debt", "Start Rs 500 SIP investing", "Reach Rs 1 lakh savings"],
  hustle: ["Earn first Rs 1,000", "Earn Rs 5,000/month", "Earn Rs 10,000/month", "Build Rs 20,000/month income"],
  startup: ["Validate my startup idea", "Get first 10 customers", "Build and launch MVP", "Apply for KSUM grant", "Reach first Rs 1 lakh revenue"],
};

const getPillarFirstQuestion = (pillarId, name, memory) => {
  const n = name || memory?.name || "";
  const lastName = memory?.lastTask;
  const greeting = n ? `Hi ${n}! ` : "Hi! ";

  if (lastName) {
    return `${greeting}Welcome back! 🛡️\n\nLast time you worked on: "${lastName}"\n\nHow did it go? Tell me what happened — I'll give your next step based on your result.\n\n→ It went well — I completed it\n→ I tried but faced a problem\n→ I haven't done it yet`;
  }

  const q = {
    career: `${greeting}Welcome to Career Guard 🛡️\n\nWhat part of your career do you want to protect or improve right now?\n\n💬 HOW TO GET THE BEST HELP:\n→ "I am an MEP engineer worried AI will replace my job"\n→ "I completed EEE but confused whether to go Gulf or stay Kerala"\n→ "I work as site engineer 2 years but feel stuck"`,
    jobs: `${greeting}Welcome to Job Finder 🔍\n\nTell me your target role, city, and how long you have been searching.\n\n💬 HOW TO GET THE BEST HELP:\n→ "MEP Electrical fresher from Kochi, targeting draftsman, 2 months searching"\n→ "AutoCAD skills, want office job in Malappuram, 3 months, no response"\n→ "IT fresher from Thrissur, software jobs 4 months, no callbacks"`,
    cv: `${greeting}Welcome to CV Builder 📄\n\nTell me your target role, whether you have a CV, and what feels weak.\n\n💬 HOW TO GET THE BEST HELP:\n→ "Targeting MEP draftsman, have CV but keeps getting rejected, keywords missing"\n→ "Building CV from scratch for IT fresher jobs in Kochi"\n→ "Have CV, targeting AutoCAD roles, summary section very weak"`,
    wealth: `${greeting}Welcome to Wealth Guard 💰\n\nTell me your monthly income, biggest money worry, and savings status.\n\n💬 HOW TO GET THE BEST HELP:\n→ "Earn Rs 18,000/month, spend almost everything, zero savings"\n→ "Earn Rs 25,000, have Rs 5,000 saved, want to start investing"\n→ "Credit card debt Rs 50,000, no savings, earn Rs 20,000"`,
    hustle: `${greeting}Welcome to Side Hustle 💸\n\nWhat skills do you have, how many hours free daily, and fast or long-term income?\n\n💬 HOW TO GET THE BEST HELP:\n→ "Know Canva and video editing, 2 free hours, want fast money"\n→ "Good at writing, free 3 hours evening, want long-term income"\n→ "No digital skill but have smartphone and 1 free hour"`,
    startup: `${greeting}Welcome to Startup Validator 🚀\n\nTell me your exact idea, who it helps, what problem it solves, and your current stage.\n\n💬 HOW TO GET THE BEST HELP:\n→ "Tiffin delivery for office workers in Kochi — idea stage"\n→ "App to connect plumbers with customers in Kerala — early stage"\n→ "Want to sell handmade items online — made 5 pieces, want to validate"`,
  };
  return q[pillarId] || q.career;
};

const ValidationScore = ({ score, pillarColor, pillarRgb }) => {
  if (!score) return null;
  const getColor = (val, max) => {
    const pct = val / max;
    if (pct >= 0.7) return "#10b981";
    if (pct >= 0.4) return "#f59e0b";
    return "#ef4444";
  };
  return (
    <div style={{ padding: "16px", background: "rgba(255,255,255,.02)", borderRadius: 16, border: `1px solid rgba(${pillarRgb},.2)`, marginTop: 12 }}>
      <div style={{ color: pillarColor, fontSize: 9, fontWeight: 700, letterSpacing: 2, marginBottom: 12 }}>📊 STARTUP VALIDATION SCORE</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: `rgba(${pillarRgb},.1)`, border: `3px solid ${getColor(score.overall, 100)}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ color: getColor(score.overall, 100), fontSize: 20, fontWeight: 900 }}>{score.overall}</span>
        </div>
        <div>
          <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 14 }}>Overall Score</div>
          <div style={{ color: "#64748b", fontSize: 11 }}>out of 100</div>
        </div>
      </div>
      {[
        { label: "Market", val: score.market },
        { label: "Problem", val: score.problem },
        { label: "Competition", val: score.competition },
        { label: "Execution", val: score.execution },
      ].map((s, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: "#94a3b8", fontSize: 11 }}>{s.label}</span>
            <span style={{ color: getColor(s.val, 10), fontSize: 11, fontWeight: 700 }}>{s.val}/10</span>
          </div>
          <div style={{ background: "rgba(255,255,255,.08)", borderRadius: 100, height: 4 }}>
            <div style={{ height: 4, borderRadius: 100, width: `${(s.val / 10) * 100}%`, background: getColor(s.val, 10) }} />
          </div>
        </div>
      ))}
      {score.strengths?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: "#10b981", fontSize: 10, fontWeight: 700, marginBottom: 6 }}>✅ STRENGTHS</div>
          {score.strengths.map((s, i) => <div key={i} style={{ color: "#94a3b8", fontSize: 12, marginBottom: 3 }}>• {s}</div>)}
        </div>
      )}
      {score.weaknesses?.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ color: "#ef4444", fontSize: 10, fontWeight: 700, marginBottom: 6 }}>⚠️ WEAKNESSES</div>
          {score.weaknesses.map((w, i) => <div key={i} style={{ color: "#94a3b8", fontSize: 12, marginBottom: 3 }}>• {w}</div>)}
        </div>
      )}
      {score.risk && (
        <div style={{ marginTop: 10, padding: "10px", background: "rgba(239,68,68,.06)", borderRadius: 10, border: "1px solid rgba(239,68,68,.15)" }}>
          <div style={{ color: "#ef4444", fontSize: 10, fontWeight: 700, marginBottom: 4 }}>🔴 RISK</div>
          <div style={{ color: "#94a3b8", fontSize: 12 }}>{score.risk}</div>
        </div>
      )}
    </div>
  );
};

const ProgressDashboard = ({ memory, pillar, onClose }) => {
  const wins = memory.wins || [];
  const completed = memory.completedTasks || [];
  const progress = memory.progress || 0;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 300, display: "flex", alignItems: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#0a1020", borderRadius: "22px 22px 0 0", padding: "24px 20px 48px", border: "1px solid rgba(255,255,255,0.07)", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>📊 Your Progress</div>
            <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>{memory.selectedGoal || "No goal set yet"}</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 100, padding: "6px 14px", color: "#64748b", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Close</button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ color: "#94a3b8", fontSize: 12 }}>Overall Progress</span>
            <span style={{ color: pillar.color, fontSize: 12, fontWeight: 700 }}>{progress}%</span>
          </div>
          <div style={{ background: "rgba(255,255,255,.08)", borderRadius: 100, height: 8 }}>
            <div style={{ height: 8, borderRadius: 100, width: `${progress}%`, background: `linear-gradient(90deg,${pillar.color}88,${pillar.color})`, transition: "width 1s ease", boxShadow: `0 0 10px ${pillar.color}66` }} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Tasks Done", value: completed.length, icon: "✅" },
            { label: "Wins", value: wins.length, icon: "🏆" },
            { label: "Day Streak", value: memory.streak || 0, icon: "🔥" },
          ].map((stat, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,.04)", borderRadius: 14, padding: "14px 10px", textAlign: "center", border: "1px solid rgba(255,255,255,.07)" }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{stat.icon}</div>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 20 }}>{stat.value}</div>
              <div style={{ color: "#64748b", fontSize: 10, marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {wins.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: "#f59e0b", fontSize: 11, fontWeight: 700, letterSpacing: 2, marginBottom: 10 }}>🏆 YOUR WINS</div>
            {wins.map((w, i) => (
              <div key={i} style={{ padding: "10px 14px", background: "rgba(245,158,11,.06)", border: "1px solid rgba(245,158,11,.2)", borderRadius: 12, marginBottom: 8 }}>
                <span style={{ color: "#f59e0b", fontSize: 13 }}>🎉 {w}</span>
              </div>
            ))}
          </div>
        )}

        {completed.length > 0 && (
          <div>
            <div style={{ color: "#10b981", fontSize: 11, fontWeight: 700, letterSpacing: 2, marginBottom: 10 }}>✅ COMPLETED TASKS</div>
            {completed.slice(-5).map((t, i) => (
              <div key={i} style={{ padding: "9px 14px", background: "rgba(16,185,129,.04)", border: "1px solid rgba(16,185,129,.1)", borderRadius: 10, marginBottom: 6 }}>
                <span style={{ color: "#64748b", fontSize: 12 }}>• {t}</span>
              </div>
            ))}
          </div>
        )}

        {completed.length === 0 && wins.length === 0 && (
          <div style={{ textAlign: "center", padding: "30px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🚀</div>
            <div style={{ color: "#64748b", fontSize: 14 }}>Complete your first task to start tracking progress!</div>
          </div>
        )}
      </div>
    </div>
  );
};

const GoalSelector = ({ pillarId, pillarColor, pillarRgb, onSelect, onClose }) => {
  const goals = GOAL_OPTIONS[pillarId] || [];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 300, display: "flex", alignItems: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#0a1020", borderRadius: "22px 22px 0 0", padding: "24px 20px 44px", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 18, marginBottom: 6 }}>🎯 Set Your Goal</div>
        <div style={{ color: "#64748b", fontSize: 12, marginBottom: 20 }}>Choose your goal — AI will create a roadmap for you</div>
        {goals.map((g, i) => (
          <button key={i} onClick={() => onSelect(g)}
            style={{ width: "100%", padding: "14px 16px", background: "rgba(255,255,255,.04)", border: `1px solid rgba(${pillarRgb},.2)`, borderRadius: 14, color: "#e2e8f0", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 10, textAlign: "left" }}>
            🎯 {g}
          </button>
        ))}
        <button onClick={onClose} style={{ width: "100%", padding: 12, background: "transparent", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, color: "#64748b", fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginTop: 4 }}>Cancel</button>
      </div>
    </div>
  );
};

const TaskCard = ({ data, pillar, onShare, onTaskDone, onFillInput }) => {
  const [done, setDone] = useState(false);
  const [fbState, setFbState] = useState("idle");
  if (!data) return null;

  const [fbError, setFbError] = useState("");

const handlePositive = async () => {
  setFbState("saving");
  setFbError("");
  const result = await saveFeedback({ rating: "positive", pillar: pillar.id });
  if (result.success) {
    setFbState("saved");
  } else {
    setFbState("error");
    setFbError(result.error);
  }
};

const handleNegativeReason = async (reason) => {
  setFbState("saving");
  setFbError("");
  const result = await saveFeedback({ rating: "negative", reason, pillar: pillar.id });
  if (result.success) {
    setFbState("saved");
  } else {
    setFbState("error");
    setFbError(result.error);
  }
};

  const renderSteps = (text) => {
    if (!text) return null;
    return text.split("\n").map(l => l.trim()).filter(l => l.length > 0).map((line, i) => {
      const match = line.match(/^Step\s*(\d+):\s*(.*)/i);
      if (match) return (
        <div key={i} style={{ display: "flex", gap: 12, marginBottom: 13, alignItems: "flex-start" }}>
          <div style={{ width: 26, height: 26, borderRadius: "50%", background: `rgba(${pillar.rgb},.15)`, border: `1px solid rgba(${pillar.rgb},.35)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ color: pillar.color, fontSize: 11, fontWeight: 800 }}>{match[1]}</span>
          </div>
          <span style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.7, flex: 1 }}>{match[2]}</span>
        </div>
      );
      return (
        <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#334155", flexShrink: 0, marginTop: 8 }} />
          <span style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.7 }}>{line}</span>
        </div>
      );
    });
  };

  const renderLines = (text, isHint = false) => {
    if (!text) return null;
    return text.split("\n").map((line, i) => {
      const t = line.trim();
      if (!t) return <div key={i} style={{ height: 4 }} />;
      if (t.startsWith("→")) {
        const example = t.replace("→", "").trim();
        return (
          <div key={i}
            onClick={() => onFillInput && onFillInput(example)}
            style={{ display: "flex", gap: 8, marginTop: 7, padding: isHint ? "7px 10px" : "10px 12px", background: isHint ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.04)", borderRadius: 10, border: "1px solid rgba(255,255,255,.07)", cursor: "pointer" }}
            onTouchStart={e => e.currentTarget.style.background = `rgba(${pillar.rgb},.1)`}
            onTouchEnd={e => e.currentTarget.style.background = isHint ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.04)"}>
            <span style={{ color: pillar.color, fontSize: isHint ? 11 : 13, fontWeight: 700, flexShrink: 0 }}>→</span>
            <span style={{ color: isHint ? "#475569" : "#94a3b8", fontSize: isHint ? 11 : 12, lineHeight: 1.6 }}>{example}</span>
          </div>
        );
      }
      if (t.startsWith("💬") || t.toLowerCase().startsWith("how to")) {
        return <div key={i} style={{ color: "#475569", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginTop: 12, marginBottom: 2 }}>{t}</div>;
      }
      return <div key={i} style={{ color: isHint ? "#334155" : "#e2e8f0", fontSize: isHint ? 11 : 14, fontWeight: isHint ? 400 : 600, lineHeight: 1.6, marginBottom: 2 }}>{t}</div>;
    });
  };

  return (
    <div style={{ borderRadius: 20, overflow: "hidden", marginBottom: 4, border: `1px solid rgba(${pillar.rgb},.2)`, background: "rgba(255,255,255,.018)" }}>

      <div style={{ background: `rgba(${pillar.rgb},.08)`, padding: "13px 16px", borderBottom: `1px solid rgba(${pillar.rgb},.1)` }}>
        <div style={{ color: pillar.color, fontSize: 9, fontWeight: 700, letterSpacing: 2.5, marginBottom: 5 }}>
          🛡️ LIFEPATH AI · {pillar.label.toUpperCase()}
        </div>
        <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600, lineHeight: 1.5 }}>{data.summary}</div>
      </div>

      {data.coach_note && (
        <div style={{ padding: "11px 16px", borderBottom: "1px solid rgba(255,255,255,.04)", background: "rgba(99,102,241,.03)" }}>
          <span style={{ color: "#6366f1", fontSize: 10, fontWeight: 700 }}>🎯 COACH: </span>
          <span style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.6 }}>{data.coach_note}</span>
        </div>
      )}

      {data.insight && (
        <div style={{ padding: "11px 16px", borderBottom: "1px solid rgba(255,255,255,.04)", background: "rgba(6,182,212,.025)" }}>
          <span style={{ color: "#06b6d4", fontSize: 10, fontWeight: 700 }}>💡 </span>
          <span style={{ color: "#64748b", fontSize: 12, lineHeight: 1.6 }}>{data.insight}</span>
        </div>
      )}

      {data.roadmap_step && (
        <div style={{ padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,.04)", background: `rgba(${pillar.rgb},.03)` }}>
          <span style={{ color: pillar.color, fontSize: 10, fontWeight: 700 }}>🗺️ {data.roadmap_step}</span>
        </div>
      )}

      {data.win_detected && (
        <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.04)", background: "rgba(245,158,11,.06)", border: "1px solid rgba(245,158,11,.2)" }}>
          <div style={{ color: "#f59e0b", fontSize: 12, fontWeight: 700, marginBottom: 2 }}>🏆 WIN RECORDED!</div>
          <div style={{ color: "#94a3b8", fontSize: 12 }}>{data.win_detected}</div>
        </div>
      )}

      {data.task && (
        <div style={{ padding: "18px 16px", borderBottom: "1px solid rgba(255,255,255,.05)", background: `rgba(${pillar.rgb},.05)` }}>
          <div style={{ color: pillar.color, fontSize: 9, fontWeight: 700, letterSpacing: 2.5, marginBottom: 10 }}>⚡ YOUR TASK TODAY</div>
          <div style={{ color: "#ffffff", fontSize: 18, fontWeight: 900, lineHeight: 1.4, marginBottom: 8 }}>{data.task}</div>
          {data.why_this_task && (
            <div style={{ color: "#64748b", fontSize: 12, lineHeight: 1.6 }}>
              <span style={{ color: "#475569", fontWeight: 600 }}>Why: </span>{data.why_this_task}
            </div>
          )}
        </div>
      )}

      {data.how_to_do && (
        <div style={{ padding: "16px 16px", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
          <div style={{ color: "#475569", fontSize: 9, fontWeight: 700, letterSpacing: 2, marginBottom: 14 }}>📋 HOW TO DO</div>
          {renderSteps(data.how_to_do)}
        </div>
      )}

      {data.what_to_do && (
        <div style={{ padding: "13px 16px", borderBottom: "1px solid rgba(255,255,255,.04)", background: "rgba(255,255,255,.01)" }}>
          <div style={{ color: "#475569", fontSize: 9, fontWeight: 700, letterSpacing: 2, marginBottom: 7 }}>✅ WHAT TO DO</div>
          <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.7 }}>{data.what_to_do}</div>
        </div>
      )}

      {(data.where_to_do || data.task_link) && (
        <div style={{ padding: "13px 16px", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
          <div style={{ color: "#475569", fontSize: 9, fontWeight: 700, letterSpacing: 2, marginBottom: 10 }}>📍 WHERE TO DO</div>
          {data.task_link ? (
            <a href={data.task_link} target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 20px", background: `linear-gradient(135deg,${pillar.color},${pillar.color}99)`, borderRadius: 100, color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none", boxShadow: `0 4px 14px rgba(${pillar.rgb},.3)` }}>
              {data.task_link_label || "Open Now"} →
            </a>
          ) : (
            <div style={{ color: "#94a3b8", fontSize: 13 }}>{data.where_to_do}</div>
          )}
        </div>
      )}

      {data.validation_score && (
        <div style={{ padding: "0 16px 16px" }}>
          <ValidationScore score={data.validation_score} pillarColor={pillar.color} pillarRgb={pillar.rgb} />
        </div>
      )}

      {data.success && (
        <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,.04)", background: "rgba(16,185,129,.03)" }}>
          <span style={{ color: "#10b981", fontSize: 12, fontWeight: 700 }}>🎯 {data.success}</span>
        </div>
      )}

      {data.motivation && (
        <div style={{ padding: "11px 16px", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
          <div style={{ color: "#64748b", fontSize: 13, fontStyle: "italic", lineHeight: 1.6 }}>💪 {data.motivation}</div>
        </div>
      )}

      {data.task && (
        <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
          {!done ? (
            <button onClick={() => { setDone(true); onTaskDone?.(); }}
              style={{ width: "100%", padding: "14px", background: `rgba(${pillar.rgb},.08)`, border: `2px solid rgba(${pillar.rgb},.3)`, borderRadius: 14, color: pillar.color, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              ✓ Mark as Done
            </button>
          ) : (
            <div>
              <div style={{ padding: "14px", background: "rgba(16,185,129,.1)", border: "2px solid rgba(16,185,129,.3)", borderRadius: 14, color: "#10b981", fontWeight: 800, fontSize: 14, textAlign: "center", marginBottom: 12 }}>
                ✅ Task Completed! Come back tomorrow 🔥
              </div>
              <div style={{ padding: "13px 14px", background: "rgba(6,182,212,.05)", border: "1px solid rgba(6,182,212,.15)", borderRadius: 12 }}>
                <div style={{ color: "#06b6d4", fontSize: 11, fontWeight: 700, marginBottom: 4 }}>💬 Tell me how it went</div>
                <div style={{ color: "#64748b", fontSize: 12, lineHeight: 1.6 }}>Type below — I'll give your next step based on your result.</div>
              </div>
            </div>
          )}
        </div>
      )}

      {data.next_step && (
        <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.04)", background: "rgba(99,102,241,.03)" }}>
          <div style={{ color: "#6366f1", fontSize: 9, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>🔒 NEXT LOCKED STEP</div>
          <div style={{ color: "#475569", fontSize: 12, lineHeight: 1.6 }}>{data.next_step}</div>
        </div>
      )}

      {data.needs_more_info && data.follow_up_question && (
        <div style={{ padding: "14px 16px", background: `rgba(${pillar.rgb},.04)`, borderBottom: "1px solid rgba(255,255,255,.04)" }}>
          <div style={{ color: pillar.color, fontSize: 9, fontWeight: 700, letterSpacing: 2, marginBottom: 10 }}>❓ TELL ME MORE</div>
          {renderLines(data.follow_up_question, false)}
        </div>
      )}

      {data.help_hint && (
        <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.04)", background: "rgba(255,255,255,.008)" }}>
          <div style={{ color: "#334155", fontSize: 9, fontWeight: 700, letterSpacing: 2, marginBottom: 6 }}>💡 TIP</div>
          {renderLines(data.help_hint, true)}
        </div>
      )}

      {data.task && fbState !== "saved" && (
        <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
          <div style={{ color: "#475569", fontSize: 11, fontWeight: 600, marginBottom: 10, textAlign: "center" }}>
            Did LifePath AI help you?
          </div>
          {fbState === "idle" && (
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handlePositive}
                style={{ flex: 1, padding: "11px", background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.25)", borderRadius: 12, color: "#10b981", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                👍 Helpful
              </button>
              <button onClick={() => setFbState("showReasons")}
                style={{ flex: 1, padding: "11px", background: "rgba(239,68,68,.07)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 12, color: "#ef4444", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                👎 Not Helpful
              </button>
            </div>
          )}
          {fbState === "showReasons" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {["Wrong Advice", "Too Generic", "Confusing", "Didn't Solve My Problem"].map((r, i) => (
                <button key={i} onClick={() => handleNegativeReason(r)}
                  style={{ padding: "10px 8px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, color: "#94a3b8", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  {r}
                </button>
              ))}
            </div>
          )}
          {fbState === "saving" && (
            <div style={{ textAlign: "center", color: "#475569", fontSize: 12 }}>Saving...</div>
          )}
        </div>
      )}
{fbState === "error" && (
  <div style={{ textAlign: "center", color: "#ef4444", fontSize: 11, padding: "8px", background: "rgba(239,68,68,.06)", borderRadius: 8, marginTop: 6 }}>
    ❌ Error: {fbError}
  </div>
)}

      {data.task && fbState === "saved" && (
        <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.04)", textAlign: "center" }}>
          <span style={{ color: "#10b981", fontSize: 12, fontWeight: 600 }}>
            🙏 Thanks for your feedback!
          </span>
        </div>
      )}

      <div style={{ padding: "10px 16px", display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onShare}
          style={{ padding: "6px 13px", background: "transparent", border: "1px solid rgba(255,255,255,.06)", borderRadius: 100, color: "#334155", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          📤 Share this
        </button>
      </div>
    </div>
  );
};

const ShareCard = ({ pillar, task, streak, onClose }) => {
  const streakText = streak > 0 ? `🔥 ${streak} day streak!\n` : "";
  const shareText = `🛡️ LifePath AI gave me my task for today!\n\n⚡ "${task || "Growth task"}"\n\n${streakText}\nIndia's first AI Growth Companion — FREE!\nMalayalam + English 🇮🇳\n\nTry: lifepath-ai-ovrt.vercel.app\n\n#LifePathAI #Growth #Kerala`;
  const handleShare = async () => {
    try {
      if (navigator.share) await navigator.share({ title: "LifePath AI", text: shareText, url: "https://lifepath-ai-ovrt.vercel.app" });
      else { await navigator.clipboard?.writeText(shareText); alert("✅ Copied!"); }
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
        <button onClick={onClose} style={{ width: "100%", padding: 11, background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, color: "#64748b", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
      </div>
    </div>
  );
};

export default function LifePathAI() {
  const [screen, setScreen] = useState("splash");
  const [pillar, setPillar] = useState(null);
  const [messages, setMessages] = useState(() => S.get("lp_chat_history", {}));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState(0);
  const [profile, setProfile] = useState(() => S.get("lp_profile", {}));
  const [memory, setMemory] = useState(() => getMemory());
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
  const [showDashboard, setShowDashboard] = useState(false);
  const [showGoalSelector, setShowGoalSelector] = useState(false);

  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  const textareaRef = useRef(null);
  const pdfJsLoaded = useRef(false);

  const fireToast = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); }, []);
  const fillInput = useCallback((text) => { setInput(text); setTimeout(() => textareaRef.current?.focus(), 100); }, []);

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

  const makeOpeningMsg = (pillarId, name, mem) => ({
    role: "assistant", content: null,
    structured: {
      summary: `Hi ${name || ""}! Welcome to ${PILLARS.find(p => p.id === pillarId)?.label} 🛡️`,
      coach_note: "", insight: "", task: null, how_to_do: null, what_to_do: null,
      where_to_do: null, success: null, why_this_task: null, task_link: null,
      task_link_label: null, motivation: null, next_step: null,
      roadmap_step: "", win_detected: "", validation_score: null,
      memory_update: null, help_hint: null, needs_more_info: true,
      follow_up_question: getPillarFirstQuestion(pillarId, name, mem),
    }
  });

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

    const newMemory = updateMemory({ name: onboardData.name, pillarId: assignedId, streak: ns.count });
    setMemory(newMemory);

    setAnalyzing(false);
    setPillar(ap);
    setMessages(m => ({ ...m, [assignedId]: [makeOpeningMsg(assignedId, onboardData.name, newMemory)] }));
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
    reader.onerror = () => fireToast("⚠️ File error.");
    reader.readAsText(file);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading || !pillar) return;
    const usage = getUsage();
    if (usage.count >= FREE_LIMIT) { fireToast("Daily limit reached. Come back tomorrow! 🌅"); return; }
    const userMsg = input.trim();
    setInput(""); setCvFile(null);
    const prev = messages[pillar.id] || [];
    const currentMemory = getMemory();
    const apiMessages = prev
      .filter(m => m.content || m.structured)
      .map(m => ({
        role: m.role,
        content: m.content || (m.structured
          ? `[AI: summary="${m.structured.summary || ""}" task="${m.structured.task || ""}" question="${m.structured.follow_up_question || ""}"]`
          : ""),
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
        body: JSON.stringify({ messages: apiMessages, pillarId: pillar.id, profile: { ...profile, ...currentMemory } })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.message || "Connection error. Please retry.");

      const aiMsg = { role: "assistant", content: data.reply || null, structured: data.structured || null };

      if (data.structured?.memory_update) {
        const mu = data.structured.memory_update;
        const updatedMem = updateMemory({ ...mu, streak: ns.count });
        setMemory(updatedMem);
      }

      setMessages(m => ({ ...m, [pillar.id]: [...newMsgs, aiMsg] }));
    } catch (err) {
      setMessages(m => ({ ...m, [pillar.id]: [...newMsgs, { role: "assistant", content: `⚠️ ${err.message || "Connection error. Please retry."}`, structured: null }] }));
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      if (!loading) sendMessage();
    }
  };
  const clearChat = () => {
    if (!pillar) return;
    setMessages(m => { const u = { ...m }; delete u[pillar.id]; S.set("lp_chat_history", u); return u; });
    fireToast("💬 Chat cleared");
    setTimeout(() => { setMessages(m => ({ ...m, [pillar.id]: [makeOpeningMsg(pillar.id, profile.name || "", memory)] })); }, 100);
  };

  const switchPillar = (p) => {
    setPillar(p); setShowAllPillars(false);
    if (!messages[p.id] || messages[p.id].length === 0) {
      setMessages(m => ({ ...m, [p.id]: [makeOpeningMsg(p.id, profile.name || "", memory)] }));
    }
    setScreen("chat");
  };

  const handleTaskDone = (pillarId) => {
    const reflection = PILLAR_REFLECTION[pillarId] || PILLAR_REFLECTION.career;
    setMessages(m => ({
      ...m,
      [pillarId]: [...(m[pillarId] || []), {
        role: "assistant", content: null,
        structured: {
          summary: "Amazing — task completed! 🎉", coach_note: "", insight: "", task: null,
          how_to_do: null, what_to_do: null, where_to_do: null, success: null,
          why_this_task: null, task_link: null, task_link_label: null,
          motivation: null, next_step: null, roadmap_step: "", win_detected: "",
          validation_score: null, memory_update: null, help_hint: null, needs_more_info: true,
          follow_up_question: reflection,
        }
      }]
    }));
  };

  const handleGoalSelect = (goal) => {
    const updatedMem = updateMemory({ selectedGoal: goal, goalStep: 1, progress: 5 });
    setMemory(updatedMem);
    setShowGoalSelector(false);
    fireToast(`🎯 Goal set: ${goal}`);
    if (pillar) {
      setInput(`My goal is: ${goal}. Please create my roadmap and give me my first task.`);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
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
      {showDashboard && pillar && <ProgressDashboard memory={memory} pillar={pillar} onClose={() => setShowDashboard(false)} />}
      {showGoalSelector && pillar && <GoalSelector pillarId={pillar.id} pillarColor={pillar.color} pillarRgb={pillar.rgb} onSelect={handleGoalSelect} onClose={() => setShowGoalSelector(false)} />}

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
            <div style={{ color: "#0d2535", fontSize: 11, letterSpacing: "0.2em", fontFamily: "'JetBrains Mono',monospace" }}>YOUR PERSONAL GROWTH COACH · ALWAYS WITH YOU</div>
          </div>
          <div style={{ marginTop: 70, display: "flex", gap: 9, animation: phase >= 1 ? "fadeIn .5s 1s both" : "none" }}>
            {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "#06b6d4", animation: `dot 1.5s ${i*.25}s infinite` }} />)}
          </div>
        </div>
      )}

      {screen === "welcome" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", zIndex: 1 }}>
          <div style={{ width: "100%", background: "#0a1020", borderRadius: "24px 24px 0 0", padding: "32px 22px 48px", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize: 38, marginBottom: 14, textAlign: "center" }}>🛡️</div>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: 22, marginBottom: 8, textAlign: "center" }}>Welcome to LifePath AI</div>
            <div style={{ color: "#64748b", fontSize: 13, lineHeight: 1.7, marginBottom: 22, textAlign: "center" }}>Your personal AI growth coach 🇮🇳<br />Remembers you · Tracks progress · Free forever</div>
            <div style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 14, padding: "14px 16px", marginBottom: 22 }}>
              <div style={{ color: "#f59e0b", fontSize: 11, fontWeight: 700, marginBottom: 7 }}>⚠️ DISCLAIMER</div>
              <div style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.7 }}>General guidance only — not professional financial, legal, or career advice.</div>
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

      {analyzing && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 1, padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 20 }}>🛡️</div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 20, marginBottom: 8, textAlign: "center" }}>Setting up your coach...</div>
          <div style={{ color: "#475569", fontSize: 13, marginBottom: 30, textAlign: "center" }}>Building your personal growth system</div>
          {["Reading your goals...", "Finding your best pillar...", "Setting up memory..."].map((txt, i) => (
            <div key={i} style={{ color: "#06b6d4", fontSize: 12, marginBottom: 8, animation: `fadeIn .5s ${i*.6}s both`, opacity: 0 }}>✓ {txt}</div>
          ))}
          <div style={{ width: "100%", maxWidth: 280, background: "rgba(255,255,255,0.05)", borderRadius: 100, height: 4, overflow: "hidden", marginTop: 20 }}>
            <div style={{ height: 4, borderRadius: 100, background: "linear-gradient(90deg,#06b6d4,#6366f1)", animation: "analyzing 2.5s ease forwards" }} />
          </div>
        </div>
      )}

      {screen === "home" && (
        <div style={{ flex: 1, overflowY: "auto", zIndex: 1 }}>
          <div style={{ position: "fixed", top: -100, left: "50%", transform: "translateX(-50%)", width: 500, height: 500, borderRadius: "50%", pointerEvents: "none", background: "radial-gradient(circle,rgba(6,182,212,.035) 0%,transparent 65%)" }} />

          <div style={{ padding: "20px 18px 0", display: "flex", justifyContent: "space-between", alignItems: "center", animation: "fadeUp .4s both" }}>
            <div>
              <span style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "-0.8px" }}>LifePath </span>
              <span style={{ fontSize: 22, fontWeight: 900, color: "#06b6d4", letterSpacing: "-0.8px" }}>AI</span>
              <div style={{ color: "#1e3a4a", fontSize: 8, letterSpacing: 2.5, fontFamily: "'JetBrains Mono',monospace", marginTop: 1 }}>YOUR GROWTH COACH 🛡️</div>
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
                  {memory.lastTask && <span style={{ color: "#334155", fontSize: 11, display: "block", marginTop: 2 }}>Last: {memory.lastTask}</span>}
                </div>
                <div style={{ padding: "18px 16px", background: `linear-gradient(135deg,rgba(${ap.rgb},.1),rgba(${ap.rgb},.05))`, border: `1px solid rgba(${ap.rgb},.25)`, borderRadius: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div>
                      <div style={{ color: ap.color, fontSize: 9, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>YOUR ACTIVE SHIELD</div>
                      <div style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>{ap.icon} {ap.label}</div>
                      {memory.selectedGoal && <div style={{ color: "#64748b", fontSize: 11, marginTop: 3 }}>🎯 {memory.selectedGoal}</div>}
                    </div>
                    {streak > 0 && (
                      <div style={{ textAlign: "right", background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.2)", borderRadius: 12, padding: "8px 12px" }}>
                        <div style={{ color: "#f59e0b", fontSize: 22, fontWeight: 800, lineHeight: 1 }}>🔥 {streak}</div>
                        <div style={{ color: "#64748b", fontSize: 9, marginTop: 2 }}>day streak</div>
                      </div>
                    )}
                  </div>

                  {memory.progress > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ color: "#64748b", fontSize: 10 }}>Goal Progress</span>
                        <span style={{ color: ap.color, fontSize: 10, fontWeight: 600 }}>{memory.progress}%</span>
                      </div>
                      <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 100, height: 5 }}>
                        <div style={{ height: 5, borderRadius: 100, width: `${Math.min(memory.progress, 100)}%`, background: `linear-gradient(90deg,${ap.color}88,${ap.color})`, transition: "width .8s ease", boxShadow: `0 0 8px ${ap.color}66` }} />
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn" onClick={() => { setPillar(ap); setScreen("chat"); }}
                      style={{ flex: 1, padding: "12px", background: ap.color, border: "none", borderRadius: 12, color: "#fff", fontWeight: 700, fontSize: 13, boxShadow: `0 4px 16px rgba(${ap.rgb},.3)` }}>
                      Continue Journey →
                    </button>
                    <button className="btn" onClick={() => setShowDashboard(true)}
                      style={{ padding: "12px 14px", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, color: "#94a3b8", fontSize: 12, fontWeight: 600 }}>
                      📊
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {memory.wins?.length > 0 && (
            <div style={{ margin: "12px 18px 0", padding: "14px 16px", background: "rgba(245,158,11,.06)", border: "1px solid rgba(245,158,11,.2)", borderRadius: 16 }}>
              <div style={{ color: "#f59e0b", fontWeight: 700, fontSize: 13, marginBottom: 4 }}>🏆 Latest Win!</div>
              <div style={{ color: "#94a3b8", fontSize: 12 }}>{memory.wins[memory.wins.length - 1]}</div>
            </div>
          )}

          {streak > 0 && STREAK_MILESTONES.includes(streak) && (
            <div style={{ margin: "12px 18px 0", padding: "16px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 16 }}>
              <div style={{ color: "#f59e0b", fontWeight: 800, fontSize: 16, marginBottom: 4 }}>🎉 {streak} Day Milestone!</div>
              <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 12 }}>Incredible consistency! Share your achievement!</div>
              <button className="btn" onClick={() => {
                const text = `🔥 ${streak} days with LifePath AI!\n\nGrowing daily 📈\n\nTry free: lifepath-ai-ovrt.vercel.app\n\n#LifePathAI #Growth #Kerala`;
                if (navigator.share) navigator.share({ title: "LifePath AI", text });
                else navigator.clipboard?.writeText(text).then(() => fireToast("Copied!"));
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

      {screen === "chat" && pillar && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", zIndex: 1 }}>
          <div style={{ padding: "11px 14px", background: "rgba(6,11,20,.97)", borderBottom: "1px solid rgba(255,255,255,.05)", backdropFilter: "blur(24px)", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 10 }}>
            <button className="btn" onClick={() => setScreen("home")}
              style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 11, width: 34, height: 34, color: "#64748b", fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: `rgba(${pillar.rgb},.1)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{pillar.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#dde4ee", fontWeight: 700, fontSize: 12 }}>{pillar.label}</div>
              <div style={{ color: "#334155", fontSize: 9 }}>{memory.selectedGoal || pillar.sub}</div>
            </div>
            {streak > 0 && (
              <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 100, padding: "3px 9px", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 12 }}>🔥</span>
                <span style={{ color: "#f59e0b", fontWeight: 700, fontSize: 11 }}>{streak}</span>
              </div>
            )}
            <button className="btn" onClick={() => setShowGoalSelector(true)}
              style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 9, padding: "5px 9px", color: "#475569", fontSize: 9 }}>🎯</button>
            <button className="btn" onClick={() => setShowDashboard(true)}
              style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 9, padding: "5px 9px", color: "#475569", fontSize: 9 }}>📊</button>
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
                  <div style={{ background: `linear-gradient(135deg,${pillar.color},${pillar.color}bb)`, borderRadius: "16px 16px 4px 16px", padding: "11px 15px", maxWidth: "82%", color: "#fff", fontSize: 13, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
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
                      onFillInput={fillInput}
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

            <div style={{ color: "#1e293b", fontSize: 9, textAlign: "right", marginBottom: 5, fontFamily: "'JetBrains Mono',monospace" }}>
              Enter = new line &nbsp;·&nbsp; Shift+Enter = send
            </div>
            <div style={{ display: "flex", gap: 9, alignItems: "flex-end" }}>
              {pillar?.id === "cv" && (
                <>
                  <input ref={fileRef} type="file" accept=".txt,.doc,.docx,.pdf" onChange={handleFileUpload} style={{ display: "none" }} />
                  <button className="btn" onClick={() => fileRef.current?.click()}
                    style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0, background: "rgba(6,182,212,.08)", border: "1px solid rgba(6,182,212,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>📎</button>
                </>
              )}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Type here... (tap an example above to fill)"
                rows={3}
                style={{ flex: 1, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: "11px 13px", color: "#e2e8f0", fontSize: 13, resize: "none", lineHeight: 1.55, transition: "border-color .2s" }}
                onFocus={e => e.target.style.borderColor = pillar.color + "66"}
                onBlur={e => e.target.style.borderColor = "rgba(255,255,255,.07)"} />
              <button className="btn" onClick={sendMessage} disabled={loading || !input.trim()}
                style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0, background: loading || !input.trim() ? "rgba(255,255,255,.04)" : `linear-gradient(135deg,${pillar.color},${pillar.color}88)`, border: "none", cursor: loading || !input.trim() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, boxShadow: !loading && input.trim() ? `0 4px 16px rgba(${pillar.rgb},.3)` : "none" }}>
                {loading ? "⏳" : "↑"}
              </button>
            </div>
            <div style={{ color: "#1e293b", fontSize: 8, textAlign: "center", marginTop: 6, letterSpacing: 2, fontFamily: "'JetBrains Mono',monospace" }}>
              LIFEPATH AI · YOUR GROWTH COACH · 🇮🇳
            </div>
          </div>
        </div>
      )}
    </div>
  );
                                           }
