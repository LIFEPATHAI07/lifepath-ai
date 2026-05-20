export default function Privacy() {
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 20px 60px", background: "#060b14", minHeight: "100vh", color: "#94a3b8", fontFamily: "sans-serif" }}>
      <div style={{ color: "#06b6d4", fontSize: 10, letterSpacing: 3, marginBottom: 16 }}>LIFEPATH AI</div>
      <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Privacy Policy</h1>
      <div style={{ color: "#475569", fontSize: 11, marginBottom: 32 }}>Last updated: May 2025</div>

      {[
        ["What We Collect", "We collect information you voluntarily provide including name, education, experience, salary, location, and career goals. This data is stored locally on your device using browser localStorage. We do not collect or store this information on our servers."],
        ["How We Use Your Data", "Your profile data is used solely to personalize AI responses within the app. Your conversations are processed by Google Gemini AI and Groq AI APIs to generate responses. We do not sell your personal data to third parties."],
        ["Third Party Services", "We use Google Gemini API and Groq API to process your queries. These services have their own privacy policies. We use Google AdSense for advertising. We include affiliate links to third-party websites including Udemy, Naukri, Groww, Zerodha, and others. We earn a commission when you purchase through these links."],
        ["AI Disclaimer", "LifePath AI provides general guidance only — not professional financial, legal, or career advice. All information is for educational purposes. Always verify information and consult qualified professionals before making major decisions. We are not responsible for decisions made based on AI-generated content."],
        ["Data Security", "Your data is stored locally on your device. We do not have access to your personal profile information. Conversation data sent to AI APIs is not permanently stored by us."],
        ["Your Rights", "You can delete all your data by clearing your browser storage or using the Clear button in the app. You can update your profile at any time."],
        ["Contact", "For privacy concerns contact us at: lifepathaiapp@gmail.com"],
      ].map(([title, text], i) => (
        <div key={i} style={{ marginBottom: 24 }}>
          <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{title}</div>
          <div style={{ fontSize: 13, lineHeight: 1.7 }}>{text}</div>
        </div>
      ))}

      <a href="/" style={{ display: "block", textAlign: "center", padding: "12px", background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.3)", borderRadius: 12, color: "#06b6d4", textDecoration: "none", fontSize: 13, fontWeight: 600, marginTop: 20 }}>← Back to LifePath AI</a>
    </div>
  );
}
