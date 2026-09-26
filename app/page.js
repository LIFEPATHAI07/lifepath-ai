"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { db } from "../lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { getUserId } from "../lib/user";

const S = {
  get: (k, fb = null) => { try { const d = localStorage.getItem(k); return d ? JSON.parse(d) : fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const saveFeedback = async ({ feedbackType = "signal", rating, reason = "", correction = "", snapshot = null }) => {
  try {
    const colRef = collection(db, "feedback");
    const docData = {
      userId: getUserId(),
      pillar: "diagnosis",
      feedbackType,
      rating,
      reason: reason || "",
      correction: correction || "",
      snapshot: snapshot || null,
      timestamp: serverTimestamp(),
    };
    const docRef = await addDoc(colRef, docData);
    return { success: true, id: docRef.id };
  } catch (e) {
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

const MessageBubbleUser = ({ content, onEdit, disabled }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content || "");

  useEffect(() => { setDraft(content || ""); }, [content]);

  if (editing) {
    return (
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "flex-end", animation: "fadeUp .3s both" }}>
        <div style={{ maxWidth: "88%", width: "100%" }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.min(8, Math.max(2, Math.ceil(draft.length / 40)))}
            autoFocus
            style={{ width: "100%", boxSizing: "border-box", padding: "11px 15px", borderRadius: "16px 16px 4px 16px", border: "1px solid rgba(99,102,241,.4)", background: "rgba(99,102,241,.08)", color: "#fff", fontSize: 14, lineHeight: 1.6, fontFamily: "inherit", resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
            <button onClick={() => { setDraft(content || ""); setEditing(false); }}
              style={{ padding: "6px 12px", background: "transparent", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, color: "#64748b", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              Cancel
            </button>
            <button
              onClick={() => {
                const t = draft.trim();
                if (!t) return;
                setEditing(false);
                onEdit?.(t);
              }}
              disabled={!draft.trim()}
              style={{ padding: "6px 14px", background: draft.trim() ? "rgba(99,102,241,.2)" : "rgba(255,255,255,.03)", border: "1px solid rgba(99,102,241,.4)", borderRadius: 8, color: draft.trim() ? "#818cf8" : "#475569", fontWeight: 700, fontSize: 12, cursor: draft.trim() ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
              Save & resend
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", alignItems: "flex-end", animation: "fadeUp .3s both" }}>
      <div style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)", borderRadius: "16px 16px 4px 16px", padding: "11px 15px", maxWidth: "82%", color: "#fff", fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
        {content?.length > 600 ? content.substring(0, 600) + "..." : content}
      </div>
      {onEdit && (
        <button
          onClick={() => setEditing(true)}
          disabled={disabled}
          title="Edit this message"
          style={{ marginTop: 4, background: "transparent", border: "none", color: "#475569", fontSize: 11, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1, padding: "2px 4px", fontFamily: "inherit" }}>
          ✏️ Edit
        </button>
      )}
    </div>
  );
};

const DIAGNOSIS_REASONS = [
  { id: "not_my_problem", label: "That's not my problem" },
  { id: "misunderstood", label: "You misunderstood my situation" },
  { id: "evidence_wrong", label: "The evidence is wrong" },
  { id: "want_to_explain", label: "I want to explain what actually happened" },
];

const InvestigationCard = ({ data, onInvestigateDeeper, onFeedback, fbState, fbError }) => {
  const [showReasons, setShowReasons] = useState(false);
  const [selectedReason, setSelectedReason] = useState("");
  const [correctionText, setCorrectionText] = useState("");

  if (!data) return null;
  const { reply, insight, uncertainty, recommended_action, next_question, tip, ready_to_investigate_deeper, diagnosis } = data;

  // feedback_mode is decided server-side, never guessed on the frontend from
  // whether a response merely exists. Fall back to the old analysis_ready
  // flag only for messages cached before this change.
  const feedbackMode = data.feedback_mode || (data.analysis_ready === true ? "diagnosis" : "none");
  const isDiagnosis = feedbackMode === "diagnosis" && !!diagnosis?.bottleneck;
  const isSignal = feedbackMode === "signal" && !isDiagnosis;
  const hasVerifiedNumbers = data.verified_stats && (data.verified_stats.portalRate != null || data.verified_stats.directRate != null || data.verified_stats.sampleSize);

  const submitDiagnosisPositive = () => {
    onFeedback?.({
      feedbackType: "diagnosis",
      rating: "positive",
      snapshot: { bottleneck: diagnosis?.bottleneck, confidence: diagnosis?.confidence },
    });
  };
  const submitDiagnosisNegative = () => {
    if (!selectedReason) return;
    onFeedback?.({
      feedbackType: "diagnosis",
      rating: "negative",
      reason: selectedReason,
      correction: correctionText.trim(),
      snapshot: { bottleneck: diagnosis?.bottleneck, confidence: diagnosis?.confidence },
    });
  };
  const submitSignal = (rating) => {
    onFeedback?.({ feedbackType: "signal", rating, snapshot: { signal: data.signal || insight } });
  };

  return (
    <div style={{ marginBottom: 16, animation: "fadeUp .3s both" }}>
      <div style={{ borderRadius: "4px 16px 16px 16px", overflow: "hidden", border: isDiagnosis ? "1px solid rgba(99,102,241,.3)" : "1px solid rgba(99,102,241,.15)", background: "rgba(255,255,255,.02)" }}>

        {reply && !isDiagnosis && (
          <div style={{ padding: "14px 16px", color: "#e2e8f0", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {reply}
          </div>
        )}

        {isDiagnosis && (
          <div style={{ padding: "14px 16px", background: "rgba(99,102,241,.05)", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
            <div style={{ color: "#818cf8", fontSize: 10, fontWeight: 800, letterSpacing: 2, marginBottom: 8 }}>YOUR JOB SEARCH</div>
            {reply && <div style={{ color: "#94a3b8", fontSize: 12.5, lineHeight: 1.6 }}>{reply}</div>}
          </div>
        )}

        {insight && (
          <div style={{ padding: "14px 16px", background: "rgba(99,102,241,.06)", borderTop: isDiagnosis ? "none" : "1px solid rgba(255,255,255,.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
              <span style={{ color: "#818cf8", fontSize: 9, fontWeight: 700, letterSpacing: 2 }}>
                {isDiagnosis ? "WHAT WE FOUND" : isSignal ? "🔎 JOB SEARCH SIGNAL" : "🔍 SIGNAL FOUND"}
              </span>
              {isSignal && data.leadingHypothesis?.confidence && (
                <span title={`Confidence in the specific idea being discussed ("${data.leadingHypothesis.label}") — not proof, and not based on how much data we have`} style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: 1, padding: "3px 8px", borderRadius: 100,
                  color: data.leadingHypothesis.confidence === "low" ? "#f59e0b" : data.leadingHypothesis.confidence === "medium" ? "#818cf8" : "#10b981",
                  background: data.leadingHypothesis.confidence === "low" ? "rgba(245,158,11,.1)" : data.leadingHypothesis.confidence === "medium" ? "rgba(99,102,241,.1)" : "rgba(16,185,129,.1)",
                }}>
                  HYPOTHESIS CONFIDENCE: {data.leadingHypothesis.confidence?.toUpperCase()}
                </span>
              )}
            </div>
            <div style={{ color: "#c7d2fe", fontSize: 13, lineHeight: 1.6 }}>{insight}</div>
          </div>
        )}

        {isDiagnosis && diagnosis?.bottleneck && (
          <div style={{ padding: "14px 16px", background: "rgba(99,102,241,.04)", borderTop: "1px solid rgba(255,255,255,.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ color: "#818cf8", fontSize: 9, fontWeight: 700, letterSpacing: 2 }}>🎯 YOUR JOB SEARCH DIAGNOSIS</span>
              {diagnosis.confidence && (
                <span title="How strong the evidence behind this specific diagnosis is" style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: 1, padding: "3px 8px", borderRadius: 100,
                  color: diagnosis.confidence === "low" ? "#f59e0b" : diagnosis.confidence === "medium" ? "#818cf8" : "#10b981",
                  background: diagnosis.confidence === "low" ? "rgba(245,158,11,.1)" : diagnosis.confidence === "medium" ? "rgba(99,102,241,.1)" : "rgba(16,185,129,.1)",
                }}>
                  CONFIDENCE: {diagnosis.confidence.toUpperCase()}
                </span>
              )}
            </div>
            <div style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{diagnosis.bottleneck}</div>
            {Array.isArray(diagnosis.reasoning) && diagnosis.reasoning.length > 0 && (
              <div>
                <div style={{ color: "#64748b", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 5 }}>WHY WE THINK THIS</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: "#94a3b8", fontSize: 12.5, lineHeight: 1.7 }}>
                  {diagnosis.reasoning.map((r, idx) => <li key={idx}>{r}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {uncertainty && (
          <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,.04)" }}>
            <div style={{ color: "#94a3b8", fontSize: 9, fontWeight: 700, letterSpacing: 2, marginBottom: 5 }}>{isDiagnosis ? "WHAT WE DON'T KNOW YET" : "⚠️ UNCERTAINTY"}</div>
            <div style={{ color: "#64748b", fontSize: 12, lineHeight: 1.6 }}>{uncertainty}</div>
          </div>
        )}

        {hasVerifiedNumbers && (
          <div style={{ padding: "12px 16px", background: "rgba(16,185,129,.04)", borderTop: "1px solid rgba(255,255,255,.04)" }}>
            <div style={{ color: "#10b981", fontSize: 9, fontWeight: 700, letterSpacing: 2, marginBottom: 6 }}>📊 FROM THE NUMBERS YOU GAVE</div>
            {data.verified_stats.portalRate != null && (
              <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 3 }}>
                Portal: {data.verified_stats.portalRate}% response ({data.verified_stats.portalResponses}/{data.verified_stats.portalApplications})
              </div>
            )}
            {data.verified_stats.directRate != null && (
              <div style={{ color: "#94a3b8", fontSize: 12 }}>
                Direct: {data.verified_stats.directRate}% response ({data.verified_stats.directResponses}/{data.verified_stats.directApplications})
              </div>
            )}
            {data.verified_stats.sampleSize && (
              <div title="How much application volume we have — not a judgment about any specific cause" style={{ color: "#475569", fontSize: 11, marginTop: 6, fontStyle: "italic" }}>
                Sample size so far: {data.verified_stats.sampleSize}
              </div>
            )}
          </div>
        )}

        {recommended_action && (
          <div style={{ padding: "14px 16px", background: "rgba(245,158,11,.05)", borderTop: "1px solid rgba(255,255,255,.04)" }}>
            <div style={{ color: "#f59e0b", fontSize: 9, fontWeight: 700, letterSpacing: 2, marginBottom: 6 }}>{isDiagnosis ? "WHAT WE'D INVESTIGATE NEXT" : "🎯 SMALLEST NEXT STEP"}</div>
            <div style={{ color: "#fbbf24", fontSize: 13, lineHeight: 1.6, fontWeight: 600 }}>{recommended_action}</div>
          </div>
        )}

        {tip && (
          <div style={{ padding: "10px 16px", borderTop: "1px solid rgba(255,255,255,.04)" }}>
            <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
              <span style={{ color: "#475569", fontSize: 11 }}>💡</span>
              <span style={{ color: "#64748b", fontSize: 11.5, lineHeight: 1.6, fontStyle: "italic" }}>{tip}</span>
            </div>
          </div>
        )}

        {ready_to_investigate_deeper && (
          <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,.04)" }}>
            <button onClick={onInvestigateDeeper}
              style={{ width: "100%", padding: "12px", background: "rgba(99,102,241,.1)", border: "1px solid rgba(99,102,241,.3)", borderRadius: 12, color: "#818cf8", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Yes, let's investigate further →
            </button>
          </div>
        )}

        {/* SIGNAL-LEVEL FEEDBACK — lightweight, optional, no reason capture. */}
        {isSignal && onFeedback && fbState !== "saved" && (
          <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,.04)" }}>
            {fbState === "saving" ? (
              <div style={{ textAlign: "center", color: "#475569", fontSize: 11 }}>Saving...</div>
            ) : (
              <>
                <div style={{ color: "#64748b", fontSize: 11, marginBottom: 8 }}>Was this analysis useful?</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => submitSignal("positive")}
                    style={{ flex: 1, padding: "9px", background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.2)", borderRadius: 10, color: "#10b981", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                    👍 Yes
                  </button>
                  <button onClick={() => submitSignal("negative")}
                    style={{ flex: 1, padding: "9px", background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.15)", borderRadius: 10, color: "#ef4444", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                    👎 Not really
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* DIAGNOSIS-LEVEL FEEDBACK — the moment that actually matters. */}
        {isDiagnosis && onFeedback && fbState !== "saved" && (
          <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,.04)" }}>
            {fbState === "saving" ? (
              <div style={{ textAlign: "center", color: "#475569", fontSize: 11 }}>Saving...</div>
            ) : !showReasons ? (
              <>
                <div style={{ color: "#64748b", fontSize: 11, marginBottom: 8 }}>Does this diagnosis match what actually happened?</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={submitDiagnosisPositive}
                    style={{ flex: 1, padding: "9px", background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.2)", borderRadius: 10, color: "#10b981", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                    👍 Yes, that matches
                  </button>
                  <button onClick={() => setShowReasons(true)}
                    style={{ flex: 1, padding: "9px", background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.15)", borderRadius: 10, color: "#ef4444", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                    👎 No, that's not what happened
                  </button>
                </div>
              </>
            ) : (
              <div>
                <div style={{ color: "#64748b", fontSize: 11, marginBottom: 8 }}>What's off about it?</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {DIAGNOSIS_REASONS.map(r => (
                    <button key={r.id} onClick={() => setSelectedReason(r.id)}
                      style={{
                        padding: "6px 10px", borderRadius: 100, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                        border: selectedReason === r.id ? "1px solid rgba(99,102,241,.5)" : "1px solid rgba(255,255,255,.1)",
                        background: selectedReason === r.id ? "rgba(99,102,241,.15)" : "rgba(255,255,255,.03)",
                        color: selectedReason === r.id ? "#818cf8" : "#94a3b8",
                      }}>
                      {r.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={correctionText}
                  onChange={e => setCorrectionText(e.target.value)}
                  placeholder="Optional — tell us what actually happened, in your own words"
                  rows={2}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.03)", color: "#e2e8f0", fontSize: 12, fontFamily: "inherit", resize: "vertical", marginBottom: 8 }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setShowReasons(false)}
                    style={{ padding: "8px 12px", background: "transparent", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, color: "#64748b", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                    Cancel
                  </button>
                  <button onClick={submitDiagnosisNegative} disabled={!selectedReason}
                    style={{ flex: 1, padding: "8px 12px", background: selectedReason ? "rgba(99,102,241,.15)" : "rgba(255,255,255,.03)", border: "1px solid rgba(99,102,241,.3)", borderRadius: 10, color: selectedReason ? "#818cf8" : "#475569", fontWeight: 700, fontSize: 12, cursor: selectedReason ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
                    Submit
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {fbState === "saved" && (
          <div style={{ padding: "10px 16px", textAlign: "center", borderTop: "1px solid rgba(255,255,255,.04)" }}>
            <span style={{ color: "#10b981", fontSize: 11 }}>🙏 Thanks</span>
          </div>
        )}
        {fbState === "error" && (
          <div style={{ padding: "8px 16px", textAlign: "center", color: "#ef4444", fontSize: 11 }}>❌ {fbError}</div>
        )}
      </div>
    </div>
  );
};

export default function LifePath() {
  const [screen, setScreen] = useState("splash");
  const [phase, setPhase] = useState(0);
  const [messages, setMessages] = useState(() => {
    const stored = S.get("lp_chat_history_v2", []);
    return Array.isArray(stored) ? stored : [];
  });
  const [input, setInput] = useState("");
  const [cvFile, setCvFile] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fbStates, setFbStates] = useState({});
  const [fbErrors, setFbErrors] = useState({});
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const fileRef = useRef(null);
  const pdfJsLoaded = useRef(false);
  const sendingRef = useRef(false);

  useEffect(() => {
    const ts = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1100),
      setTimeout(() => setPhase(3), 2200),
      setTimeout(() => {
        setScreen(messages.length > 0 ? "chat" : "home");
      }, 2800),
    ];
    return () => ts.forEach(clearTimeout);
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => { if (messages.length > 0) S.set("lp_chat_history_v2", messages); }, [messages]);

  const startInvestigation = () => {
    setScreen("chat");
  };

  const loadPdfJs = async () => {
    if (pdfJsLoaded.current && window.pdfjsLib) return true;
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        pdfJsLoaded.current = true;
        resolve(true);
      };
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    // Always reset so selecting the exact same file again still fires onChange.
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;

    if (file.name.toLowerCase().endsWith(".pdf")) {
      setExtracting(true);
      try {
        const loaded = await loadPdfJs();
        if (!loaded || !window.pdfjsLib) throw new Error("pdfjs-unavailable");
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = "";
        for (let i = 1; i <= Math.min(pdf.numPages, 8); i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          fullText += content.items.map((item) => item.str).join(" ") + "\n";
        }
        if (fullText.trim().length > 80) {
          setCvFile({ name: file.name, text: fullText.trim() });
        } else {
          setMessages((m) => [...m, { role: "assistant", content: "⚠️ This PDF doesn't appear to have readable text — it may be a scanned image. Please paste your CV text directly in the message box instead.", structured: null }]);
        }
      } catch {
        setMessages((m) => [...m, { role: "assistant", content: "⚠️ Couldn't read that PDF. It may be corrupted or scanned. You can paste your CV text directly in the message box instead.", structured: null }]);
      } finally {
        setExtracting(false);
      }
      return;
    }

    if (file.name.toLowerCase().endsWith(".txt")) {
      setExtracting(true);
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target.result;
        setExtracting(false);
        if (!text || text.trim().length < 30) {
          setMessages((m) => [...m, { role: "assistant", content: "⚠️ Couldn't read that file. You can paste your CV text directly in the message box instead.", structured: null }]);
          return;
        }
        setCvFile({ name: file.name, text: text.trim() });
      };
      reader.onerror = () => {
        setExtracting(false);
        setMessages((m) => [...m, { role: "assistant", content: "⚠️ File error. You can paste your CV text directly instead.", structured: null }]);
      };
      reader.readAsText(file);
      return;
    }

    setMessages((m) => [...m, { role: "assistant", content: "⚠️ Please upload a PDF or TXT file — other formats aren't supported yet. You can paste your CV text directly instead.", structured: null }]);
  };

  const sendMessage = async (overrideText, baseMessages) => {
    const userMsg = (overrideText || input).trim();
    if ((!userMsg && !cvFile) || loading || sendingRef.current) return;
    sendingRef.current = true;

    const usage = getUsage();
    if (usage.count >= FREE_LIMIT) {
      sendingRef.current = false;
      alert("Daily limit reached. Come back tomorrow.");
      return;
    }

    // baseMessages lets an edit-and-resend build on the just-truncated
    // history explicitly, instead of the (possibly stale, pre-truncation)
    // `messages` closure from this render.
    const historyBase = baseMessages || messages;

    const attachedCv = cvFile;
    setInput("");
    setCvFile(null);

    const MAX_HISTORY_MESSAGES = 12;
    const MAX_MESSAGE_CHARS = 1200;
    const MAX_CV_CHARS = 10000;
    const truncate = (text, max = MAX_MESSAGE_CHARS) => {
      if (!text) return "";
      return text.length > max ? text.slice(0, max) + " ...[truncated]" : text;
    };

    const fullApiMessages = historyBase
      .filter(m => m.content || m.structured)
      .map(m => ({
        role: m.role,
        content: truncate(m.content) || (m.structured
          ? `[LifePath: ${truncate(m.structured.reply) || ""}]`
          : ""),
      }))
      .filter(m => m.content);

    const apiMessages = fullApiMessages.slice(-MAX_HISTORY_MESSAGES);

    let outgoingText = truncate(userMsg);
    let displayText = userMsg;
    if (attachedCv) {
      const cvBlock = `[CV attached: ${attachedCv.name}]\n${truncate(attachedCv.text, MAX_CV_CHARS)}`;
      outgoingText = outgoingText ? `${outgoingText}\n\n${cvBlock}` : cvBlock;
      displayText = userMsg ? `${userMsg}\n\n📎 ${attachedCv.name}` : `📎 ${attachedCv.name}`;
    }

    apiMessages.push({ role: "user", content: outgoingText });

    const newMsgs = [...historyBase, { role: "user", content: displayText }];
    setMessages(newMsgs);
    setLoading(true);
    S.set("lp_usage", { ...usage, count: usage.count + 1 });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, userId: getUserId() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.message || "Connection error. Please retry.");

      const aiMsg = {
        role: "assistant",
        structured: { ...data.structured, verified_stats: data.verified_stats },
      };
      setMessages(m => [...m, aiMsg]);
    } catch (err) {
      setMessages(m => [...m, { role: "assistant", content: `⚠️ ${err.message || "Connection error. Please retry."}`, structured: null }]);
    } finally {
      setLoading(false);
      sendingRef.current = false;
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      if (!loading) sendMessage();
    }
  };

  // Editing a past message drops it and everything after it (its answer is
  // no longer valid once the question changes), then resends the edited
  // text as a fresh turn — the same "edit and regenerate" pattern other
  // chat assistants use. Any feedback state tied to the now-discarded
  // messages is cleared so it can't bleed onto whatever reoccupies those
  // slots. Note: this only rewinds what's shown in this chat — it does not
  // roll back the server-side investigation state (facts/hypotheses
  // already recorded from the original branch stay recorded).
  const handleEditMessage = (index, newText) => {
    if (loading || sendingRef.current) return;
    const truncated = messages.slice(0, index);
    setMessages(truncated);
    const keepBelow = (obj) => {
      const next = {};
      Object.entries(obj).forEach(([k, v]) => { if (Number(k) < index) next[k] = v; });
      return next;
    };
    setFbStates(keepBelow);
    setFbErrors(keepBelow);
    sendMessage(newText, truncated);
  };

  const handleFeedback = async (msgIndex, payload) => {
    setFbStates(s => ({ ...s, [msgIndex]: "saving" }));
    const result = await saveFeedback(payload);
    if (result.success) {
      setFbStates(s => ({ ...s, [msgIndex]: "saved" }));
      // A correction is new evidence about the user's real situation — feed
      // it back into the investigation as a normal turn so the reasoning
      // state (hypotheses/diagnosis) can actually update, instead of just
      // storing it as an inert rating.
      if (payload.correction && payload.correction.trim()) {
        sendMessage(payload.correction.trim());
      }
    } else {
      setFbStates(s => ({ ...s, [msgIndex]: "error" }));
      setFbErrors(e => ({ ...e, [msgIndex]: result.error }));
    }
  };

  // True clear: resets the persisted server-side investigation state,
  // then clears local UI state. If the server reset fails, we tell the
  // user rather than silently pretending it worked.
  const clearChat = async () => {
    setClearing(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_search", userId: getUserId() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.message || "Could not reset your investigation.");

      setMessages([]);
      setFbStates({});
      setFbErrors({});
      setCvFile(null);
      S.set("lp_chat_history_v2", []);
      setShowClearConfirm(false);
    } catch (err) {
      setShowClearConfirm(false);
      setMessages(m => [...m, { role: "assistant", content: `⚠️ ${err.message || "Could not fully reset. Please try again."}`, structured: null }]);
    } finally {
      setClearing(false);
    }
  };

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#060814;overscroll-behavior:none}
    .app-shell{height:100vh;height:100dvh;overflow:hidden;display:flex;flex-direction:column}
    ::-webkit-scrollbar{width:2px}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}
    textarea,input,button{font-family:'Syne',sans-serif!important}
    textarea::placeholder{color:#334155!important}
    @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes dot{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
    @keyframes brandIn{from{opacity:0;transform:scale(.85) translateY(16px)}to{opacity:1;transform:scale(1) translateY(0)}}
    @keyframes glow{0%,100%{opacity:.2}50%{opacity:.5}}
    .btn{transition:all .15s;cursor:pointer}.btn:active{transform:scale(.96)}
  `;

  return (
    <div className="app-shell" style={{ background: "#060814", fontFamily: "'Syne','Segoe UI',sans-serif", maxWidth: 480, margin: "0 auto", position: "relative", overflowX: "hidden" }}>
      <style>{CSS}</style>

      {screen === "splash" && (
        <div style={{ position: "fixed", inset: 0, background: "#060814", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 300 }}>
          <div style={{ position: "absolute", width: 360, height: 360, borderRadius: "50%", background: "radial-gradient(circle,rgba(99,102,241,.08) 0%,transparent 70%)", animation: phase >= 1 ? "glow 3s ease infinite" : "none" }} />
          <div style={{ animation: phase >= 1 ? "brandIn .9s cubic-bezier(.34,1.4,.64,1) both" : "none", textAlign: "center", zIndex: 1 }}>
            <div style={{ fontSize: 46, fontWeight: 900, color: "#fff", letterSpacing: "-2px" }}>LifePath</div>
          </div>
          <div style={{ marginTop: 60, display: "flex", gap: 9, animation: phase >= 1 ? "fadeIn .5s 1s both" : "none" }}>
            {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "#6366f1", animation: `dot 1.5s ${i*.25}s infinite` }} />)}
          </div>
        </div>
      )}

      {screen === "home" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "40px 22px 32px", zIndex: 1 }}>

          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "rgba(99,102,241,.1)", border: "1px solid rgba(99,102,241,.25)", borderRadius: 100, marginBottom: 22 }}>
            <span style={{ color: "#818cf8", fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>✦ YOUR JOB SEARCH INTELLIGENCE</span>
          </div>

          <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", lineHeight: 1.35, marginBottom: 10 }}>
            Not getting responses from your job applications?
          </div>

          <div style={{ fontSize: 16, color: "#818cf8", fontWeight: 700, marginBottom: 16 }}>
            Stop guessing. Find what's holding your job search back.
          </div>

          <div style={{ color: "#94a3b8", fontSize: 13.5, lineHeight: 1.75, marginBottom: 32 }}>
            You don't need more job listings. You need to understand why your applications aren't converting — and what to change. LifePath analyzes your actual search to find the answer.
          </div>

          <div style={{ color: "#334155", fontSize: 10, fontWeight: 700, letterSpacing: 2, marginBottom: 14 }}>WHAT LIFEPATH DOES</div>

          {[
            { title: "Find what's holding you back", desc: "See the patterns behind your missed responses and interviews." },
            { title: "Know what to change", desc: "Get a clear next move based on your actual job search — not generic advice." },
            { title: "Test what works", desc: "Make one change, track the result, and learn what improves your response rate." },
            { title: "Turn your search into a system", desc: "LifePath remembers what you've tried and gets smarter about what works for you." },
          ].map((f, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "14px 0", borderBottom: i < 3 ? "1px solid rgba(255,255,255,.05)" : "none" }}>
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#6366f1", flexShrink: 0, marginTop: 8 }} />
              <div>
                <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 13.5, marginBottom: 3 }}>{f.title}</div>
                <div style={{ color: "#64748b", fontSize: 12.5, lineHeight: 1.6 }}>{f.desc}</div>
              </div>
            </div>
          ))}

          <div style={{ color: "#334155", fontSize: 10, fontWeight: 700, letterSpacing: 2, margin: "32px 0 16px" }}>HOW IT WORKS</div>

          <div style={{ padding: "16px", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 16, marginBottom: 32 }}>
            {["Tell us what you've been doing", "LifePath analyzes your search", "Finds the likely bottleneck", "Shows what to change next", "Track the result"].map((step, i, arr) => (
              <div key={i}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(99,102,241,.15)", border: "1px solid rgba(99,102,241,.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ color: "#818cf8", fontSize: 10, fontWeight: 800 }}>{i + 1}</span>
                  </div>
                  <span style={{ color: "#cbd5e1", fontSize: 13 }}>{step}</span>
                </div>
                {i < arr.length - 1 && <div style={{ width: 1, height: 14, background: "rgba(99,102,241,.2)", marginLeft: 10 }} />}
              </div>
            ))}
          </div>

          <button className="btn" onClick={startInvestigation}
            style={{ width: "100%", padding: 17, background: "linear-gradient(135deg,#6366f1,#4f46e5)", border: "none", borderRadius: 14, color: "#fff", fontWeight: 800, fontSize: 15, textAlign: "center", boxShadow: "0 8px 24px rgba(99,102,241,.3)" }}>
            Find out what's holding me back →
          </button>

          <div style={{ color: "#475569", fontSize: 11, textAlign: "center", marginTop: 12 }}>
            No forms. Start by telling us what's happening.
          </div>
        </div>
      )}

      {screen === "chat" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, zIndex: 1 }}>
          <div style={{ padding: "14px 16px", background: "rgba(6,8,20,.97)", borderBottom: "1px solid rgba(255,255,255,.05)", backdropFilter: "blur(24px)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>LifePath</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {messages.length > 0 && (
                  <button className="btn" onClick={() => setShowClearConfirm(true)}
                    style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 10, padding: "6px 12px", color: "#64748b", fontSize: 11 }}>
                    Clear chat
                  </button>
                )}
                <button className="btn" onClick={() => setScreen("home")}
                  style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 10, padding: "6px 12px", color: "#64748b", fontSize: 11 }}>
                  ‹ Back
                </button>
              </div>
            </div>
          </div>

          {showClearConfirm && (
            <div onClick={() => !clearing && setShowClearConfirm(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
              <div onClick={(e) => e.stopPropagation()} style={{ background: "#0d1020", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: 20, maxWidth: 320, width: "100%" }}>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Clear this conversation?</div>
                <div style={{ color: "#94a3b8", fontSize: 12.5, lineHeight: 1.6, marginBottom: 18 }}>
                  This resets your entire investigation — role, applications, everything LifePath has learned so far. This can't be undone.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn" onClick={() => setShowClearConfirm(false)} disabled={clearing}
                    style={{ flex: 1, padding: "10px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, color: "#94a3b8", fontSize: 12.5, fontFamily: "inherit" }}>
                    Cancel
                  </button>
                  <button className="btn" onClick={clearChat} disabled={clearing}
                    style={{ flex: 1, padding: "10px", background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 10, color: "#ef4444", fontWeight: 700, fontSize: 12.5, fontFamily: "inherit" }}>
                    {clearing ? "Clearing..." : "Clear chat"}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div style={{ flex: 1, overflowY: "auto", padding: "16px 13px", minHeight: 0 }}>
            {messages.length === 0 && (
              <div style={{ padding: "12px 16px", color: "#94a3b8", fontSize: 14, lineHeight: 1.7 }}>
                Tell me what's going on — for example, "I've applied to 100+ jobs and nobody is responding."
              </div>
            )}
            {messages.map((msg, i) => {
              if (msg.role === "user") return (
                <MessageBubbleUser
                  key={i}
                  content={msg.content}
                  disabled={loading || clearing}
                  onEdit={(newText) => handleEditMessage(i, newText)}
                />
              );
              if (msg.structured) {
                return (
                  <InvestigationCard
                    key={i}
                    data={msg.structured}
                    onInvestigateDeeper={() => sendMessage("Yes, let's investigate further.")}
                    onFeedback={(payload) => handleFeedback(i, payload)}
                    fbState={fbStates[i] || "idle"}
                    fbError={fbErrors[i]}
                  />
                );
              }
              if (msg.content) {
                return (
                  <div key={i} style={{ marginBottom: 16, padding: "14px 16px", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)", borderRadius: "4px 16px 16px 16px", color: "#94a3b8", fontSize: 13 }}>
                    {msg.content}
                  </div>
                );
              }
              return null;
            })}
            {loading && (
              <div style={{ padding: "12px 16px", display: "inline-flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: "#818cf8", fontSize: 9, letterSpacing: 2 }}>INVESTIGATING</span>
                {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "#818cf8", animation: `dot 1.3s ${i*.22}s infinite` }} />)}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div style={{ flexShrink: 0, padding: "10px 13px 20px", background: "rgba(6,8,20,.97)", borderTop: "1px solid rgba(255,255,255,.04)" }}>
            {extracting && (
              <div style={{ marginBottom: 9, padding: "7px 13px", background: "rgba(99,102,241,.07)", border: "1px solid rgba(99,102,241,.2)", borderRadius: 10, color: "#818cf8", fontSize: 11 }}>
                Reading your file...
              </div>
            )}
            {cvFile && !extracting && (
              <div style={{ marginBottom: 9, padding: "7px 13px", background: "rgba(99,102,241,.07)", border: "1px solid rgba(99,102,241,.2)", borderRadius: 10, color: "#818cf8", fontSize: 11, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>📎 {cvFile.name}</span>
                <button onClick={() => setCvFile(null)} style={{ background: "none", border: "none", color: "#ef4444", fontSize: 13, cursor: "pointer" }}>✕</button>
              </div>
            )}
            <div style={{ display: "flex", gap: 9, alignItems: "flex-end" }}>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.txt"
                onChange={handleFileUpload}
                style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}
              />
              <button className="btn" onClick={() => fileRef.current?.click()} disabled={extracting}
                style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0, background: "rgba(99,102,241,.08)", border: "1px solid rgba(99,102,241,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, opacity: extracting ? 0.5 : 1 }}>
                📎
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Type here..."
                rows={2}
                style={{ flex: 1, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: "11px 13px", color: "#e2e8f0", fontSize: 14, resize: "none", lineHeight: 1.5 }}
              />
              <button className="btn" onClick={() => sendMessage()} disabled={loading || (!input.trim() && !cvFile) || sendingRef.current}
                style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0, background: loading || (!input.trim() && !cvFile) ? "rgba(255,255,255,.04)" : "linear-gradient(135deg,#6366f1,#4f46e5)", border: "none", cursor: loading || (!input.trim() && !cvFile) ? "not-allowed" : "pointer", fontSize: 18 }}>
                {loading ? "⏳" : "↑"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

