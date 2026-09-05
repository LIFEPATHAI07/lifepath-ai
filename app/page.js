"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { db } from "../lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { getUserId } from "../lib/user";

const S = {
  get: (k, fb = null) => { try { const d = localStorage.getItem(k); return d ? JSON.parse(d) : fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const saveFeedback = async ({ rating, reason }) => {
  try {
    const colRef = collection(db, "feedback");
    const docData = {
      userId: getUserId(),
      pillar: "diagnosis",
      rating,
      reason: reason || "",
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

const MessageBubbleUser = ({ content }) => (
  <div style={{ marginBottom: 14, display: "flex", justifyContent: "flex-end", animation: "fadeUp .3s both" }}>
    <div style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)", borderRadius: "16px 16px 4px 16px", padding: "11px 15px", maxWidth: "82%", color: "#fff", fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
      {content?.length > 600 ? content.substring(0, 600) + "..." : content}
    </div>
  </div>
);

const InvestigationCard = ({ data, onInvestigateDeeper, onFeedback, fbState, fbError }) => {
  if (!data) return null;
  const { reply, insight, uncertainty, recommended_action, next_question, ready_to_investigate_deeper } = data;

  return (
    <div style={{ marginBottom: 16, animation: "fadeUp .3s both" }}>
      <div style={{ borderRadius: "4px 16px 16px 16px", overflow: "hidden", border: "1px solid rgba(99,102,241,.15)", background: "rgba(255,255,255,.02)" }}>

        {reply && (
          <div style={{ padding: "14px 16px", color: "#e2e8f0", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {reply}
          </div>
        )}

        {insight && (
          <div style={{ padding: "12px 16px", background: "rgba(99,102,241,.06)", borderTop: "1px solid rgba(255,255,255,.05)" }}>
            <div style={{ color: "#818cf8", fontSize: 9, fontWeight: 700, letterSpacing: 2, marginBottom: 5 }}>🔍 SIGNAL FOUND</div>
            <div style={{ color: "#c7d2fe", fontSize: 13, lineHeight: 1.6 }}>{insight}</div>
          </div>
        )}

        {uncertainty && (
          <div style={{ padding: "10px 16px", borderTop: "1px solid rgba(255,255,255,.04)" }}>
            <div style={{ color: "#64748b", fontSize: 11, lineHeight: 1.6, fontStyle: "italic" }}>⚠️ {uncertainty}</div>
          </div>
        )}

        {data.verified_stats && (
          <div style={{ padding: "12px 16px", background: "rgba(16,185,129,.04)", borderTop: "1px solid rgba(255,255,255,.04)" }}>
            <div style={{ color: "#10b981", fontSize: 9, fontWeight: 700, letterSpacing: 2, marginBottom: 6 }}>✅ VERIFIED FROM YOUR NUMBERS</div>
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
          </div>
        )}

        {recommended_action && (
          <div style={{ padding: "14px 16px", background: "rgba(245,158,11,.05)", borderTop: "1px solid rgba(255,255,255,.04)" }}>
            <div style={{ color: "#f59e0b", fontSize: 9, fontWeight: 700, letterSpacing: 2, marginBottom: 6 }}>🎯 SMALLEST NEXT STEP</div>
            <div style={{ color: "#fbbf24", fontSize: 13, lineHeight: 1.6, fontWeight: 600 }}>{recommended_action}</div>
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

        {onFeedback && fbState !== "saved" && (
          <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,.04)" }}>
            {fbState === "idle" && (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => onFeedback("positive")}
                  style={{ flex: 1, padding: "9px", background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.2)", borderRadius: 10, color: "#10b981", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  👍 Helpful
                </button>
                <button onClick={() => onFeedback("negative")}
                  style={{ flex: 1, padding: "9px", background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.15)", borderRadius: 10, color: "#ef4444", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  👎 Not helpful
                </button>
              </div>
            )}
            {fbState === "saving" && <div style={{ textAlign: "center", color: "#475569", fontSize: 11 }}>Saving...</div>}
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
  const [messages, setMessages] = useState(() => S.get("lp_chat_history", []));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [fbStates, setFbStates] = useState({});
  const [fbErrors, setFbErrors] = useState({});

  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
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
  useEffect(() => { if (messages.length > 0) S.set("lp_chat_history", messages); }, [messages]);

  const startInvestigation = () => {
    setScreen("chat");
  };

  const sendMessage = async (overrideText) => {
    const userMsg = (overrideText || input).trim();
    if (!userMsg || loading || sendingRef.current) return;
    sendingRef.current = true;

    const usage = getUsage();
    if (usage.count >= FREE_LIMIT) {
      sendingRef.current = false;
      alert("Daily limit reached. Come back tomorrow.");
      return;
    }

    setInput("");

    const MAX_HISTORY_MESSAGES = 12;
    const MAX_MESSAGE_CHARS = 1200;
    const truncate = (text) => {
      if (!text) return "";
      return text.length > MAX_MESSAGE_CHARS ? text.slice(0, MAX_MESSAGE_CHARS) + " ...[truncated]" : text;
    };

    const fullApiMessages = messages
      .filter(m => m.content || m.structured)
      .map(m => ({
        role: m.role,
        content: truncate(m.content) || (m.structured
          ? `[LifePath: ${truncate(m.structured.reply) || ""}]`
          : ""),
      }))
      .filter(m => m.content);

    const apiMessages = fullApiMessages.slice(-MAX_HISTORY_MESSAGES);
    apiMessages.push({ role: "user", content: truncate(userMsg) });

    const newMsgs = [...messages, { role: "user", content: userMsg }];
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

  const handleFeedback = async (msgIndex, rating) => {
    setFbStates(s => ({ ...s, [msgIndex]: "saving" }));
    const result = await saveFeedback({ rating });
    if (result.success) {
      setFbStates(s => ({ ...s, [msgIndex]: "saved" }));
    } else {
      setFbStates(s => ({ ...s, [msgIndex]: "error" }));
      setFbErrors(e => ({ ...e, [msgIndex]: result.error }));
    }
  };

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#060814;overscroll-behavior:none}
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
    <div style={{ minHeight: "100vh", background: "#060814", fontFamily: "'Syne','Segoe UI',sans-serif", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", position: "relative", overflowX: "hidden" }}>
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
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px", zIndex: 1 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", textAlign: "center", lineHeight: 1.4, marginBottom: 12 }}>
            Not getting responses<br />from your job applications?
          </div>
          <div style={{ fontSize: 15, color: "#818cf8", fontWeight: 700, marginBottom: 28 }}>
            Let's find out why.
          </div>
          <div style={{ color: "#64748b", fontSize: 13, textAlign: "center", lineHeight: 1.7, marginBottom: 36 }}>
            Tell LifePath what's happening with your job search.<br />No forms. Just explain it in your own words.
          </div>
          <button className="btn" onClick={startInvestigation}
            style={{ width: "100%", padding: 16, background: "linear-gradient(135deg,#6366f1,#4f46e5)", border: "none", borderRadius: 14, color: "#fff", fontWeight: 800, fontSize: 15, boxShadow: "0 8px 24px rgba(99,102,241,.25)" }}>
            Tell me what's happening →
          </button>
        </div>
      )}

      {screen === "chat" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", zIndex: 1 }}>
          <div style={{ padding: "14px 16px", background: "rgba(6,8,20,.97)", borderBottom: "1px solid rgba(255,255,255,.05)", backdropFilter: "blur(24px)", position: "sticky", top: 0, zIndex: 10 }}>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>LifePath</div>
            <div style={{ color: "#475569", fontSize: 10, letterSpacing: 1 }}>JOB SEARCH INVESTIGATION</div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "16px 13px" }}>
            {messages.length === 0 && (
              <div style={{ padding: "12px 16px", color: "#94a3b8", fontSize: 14, lineHeight: 1.7 }}>
                Tell me what's going on — for example, "I've applied to 100+ jobs and nobody is responding."
              </div>
            )}
            {messages.map((msg, i) => {
              if (msg.role === "user") return <MessageBubbleUser key={i} content={msg.content} />;
              if (msg.structured) {
                return (
                  <InvestigationCard
                    key={i}
                    data={msg.structured}
                    onInvestigateDeeper={() => sendMessage("Yes, let's investigate further.")}
                    onFeedback={(rating) => handleFeedback(i, rating)}
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

          <div style={{ padding: "10px 13px 24px", background: "rgba(6,8,20,.97)", borderTop: "1px solid rgba(255,255,255,.04)" }}>
            <div style={{ display: "flex", gap: 9, alignItems: "flex-end" }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Type here..."
                rows={2}
                style={{ flex: 1, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, padding: "11px 13px", color: "#e2e8f0", fontSize: 14, resize: "none", lineHeight: 1.5 }}
              />
              <button className="btn" onClick={() => sendMessage()} disabled={loading || !input.trim() || sendingRef.current}
                style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0, background: loading || !input.trim() ? "rgba(255,255,255,.04)" : "linear-gradient(135deg,#6366f1,#4f46e5)", border: "none", cursor: loading || !input.trim() ? "not-allowed" : "pointer", fontSize: 18 }}>
                {loading ? "⏳" : "↑"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
          }
