"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (email === process.env.NEXT_PUBLIC_ADMIN_EMAIL && password === process.env.NEXT_PUBLIC_ADMIN_PASSWORD) {
      document.cookie = `lp_admin=${email}; path=/; max-age=86400`;
      router.push("/admin/feedback");
    } else {
      setError("Invalid credentials");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#060b14", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#0a1020", borderRadius: 20, padding: "32px 24px", border: "1px solid rgba(255,255,255,.07)" }}>
        <div style={{ fontSize: 32, textAlign: "center", marginBottom: 8 }}>🛡️</div>
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 20, textAlign: "center", marginBottom: 4 }}>Admin Access</div>
        <div style={{ color: "#64748b", fontSize: 12, textAlign: "center", marginBottom: 28 }}>LifePath AI Dashboard</div>
        <form onSubmit={handleLogin}>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Admin email"
            style={{ width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "13px 16px", color: "#e2e8f0", fontSize: 14, outline: "none", marginBottom: 12, boxSizing: "border-box", fontFamily: "inherit" }} />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password"
            style={{ width: "100%", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "13px 16px", color: "#e2e8f0", fontSize: 14, outline: "none", marginBottom: 16, boxSizing: "border-box", fontFamily: "inherit" }} />
          {error && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 12, textAlign: "center" }}>{error}</div>}
          <button type="submit" style={{ width: "100%", padding: "14px", background: "linear-gradient(135deg,#06b6d4,#0891b2)", border: "none", borderRadius: 12, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
            Login →
          </button>
        </form>
      </div>
    </div>
  );
                                                      }
