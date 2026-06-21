"use client";
import { useEffect, useState } from "react";
import { db } from "../../../lib/firebase";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { useRouter } from "next/navigation";

const FIELDS = [
  { key: "whyTried", label: "Why Tried" },
  { key: "expected", label: "Expected" },
  { key: "useful", label: "Most Useful" },
  { key: "disappointed", label: "Disappointed" },
  { key: "returnTomorrow", label: "Return Tomorrow" },
  { key: "payFor", label: "Pay For" },
];

export default function AdminInterviews() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      try {
        const q = query(collection(db, "interviews"), orderBy("timestamp", "desc"));
        const snap = await getDocs(q);
        setData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, []);

  const filtered = data.filter(d =>
    !search ||
    Object.values(d).some(v => typeof v === "string" && v.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{ minHeight: "100vh", background: "#060b14", fontFamily: "system-ui, sans-serif", padding: "24px 16px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 22 }}>💬 User Interviews</div>
            <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>{data.length} total responses</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => router.push("/admin/feedback")}
              style={{ padding: "8px 16px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, color: "#94a3b8", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              📊 Feedback
            </button>
            <button onClick={() => { document.cookie = "lp_admin=; max-age=0"; router.push("/admin/login"); }}
              style={{ padding: "8px 16px", background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 10, color: "#ef4444", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              Logout
            </button>
          </div>
        </div>

        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search all responses..."
          style={{ width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "11px 16px", color: "#e2e8f0", fontSize: 13, outline: "none", marginBottom: 16, boxSizing: "border-box", fontFamily: "inherit" }} />

        {loading ? (
          <div style={{ color: "#64748b", textAlign: "center", padding: 60 }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: "#64748b", textAlign: "center", padding: 60 }}>No interviews yet</div>
        ) : (
          filtered.map((row, i) => (
            <div key={i} style={{ background: "#0a1020", border: "1px solid rgba(255,255,255,.07)", borderRadius: 16, marginBottom: 12, overflow: "hidden" }}>
              <div onClick={() => setExpanded(expanded === i ? null : i)}
                style={{ padding: "14px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <span style={{ background: "rgba(6,182,212,.1)", color: "#06b6d4", padding: "2px 8px", borderRadius: 6, fontSize: 11, marginRight: 8 }}>
                    {row.pillar || "unknown"}
                  </span>
                  <span style={{ color: "#475569", fontSize: 11, fontFamily: "monospace" }}>
                    {row.userId?.slice(0, 12)}...
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: "#475569", fontSize: 11 }}>
                    {row.timestamp?.toDate ? row.timestamp.toDate().toLocaleDateString("en-IN") : "—"}
                  </span>
                  <span style={{ color: "#64748b", fontSize: 14 }}>{expanded === i ? "▲" : "▼"}</span>
                </div>
              </div>

              {expanded === i && (
                <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,.04)" }}>
                  {FIELDS.map((f, fi) => row[f.key] && (
                    <div key={fi} style={{ marginTop: 12 }}>
                      <div style={{ color: "#475569", fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>{f.label.toUpperCase()}</div>
                      <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.6, background: "rgba(255,255,255,.02)", borderRadius: 8, padding: "10px 12px" }}>
                        {row[f.key]}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
