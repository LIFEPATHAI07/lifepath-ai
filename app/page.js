"use client";
import { useState, useRef, useEffect, useCallback } from "react";

// ── STORAGE HELPER ─────────────────────────────────────────────
const S = {
  get: (k, fb = null) => {
    try { const d = localStorage.getItem(k); return d ? JSON.parse(d) : fb; }
    catch { return fb; }
  },
  set: (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); }
    catch {}
  },
};

// ── USAGE TRACKING ─────────────────────────────────────────────
const FREE_LIMIT = 100;
const getUsage = () => {
  const today = new Date().toDateString();
  const u = S.get("lp_usage", { date: today, count: 0 });
  if (u.date !== today) { const f = { date: today, count: 0 }; S.set("lp_usage", f); return f; }
  return u;
};

// ── PARSE METRICS ──────────────────────────────────────────────
const parseMetrics = (text) => {
  if (!text) return {};
  const m = {};
  const patterns = [
    ["ATS_SCORE", /ATS_SCORE:\s*(\d+)/i],
    ["AUTOMATION_RISK", /AUTOMATION_RISK:\s*(\d+)/i],
    ["SKILL_GAP_SCORE", /SKILL_GAP_SCORE:\s*(\d+)/i],
    ["MISSING_KEYWORDS", /MISSING_KEYWORDS:\s*([^\n]+)/i],
    ["RISK_LEVEL", /RISK_LEVEL:\s*(LOW|MEDIUM|HIGH)/i],
    ["EARNING_SCORE", /EARNING_SCORE:\s*(\d+)/i],
    ["SCHEDULE_FIT", /SCHEDULE_FIT:\s*(\d+)/i],
    ["SOCIAL_BATTERY_DRAIN", /SOCIAL_BATTERY_DRAIN:\s*(LOW|MEDIUM|HIGH)/i],
    ["INITIAL_INVESTMENT", /INITIAL_INVESTMENT:\s*([^\n]+)/i],
    ["BEST_HUSTLE", /BEST_HUSTLE:\s*([^\n]+)/i],
    ["FINANCIAL_HEALTH", /FINANCIAL_HEALTH:\s*(\d+)/i],
    ["SAVINGS_RATE", /SAVINGS_RATE:\s*(\d+)/i],
    ["EMERGENCY_FUND_STATUS", /EMERGENCY_FUND_STATUS:\s*(SAFE|AT_RISK|CRITICAL)/i],
    ["LEAKAGE_RISK", /LEAKAGE_RISK:\s*(LOW|MEDIUM|HIGH)/i],
    ["MONTHLY_SAVE_TARGET", /MONTHLY_SAVE_TARGET:\s*([^\n]+)/i],
    ["AUTHENTICITY_SCORE", /AUTHENTICITY_SCORE:\s*(\d+)/i],
    ["GROWTH_TRAJECTORY", /GROWTH_TRAJECTORY:\s*(DEAD_END|MODERATE|SCALABLE)/i],
    ["SCAM_RISK", /SCAM_RISK:\s*(LOW|MEDIUM|HIGH)/i],
    ["SALARY_FIT", /SALARY_FIT:\s*(BELOW|FAIR|ABOVE)/i],
    ["SUCCESS_SCORE", /SUCCESS_SCORE:\s*(\d+)/i],
    ["WINNING_CHANCE", /WINNING_CHANCE:\s*(\d+)/i],
    ["LEGAL_RISK", /LEGAL_RISK:\s*(LOW|MEDIUM|HIGH)/i],
    ["MARKET_SIZE", /MARKET_SIZE:\s*(NICHE|MEDIUM|LARGE)/i],
    ["FORMATTING_SCORE", /FORMATTING_SCORE:\s*(\d+)/i],
  ];
  patterns.forEach(([k, re]) => {
    const x = text.match(re);
    if (x) m[k] = x[1].trim();
  });
  return m;
};

// ── PARSE JOB CARDS ────────────────────────────────────────────
const parseJobCards = (text) => {
  if (!text) return [];
  const cards = [];
  const blocks = text.split(/\n(?=ROLE:)/i);
  blocks.forEach(b => {
    const role = b.match(/ROLE:\s*(.+)/i)?.[1]?.trim();
    const company = b.match(/COMPANY(?:\s*TYPE)?:\s*(.+)/i)?.[1]?.trim();
    const salary = b.match(/SALARY:\s*(.+)/i)?.[1]?.trim();
    // Extract URL more reliably
    const applyLine = b.match(/APPLY:\s*(.+)/i)?.[1]?.trim();
    const urlMatch = applyLine?.match(/https?:\/\/[^\s\n)]+/);
    const apply = urlMatch?.[0] || (
      role ? `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(role)}&location=India` : null
    );
    if (role && apply) {
      cards.push({ role, company: company || "", salary: salary || "", apply: apply.replace(/[.,;)]+$/, "") });
    }
  });
  return cards.slice(0, 5);
};

