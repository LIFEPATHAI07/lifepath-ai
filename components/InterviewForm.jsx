"use client";
import { useState } from "react";
import { saveInterview } from "../lib/feedback";
import { getUserId } from "../lib/session";

const QUESTIONS = [
  { key: "whyTried", label: "Why did you try LifePath AI today?" },
  { key: "expected", label: "What problem were you hoping it would solve?" },
  { key: "useful", label: "What was most useful?" },
  { key: "disappointed", label: "What disappointed you?" },
  { key: "returnTomorrow", label: "Would you come back tomorrow? Why?" },
  { key: "payFor", label: "What would make this worth paying for?" },
];

export default function InterviewForm({ pillar, onClose }) {
  const [answers, setAnswers] = useState({});
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const current = QUESTIONS[step];

  const handleNext = () => {
    if (step < QUESTIONS.length - 1) setStep(s => s + 1);
    else handleSubmit();
  };

  const handleSubmit = async () => {
    setSaving(true);
    await saveInterview({
      userId: getUserId(),
      pillar: pillar?.id || "unknown",
      ...answers,
    });
    setSaving(false);
    setDone(true);
    setTimeout(onClose, 2000);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 400, display: "flex", alignItems: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#0a1020", borderRadius: "22px 22px 0 0", padding: "24px 20px 44px", border: "1px solid rgba(255,255,255,0.07)" }}>

        {done ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🙏</div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>Thank you!</div>
            <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>Your feedback shapes the future of LifePath AI.</div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>💬 Share Your Experience</div>
                <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>Question {step + 1} of {QUESTIONS.length}</div>
              </div>
              <button onClick={onClose} style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 100, padding: "5px 12px", color: "#64748b", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Close</button>
            </div>

            <div style={{ background: "rgba(255,255,255,.06)", borderRadius: 100, height: 3, marginBottom: 20, overflow: "hidden" }}>
              <div style={{ height: 3, borderRadius: 100, width: `${((step + 1) / QUESTIONS.length) * 100}%`, background: "linear-gradient(90deg,#06b6d4,#6366f1)", transition: "width .3s ease" }} />
            </div>

            <div style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 600, marginBottom: 14, lineHeight: 1.5 }}>
              {current.label}
            </div>

            <textarea
              value={answers[current.key] || ""}
              onChange={e => setAnswers(a => ({ ...a, [current.key]: e.target.value }))}
              placeholder="Type your answer here..."
              rows={4}
              autoFocus
              style={{ width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "12px 14px", color: "#e2e8f0", fontSize: 13, resize: "none", lineHeight: 1.6, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              {step > 0 && (
                <button onClick={() => setStep(s => s - 1)}
                  style={{ padding: "12px 20px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, color: "#64748b", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                  ← Back
                </button>
              )}
              <button onClick={handleNext} disabled={saving}
                style={{ flex: 1, padding: "13px", background: "linear-gradient(135deg,#06b6d4,#0891b2)", border: "none", borderRadius: 12, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                {saving ? "Saving..." : step === QUESTIONS.length - 1 ? "Submit 🙏" : "Next →"}
              </button>
            </div>

            <button onClick={onClose}
              style={{ width: "100%", marginTop: 10, padding: "8px", background: "transparent", border: "none", color: "#334155", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
              Skip this
            </button>
          </>
        )}
      </div>
    </div>
  );
              }
