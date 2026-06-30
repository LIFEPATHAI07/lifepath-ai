"use client";
import { useEffect, useState } from "react";
import { db } from "../../../lib/firebase";
import { collection, getDocs, query, orderBy } from "firebase/firestore";

export default function AdminFeedbackPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pillarFilter, setPillarFilter] = useState("all");
  const [ratingFilter, setRatingFilter] = useState("all");

  useEffect(() => {
    const load = async () => {
      try {
        const q = query(collection(db, "feedback"), orderBy("timestamp", "desc"));
        const snap = await getDocs(q);
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setData(rows);
      } catch (e) {
        console.error("Admin load error:", e);
        setError(e.message || "Failed to load feedback");
      }
      setLoading(false);
    };
    load();
  }, []);

  const filtered = data.filter(d => {
    if (pillarFilter !== "all" && d.pillar !== pillarFilter) return false;
    if (ratingFilter !== "all" && d.rating !== ratingFilter) return false;
    return true;
  });

  const total = data.length;
  const positiveCount = data.filter(d => d.rating === "positive").length;
  const negativeCount = data.filter(d => d.rating === "negative").length;

  const pillars = [...new Set(data.map(d => d.pillar).filter(Boolean))];

  const formatDate = (ts) => {
    if (!ts) return "—";
    try {
      const date = ts.toDate ? ts.toDate() : new Date(ts);
      return date.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch {
      return "—";
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#060b14", fontFamily: "'Syne','Segoe UI',sans-serif", padding: "24px 16px", color: "#e2e8f0" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#fff" }}>📊 Feedback Dashboard</div>
          <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>LifePath AI · Admin View</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
          <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: "16px" }}>
            <div style={{ color: "#64748b", fontSize: 11, fontWeight: 600, marginBottom: 6 }}>TOTAL FEEDBACK</div>
            <div style={{ color: "#fff", fontSize: 28, fontWeight: 900 }}>{total}</div>
          </div>
          <div style={{ background: "rgba(16,185,129,.05)", border: "1px solid rgba(16,185,129,.2)", borderRadius: 14, padding: "16px" }}>
            <div style={{ color: "#10b981", fontSize: 11, fontWeight: 600, marginBottom: 6 }}>👍 HELPFUL</div>
            <div style={{ color: "#10b981", fontSize: 28, fontWeight: 900 }}>{positiveCount}</div>
          </div>
          <div style={{ background: "rgba(239,68,68,.05)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 14, padding: "16px" }}>
            <div style={{ color: "#ef4444", fontSize: 11, fontWeight: 600, marginBottom: 6 }}>👎 NOT HELPFUL</div>
            <div style={{ color: "#ef4444", fontSize: 28, fontWeight: 900 }}>{negativeCount}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          <select value={pillarFilter} onChange={e => setPillarFilter(e.target.value)}
            style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, padding: "9px 14px", color: "#e2e8f0", fontSize: 13, fontFamily: "inherit" }}>
            <option value="all">All Pillars</option>
            {pillars.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select value={ratingFilter} onChange={e => setRatingFilter(e.target.value)}
            style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, padding: "9px 14px", color: "#e2e8f0", fontSize: 13, fontFamily: "inherit" }}>
            <option value="all">All Ratings</option>
            <option value="positive">👍 Positive</option>
            <option value="negative">👎 Negative</option>
          </select>

          <div style={{ color: "#475569", fontSize: 12, alignSelf: "center", marginLeft: "auto" }}>
            Showing {filtered.length} of {total}
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>Loading feedback...</div>
        )}

        {error && (
          <div style={{ padding: 16, background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 12, color: "#ef4444", fontSize: 13 }}>
            Error: {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "#475569" }}>No feedback found.</div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,.03)", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
                    <th style={{ padding: "12px 14px", textAlign: "left", color: "#94a3b8", fontWeight: 600 }}>Date</th>
                    <th style={{ padding: "12px 14px", textAlign: "left", color: "#94a3b8", fontWeight: 600 }}>Pillar</th>
                    <th style={{ padding: "12px 14px", textAlign: "left", color: "#94a3b8", fontWeight: 600 }}>Rating</th>
                    <th style={{ padding: "12px 14px", textAlign: "left", color: "#94a3b8", fontWeight: 600 }}>Reason</th>
                    <th style={{ padding: "12px 14px", textAlign: "left", color: "#94a3b8", fontWeight: 600 }}>User ID</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => (
                    <tr key={row.id} style={{ borderBottom: "1px solid rgba(255,255,255,.04)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,.01)" }}>
                      <td style={{ padding: "11px 14px", color: "#94a3b8", whiteSpace: "nowrap" }}>{formatDate(row.timestamp)}</td>
                      <td style={{ padding: "11px 14px" }}>
                        <span style={{ background: "rgba(99,102,241,.1)", color: "#818cf8", padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                          {row.pillar || "—"}
                        </span>
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        {row.rating === "positive" ? (
                          <span style={{ color: "#10b981", fontWeight: 700 }}>👍 Positive</span>
                        ) : (
                          <span style={{ color: "#ef4444", fontWeight: 700 }}>👎 Negative</span>
                        )}
                      </td>
                      <td style={{ padding: "11px 14px", color: "#94a3b8" }}>{row.reason || "—"}</td>
                      <td style={{ padding: "11px 14px", color: "#475569", fontSize: 10, fontFamily: "monospace" }}>{row.userId || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
  }
