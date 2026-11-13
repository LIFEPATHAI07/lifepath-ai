import { affiliateSection } from "../../lib/siteConfig";

export default function Terms() {
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 20px 60px", background: "#060b14", minHeight: "100vh", color: "#94a3b8", fontFamily: "sans-serif" }}>
      <div style={{ color: "#06b6d4", fontSize: 10, letterSpacing: 3, marginBottom: 16 }}>LIFEPATH AI</div>
      <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Terms of Service</h1>
      <div style={{ color: "#475569", fontSize: 11, marginBottom: 32 }}>Last updated: 12 November 2026</div>

      {[
        ["Acceptance", "By using LifePath AI you agree to these terms. If you do not agree, please do not use this service."],
        ["What LifePath AI is", "LifePath AI is an evidence-first tool for investigating your job search. You tell it what has happened (for example where you applied, what replies, interviews or feedback you got) and it helps you organise those facts, look at possible bottlenecks, and choose practical next actions. It can also read a CV or job post that you share. It is not a recruiter or employment agency, and it does not apply for jobs for you. It cannot browse the web or look up employers or vacancies."],
        ["The analysis can be wrong", "LifePath's analysis is produced by an AI model and works only from what you tell it. It can be incomplete or incorrect. The explanations it offers are possibilities to test, not confirmed reasons why an employer did or did not reply to you or select you."],
        ["No guarantees", "LifePath AI does not guarantee interviews, job offers, employment, salary outcomes or that any job is available."],
        ["Check things yourself", "You must independently verify employers, job vacancies, any fee you are asked to pay, contracts and offer letters, and any legal matter. Warning signs that LifePath points out are prompts to check further. They are not proof that an offer is genuine or fraudulent."],
        ["Not professional advice", "LifePath AI is not a substitute for qualified legal, financial or other professional advice where that applies to you. We are not a licensed financial advisor, career counselor, legal advisor, or employment agency."],
        ["Your information and AI providers", "What you type, and the text of any CV or job post you attach, is sent to third-party AI providers (Google Gemini, and Groq as a fallback) so they can produce replies. A summary of your case is also saved on our server so your investigation stays consistent. Our Privacy Policy (the page at /privacy) explains what is stored, how to delete it, and what we cannot control. Please read it."],
        ["Your responsibilities", "You are responsible for how you use the information provided. You must be 13 years or older to use this service. Do not input sensitive financial information like bank account numbers or passwords. Only share information you are comfortable having processed as described in the Privacy Policy."],
        ["Limitation of Liability", "LifePath AI and its creators are not liable for any decisions made based on AI-generated content. We are not responsible for the accuracy of information about employers, vacancies, fees or contracts that comes from third parties or from you. Use this service at your own discretion."],
        ...(affiliateSection() ? [affiliateSection()] : []),
        ["Changes", "We may update these terms at any time. The date at the top shows when they were last changed. Continued use of the service means you accept updated terms."],
        ["Contact", "For questions contact: lifepathaiapp@gmail.com"],
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
