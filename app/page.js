"use client";
import { useState, useRef, useEffect } from "react";

const S = {
  get: (k, fb = null) => { try { const d = localStorage.getItem(k); return d ? JSON.parse(d) : fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const FREE_LIMIT = 2;
const getUsage = () => {
  const today = new Date().toDateString();
  const u = S.get("lp_usage", { date: today, count: 0 });
  if (u.date !== today) { const f = { date: today, count: 0 }; S.set("lp_usage", f); return f; }
  return u;
};

const parseMetrics = (text) => {
  const m = {};
  [
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
    ["LEGAL_RISK", /LEGAL_RISK:\s*(LOW|MEDIUM|HIGH)/i],
    ["MARKET_SIZE", /MARKET_SIZE:\s*(NICHE|MEDIUM|LARGE)/i],
  ].forEach(([k, re]) => { const x = text.match(re); if (x) m[k] = x[1].trim(); });
  return m;
};

const parseJobCards = (text) => {
  const cards = [];
  text.split(/\n(?=ROLE:)/i).forEach((b) => {
    const role = b.match(/ROLE:\s*(.+)/i)?.[1]?.trim();
    const company = b.match(/COMPANY(?:\s*TYPE)?:\s*(.+)/i)?.[1]?.trim();
    const salary = b.match(/SALARY:\s*(.+)/i)?.[1]?.trim();
    const apply = b.match(/APPLY:\s*(https?:\/\/[^\s\n]+)/i)?.[1]?.trim();
    if (role) cards.push({ role, company: company || "", salary: salary || "", apply: apply || `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(role)}&location=India` });
  });
  return cards.slice(0, 5);
};

const parseLinks = (text) => {
  const map = { "linkedin.com/jobs": "💼 LinkedIn Jobs", "naukri.com": "📋 Naukri", "internshala.com": "🎓 Internshala", "indeed.co.in": "🔎 Indeed", "ksum.org": "🚀 KSUM Kerala", "startupindia.gov": "🇮🇳 Startup India", "angellist.com": "👼 AngelList", "coursera.org": "📚 Coursera", "udemy.com": "🎯 Udemy", "upwork.com": "💻 Upwork", "fiverr.com": "⚡ Fiverr" };
  const urls = [...new Set((text.match(/https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/g) || []))];
  return urls.map((url) => { const k = Object.keys(map).find((k) => url.includes(k)); return k ? { label: map[k], url } : null; }).filter(Boolean).slice(0, 4);
};

const cleanText = (text) => text.split("\n").filter((l) => { const t = l.trim(); return !(/^[A-Z_]{3,}:\s/.test(t) && !t.startsWith("ROLE") && t.length < 120); }).join("\n");

const PILLARS = [
  { id: "career", icon: "🛡️", label: "Career Guard", sub: "Threats · Skill Gaps · Growth Path", color: "#6366f1", rgb: "99,102,241", hint: "I completed diploma in Electrical Engineering. Is my career safe?" },
  { id: "cv", icon: "📄", label: "CV Builder", sub: "ATS Resume · Keywords · Professional Format", color: "#06b6d4", rgb: "6,182,212", hint: "Build me a professional CV for MEP Electrical Engineer jobs" },
  { id: "jobs", icon: "🔍", label: "Job Finder", sub: "Direct Links · Scam Check · Salary", color: "#f59e0b", rgb: "245,158,11", hint: "I want MEP Electrical Engineer job in Kochi" },
  { id: "wealth", icon: "💰", label: "Wealth Guard", sub: "Budget · Savings · Investment Plan", color: "#10b981", rgb: "16,185,129", hint: "I earn Rs 25,000 per month. Help me save and invest." },
  { id: "hustle", icon: "💸", label: "Side Hustle", sub: "Extra Income · 7-Day Plan · Real Hustles", color: "#a855f7", rgb: "168,85,247", hint: "I have 2 free hours daily. Best side hustle for me?" },
  { id: "startup", icon: "🚀", label: "Startup Validator", sub: "Honest Score · Cost · Legal Guide", color: "#ec4899", rgb: "236,72,153", hint: "I want to start a food delivery business with Rs 50,000" },
];

const AFFS = [
  { icon: "📊", title: "Data Analytics Course", desc: "Python & SQL. Hired in 90 days.", tag: "₹499 · Udemy", url: "https://www.udemy.com/courses/development/data-science/", color: "#06b6d4" },
  { icon: "💼", title: "Naukri Premium", desc: "3x more recruiter views.", tag: "Free Trial", url: "https://www.naukri.com", color: "#f59e0b" },
  { icon: "🚀", title: "KSUM Startup Grant", desc: "Kerala govt funding up to ₹10L.", tag: "Free Apply", url: "https://startupmission.kerala.gov.in", color: "#10b981" },
  { icon: "📚", title: "LinkedIn Learning", desc: "1000+ courses. Certificate in 2 weeks.", tag: "1 Month Free", url: "https://www.linkedin.com/learning", color: "#6366f1" },
  { icon: "💰", title: "Zerodha + Coin", desc: "Start SIP from ₹100/month.", tag: "Free Account", url: "https://zerodha.com", color: "#ec4899" },
  { icon: "🖥️", title: "Upwork Profile", desc: "Earn dollars with Indian skills.", tag: "Free Join", url: "https://www.upwork.com", color: "#a855f7" },
];

const Circle = ({ score, size = 80, stroke = 6, color = "#06b6d4", label }) => {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(score, 100) / 100) * circ;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 5px ${color}88)`, transition: "stroke-dasharray 1.2s ease" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#f1f5f9", fontWeight: 800, fontSize: size > 70 ? 17 : 12 }}>{score}</span>
          <span style={{ color: "#334155", fontSize: 7 }}>/100</span>
        </div>
      </div>
      {label && <div style={{ color: "#64748b", fontSize: 10, fontWeight: 600, textAlign: "center" }}>{label}</div>}
    </div>
  );
};

const Bdg = ({ text, type = "ok" }) => {
  const C = { ok: ["#10b981", "rgba(16,185,129,0.1)"], warn: ["#f59e0b", "rgba(245,158,11,0.1)"], danger: ["#ef4444", "rgba(239,68,68,0.1)"], info: ["#06b6d4", "rgba(6,182,212,0.1)"] };
  const [c, bg] = C[type] || C.info;
  return <span style={{ padding: "3px 9px", borderRadius: 100, fontSize: 10, fontWeight: 700, color: c, background: bg, border: `1px solid ${c}33` }}>{text}</span>;
};

const SCard = ({ children, style = {} }) => (
  <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "13px 14px", marginBottom: 10, ...style }}>{children}</div>
);

const MiniBar = ({ label, value, color, icon, warn }) => (
  <div style={{ marginBottom: 9 }}>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
      <span style={{ color: "#475569", fontSize: 12 }}>{icon} {label} {warn && "⚠️"}</span>
      <span style={{ color, fontSize: 12, fontWeight: 700 }}>{value}%</span>
    </div>
    <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 100, height: 4 }}>
      <div style={{ height: 4, borderRadius: 100, width: `${Math.min(value, 100)}%`, background: `linear-gradient(90deg,${color}88,${color})`, transition: "width 1.2s ease" }} />
    </div>
  </div>
);

const Dashboard = ({ id, m }) => {
  const n = (k) => parseInt(m[k] || "0", 10);
  const rc = (v) => ["HIGH","CRITICAL","DEAD_END"].includes(v) ? "#ef4444" : ["MEDIUM","AT_RISK","MODERATE"].includes(v) ? "#f59e0b" : "#10b981";

  if (id === "career") return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 14 }}>
        <Circle score={n("ATS_SCORE")} color="#06b6d4" label="ATS Match" />
        <Circle score={Math.max(0, 100 - n("AUTOMATION_RISK"))} color="#10b981" label="Job Safety" />
        <Circle score={n("SKILL_GAP_SCORE")} color="#6366f1" label="Skill Fit" />
      </div>
      <SCard>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ color: "#334155", fontSize: 11, fontWeight: 700 }}>RISK RADAR</span>
          <Bdg text={m.RISK_LEVEL || "MEDIUM"} type={m.RISK_LEVEL === "HIGH" ? "danger" : m.RISK_LEVEL === "LOW" ? "ok" : "warn"} />
        </div>
        <MiniBar label="Automation Risk" value={n("AUTOMATION_RISK")} color={rc(m.RISK_LEVEL)} warn={n("AUTOMATION_RISK") > 60} icon="🤖" />
        <MiniBar label="Skill Relevance" value={n("SKILL_GAP_SCORE")} color="#6366f1" icon="🎯" />
      </SCard>
      {m.MISSING_KEYWORDS && <SCard>
        <div style={{ color: "#334155", fontSize: 11, fontWeight: 700, marginBottom: 8 }}>⚠️ MISSING KEYWORDS</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {m.MISSING_KEYWORDS.split(",").map((kw, i) => <span key={i} style={{ padding: "3px 9px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 100, color: "#ef4444", fontSize: 10, fontWeight: 600 }}>{kw.trim()}</span>)}
        </div>
      </SCard>}
    </div>
  );

  if (id === "hustle") return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 14 }}>
        <Circle score={n("EARNING_SCORE")} color="#06b6d4" label="Earning Potential" />
        <Circle score={n("SCHEDULE_FIT")} color="#10b981" label="Schedule Fit" />
      </div>
      <SCard>
        <div style={{ color: "#334155", fontSize: 11, fontWeight: 700, marginBottom: 10 }}>HUSTLE PROFILE</div>
        <div style={{ display: "flex", gap: 8 }}>
          {[["🔋","Social Drain",m.SOCIAL_BATTERY_DRAIN||"—",rc(m.SOCIAL_BATTERY_DRAIN)],["💰","Upfront Cost",m.INITIAL_INVESTMENT||"—","#06b6d4"]].map(([icon,lbl,val,c],i) => (
            <div key={i} style={{ flex: 1, background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "9px 8px", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
              <div style={{ fontSize: 15, marginBottom: 3 }}>{icon}</div>
              <div style={{ color: "#1e293b", fontSize: 9 }}>{lbl.toUpperCase()}</div>
              <div style={{ color: c, fontWeight: 700, fontSize: 11, marginTop: 2 }}>{val}</div>
            </div>
          ))}
        </div>
        {m.BEST_HUSTLE && <div style={{ color: "#06b6d4", fontSize: 12, fontWeight: 600, padding: "8px 10px", background: "rgba(6,182,212,0.08)", borderRadius: 9, border: "1px solid rgba(6,182,212,0.2)", marginTop: 10 }}>🏆 Top Pick: {m.BEST_HUSTLE}</div>}
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
        <div style={{ color: "#334155", fontSize: 11, fontWeight: 700, marginBottom: 10 }}>PROTECTION STATUS</div>
        {[["🏦","Emergency Fund",m.EMERGENCY_FUND_STATUS||"AT_RISK"],["🚨","Expense Leakage",m.LEAKAGE_RISK||"MEDIUM"]].map(([icon,lbl,val],i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7, padding: "7px 9px", background: "rgba(255,255,255,0.03)", borderRadius: 9 }}>
            <span style={{ color: "#475569", fontSize: 12 }}>{icon} {lbl}</span>
            <Bdg text={val.replace("_"," ")} type={["SAFE","LOW"].includes(val)?"ok":["CRITICAL","HIGH"].includes(val)?"danger":"warn"} />
          </div>
        ))}
        {m.MONTHLY_SAVE_TARGET && <div style={{ marginTop: 8, padding: "8px 10px", background: "rgba(16,185,129,0.08)", borderRadius: 9, border: "1px solid rgba(16,185,129,0.2)" }}>
          <span style={{ color: "#475569", fontSize: 11 }}>Monthly Save Target: </span>
          <span style={{ color: "#10b981", fontWeight: 700, fontSize: 13 }}>{m.MONTHLY_SAVE_TARGET}</span>
        </div>}
      </SCard>
    </div>
  );

  if (id === "jobs") return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 14 }}>
        <Circle score={n("AUTHENTICITY_SCORE")} color="#f59e0b" label="Authenticity" />
        <Circle score={m.GROWTH_TRAJECTORY==="SCALABLE"?85:m.GROWTH_TRAJECTORY==="MODERATE"?55:25} color="#10b981" label="Growth" />
      </div>
      <SCard>
        <div style={{ color: "#334155", fontSize: 11, fontWeight: 700, marginBottom: 10 }}>JOB INTELLIGENCE</div>
        {[["🚨","Scam Risk",m.SCAM_RISK||"MEDIUM"],["📈","Growth",m.GROWTH_TRAJECTORY||"MODERATE"],["💰","Salary Fit",m.SALARY_FIT||"FAIR"]].map(([icon,lbl,val],i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, padding: "6px 9px", background: "rgba(255,255,255,0.03)", borderRadius: 9 }}>
            <span style={{ color: "#475569", fontSize: 12 }}>{icon} {lbl}</span>
            <Bdg text={val.replace(/_/g," ")} type={["LOW","SCALABLE","ABOVE","FAIR"].includes(val)?"ok":["HIGH","DEAD_END"].includes(val)?"danger":"warn"} />
          </div>
        ))}
      </SCard>
    </div>
  );

  if (id === "startup") return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 14 }}>
        <Circle score={n("SUCCESS_SCORE")} color="#ec4899" label="Success Score" />
        <Circle score={m.LEGAL_RISK==="LOW"?85:m.LEGAL_RISK==="MEDIUM"?50:20} color="#10b981" label="Legal Safety" />
      </div>
      <SCard>
        <div style={{ color: "#334155", fontSize: 11, fontWeight: 700, marginBottom: 10 }}>STARTUP INTEL</div>
        {[["⚖️","Legal Risk",m.LEGAL_RISK||"LOW"],["🌐","Market Size",m.MARKET_SIZE||"MEDIUM"]].map(([icon,lbl,val],i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, padding: "6px 9px", background: "rgba(255,255,255,0.03)", borderRadius: 9 }}>
            <span style={{ color: "#475569", fontSize: 12 }}>{icon} {lbl}</span>
            <Bdg text={val} type={["LOW","LARGE"].includes(val)?"ok":["HIGH"].includes(val)?"danger":"warn"} />
          </div>
        ))}
      </SCard>
    </div>
  );
  return null;
};

const Fmt = ({ text, color }) => {
  const clean = cleanText(text);
  return (
    <div>
      {clean.split("\n").map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} style={{ height: 5 }} />;
        if (t.includes("monitoring") && t.includes("🛡️")) return <div key={i} style={{ marginTop: 12, padding: "8px 11px", background: "rgba(6,182,212,0.07)", border: "1px solid rgba(6,182,212,0.18)", borderRadius: 9, color: "#06b6d4", fontSize: 11, fontStyle: "italic" }}>{t}</div>;
        if (t.startsWith("⚡")) return <div key={i} style={{ marginTop: 12, marginBottom: 4, padding: "7px 11px", background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 9, fontWeight: 700, fontSize: 12, color: "#f1f5f9" }}>{t}</div>;
        if (/^(ROLE|COMPANY|SALARY|APPLY):/.test(t)) return null;
        const parts = t.replace(/\*\*([^*]+)\*\*/g, "|||$1|||").split("|||");
        const hasBold = parts.length > 1;
        const content = hasBold ? parts.map((p, j) => j % 2 === 1 ? <strong key={j} style={{ color: "#e2e8f0" }}>{p}</strong> : p) : t;
        if (/^[-•*]\s/.test(t) || /^\d+[.)]\s/.test(t)) return (
          <div key={i} style={{ display: "flex", gap: 7, paddingLeft: 2, margin: "4px 0" }}>
            <span style={{ color, fontSize: 10, marginTop: 3, flexShrink: 0 }}>›</span>
            <span style={{ color: "#7a8ea8", fontSize: 13, lineHeight: 1.65 }}>{hasBold ? content : t.replace(/^[-•*]\s/,"").replace(/^\d+[.)]\s/,"")}</span>
          </div>
        );
        if (/^[🛡️🔍💰🚀💸🎯📊⚡✅❌💼💡⚠️🏢📋🎓🔎]/.test(t) || /^#{1,3}\s/.test(t)) return <div key={i} style={{ marginTop: 12, marginBottom: 3, fontWeight: 700, fontSize: 13, color: "#dde4ee" }}>{t.replace(/^#{1,3}\s/,"")}</div>;
        return <div key={i} style={{ margin: "3px 0", color: "#64748b", fontSize: 13, lineHeight: 1.7 }}>{content}</div>;
      })}
    </div>
  );
};

const UpgradeModal = ({ onClose, onWatchAd }) => (
  <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 20px" }}>
    <div onClick={(e) => e.stopPropagation()} style={{ background: "#0a1220", borderRadius: 22, padding: "30px 22px", border: "1px solid rgba(6,182,212,0.3)", maxWidth: 370, width: "100%", textAlign: "center" }}>
      <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, margin: "0 auto 16px" }}>🛡️</div>
      <div style={{ color: "#fff", fontWeight: 800, fontSize: 20, marginBottom: 6 }}>Daily Quota Full</div>
      <div style={{ color: "#334155", fontSize: 13, lineHeight: 1.7, marginBottom: 22 }}>Used your <strong style={{ color: "#e2e8f0" }}>2 free shields</strong> today.<br />Job consultancy charges <strong style={{ color: "#ef4444" }}>₹25,000+</strong>.<br />LifePath Pro costs <strong style={{ color: "#10b981" }}>₹99/month</strong>.</div>
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 14, marginBottom: 18, textAlign: "left" }}>
        <div style={{ color: "#06b6d4", fontSize: 10, fontWeight: 700, letterSpacing: 2, marginBottom: 10 }}>LIFEPATH PRO</div>
        {["Unlimited daily shields","Malayalam + Hindi + English AI","Full analytics dashboard","24/7 job market monitoring","Cancel anytime"].map((f, i) => <div key={i} style={{ color: "#334155", fontSize: 12, margin: "5px 0" }}>✓ {f}</div>)}
      </div>
      <button onClick={onWatchAd} style={{ width: "100%", padding: 13, borderRadius: 12, border: "1px solid rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.1)", color: "#f59e0b", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>▶️ Watch Ad — Earn 1 Free Shield</button>
      <a href="https://wa.me/?text=Hi%20I%20want%20LifePath%20Pro" target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 13, borderRadius: 12, textDecoration: "none", background: "linear-gradient(135deg,#06b6d4,#0891b2)", color: "#fff", fontWeight: 700, fontSize: 13, marginBottom: 10 }}>💬 Upgrade via WhatsApp</a>
      <button onClick={onClose} style={{ width: "100%", padding: 10, background: "transparent", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, color: "#1e293b", fontSize: 12, cursor: "pointer" }}>Continue Tomorrow (Free)</button>
    </div>
  </div>
);

const ProfileModal = ({ profile, onSave, onClose }) => {
  const [form, setForm] = useState({ ...profile });
  const fields = [["name","Your Name"],["education","Education (e.g. B.Tech CSE)"],["experience","Experience (e.g. 2 years)"],["salary","Current Salary (e.g. ₹5 LPA)"],["location","City (e.g. Kochi, Bangalore)"],["goal","Career Goal"]];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 200, display: "flex", alignItems: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#0d1523", borderRadius: "22px 22px 0 0", padding: "26px 20px 44px", border: "1px solid rgba(255,255,255,0.07)", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 18, marginBottom: 4 }}>👤 My Profile</div>
        <div style={{ color: "#1e293b", fontSize: 12, marginBottom: 20 }}>Saved locally. Personalises every AI response.</div>
        {fields.map(([key, placeholder]) => (
          <input key={key} value={form[key] || ""} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "11px 14px", color: "#e2e8f0", fontSize: 13, marginBottom: 10, outline: "none", fontFamily: "inherit" }} />
        ))}
        <button onClick={() => onSave(form)} style={{ width: "100%", padding: 13, background: "linear-gradient(135deg,#06b6d4,#0891b2)", border: "none", borderRadius: 12, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Save Profile 🛡️</button>
      </div>
    </div>
  );
};

export default function LifePathAI() {
  const [screen, setScreen]     = useState("splash");
  const [pillar, setPillar]     = useState(null);
  const [messages, setMessages] = useState(() => {
  try {
    const saved = localStorage.getItem("lp_chat_history");
    return saved ? JSON.parse(saved) : {};
  } catch { return {}; }
});
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [phase, setPhase]       = useState(0);
  const [profile, setProfile]   = useState(() => S.get("lp_profile", {}));
  const [adBonus, setAdBonus]   = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [toast, setToast]       = useState("");
  const [lang, setLang]         = useState("english");
  const bottomRef = useRef(null);

  const fireToast = (m) => { setToast(m); setTimeout(() => setToast(""), 3000); };

  useEffect(() => {
    const ts = [setTimeout(()=>setPhase(1),350), setTimeout(()=>setPhase(2),1200), setTimeout(()=>setPhase(3),2300), setTimeout(()=>setScreen("home"),3500)];
    return () => ts.forEach(clearTimeout);
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const saveProfile = (p) => { setProfile(p); S.set("lp_profile", p); setShowProfile(false); fireToast("✅ Profile saved!"); };

  const sendMessage = async () => {
    if (!input.trim() || loading || !pillar) return;
    const usage = getUsage();
    const limit = adBonus ? FREE_LIMIT + 1 : FREE_LIMIT;
    if (usage.count >= limit) { setShowUpgrade(true); return; }
    const userMsg = input.trim();
    setInput("");
    const prev = messages[pillar.id] || [];
    const newMsgs = [...prev, { role: "user", content: userMsg }];
    setMessages((m) => ({ ...m, [pillar.id]: newMsgs }));
    setLoading(true);
    S.set("lp_usage", { ...usage, count: usage.count + 1 });
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: newMsgs, pillarId: pillar.id, profile }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.language) setLang(data.language);
      setMessages((m) => ({ ...m, [pillar.id]: [...newMsgs, { role: "assistant", content: data.reply }] }));
    } catch (err) {
      setMessages((m) => ({ ...m, [pillar.id]: [...newMsgs, { role: "assistant", content: `⚠️ ${err.message || "Connection error. Please retry."}` }] }));
    }
    setLoading(false);
    // Save to memory
S.set("lp_chat_history", messages);
  };

  const handleKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

  const usage = getUsage();
  const shieldsLeft = Math.max(0, (adBonus ? FREE_LIMIT + 1 : FREE_LIMIT) - usage.count);
  const curMsgs = pillar ? (messages[pillar.id] || []) : [];
  const lastAI = curMsgs.filter((m) => m.role === "assistant").slice(-1)[0];
  const metrics = lastAI ? parseMetrics(lastAI.content) : {};

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#060b14}
    ::-webkit-scrollbar{width:2px}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}
    textarea,input{font-family:'Syne',sans-serif!important}
    textarea::placeholder,input::placeholder{color:#1a2535}
    textarea:focus,input:focus{outline:none!important}
    a:hover{opacity:.88}
    @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes pulse{0%,100%{opacity:.25}50%{opacity:1}}
    @keyframes dot{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
    @keyframes brandIn{from{opacity:0;transform:scale(.87) translateY(14px)}to{opacity:1;transform:scale(1) translateY(0)}}
    @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
    @keyframes splashOut{0%{opacity:1}70%{opacity:1}100%{opacity:0}}
    @keyframes scan{0%{transform:translateY(-100%)}100%{transform:translateY(600%)}}
    .card{transition:transform .15s,box-shadow .15s;cursor:pointer}.card:active{transform:scale(.97)}
    .sx{overflow-x:auto;scrollbar-width:none}.sx::-webkit-scrollbar{display:none}
  `;

  return (
    <div style={{ minHeight:"100vh", background:"#060b14", fontFamily:"'Syne','Segoe UI',sans-serif", maxWidth:480, margin:"0 auto", display:"flex", flexDirection:"column", position:"relative", overflowX:"hidden" }}>
      <style>{CSS}</style>

      {toast && <div style={{ position:"fixed", top:14, left:"50%", transform:"translateX(-50%)", background:"rgba(6,182,212,.13)", border:"1px solid rgba(6,182,212,.4)", backdropFilter:"blur(12px)", borderRadius:100, padding:"7px 18px", color:"#06b6d4", fontSize:12, fontWeight:700, zIndex:400, whiteSpace:"nowrap", animation:"toastIn .3s both" }}>{toast}</div>}
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} onWatchAd={() => { setAdBonus(true); setShowUpgrade(false); fireToast("✅ +1 Shield earned!"); }} />}
      {showProfile && <ProfileModal profile={profile} onSave={saveProfile} onClose={() => setShowProfile(false)} />}

      {/* SPLASH */}
      {screen === "splash" && (
        <div style={{ position:"fixed", inset:0, background:"#060b14", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", zIndex:300, animation:phase>=3?"splashOut .8s both":"none" }}>
          <div style={{ position:"absolute", inset:0, overflow:"hidden", pointerEvents:"none" }}>
            <div style={{ position:"absolute", left:0, right:0, height:1, background:"linear-gradient(90deg,transparent,rgba(6,182,212,.4),transparent)", animation:phase>=1?"scan 2.5s linear infinite":"none" }} />
          </div>
          <div style={{ position:"absolute", width:300, height:300, borderRadius:"50%", background:"radial-gradient(circle,rgba(6,182,212,.07) 0%,transparent 70%)", animation:phase>=1?"fadeIn 1.5s both":"none" }} />
          <div style={{ animation:phase>=1?"brandIn .9s cubic-bezier(.34,1.4,.64,1) both":"none", textAlign:"center", marginBottom:10, zIndex:1 }}>
            <div style={{ fontSize:48, fontWeight:900, color:"#fff", letterSpacing:"-1.5px" }}>LifePath <span style={{ color:"#06b6d4" }}>AI</span></div>
          </div>
          <div style={{ animation:phase>=2?"fadeUp .6s both":"none", opacity:phase>=2?1:0, zIndex:1 }}>
            <div style={{ color:"#1e3a4a", fontSize:12, letterSpacing:"0.15em", fontFamily:"'JetBrains Mono',monospace" }}>YOUR CAREER BODYGUARD. ALWAYS WATCHING.</div>
          </div>
          <div style={{ marginTop:60, display:"flex", gap:8, animation:phase>=1?"fadeIn .5s 1s both":"none" }}>
            {[0,1,2].map((i) => <div key={i} style={{ width:4, height:4, borderRadius:"50%", background:"#06b6d4", animation:`dot 1.4s ${i*0.22}s infinite` }} />)}
          </div>
        </div>
      )}

      {/* HOME */}
      {screen === "home" && (
        <div style={{ flex:1, overflowY:"auto", zIndex:1 }}>
          <div style={{ position:"fixed", top:-80, left:"50%", transform:"translateX(-50%)", width:480, height:480, borderRadius:"50%", pointerEvents:"none", background:"radial-gradient(circle,rgba(6,182,212,.04) 0%,transparent 65%)" }} />

          {/* Header */}
          <div style={{ padding:"18px 18px 0", display:"flex", justifyContent:"space-between", alignItems:"center", animation:"fadeUp .4s both" }}>
            <div>
              <span style={{ fontSize:22, fontWeight:900, color:"#fff", letterSpacing:"-0.5px" }}>LifePath </span>
              <span style={{ fontSize:22, fontWeight:900, color:"#06b6d4", letterSpacing:"-0.5px" }}>AI</span>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <button onClick={() => setShowProfile(true)} style={{ background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.07)", borderRadius:100, padding:"5px 12px", color:"#334155", fontSize:13, cursor:"pointer" }}>👤</button>
              <div onClick={() => shieldsLeft===0 && setShowUpgrade(true)} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 13px", background:shieldsLeft>0?"rgba(6,182,212,.08)":"rgba(239,68,68,.08)", border:`1px solid ${shieldsLeft>0?"rgba(6,182,212,.22)":"rgba(239,68,68,.22)"}`, borderRadius:100, cursor:shieldsLeft===0?"pointer":"default" }}>
                <span>🛡️</span>
                <span style={{ color:shieldsLeft>0?"#06b6d4":"#ef4444", fontSize:12, fontWeight:700 }}>{shieldsLeft} Left</span>
              </div>
            </div>
          </div>

          {/* Welcome brief */}
          {(profile.name || profile.goal) && (
            <div style={{ margin:"14px 18px 0", padding:"13px 15px", background:"rgba(6,182,212,.05)", border:"1px solid rgba(6,182,212,.13)", borderRadius:14, animation:"fadeUp .5s .1s both" }}>
              <div style={{ color:"#06b6d4", fontSize:9, fontWeight:700, letterSpacing:2.5, marginBottom:5 }}>🛡️ DAILY BRIEFING</div>
              <div style={{ color:"#334155", fontSize:12, lineHeight:1.65 }}>
                {profile.name && <><strong style={{ color:"#64748b" }}>{profile.name}</strong>, </>}
                I am monitoring the <strong style={{ color:"#64748b" }}>{profile.goal||"career"}</strong> market. Your path is steady.
              </div>
            </div>
          )}

          {/* 5 Pillars */}
          <div style={{ padding:"18px 18px 0" }}>
            <div style={{ color:"#0f1825", fontSize:9, fontWeight:700, letterSpacing:3, marginBottom:12 }}>5 POWER PILLARS</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {PILLARS.map((p, i) => (
                <div key={p.id} className="card" onClick={() => { setPillar(p); setScreen("chat"); setInput(""); }} style={{ background:"rgba(255,255,255,.022)", backdropFilter:"blur(20px)", border:"1px solid rgba(255,255,255,.055)", borderRadius:18, padding:"16px 13px", position:"relative", overflow:"hidden", animation:`fadeUp .5s ${i*0.07}s both`, boxShadow:"0 4px 20px rgba(0,0,0,.3)" }}>
                  <div style={{ position:"absolute", top:-16, right:-16, width:70, height:70, borderRadius:"50%", background:`rgba(${p.rgb},.1)`, filter:"blur(16px)", pointerEvents:"none" }} />
                  <div style={{ width:38, height:38, borderRadius:11, background:`rgba(${p.rgb},.09)`, border:`1px solid rgba(${p.rgb},.2)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, marginBottom:10 }}>{p.icon}</div>
                  <div style={{ color:"#dde4ee", fontSize:11, fontWeight:700, marginBottom:3, lineHeight:1.3 }}>{p.label}</div>
                  <div style={{ color:"#0f1825", fontSize:9, lineHeight:1.4 }}>{p.sub}</div>
                  <div style={{ position:"absolute", bottom:11, right:11, color:p.color, fontSize:12, opacity:.4 }}>›</div>
                  {messages[p.id]?.length>0 && <div style={{ position:"absolute", top:9, right:9, background:p.color, borderRadius:100, padding:"1px 5px", fontSize:7, color:"#fff", fontWeight:700 }}>{Math.floor(messages[p.id].length/2)}</div>}
                </div>
              ))}
              <div className="card" onClick={() => setShowUpgrade(true)} style={{ background:"linear-gradient(135deg,rgba(6,182,212,.08),rgba(99,102,241,.08))", border:"1px solid rgba(6,182,212,.2)", borderRadius:18, padding:"16px 13px", display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", gap:8, animation:"fadeUp .5s .35s both" }}>
                <div style={{ fontSize:22 }}>⭐</div>
                <div style={{ color:"#06b6d4", fontSize:11, fontWeight:700 }}>LifePath Pro</div>
                <div style={{ color:"#1e3a4a", fontSize:9 }}>Unlimited · ₹99/mo</div>
              </div>
            </div>
          </div>

          {/* Affiliate Cards */}
          <div style={{ padding:"22px 0 0" }}>
            <div style={{ padding:"0 18px 10px", color:"#0f1825", fontSize:9, fontWeight:700, letterSpacing:3 }}>RECOMMENDED FOR YOU</div>
            <div className="sx" style={{ paddingLeft:18 }}>
              <div style={{ display:"flex", gap:10, paddingRight:18, width:"max-content" }}>
                {AFFS.map((a, i) => (
                  <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" style={{ display:"flex", alignItems:"center", gap:11, padding:"13px 14px", background:"rgba(255,255,255,.022)", border:"1px solid rgba(255,255,255,.065)", borderRadius:14, textDecoration:"none", width:248, flexShrink:0 }}>
                    <div style={{ width:40, height:40, borderRadius:11, background:`${a.color}18`, border:`1px solid ${a.color}33`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>{a.icon}</div>
                    <div>
                      <div style={{ color:"#e2e8f0", fontWeight:600, fontSize:12, marginBottom:2 }}>{a.title}</div>
                      <div style={{ color:"#1e293b", fontSize:10, lineHeight:1.4, marginBottom:4 }}>{a.desc}</div>
                      <span style={{ padding:"2px 8px", borderRadius:100, fontSize:9, fontWeight:700, color:"#06b6d4", background:"rgba(6,182,212,0.1)", border:"1px solid rgba(6,182,212,0.2)" }}>{a.tag}</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Ad Banner */}
          <div style={{ margin:"20px 18px", padding:16, background:"rgba(255,255,255,.015)", border:"1px dashed rgba(255,255,255,.06)", borderRadius:14, textAlign:"center", minHeight:90, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <div>
              <div style={{ color:"#1e293b", fontSize:10, letterSpacing:2, marginBottom:4 }}>ADVERTISEMENT</div>
              <div style={{ color:"#0f1825", fontSize:9 }}>Google AdSense · 320×90</div>
            </div>
          </div>

          <div style={{ textAlign:"center", padding:"4px 18px 36px", color:"#060d18", fontSize:9, letterSpacing:1.5, fontFamily:"'JetBrains Mono',monospace" }}>
            LIFEPATH AI · GEMINI 2.0 FLASH · 🇮🇳 INDIA
          </div>
        </div>
      )}

      {/* CHAT */}
      {screen === "chat" && pillar && (
        <div style={{ flex:1, display:"flex", flexDirection:"column", zIndex:1 }}>
          {/* Chat Header */}
          <div style={{ padding:"10px 13px", background:"rgba(6,11,20,.97)", borderBottom:"1px solid rgba(255,255,255,.05)", backdropFilter:"blur(24px)", display:"flex", alignItems:"center", gap:9, position:"sticky", top:0, zIndex:10 }}>
            <button onClick={() => setScreen("home")} style={{ background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.07)", borderRadius:10, width:33, height:33, color:"#475569", fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
            <span style={{ color:"#fff", fontWeight:900, fontSize:13 }}>LifePath </span>
            <span style={{ color:"#06b6d4", fontWeight:900, fontSize:13 }}>AI</span>
            <div style={{ width:29, height:29, borderRadius:9, background:`rgba(${pillar.rgb},.1)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13 }}>{pillar.icon}</div>
            <div style={{ flex:1 }}>
              <div style={{ color:"#dde4ee", fontWeight:700, fontSize:12 }}>{pillar.label}</div>
              <div style={{ color:"#0f1825", fontSize:9 }}>{lang!=="english"&&`🌐 ${lang} · `}{pillar.sub}</div>
            </div>
            <div style={{ background:"rgba(6,182,212,.08)", border:"1px solid rgba(6,182,212,.2)", borderRadius:100, padding:"3px 9px", display:"flex", alignItems:"center", gap:4 }}>
              <div style={{ width:4, height:4, borderRadius:"50%", background:"#06b6d4", animation:"pulse 2s infinite" }} />
              <span style={{ color:"#06b6d4", fontSize:9, fontWeight:700 }}>🛡️ {shieldsLeft}</span>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex:1, overflowY:"auto", padding:"14px 12px" }}>
            {lastAI && Object.keys(metrics).length>0 && (
              <div style={{ marginBottom:14, animation:"fadeUp .5s both" }}>
                <div style={{ color:"#0f1825", fontSize:9, fontWeight:700, letterSpacing:2.5, marginBottom:10, paddingLeft:2 }}>SECURITY DASHBOARD</div>
                <Dashboard id={pillar.id} m={metrics} />
              </div>
            )}

            {curMsgs.length===0 && (
              <div style={{ textAlign:"center", padding:"28px 12px", animation:"fadeUp .4s both" }}>
                <div style={{ width:62, height:62, borderRadius:"50%", background:`rgba(${pillar.rgb},.1)`, border:`1px solid rgba(${pillar.rgb},.2)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, margin:"0 auto 14px" }}>{pillar.icon}</div>
                <div style={{ color:"#e2e8f0", fontSize:16, fontWeight:700, marginBottom:5 }}>{pillar.label}</div>
                <div style={{ color:"#0f1825", fontSize:12, lineHeight:1.7, marginBottom:18 }}>Type in any language — Malayalam, Hindi, English, Manglish...</div>
                {profile.name && <div style={{ background:"rgba(16,185,129,.06)", border:"1px solid rgba(16,185,129,.15)", borderRadius:11, padding:"9px 13px", marginBottom:14, color:"#10b981", fontSize:11 }}>🛡️ Hi {profile.name}! Profile loaded. Ready to protect.</div>}
                <div onClick={() => setInput(pillar.hint)} style={{ background:"rgba(255,255,255,.025)", border:"1px solid rgba(255,255,255,.06)", borderRadius:12, padding:"10px 14px", cursor:"pointer", color:"#1e2d3d", fontSize:12, textAlign:"left", lineHeight:1.5 }}>
                  <span style={{ color:pillar.color, fontWeight:700 }}>Try: </span>{pillar.hint}
                </div>
              </div>
            )}

            {curMsgs.map((msg, i) => {
              const isAI = msg.role==="assistant";
              const jobCards = isAI && pillar.id==="jobs" ? parseJobCards(msg.content) : [];
              const links = isAI ? parseLinks(msg.content) : [];
              return (
                <div key={i} style={{ marginBottom:12, display:"flex", flexDirection:"column", alignItems:isAI?"flex-start":"flex-end", animation:"fadeUp .3s both" }}>
                  {!isAI ? (
                    <div style={{ background:`linear-gradient(135deg,${pillar.color},${pillar.color}cc)`, borderRadius:"15px 15px 4px 15px", padding:"10px 14px", maxWidth:"80%", color:"#fff", fontSize:13, lineHeight:1.6, boxShadow:`0 4px 14px rgba(${pillar.rgb},.22)` }}>{msg.content}</div>
                  ) : (
                    <div style={{ background:"rgba(255,255,255,.022)", backdropFilter:"blur(16px)", border:"1px solid rgba(255,255,255,.065)", borderRadius:"4px 15px 15px 15px", padding:"13px 13px", maxWidth:"97%", boxShadow:"0 4px 20px rgba(0,0,0,.22)" }}>
                      <div style={{ color:"#06b6d4", fontSize:9, letterSpacing:2.5, fontWeight:700, marginBottom:9, fontFamily:"'JetBrains Mono',monospace" }}>🛡️ LIFEPATH AI · {pillar.label.toUpperCase()}</div>
                      <Fmt text={msg.content} color={pillar.color} />
                      {jobCards.map((c, ci) => (
                        <div key={ci} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, padding:"11px 13px", background:"rgba(245,158,11,.07)", border:"1px solid rgba(245,158,11,.2)", borderRadius:12, marginTop:8 }}>
                          <div style={{ flex:1 }}>
                            <div style={{ color:"#e2e8f0", fontWeight:700, fontSize:12 }}>{c.role}</div>
                            {c.company && <div style={{ color:"#475569", fontSize:10, marginTop:1 }}>{c.company}</div>}
                            {c.salary && <div style={{ color:"#f59e0b", fontSize:11, marginTop:2, fontWeight:700 }}>{c.salary}</div>}
                          </div>
                          <a href={c.apply} target="_blank" rel="noopener noreferrer" style={{ padding:"7px 12px", borderRadius:100, textDecoration:"none", background:"linear-gradient(135deg,#f59e0b,#d97706)", color:"#fff", fontSize:11, fontWeight:700, flexShrink:0 }}>Apply →</a>
                        </div>
                      ))}
                      {links.length>0 && (
                        <div style={{ marginTop:12, display:"flex", flexWrap:"wrap", gap:7 }}>
                          {links.map((l, li) => <a key={li} href={l.url} target="_blank" rel="noopener noreferrer" style={{ padding:"6px 12px", borderRadius:100, textDecoration:"none", background:`rgba(${pillar.rgb},.09)`, border:`1px solid rgba(${pillar.rgb},.25)`, color:pillar.color, fontSize:11, fontWeight:600 }}>{l.label}</a>)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {loading && (
              <div style={{ background:"rgba(255,255,255,.022)", border:"1px solid rgba(255,255,255,.065)", borderRadius:"4px 15px 15px 15px", padding:"12px 14px", display:"inline-flex", alignItems:"center", gap:10 }}>
                <span style={{ color:"#06b6d4", fontSize:9, letterSpacing:2, fontFamily:"'JetBrains Mono',monospace" }}>SCANNING MARKET</span>
                {[0,1,2].map((i) => <div key={i} style={{ width:5, height:5, borderRadius:"50%", background:"#06b6d4", animation:`dot 1.2s ${i*0.2}s infinite` }} />)}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding:"9px 12px 24px", background:"rgba(6,11,20,.97)", borderTop:"1px solid rgba(255,255,255,.04)", backdropFilter:"blur(24px)" }}>
            <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
              <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKey} placeholder="Type in any language — Malayalam, Hindi, English..." rows={2}
                style={{ flex:1, background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)", borderRadius:13, padding:"10px 12px", color:"#e2e8f0", fontSize:13, resize:"none", lineHeight:1.5, transition:"border-color .2s" }}
                onFocus={(e) => (e.target.style.borderColor=pillar.color+"55")}
                onBlur={(e) => (e.target.style.borderColor="rgba(255,255,255,.07)")} />
              <button onClick={sendMessage} disabled={loading||!input.trim()} style={{ width:44, height:44, borderRadius:12, flexShrink:0, background:loading||!input.trim()?"rgba(255,255,255,.04)":`linear-gradient(135deg,${pillar.color},${pillar.color}99)`, border:"none", cursor:loading||!input.trim()?"not-allowed":"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, boxShadow:loading||!input.trim()?"none":`0 4px 14px rgba(${pillar.rgb},.3)`, transition:"all .2s" }}>
                {loading?"⏳":"↑"}
              </button>
            </div>
            <div style={{ color:"#060b14", fontSize:8, textAlign:"center", marginTop:5, letterSpacing:1.5, fontFamily:"'JetBrains Mono',monospace" }}>
              LIFEPATH AI · GEMINI 2.0 FLASH · ALWAYS WATCHING 🛡️
            </div>
          </div>
        </div>
      )}
    </div>
  );
   }
