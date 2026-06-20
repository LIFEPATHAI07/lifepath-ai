"use client";
import { useState } from "react";
import { saveFeedback } from "@/lib/feedback";
import { getSessionId, getUserId } from "@/lib/session";

const YES_REASONS = ["Useful Advice", "Clear Roadmap", "Motivation", "Other"];
const NO_REASONS = ["Wrong Advice", "Confusing", "Didn't Solve My Problem", "Other"];

export default function FeedbackPrompt({ pillar, onClose, onDone }) {
  const [step, setStep] = useState("initial");
  const [rating, setRating] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleRating = (r) => {
    setRating(r);
    setStep(r === "yes" ? "yes_reason" : "no_reason");
  };

  const handleReason = async (reason) => {
    setSaving(true);
    await saveFeedback({
      rating,
      reason,
      pillar: pillar?.id || "unknown",
      sessionId: getSessionId(),
      userId: getUserId(),
    });
    setSaving(false);
    setStep("done");
    setTimeout(() => { onDone?.(); onClose?.(); }, 1800);
  };

  const reasons = rating === "yes" ? YES_REASONS : NO_REASONS;

  return (
    <div style={{ position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 32px)", maxWidth: 450, background: "#0d1929", border: `1px solid rgba(${pillar?.rgb || "6,182,212"},.25)`, borderRadius: 20, padding: "18px 18px 16px", zIndex: 200, boxShadow: "0 8px 40px rgba(0,0,0,.6)" }}>

      {step === "initial" && (
        <>
          <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 14, marginBottom: 14, textAlign: "center" }}>
            Did LifePath AI help you today?
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => handleRating("yes")}
              style={{ flex: 1, padding: "12px", background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.3)", borderRadius: 12, color: "#10b981", fontWeight: 700, fontSize: 18, cursor: "pointer", fontFamily: "inherit" }}>
              👍 Yes
            </button>
            <button onClick={() => handleRating("no")}
              style={{ flex: 1, padding: "12px", background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)", borderRadius: 12, color: "#ef4444", fontWeight: 700, fontSize: 18, cursor: "pointer", fontFamily: "inherit" }}>
              👎 No
            </button>
          </div>
          <button onClick={onClose}
            style={{ width: "100%", marginTop: 10, padding: "8px", background: "transparent", border: "none", color: "#334155", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
            Skip
          </button>
        </>
      )}

      {(step === "yes_reason" || step === "no_reason") && (
        <>
          <div style={{ color: rating === "yes" ? "#10b981" : "#ef4444", fontWeight: 700, fontSize: 13, marginBottom: 12, textAlign: "center" }}>
            {rating === "yes" ? "👍 Great! What helped most?" : "👎 Sorry. What went wrong?"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {reasons.map((r, i) => (
              <button key={i} onClick={() => handleReason(r)} disabled={saving}
                style={{ padding: "11px 10px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 12, color: "#94a3b8", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", lineHeight: 1.4 }}>
                {r}
              </button>
            ))}
          </div>
          <button onClick={onClose}
            style={{ width: "100%", marginTop: 10, padding: "8px", background: "transparent", border: "none", color: "#334155", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
            Skip
          </button>
        </>
      )}

      {step === "done" && (
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🙏</div>
          <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 14 }}>Thank you for your feedback!</div>
          <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>It helps us improve for everyone.</div>
        </div>
      )}
    </div>
  );
}
