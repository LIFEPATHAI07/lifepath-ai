"use client";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { useRouter } from "next/navigation";

export default function AdminFeedback() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      try {
        const q = query(collection(db, "feedback"), orderBy("timestamp", "desc"));
        const snap = await getDocs(q);
        setData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    load();
  }, []);

  const total = data.length;
  const yes = data.filter(d => d.rating === "yes").length;
  const no = data.filter(d => d.rating === "no").length;

  const reasonCount = data.reduce((acc, d) => {
    if (d.reason) acc[d.reason] = (acc[d.reason] || 0) + 1;
    return acc;
  }, {});

  const topPraise = data.filter(d => d.rating === "yes").reduce((acc, d) => {
    if (d.reason) acc[d.reason] = (acc[d.reason] || 0) + 1;
    return acc;
  }, {});
  const topComplaint = data.filter(d => d.rating === "no").reduce((acc, d) => {
    if (d.reason) acc[d.reason] = (acc[d.reason] || 0) + 1;
    return acc;
  }, {});
  const bestPraise = Object.entries(topPraise).sort((a, b) => b[1] - a[1])[0];
  const worstComplaint = Object.entries(topComplaint).sort((a, b) => b[1] - a[1])[0];

  const filtered = data.filter(d =>
    !search || d.pillar?.includes(search) || d.reason?.toLowerCase().includes(search.toLowerCase()) || d.rating?.includes(search)
  );

  const S = { th: { padding: "10px 12px", color: "#64748b", fontSize: 11, fontWeight: 700, textAlign: "left", borderBottom: "1px solid rgba(255,255,255,.06)", whiteSpace: "nowrap" }, td: { padding: "10px 12px", color: "#94a3b8", fontSize: 12, borderBottom: "1px solid rgba(255,255,255,.04)" } };

  return (
    <div style={{ minHeight: "100vh", background: "#060b14", fontFamily: "system-ui, sans-serif", padding: "24px 16px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 22 }}>📊 Feedback Dashboard</div>
            <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>LifePath AI · Admin</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => router.push("/admin/interviews")}
              style={{ padding: "8px 16px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, color: "#94a3b8", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              💬 Interviews
            </button>
            <button onClick={() => { document.cookie = "lp_admin=; max-age=0"; router.push("/admin/login"); }}
              style={{ padding: "8px 16px", background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 10, color: "#ef4444", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              Logout
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ color: "#64748b", textAlign: "center", padding: 60 }}>Loading...</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
              {[
                { label: "Total Feedback", value: total, color: "#06b6d4" },
                { label: "👍 Helpful", value: yes, color: "#10b981" },
                { label: "👎 Not Helpful", value: no, color: "#ef4444" },
                { label: "% Positive", value: total > 0 ? `${Math.round((yes/total)*100)}%` : "—", color: "#f59e0b" },
              ].map((s, i) => (
                <div key={i} style={{ background: "#0a1020", border: "1px solid rgba(255,255,255,.07)", borderRadius: 16, padding: "16px" }}>
                  <div style={{ color: s.color, fontSize: 26, fontWeight: 900 }}>{s.value}</div>
                  <div style={{ color: "#64748b", fontSize: 11, marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
              <div style={{ background: "#0a1020", border: "1px solid rgba(16,185,129,.15)", borderRadius: 14, padding: "14px 16px" }}>
                <div style={{ color: "#10b981", fontSize: 10, fontWeight: 700, marginBottom: 6 }}>✅ TOP PRAISE</div>
                <div style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600 }}>{bestPraise ? bestPraise[0] : "—"}</div>
                {bestPraise && <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>{bestPraise[1]} times</div>}
              </div>
              <div style={{ background: "#0a1020", border: "1px solid rgba(239,68,68,.15)", borderRadius: 14, padding: "14px 16px" }}>
                <div style={{ color: "#ef4444", fontSize: 10, fontWeight: 700, marginBottom: 6 }}>⚠️ TOP COMPLAINT</div>
                <div style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600 }}>{worstComplaint ? worstComplaint[0] : "—"}</div>
                {worstComplaint && <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>{worstComplaint[1]} times</div>}
              </div>
            </div>

            {Object.keys(reasonCount).length > 0 && (
              <div style={{ background: "#0a1020", border: "1px solid rgba(255,255,255,.07)", borderRadius: 16, padding: "16px", marginBottom: 24 }}>
                <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, marginBottom: 12 }}>REASON BREAKDOWN</div>
                {Object.entries(reasonCount).sort((a, b) => b[1] - a[1]).map(([reason, count], i) => (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ color: "#94a3b8", fontSize: 12 }}>{reason}</span>
                      <span style={{ color: "#64748b", fontSize: 12 }}>{count}</span>
                    </div>
                    <div style={{ background: "rgba(255,255,255,.06)", borderRadius: 100, height: 4 }}>
                      <div style={{ height: 4, borderRadius: 100, width: `${(count / total) * 100}%`, background: "#06b6d4" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by pillar, rating, reason..."
              style={{ width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "11px 16px", color: "#e2e8f0", fontSize: 13, outline: "none", marginBottom: 16, boxSizing: "border-box", fontFamily: "inherit" }} />

            <div style={{ background: "#0a1020", border: "1px solid rgba(255,255,255,.07)", borderRadius: 16, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,.02)" }}>
                      {["Rating", "Reason", "Pillar", "User ID", "Time"].map(h => (
                        <th key={h} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={5} style={{ ...S.td, textAlign: "center", padding: 40 }}>No feedback yet</td></tr>
                    ) : filtered.map((row, i) => (
                      <tr key={i}>
                        <td style={S.td}>
                          <span style={{ color: row.rating === "yes" ? "#10b981" : "#ef4444", fontWeight: 700 }}>
                            {row.rating === "yes" ? "👍 Yes" : "👎 No"}
                          </span>
                        </td>
                        <td style={S.td}>{row.reason || "—"}</td>
                        <td style={S.td}>
                          <span style={{ background: "rgba(6,182,212,.1)", color: "#06b6d4", padding: "2px 8px", borderRadius: 6, fontSize: 11 }}>
                            {row.pillar || "—"}
                          </span>
                        </td>
                        <td style={{ ...S.td, fontSize: 10, color: "#475569", fontFamily: "monospace" }}>
                          {row.userId?.slice(0, 16) || "—"}
                        </td>
                        <td style={{ ...S.td, fontSize: 11, whiteSpace: "nowrap" }}>
                          {row.timestamp?.toDate ? row.timestamp.toDate().toLocaleDateString("en-IN") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={{ color: "#334155", fontSize: 11, textAlign: "right", marginTop: 8 }}>
              Showing {filtered.length} of {total} entries
            </div>
          </>
        )}
      </div>
    </div>
  );
}