// ── PARSE CLICKABLE LINKS ──────────────────────────────────────
const parseLinks = (text) => {
  if (!text) return [];
  const map = {
    "linkedin.com/jobs": "💼 LinkedIn Jobs",
    "naukri.com": "📋 Naukri",
    "internshala.com": "🎓 Internshala",
    "indeed": "🔎 Indeed",
    "shine.com": "✨ Shine",
    "foundit.in": "🔍 Foundit",
    "timesjobs.com": "⏰ TimesJobs",
    "apna.co": "👔 Apna",
    "workindia.in": "💼 WorkIndia",
    "norkaroots": "🌍 NORKA Gulf",
    "keralapsc.gov.in": "🏛️ Kerala PSC",
    "startupmission": "🚀 KSUM",
    "startupindia.gov": "🇮🇳 Startup India",
    "angellist": "👼 AngelList",
    "letsventure": "💡 LetsVenture",
    "coursera.org": "📚 Coursera",
    "udemy.com": "🎯 Udemy",
    "nptel.ac.in": "🎓 NPTEL Free",
    "swayam.gov.in": "🎓 Swayam",
    "upwork.com": "💻 Upwork",
    "fiverr.com": "⚡ Fiverr",
    "groww.in": "📈 Groww",
    "zerodha": "💰 Zerodha",
    "scholarships.gov.in": "🏆 Scholarships",
    "gst.gov.in": "📋 GST Portal",
    "udyamregistration": "🏭 MSME Udyam",
    "fssai.gov.in": "🍽️ FSSAI",
    "ipindia.gov.in": "™️ Trademark",
    "amazon": "🛒 Amazon",
    "meesho": "🛍️ Meesho",
    "gumroad.com": "💸 Gumroad",
    "promptbase.com": "🤖 PromptBase",
    "hostinger": "🌐 Hostinger",
    "canva.com": "🎨 Canva Free",
    "cee.kerala.gov.in": "📝 KEAM",
    "jeemain": "📝 JEE",
    "neet.nta": "📝 NEET",
    "scale.ai": "🤖 Scale AI",
    "toloka.ai": "🤖 Toloka",
    "printful.com": "👕 Printful",
    "etsy.com": "🛍️ Etsy",
    "neom.com": "🏗️ NEOM Jobs",
    "larsentoubro": "🏢 L&T Careers",
    "kefholdings": "🏢 KEF Careers",
    "cial.aero": "✈️ CIAL",
    "infosys.com": "💻 Infosys",
    "wipro.com": "💻 Wipro",
    "tcs.com": "💻 TCS",
    "tataelxsi": "💻 Tata Elxsi",
    "asterhospitals": "🏥 Aster Hospitals",
    "ust.com": "💻 UST Global",
    "federalbank": "🏦 Federal Bank",
    "sobha.com": "🏢 Sobha Careers",
    "bharatpetroleum": "🏭 BPCL",
    "idfcfirstbank": "🏦 IDFC First",
  };
  try {
    // Extract URLs including those inside parentheses
    const processed = text
      .replace(/\(https?:\/\//g, " https://")
      .replace(/\[https?:\/\//g, " https://");
    const rawUrls = processed.match(/https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/g) || [];
    const urls = [...new Set(rawUrls.map(u => u.replace(/[.,;)\]]+$/, "")))];
    return urls
      .map(url => {
        const k = Object.keys(map).find(k => url.includes(k));
        return k ? { label: map[k], url } : null;
      })
      .filter(Boolean)
      .slice(0, 10);
  } catch { return []; }
};

// ── CLEAN TEXT (remove raw metric lines) ───────────────────────
const cleanText = (text) => {
  if (!text) return "";
  return text
    .split("\n")
    .filter(line => {
      const t = line.trim();
      if (!t) return true;
      // Remove raw metric lines but keep job card fields and section headers
      const isMetricLine = /^[A-Z_]{3,}:\s/.test(t) &&
        !t.startsWith("ROLE:") &&
        !t.startsWith("COMPANY") &&
        !t.startsWith("SALARY:") &&
        !t.startsWith("APPLY:") &&
        !t.startsWith("MATCH") &&
        t.length < 150;
      return !isMetricLine;
    })
    .join("\n");
};

// ── MAKE URLS CLICKABLE INLINE ─────────────────────────────────
const makeLinksClickable = (text, color) => {
  if (!text || typeof text !== "string") return text;
  const urlRegex = /(https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+)/g;
  const parts = text.split(urlRegex);
  if (parts.length === 1) return text;
  return parts.map((part, idx) => {
    if (urlRegex.test(part)) {
      const cleanUrl = part.replace(/[.,;)\]]+$/, "");
      return (
        <a key={idx} href={cleanUrl} target="_blank" rel="noopener noreferrer"
          style={{ color, textDecoration: "underline", wordBreak: "break-all", fontSize: 12 }}>
          {cleanUrl}
        </a>
      );
    }
    return part;
  });
};

// ── PILLAR CONFIG ──────────────────────────────────────────────
const PILLARS = [
  { id: "career", icon: "🛡️", label: "Career Guard", sub: "AI Threats · Skill Gaps · Growth", color: "#6366f1", rgb: "99,102,241", hint: "I completed MEP Electrical diploma. Is my career safe from AI?" },
  { id: "cv", icon: "📄", label: "CV Builder", sub: "ATS Score · Build · PDF Upload", color: "#06b6d4", rgb: "6,182,212", hint: "Build me an ATS-optimized CV for MEP Electrical Engineer jobs" },
  { id: "jobs", icon: "🔍", label: "Job Finder", sub: "Real Jobs · Direct Apply · Scam Check", color: "#f59e0b", rgb: "245,158,11", hint: "MEP Electrical fresher looking for jobs in Kerala" },
  { id: "wealth", icon: "💰", label: "Wealth Guard", sub: "Budget · Save · Invest Smart", color: "#10b981", rgb: "16,185,129", hint: "I earn Rs 25,000/month. Help me save and invest." },
  { id: "hustle", icon: "💸", label: "Side Hustle", sub: "Extra Income · Full A-Z Guide", color: "#a855f7", rgb: "168,85,247", hint: "I have 2 free hours daily. Best side hustle with complete guide?" },
  { id: "startup", icon: "🚀", label: "Startup Validator", sub: "Honest Score · Strengths · Red Flags", color: "#ec4899", rgb: "236,72,153", hint: "I want to start a tiffin delivery in Kochi with Rs 50,000" },
];

const AFFS = [
  { icon: "🎯", title: "Udemy Courses", desc: "Boost skills. Get hired faster.", tag: "From ₹449", url: "https://www.udemy.com", color: "#a855f7" },
  { icon: "📈", title: "Groww — Start SIP", desc: "Invest from just ₹100/month.", tag: "Free Account", url: "https://groww.in", color: "#10b981" },
  { icon: "🌍", title: "NORKA Gulf Jobs", desc: "Free govt Gulf job placement.", tag: "100% Free", url: "https://norkaroots.kerala.gov.in", color: "#06b6d4" },
  { icon: "💻", title: "Upwork Freelance", desc: "Earn dollars from your skills.", tag: "Free Join", url: "https://www.upwork.com", color: "#6366f1" },
  { icon: "🚀", title: "KSUM Startup Grant", desc: "Kerala govt funding up to ₹10L.", tag: "Free Apply", url: "https://startupmission.kerala.gov.in", color: "#ec4899" },
  { icon: "⚡", title: "Fiverr Freelance", desc: "Sell your skills to the world.", tag: "Free Join", url: "https://www.fiverr.com/start_selling", color: "#f59e0b" },
];

// ── UI COMPONENTS ──────────────────────────────────────────────
const Circle = ({ score, size = 80, stroke = 6, color = "#06b6d4", label }) => {
  const s = Math.min(Math.max(parseInt(score) || 0, 0), 100);
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (s / 100) * circ;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${color}99)`, transition: "stroke-dasharray 1.4s ease" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#f1f5f9", fontWeight: 800, fontSize: size > 70 ? 18 : 13 }}>{s}</span>
          <span style={{ color: "#475569", fontSize: 7 }}>/100</span>
        </div>
      </div>
      {label && <div style={{ color: "#64748b", fontSize: 9, fontWeight: 600, textAlign: "center", maxWidth: 80 }}>{label}</div>}
    </div>
  );
};

const Bdg = ({ text, type = "ok" }) => {
  const C = {
    ok: ["#10b981", "rgba(16,185,129,0.12)"],
    warn: ["#f59e0b", "rgba(245,158,11,0.12)"],
    danger: ["#ef4444", "rgba(239,68,68,0.12)"],
    info: ["#06b6d4", "rgba(6,182,212,0.12)"],
  };
  const [c, bg] = C[type] || C.info;
  return (
    <span style={{ padding: "3px 10px", borderRadius: 100, fontSize: 10, fontWeight: 700, color: c, background: bg, border: `1px solid ${c}33` }}>
      {text}
    </span>
  );
};

const SCard = ({ children, style = {} }) => (
  <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "13px 14px", marginBottom: 10, ...style }}>
    {children}
  </div>
);

// ── DASHBOARD ──────────────────────────────────────────────────
const Dashboard = ({ id, m }) => {
  const n = (k) => parseInt(m[k] || "0", 10);
  const rc = (v) => ["HIGH", "CRITICAL", "DEAD_END"].includes(v) ? "#ef4444" : ["MEDIUM", "AT_RISK", "MODERATE"].includes(v) ? "#f59e0b" : "#10b981";
  const bt = (v) => ["HIGH", "CRITICAL", "DEAD_END"].includes(v) ? "danger" : ["MEDIUM", "AT_RISK", "MODERATE"].includes(v) ? "warn" : "ok";

  if (id === "career") return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 14 }}>
        <Circle score={n("ATS_SCORE")} color="#06b6d4" label="ATS Match" />
        <Circle score={Math.max(0, 100 - n("AUTOMATION_RISK"))} color="#10b981" label="Job Safety" />
        <Circle score={n("SKILL_GAP_SCORE")} color="#6366f1" label="Skill Fit" />
      </div>
      <SCard>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ color: "#64748b", fontSize: 11, fontWeight: 700 }}>RISK RADAR</span>
          <Bdg text={m.RISK_LEVEL || "MEDIUM"} type={bt(m.RISK_LEVEL)} />
        </div>
        {[["🤖 Automation Risk", n("AUTOMATION_RISK"), rc(m.RISK_LEVEL)], ["🎯 Skill Relevance", n("SKILL_GAP_SCORE"), "#6366f1"]].map(([lbl, val, c], i) => (
          <div key={i} style={{ marginBottom: i === 0 ? 10 : 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: "#64748b", fontSize: 12 }}>{lbl}</span>
              <span style={{ color: c, fontSize: 12, fontWeight: 700 }}>{val}%</span>
            </div>
            <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 100, height: 4 }}>
              <div style={{ height: 4, borderRadius: 100, width: `${Math.min(val, 100)}%`, background: `linear-gradient(90deg,${c}88,${c})`, transition: "width 1.4s ease" }} />
            </div>
          </div>
        ))}
      </SCard>
      {m.MISSING_KEYWORDS && m.MISSING_KEYWORDS !== "Not applicable yet" && (
        <SCard>
          <div style={{ color: "#64748b", fontSize: 11, fontWeight: 700, marginBottom: 8 }}>⚠️ MISSING KEYWORDS</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {m.MISSING_KEYWORDS.split(",").slice(0, 8).map((kw, i) => (
              <span key={i} style={{ padding: "3px 9px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 100, color: "#ef4444", fontSize: 10, fontWeight: 600 }}>{kw.trim()}</span>
            ))}
          </div>
        </SCard>
      )}
    </div>
  );

  if (id === "cv") return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 14 }}>
        <Circle score={n("ATS_SCORE")} color="#06b6d4" label="ATS Score" size={90} />
        <Circle score={n("FORMATTING_SCORE") || 50} color="#10b981" label="Format Score" size={90} />
      </div>
      {m.MISSING_KEYWORDS && (
        <SCard>
          <div style={{ color: "#64748b", fontSize: 11, fontWeight: 700, marginBottom: 8 }}>💡 ADD THESE KEYWORDS</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {m.MISSING_KEYWORDS.split(",").slice(0, 8).map((kw, i) => (
              <span key={i} style={{ padding: "3px 9px", background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.2)", borderRadius: 100, color: "#06b6d4", fontSize: 10, fontWeight: 600 }}>{kw.trim()}</span>
            ))}
          </div>
        </SCard>
      )}
    </div>
  );

  if (id === "jobs") return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 14 }}>
        <Circle score={n("AUTHENTICITY_SCORE")} color="#f59e0b" label="Authenticity" />
        <Circle score={m.GROWTH_TRAJECTORY === "SCALABLE" ? 85 : m.GROWTH_TRAJECTORY === "MODERATE" ? 55 : 25} color="#10b981" label="Growth" />
      </div>
      <SCard>
        <div style={{ color: "#64748b", fontSize: 11, fontWeight: 700, marginBottom: 10 }}>JOB INTELLIGENCE</div>
        {[["🚨", "Scam Risk", m.SCAM_RISK || "MEDIUM"], ["📈", "Growth", m.GROWTH_TRAJECTORY || "MODERATE"], ["💰", "Salary Fit", m.SALARY_FIT || "FAIR"]].map(([icon, lbl, val], i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, padding: "6px 9px", background: "rgba(255,255,255,0.03)", borderRadius: 9 }}>
            <span style={{ color: "#64748b", fontSize: 12 }}>{icon} {lbl}</span>
            <Bdg text={val.replace(/_/g, " ")} type={["LOW", "SCALABLE", "ABOVE", "FAIR"].includes(val) ? "ok" : ["HIGH", "DEAD_END"].includes(val) ? "danger" : "warn"} />
          </div>
        ))}
      </SCard>
    </div>
  );

  if (id === "wealth") return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 14 }}>
        <Circle score={n("FINANCIAL_HEALTH")} color="#10b981" label="Financial Health" size={90} />
        <Circle score={n("SAVINGS_RATE")} color="#06b6d4" label="Savings Rate" size={90} />
      </div>
      <SCard>
        <div style={{ color: "#64748b", fontSize: 11, fontWeight: 700, marginBottom: 10 }}>💰 PROTECTION STATUS</div>
        {[["🏦", "Emergency Fund", m.EMERGENCY_FUND_STATUS || "AT_RISK"], ["🚨", "Expense Leakage", m.LEAKAGE_RISK || "MEDIUM"]].map(([icon, lbl, val], i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7, padding: "7px 9px", background: "rgba(255,255,255,0.03)", borderRadius: 9 }}>
            <span style={{ color: "#64748b", fontSize: 12 }}>{icon} {lbl}</span>
            <Bdg text={val.replace("_", " ")} type={["SAFE", "LOW"].includes(val) ? "ok" : ["CRITICAL", "HIGH"].includes(val) ? "danger" : "warn"} />
          </div>
        ))}
        {m.MONTHLY_SAVE_TARGET && (
          <div style={{ marginTop: 8, padding: "8px 10px", background: "rgba(16,185,129,0.08)", borderRadius: 9, border: "1px solid rgba(16,185,129,0.2)" }}>
            <span style={{ color: "#64748b", fontSize: 11 }}>Monthly Save Target: </span>
            <span style={{ color: "#10b981", fontWeight: 800, fontSize: 14 }}>{m.MONTHLY_SAVE_TARGET}</span>
          </div>
        )}
      </SCard>
    </div>
  );

  if (id === "hustle") return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 14 }}>
        <Circle score={n("EARNING_SCORE")} color="#a855f7" label="Earning Potential" />
        <Circle score={n("SCHEDULE_FIT")} color="#10b981" label="Schedule Fit" />
      </div>
      {m.BEST_HUSTLE && (
        <SCard>
          <div style={{ color: "#64748b", fontSize: 11, fontWeight: 700, marginBottom: 8 }}>🏆 YOUR BEST MATCH</div>
          <div style={{ color: "#a855f7", fontSize: 13, fontWeight: 700, lineHeight: 1.4 }}>{m.BEST_HUSTLE}</div>
          {m.INITIAL_INVESTMENT && (
            <div style={{ color: "#64748b", fontSize: 11, marginTop: 6 }}>
              Investment: <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{m.INITIAL_INVESTMENT}</span>
            </div>
          )}
        </SCard>
      )}
    </div>
  );

  if (id === "startup") return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 14 }}>
        <Circle score={n("SUCCESS_SCORE")} color="#ec4899" label="Success Score" size={75} />
        <Circle score={n("WINNING_CHANCE") || n("SUCCESS_SCORE")} color="#f59e0b" label="Win Chance" size={75} />
        <Circle score={m.LEGAL_RISK === "LOW" ? 88 : m.LEGAL_RISK === "MEDIUM" ? 52 : 20} color="#10b981" label="Legal Safety" size={75} />
      </div>
      <SCard>
        <div style={{ color: "#64748b", fontSize: 11, fontWeight: 700, marginBottom: 10 }}>🚀 STARTUP INTEL</div>
        {[["⚖️", "Legal Risk", m.LEGAL_RISK || "LOW"], ["🌐", "Market Size", m.MARKET_SIZE || "MEDIUM"]].map(([icon, lbl, val], i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, padding: "6px 9px", background: "rgba(255,255,255,0.03)", borderRadius: 9 }}>
            <span style={{ color: "#64748b", fontSize: 12 }}>{icon} {lbl}</span>
            <Bdg text={val} type={["LOW", "LARGE"].includes(val) ? "ok" : val === "HIGH" ? "danger" : "warn"} />
          </div>
        ))}
      </SCard>
    </div>
  );
  return null;
};

// ── FORMAT AI RESPONSE TEXT ────────────────────────────────────
const Fmt = ({ text, color }) => {
  const clean = cleanText(text);
  return (
    <div>
      {clean.split("\n").map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} style={{ height: 5 }} />;

        // Disclaimer box
        if (t.includes("⚠️") && (t.includes("general guidance") || t.includes("guidance only"))) {
          return (
            <div key={i} style={{ marginTop: 14, padding: "10px 12px", background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.18)", borderRadius: 10, color: "#f59e0b", fontSize: 11, lineHeight: 1.6 }}>
              {t}
            </div>
          );
        }

        // Protective ending line
        const isEnding = (t.includes("🛡️") && (
          t.includes("watching") || t.includes("protection") || t.includes("protected") ||
          t.includes("safe") || t.includes("career") || t.includes("money") ||
          t.includes("journey") || t.includes("building") || t.includes("confidence") ||
          t.includes("kayyil") || t.includes("zimmedari") || t.includes("padhukaapar") ||
          t.includes("nireekhana")
        )) || (t.includes("🚀🛡️") || t.includes("📄🛡️") || t.includes("🔍🛡️") || t.includes("💰🛡️") || t.includes("💸🛡️"));
        if (isEnding) {
          return (
            <div key={i} style={{ marginTop: 14, padding: "10px 12px", background: "rgba(6,182,212,0.07)", border: "1px solid rgba(6,182,212,0.18)", borderRadius: 10, color: "#06b6d4", fontSize: 12, fontStyle: "italic", fontWeight: 600 }}>
              {t}
            </div>
          );
        }

        // Skip raw job card metric lines
        if (/^(ROLE|COMPANY|SALARY|APPLY|MATCH):/.test(t)) return null;

        // Horizontal divider
        if (t.startsWith("━")) {
          return <div key={i} style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "12px 0" }} />;
        }

        // Bold text processing
        const parts = t.replace(/\*\*([^*]+)\*\*/g, "|||$1|||").split("|||");
        const hasBold = parts.length > 1;
        const boldContent = hasBold
          ? parts.map((p, j) => j % 2 === 1
            ? <strong key={j} style={{ color: "#e2e8f0", fontWeight: 700 }}>{p}</strong>
            : p)
          : null;

        // Section headers
        const isHeader = /^[🛡️📄🔍💰💸🚀🎯📊⚡✅❌💼💡🏢📋🌍👼🏆📅💪🎓📈🏦🚨⚖️🌐🎨👕🔥⭐💎🏗️🔍💎🎪]/.test(t)
          || /^#{1,3}\s/.test(t)
          || (t.endsWith(":") && t.length < 70 && !t.includes("http") && !t.includes("Rs") && !t.includes("Step"));
        if (isHeader) {
          return (
            <div key={i} style={{ marginTop: 14, marginBottom: 4, fontWeight: 800, fontSize: 13, color: "#e2e8f0" }}>
              {t.replace(/^#{1,3}\s/, "")}
            </div>
          );
        }

        // Bullet points
        if (/^[-•*›]\s/.test(t) || /^\d+[.)]\s/.test(t)) {
          const content = hasBold ? boldContent : makeLinksClickable(t.replace(/^[-•*›]\s/, "").replace(/^\d+[.)]\s/, ""), color);
          return (
            <div key={i} style={{ display: "flex", gap: 8, margin: "5px 0" }}>
              <span style={{ color, fontSize: 10, marginTop: 4, flexShrink: 0, opacity: 0.7 }}>›</span>
              <span style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.7 }}>{content}</span>
            </div>
          );
        }

        // Regular paragraph with inline links
        const content = hasBold ? boldContent : makeLinksClickable(t, color);
        return (
          <div key={i} style={{ margin: "4px 0", color: "#94a3b8", fontSize: 13, lineHeight: 1.75 }}>
            {content}
          </div>
        );
      })}
    </div>
  );
};

// ── SHARE CARD ─────────────────────────────────────────────────
const ShareCard = ({ pillar, msgContent, onClose }) => {
  // Parse score from the specific message being shared
  const msgMetrics = parseMetrics(msgContent || "");
  const n = (k) => parseInt(msgMetrics[k] || "0", 10);
  const scoreMap = {
    career: n("ATS_SCORE") || n("SKILL_GAP_SCORE"),
    jobs: n("AUTHENTICITY_SCORE"),
    wealth: n("FINANCIAL_HEALTH"),
    hustle: n("EARNING_SCORE"),
    startup: n("SUCCESS_SCORE") || n("WINNING_CHANCE"),
    cv: n("ATS_SCORE"),
  };
  const score = scoreMap[pillar.id] || 0;
  const scoreText = score > 0 ? `My Score: ${score}/100\n\n` : "";

  const shareText = `🛡️ LifePath AI analyzed my ${pillar.label}!\n\n${scoreText}India's first AI Career Bodyguard — completely FREE!\nWorks in Malayalam + English 🇮🇳\nNo login, no download needed.\n\nTry it: lifepath-ai-ovrt.vercel.app\n\n#LifePathAI #CareerAdvice #IndiaJobs #Kerala #AITools #Free`;

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "LifePath AI",
          text: shareText,
          url: "https://lifepath-ai-ovrt.vercel.app",
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
        alert("✅ Copied! Paste on WhatsApp, Instagram, or anywhere.");
      } else {
        alert("Share this:\n\n" + shareText);
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        alert("Copy this text:\n\n" + shareText);
      }
    }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 300, display: "flex", alignItems: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#0a1020", borderRadius: "22px 22px 0 0", padding: "24px 20px 44px", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 18, marginBottom: 5 }}>📤 Share Your Result</div>
        <div style={{ color: "#64748b", fontSize: 12, marginBottom: 18 }}>Help your friends discover LifePath AI!</div>
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "14px", marginBottom: 16 }}>
          <div style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.85, whiteSpace: "pre-line" }}>{shareText}</div>
        </div>
        <button onClick={handleShare} style={{ width: "100%", padding: 14, background: `linear-gradient(135deg,${pillar.color},${pillar.color}99)`, border: "none", borderRadius: 12, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", marginBottom: 10 }}>
          Share on WhatsApp / Instagram 📱
        </button>
        <button onClick={onClose} style={{ width: "100%", padding: 11, background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, color: "#64748b", fontSize: 13, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
};

// ── PROFILE MODAL ──────────────────────────────────────────────
const ProfileModal = ({ profile, onSave, onClose }) => {
  const [form, setForm] = useState({ ...profile });
  const fields = [
    ["name", "Your Full Name", "#06b6d4"],
    ["education", "Education (e.g. Diploma EEE, B.Tech CS)", "#6366f1"],
    ["experience", "Experience (e.g. 2 years MEP Kerala)", "#10b981"],
    ["salary", "Current Salary (e.g. Rs 25,000/month)", "#f59e0b"],
    ["location", "City (e.g. Kochi, Malappuram, Bangalore)", "#ec4899"],
    ["goal", "Your Biggest Career Goal", "#a855f7"],
  ];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 200, display: "flex", alignItems: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#0a1020", borderRadius: "22px 22px 0 0", padding: "26px 20px 44px", border: "1px solid rgba(255,255,255,0.07)", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 19, marginBottom: 5 }}>👤 My Profile</div>
        <div style={{ color: "#64748b", fontSize: 12, marginBottom: 22 }}>The more you share, the more personal and accurate every answer becomes.</div>
        {fields.map(([key, placeholder, accent]) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <div style={{ color: accent, fontSize: 10, fontWeight: 700, letterSpacing: 1.8, marginBottom: 6, textTransform: "uppercase" }}>
              {placeholder.split("(")[0].trim()}
            </div>
            <input
              value={form[key] || ""}
              onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
              placeholder={placeholder}
              style={{ width: "100%", background: `${accent}10`, border: `1px solid ${accent}33`, borderRadius: 12, padding: "12px 14px", color: "#e2e8f0", fontSize: 13, outline: "none", fontFamily: "inherit" }}
              onFocus={e => e.target.style.borderColor = accent}
              onBlur={e => e.target.style.borderColor = `${accent}33`}
            />
          </div>
        ))}
        <button
          onClick={() => onSave(form)}
          style={{ width: "100%", padding: 14, background: "linear-gradient(135deg,#06b6d4,#0891b2)", border: "none", borderRadius: 12, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", marginTop: 8 }}>
          Save & Personalize 🛡️
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
  const [showProfile, setShowProfile] = useState(false);
  const [shareContent, setShareContent] = useState(null); // stores {msgContent}
  const [toast, setToast] = useState("");
  const [lang, setLang] = useState("english");
  const [cvFile, setCvFile] = useState(null);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  const pdfJsLoaded = useRef(false);

  const fireToast = useCallback((msg, duration = 3500) => {
    setToast(msg);
    setTimeout(() => setToast(""), duration);
  }, []);

  // Splash animation
  useEffect(() => {
    const ts = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1100),
      setTimeout(() => setPhase(3), 2200),
      setTimeout(() => setScreen("home"), 3300),
    ];
    return () => ts.forEach(clearTimeout);
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => { if (Object.keys(messages).length > 0) S.set("lp_chat_history", messages); }, [messages]);

  const saveProfile = (p) => {
    setProfile(p);
    S.set("lp_profile", p);
    setShowProfile(false);
    fireToast("✅ Profile saved! Every answer will now be personal to you.");
  };

  // ── PDF READING VIA PDF.JS ───────────────────────────────────
  const loadPdfJs = async () => {
    if (pdfJsLoaded.current && window.pdfjsLib) return true;
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        pdfJsLoaded.current = true;
        resolve(true);
      };
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = "";

    const fileName = file.name.toLowerCase();

    // PDF handling via PDF.js
    if (fileName.endsWith(".pdf")) {
      fireToast("📄 Reading PDF... please wait a moment");
      try {
        const loaded = await loadPdfJs();
        if (!loaded || !window.pdfjsLib) throw new Error("PDF.js not available");

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = "";

        for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          fullText += content.items.map(item => item.str).join(" ") + "\n";
        }

        if (fullText.trim().length > 80) {
          setCvFile({ name: file.name, content: fullText });
          setInput(`Please analyze and improve this CV:\n\n${fullText.substring(0, 3000)}`);
          fireToast("✅ PDF read! Press send to analyze your CV.");
        } else {
          throw new Error("Text extraction failed");
        }
      } catch {
        fireToast("⚠️ Could not read PDF text. Please copy-paste your CV below.", 5000);
        setInput("Here is my CV:\nName: \nPhone: \nEmail: \nEducation: \nExperience: \nSkills: \nTarget Job: \n\nPlease analyze and improve it.");
      }
      return;
    }

    // TXT, DOC, DOCX
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      if (!text || text.startsWith("%PDF") || text.trim().length < 30) {
        fireToast("⚠️ Cannot read this file. Please paste your CV text in the chat.");
        setInput("Here is my CV:\nName: \nPhone: \nEmail: \nEducation: \nExperience: \nSkills: \nTarget Job: ");
        return;
      }
      setCvFile({ name: file.name, content: text });
      setInput(`Please analyze and improve this CV:\n\n${text.substring(0, 3000)}`);
      fireToast("✅ CV loaded! Press send to analyze.");
    };
    reader.onerror = () => {
      fireToast("⚠️ Cannot read file. Please paste CV text in the chat.");
    };
    reader.readAsText(file);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading || !pillar) return;
    const usage = getUsage();
    if (usage.count >= FREE_LIMIT) { fireToast("Daily limit reached. Come back tomorrow! 🌅"); return; }

    const userMsg = input.trim();
    setInput("");
    setCvFile(null);

    const prev = messages[pillar.id] || [];
    const newMsgs = [...prev, { role: "user", content: userMsg }];
    setMessages(m => ({ ...m, [pillar.id]: newMsgs }));
    setLoading(true);
    S.set("lp_usage", { ...usage, count: usage.count + 1 });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMsgs, pillarId: pillar.id, profile }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.language) setLang(data.language);
      setMessages(m => ({ ...m, [pillar.id]: [...newMsgs, { role: "assistant", content: data.reply }] }));
    } catch (err) {
      const errMsg = err.message || "Connection error. Please retry.";
      setMessages(m => ({ ...m, [pillar.id]: [...newMsgs, { role: "assistant", content: `⚠️ ${errMsg}` }] }));
    }
    setLoading(false);
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const clearChat = () => {
    if (!pillar) return;
    setMessages(m => {
      const u = { ...m };
      delete u[pillar.id];
      S.set("lp_chat_history", u);
      return u;
    });
    fireToast("💬 Chat cleared");
  };

  const curMsgs = pillar ? (messages[pillar.id] || []) : [];
  const lastAI = curMsgs.filter(m => m.role === "assistant").slice(-1)[0];
  const metrics = lastAI ? parseMetrics(lastAI.content) : {};
  const hasMetrics = Object.keys(metrics).length > 0;

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#060b14;overscroll-behavior:none}
    ::-webkit-scrollbar{width:2px}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}
    textarea,input{font-family:'Syne',sans-serif!important}
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
    .card{transition:transform .12s,box-shadow .12s;cursor:pointer}
    .card:active{transform:scale(.96)}
    .btn{transition:all .15s;cursor:pointer}.btn:active{transform:scale(.95)}
    .sx{overflow-x:auto;scrollbar-width:none}.sx::-webkit-scrollbar{display:none}
  `;

  return (
    <div style={{ minHeight: "100vh", background: "#060b14", fontFamily: "'Syne','Segoe UI',sans-serif", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", position: "relative", overflowX: "hidden" }}>
      <style>{CSS}</style>

      {/* TOAST */}
      {toast && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", background: "rgba(6,11,20,.96)", border: "1px solid rgba(6,182,212,.4)", backdropFilter: "blur(20px)", borderRadius: 100, padding: "9px 22px", color: "#06b6d4", fontSize: 12, fontWeight: 700, zIndex: 700, whiteSpace: "nowrap", animation: "toastIn .3s both", boxShadow: "0 4px 20px rgba(6,182,212,.15)" }}>
          {toast}
        </div>
      )}

      {/* TERMS POPUP */}
      {!accepted && screen !== "splash" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.96)", zIndex: 500, display: "flex", alignItems: "flex-end" }}>
          <div style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#0a1020", borderRadius: "24px 24px 0 0", padding: "32px 22px 48px", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ fontSize: 38, marginBottom: 14, textAlign: "center" }}>🛡️</div>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: 22, marginBottom: 8, textAlign: "center", letterSpacing: "-0.5px" }}>Welcome to LifePath AI</div>
            <div style={{ color: "#64748b", fontSize: 13, lineHeight: 1.7, marginBottom: 22, textAlign: "center" }}>
              India's first AI Career & Finance Bodyguard<br />Free forever · Malayalam + English 🇮🇳
            </div>
            <div style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 14, padding: "14px 16px", marginBottom: 22 }}>
              <div style={{ color: "#f59e0b", fontSize: 11, fontWeight: 700, marginBottom: 7 }}>⚠️ IMPORTANT DISCLAIMER</div>
              <div style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.7 }}>
                LifePath AI provides general guidance only — not professional financial, legal, or career advice. Always verify information and consult qualified professionals before making major decisions.
              </div>
            </div>
            <div style={{ color: "#475569", fontSize: 11, marginBottom: 22, textAlign: "center" }}>
              By continuing you agree to our{" "}
              <a href="/terms" style={{ color: "#06b6d4" }}>Terms of Service</a>{" "}and{" "}
              <a href="/privacy" style={{ color: "#06b6d4" }}>Privacy Policy</a>
            </div>
            <button className="btn" onClick={() => { setAccepted(true); S.set("lp_accepted", true); }}
              style={{ width: "100%", padding: 16, background: "linear-gradient(135deg,#06b6d4,#0891b2)", border: "none", borderRadius: 14, color: "#fff", fontWeight: 800, fontSize: 16, boxShadow: "0 4px 20px rgba(6,182,212,.3)" }}>
              I Understand — Let's Start 🚀
            </button>
          </div>
        </div>
      )}

      {showProfile && <ProfileModal profile={profile} onSave={saveProfile} onClose={() => setShowProfile(false)} />}
      {shareContent && pillar && <ShareCard pillar={pillar} msgContent={shareContent} onClose={() => setShareContent(null)} />}

      {/* SPLASH SCREEN */}
      {screen === "splash" && (
        <div style={{ position: "fixed", inset: 0, background: "#060b14", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 300 }}>
          <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
            <div style={{ position: "absolute", left: 0, right: 0, height: 1, background: "linear-gradient(90deg,transparent,rgba(6,182,212,.5),transparent)", animation: phase >= 1 ? "scan 2.8s linear infinite" : "none" }} />
          </div>
          <div style={{ position: "absolute", width: 360, height: 360, borderRadius: "50%", background: "radial-gradient(circle,rgba(6,182,212,.06) 0%,transparent 70%)", animation: phase >= 1 ? "glow 3s ease infinite" : "none" }} />
          <div style={{ animation: phase >= 1 ? "brandIn .9s cubic-bezier(.34,1.4,.64,1) both" : "none", textAlign: "center", zIndex: 1, marginBottom: 12 }}>
            <div style={{ fontSize: 52, fontWeight: 900, color: "#fff", letterSpacing: "-2px" }}>
              LifePath <span style={{ color: "#06b6d4" }}>AI</span>
            </div>
          </div>
          <div style={{ animation: phase >= 2 ? "fadeUp .6s both" : "none", opacity: phase >= 2 ? 1 : 0, zIndex: 1 }}>
            <div style={{ color: "#0d2535", fontSize: 11, letterSpacing: "0.2em", fontFamily: "'JetBrains Mono',monospace", textAlign: "center" }}>
              CAREER BODYGUARD · ALWAYS WATCHING
            </div>
          </div>
          <div style={{ marginTop: 70, display: "flex", gap: 9, animation: phase >= 1 ? "fadeIn .5s 1s both" : "none" }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "#06b6d4", animation: `dot 1.5s ${i * 0.25}s infinite` }} />
            ))}
          </div>
        </div>
      )}

      {/* HOME SCREEN */}
      {screen === "home" && (
        <div style={{ flex: 1, overflowY: "auto", zIndex: 1 }}>
          <div style={{ position: "fixed", top: -100, left: "50%", transform: "translateX(-50%)", width: 500, height: 500, borderRadius: "50%", pointerEvents: "none", background: "radial-gradient(circle,rgba(6,182,212,.035) 0%,transparent 65%)" }} />

          {/* Header */}
          <div style={{ padding: "20px 18px 0", display: "flex", justifyContent: "space-between", alignItems: "center", animation: "fadeUp .4s both" }}>
            <div>
              <span style={{ fontSize: 24, fontWeight: 900, color: "#fff", letterSpacing: "-0.8px" }}>LifePath </span>
              <span style={{ fontSize: 24, fontWeight: 900, color: "#06b6d4", letterSpacing: "-0.8px" }}>AI</span>
              <div style={{ color: "#1e3a4a", fontSize: 8, letterSpacing: 2.5, fontFamily: "'JetBrains Mono',monospace", marginTop: 1 }}>CAREER BODYGUARD 🛡️</div>
            </div>
            <button className="btn" onClick={() => setShowProfile(true)}
              style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 100, padding: "8px 16px", color: "#94a3b8", fontSize: 12, display: "flex", alignItems: "center", gap: 7 }}>
              👤 {profile.name ? profile.name.split(" ")[0] : "Profile"}
            </button>
          </div>

          {/* Daily Briefing */}
          {(profile.name || profile.goal) && (
            <div style={{ margin: "16px 18px 0", padding: "14px 16px", background: "linear-gradient(135deg,rgba(6,182,212,.05),rgba(99,102,241,.05))", border: "1px solid rgba(6,182,212,.13)", borderRadius: 16, animation: "fadeUp .5s .1s both" }}>
              <div style={{ color: "#06b6d4", fontSize: 9, fontWeight: 700, letterSpacing: 2.5, marginBottom: 6 }}>🛡️ DAILY BRIEFING</div>
              <div style={{ color: "#64748b", fontSize: 12, lineHeight: 1.7 }}>
                {profile.name && <><strong style={{ color: "#94a3b8" }}>{profile.name}</strong>, </>}
                I am actively monitoring the{" "}
                <strong style={{ color: "#94a3b8" }}>{profile.goal || "career"}</strong>{" "}
                market for you. Kerala job market is active today.
              </div>
            </div>
          )}

          {/* 6 Pillars */}
          <div style={{ padding: "20px 18px 0" }}>
            <div style={{ color: "#1e293b", fontSize: 9, fontWeight: 700, letterSpacing: 3, marginBottom: 13 }}>YOUR 6 SHIELDS</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}>
              {PILLARS.map((p, i) => (
                <div key={p.id} className="card"
                  onClick={() => { setPillar(p); setScreen("chat"); setInput(""); setCvFile(null); }}
                  style={{ background: "rgba(255,255,255,.022)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,.055)", borderRadius: 20, padding: "17px 14px", position: "relative", overflow: "hidden", animation: `fadeUp .5s ${i * .08}s both`, boxShadow: "0 4px 24px rgba(0,0,0,.35)" }}>
                  <div style={{ position: "absolute", top: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: `rgba(${p.rgb},.08)`, filter: "blur(20px)", pointerEvents: "none" }} />
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: `rgba(${p.rgb},.09)`, border: `1px solid rgba(${p.rgb},.22)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, marginBottom: 11 }}>{p.icon}</div>
                  <div style={{ color: "#e2e8f0", fontSize: 11, fontWeight: 700, marginBottom: 4, lineHeight: 1.3 }}>{p.label}</div>
                  <div style={{ color: "#475569", fontSize: 9, lineHeight: 1.5 }}>{p.sub}</div>
                  <div style={{ position: "absolute", bottom: 12, right: 13, color: p.color, fontSize: 14, opacity: .35 }}>›</div>
                  {messages[p.id]?.length > 0 && (
                    <div style={{ position: "absolute", top: 10, right: 10, background: p.color, borderRadius: 100, padding: "2px 6px", fontSize: 8, color: "#fff", fontWeight: 700 }}>
                      {Math.floor(messages[p.id].length / 2)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Affiliate Cards */}
          <div style={{ padding: "24px 0 0" }}>
            <div style={{ padding: "0 18px 11px", color: "#1e293b", fontSize: 9, fontWeight: 700, letterSpacing: 3 }}>RECOMMENDED FOR YOU</div>
            <div className="sx" style={{ paddingLeft: 18 }}>
              <div style={{ display: "flex", gap: 11, paddingRight: 18, width: "max-content" }}>
                {AFFS.map((a, i) => (
                  <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 15px", background: "rgba(255,255,255,.022)", border: "1px solid rgba(255,255,255,.065)", borderRadius: 16, width: 235, flexShrink: 0 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 11, background: `${a.color}18`, border: `1px solid ${a.color}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{a.icon}</div>
                    <div>
                      <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 11, marginBottom: 3 }}>{a.title}</div>
                      <div style={{ color: "#475569", fontSize: 9, lineHeight: 1.5, marginBottom: 5 }}>{a.desc}</div>
                      <span style={{ padding: "2px 8px", borderRadius: 100, fontSize: 9, fontWeight: 700, color: a.color, background: `${a.color}18`, border: `1px solid ${a.color}33` }}>{a.tag}</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Ad Placeholder */}
          <div style={{ margin: "22px 18px", padding: 18, background: "rgba(255,255,255,.012)", border: "1px dashed rgba(255,255,255,.05)", borderRadius: 14, textAlign: "center", minHeight: 88, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div>
              <div style={{ color: "#1e293b", fontSize: 9, letterSpacing: 2.5, marginBottom: 5 }}>ADVERTISEMENT</div>
              <div style={{ color: "#0f172a", fontSize: 9 }}>Google AdSense · 320×90</div>
            </div>
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

      {/* CHAT SCREEN */}
      {screen === "chat" && pillar && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", zIndex: 1 }}>
          {/* Chat Header */}
          <div style={{ padding: "11px 14px", background: "rgba(6,11,20,.97)", borderBottom: "1px solid rgba(255,255,255,.05)", backdropFilter: "blur(24px)", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 10 }}>
            <button className="btn" onClick={() => setScreen("home")}
              style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 11, width: 34, height: 34, color: "#64748b", fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center" }}>
              ‹
            </button>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: `rgba(${pillar.rgb},.1)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
              {pillar.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#dde4ee", fontWeight: 700, fontSize: 12 }}>{pillar.label}</div>
              <div style={{ color: "#334155", fontSize: 9 }}>{lang !== "english" && `🌐 ${lang} · `}{pillar.sub}</div>
            </div>
            {hasMetrics && (
              <button className="btn" onClick={() => setShareContent(lastAI?.content || "")}
                style={{ background: `rgba(${pillar.rgb},.08)`, border: `1px solid rgba(${pillar.rgb},.2)`, borderRadius: 9, padding: "5px 10px", color: pillar.color, fontSize: 10, fontWeight: 700 }}>
                Share 📤
              </button>
            )}
            <button className="btn" onClick={clearChat}
              style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 9, padding: "5px 9px", color: "#475569", fontSize: 9 }}>
              Clear
            </button>
            <div style={{ background: "rgba(6,182,212,.07)", border: "1px solid rgba(6,182,212,.2)", borderRadius: 100, padding: "3px 9px", display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#06b6d4", animation: "pulse 2s infinite" }} />
              <span style={{ color: "#06b6d4", fontSize: 9, fontWeight: 700 }}>LIVE</span>
            </div>
          </div>

          {/* Messages Area */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 13px" }}>
            {/* Live Dashboard */}
            {hasMetrics && (
              <div style={{ marginBottom: 16, animation: "fadeUp .5s both" }}>
                <div style={{ color: "#334155", fontSize: 9, fontWeight: 700, letterSpacing: 2.5, marginBottom: 11, paddingLeft: 2 }}>◉ LIVE DASHBOARD</div>
                <Dashboard id={pillar.id} m={metrics} />
              </div>
            )}

            {/* Empty State */}
            {curMsgs.length === 0 && (
              <div style={{ textAlign: "center", padding: "30px 14px", animation: "fadeUp .4s both" }}>
                <div style={{ width: 66, height: 66, borderRadius: "50%", background: `rgba(${pillar.rgb},.1)`, border: `1px solid rgba(${pillar.rgb},.2)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 16px" }}>
                  {pillar.icon}
                </div>
                <div style={{ color: "#e2e8f0", fontSize: 17, fontWeight: 800, marginBottom: 6 }}>{pillar.label}</div>
                <div style={{ color: "#64748b", fontSize: 12, lineHeight: 1.75, marginBottom: 20 }}>
                  {pillar.id === "cv"
                    ? "Upload your CV (PDF, DOC, TXT) for instant ATS analysis, or describe yourself to build a new one."
                    : "Ask anything in Malayalam, Hindi, English, or Manglish."}
                </div>
                {profile.name && (
                  <div style={{ background: "rgba(16,185,129,.06)", border: "1px solid rgba(16,185,129,.14)", borderRadius: 12, padding: "10px 14px", marginBottom: 16, color: "#10b981", fontSize: 11, fontWeight: 600 }}>
                    🛡️ Profile loaded for {profile.name}. Answers will be personal to you.
                  </div>
                )}
                {pillar.id === "cv" && (
                  <div style={{ marginBottom: 14 }}>
                    <input ref={fileRef} type="file" accept=".txt,.doc,.docx,.pdf" onChange={handleFileUpload} style={{ display: "none" }} />
                    <button className="btn" onClick={() => fileRef.current?.click()}
                      style={{ width: "100%", padding: "13px", background: `rgba(${pillar.rgb},.08)`, border: `1px solid rgba(${pillar.rgb},.25)`, borderRadius: 13, color: pillar.color, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                      📎 Upload CV — PDF, DOC, or TXT
                    </button>
                  </div>
                )}
                <div onClick={() => setInput(pillar.hint)} className="btn"
                  style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 13, padding: "12px 16px", color: "#64748b", fontSize: 12, textAlign: "left", lineHeight: 1.6 }}>
                  <span style={{ color: pillar.color, fontWeight: 700 }}>Try: </span>{pillar.hint}
                </div>
              </div>
            )}

            {/* Message List */}
            {curMsgs.map((msg, i) => {
              const isAI = msg.role === "assistant";
              const jobCards = isAI && pillar.id === "jobs" ? parseJobCards(msg.content) : [];
              const links = isAI ? parseLinks(msg.content) : [];

              return (
                <div key={i} style={{ marginBottom: 14, display: "flex", flexDirection: "column", alignItems: isAI ? "flex-start" : "flex-end", animation: "fadeUp .3s both" }}>
                  {!isAI ? (
                    <div style={{ background: `linear-gradient(135deg,${pillar.color},${pillar.color}bb)`, borderRadius: "16px 16px 4px 16px", padding: "11px 15px", maxWidth: "82%", color: "#fff", fontSize: 13, lineHeight: 1.65, boxShadow: `0 4px 16px rgba(${pillar.rgb},.25)` }}>
                      {msg.content.length > 500 ? msg.content.substring(0, 500) + "..." : msg.content}
                    </div>
                  ) : (
                    <div style={{ background: "rgba(255,255,255,.022)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,.065)", borderRadius: "4px 16px 16px 16px", padding: "14px", maxWidth: "98%", boxShadow: "0 4px 24px rgba(0,0,0,.25)" }}>
                      <div style={{ color: "#06b6d4", fontSize: 9, letterSpacing: 2.5, fontWeight: 700, marginBottom: 10, fontFamily: "'JetBrains Mono',monospace" }}>
                        🛡️ LIFEPATH AI · {pillar.label.toUpperCase()}
                      </div>
                      <Fmt text={msg.content} color={pillar.color} />

                      {/* Job Cards */}
                      {jobCards.map((c, ci) => (
                        <div key={ci} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "12px 14px", background: "rgba(245,158,11,.07)", border: "1px solid rgba(245,158,11,.2)", borderRadius: 13, marginTop: 9 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 12 }}>{c.role}</div>
                            {c.company && <div style={{ color: "#64748b", fontSize: 10, marginTop: 2 }}>{c.company}</div>}
                            {c.salary && <div style={{ color: "#f59e0b", fontSize: 11, marginTop: 3, fontWeight: 700 }}>{c.salary}</div>}
                          </div>
                          <a href={c.apply} target="_blank" rel="noopener noreferrer"
                            style={{ padding: "8px 14px", borderRadius: 100, background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0, boxShadow: "0 2px 10px rgba(245,158,11,.3)" }}>
                            Apply →
                          </a>
                        </div>
                      ))}

                      {/* Clickable Link Buttons */}
                      {links.length > 0 && (
                        <div style={{ marginTop: 13, display: "flex", flexWrap: "wrap", gap: 7 }}>
                          {links.map((l, li) => (
                            <a key={li} href={l.url} target="_blank" rel="noopener noreferrer"
                              style={{ padding: "7px 13px", borderRadius: 100, background: `rgba(${pillar.rgb},.09)`, border: `1px solid rgba(${pillar.rgb},.25)`, color: pillar.color, fontSize: 11, fontWeight: 600 }}>
                              {l.label}
                            </a>
                          ))}
                        </div>
                      )}

                      {/* Share Button on EVERY AI message */}
                      <button className="btn" onClick={() => setShareContent(msg.content)}
                        style={{ marginTop: 12, padding: "7px 14px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 100, color: "#64748b", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                        📤 Share this result
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Loading */}
            {loading && (
              <div style={{ background: "rgba(255,255,255,.022)", border: "1px solid rgba(255,255,255,.065)", borderRadius: "4px 16px 16px 16px", padding: "13px 16px", display: "inline-flex", alignItems: "center", gap: 11 }}>
                <span style={{ color: "#06b6d4", fontSize: 9, letterSpacing: 2.5, fontFamily: "'JetBrains Mono',monospace" }}>ANALYZING</span>
                {[0, 1, 2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "#06b6d4", animation: `dot 1.3s ${i * .22}s infinite` }} />)}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input Bar */}
          <div style={{ padding: "10px 13px 28px", background: "rgba(6,11,20,.97)", borderTop: "1px solid rgba(255,255,255,.04)", backdropFilter: "blur(24px)" }}>
            {cvFile && (
              <div style={{ marginBottom: 9, padding: "7px 13px", background: "rgba(6,182,212,.07)", border: "1px solid rgba(6,182,212,.2)", borderRadius: 10, color: "#06b6d4", fontSize: 11, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>📎 {cvFile.name}</span>
                <button onClick={() => { setCvFile(null); setInput(""); }} style={{ background: "none", border: "none", color: "#ef4444", fontSize: 13, padding: "0 4px", cursor: "pointer" }}>✕</button>
              </div>
            )}
            <div style={{ display: "flex", gap: 9, alignItems: "flex-end" }}>
              {pillar?.id === "cv" && (
                <>
                  <input ref={fileRef} type="file" accept=".txt,.doc,.docx,.pdf" onChange={handleFileUpload} style={{ display: "none" }} />
                  <button className="btn" onClick={() => fileRef.current?.click()}
                    style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0, background: "rgba(6,182,212,.08)", border: "1px solid rgba(6,182,212,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>
                    📎
                  </button>
                </>
              )}
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={pillar?.id === "cv" ? "Describe yourself or paste CV text here..." : "Ask in Malayalam, Hindi, English, Manglish..."}
                rows={2}
                style={{ flex: 1, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: "11px 13px", color: "#e2e8f0", fontSize: 13, resize: "none", lineHeight: 1.55, transition: "border-color .2s" }}
                onFocus={e => e.target.style.borderColor = pillar.color + "66"}
                onBlur={e => e.target.style.borderColor = "rgba(255,255,255,.07)"}
              />
              <button className="btn" onClick={sendMessage} disabled={loading || !input.trim()}
                style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0, background: loading || !input.trim() ? "rgba(255,255,255,.04)" : `linear-gradient(135deg,${pillar.color},${pillar.color}88)`, border: "none", cursor: loading || !input.trim() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, boxShadow: !loading && input.trim() ? `0 4px 16px rgba(${pillar.rgb},.3)` : "none" }}>
                {loading ? "⏳" : "↑"}
              </button>
            </div>
            <div style={{ color: "#1e293b", fontSize: 8, textAlign: "center", marginTop: 6, letterSpacing: 2, fontFamily: "'JetBrains Mono',monospace" }}>
              LIFEPATH AI · ALWAYS WATCHING 🛡️
            </div>
          </div>
        </div>
      )}
    </div>
  );
      }
