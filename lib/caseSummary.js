// lib/caseSummary.js
// A plain list of what LifePath actually has on file for the case, shown next
// to the "start the investigation" button so the user can see exactly what
// the app believes and correct anything that is wrong.

const hasText = (v) => (typeof v === "string" && v.trim()) || (typeof v === "number" && Number.isFinite(v));

export function summarizeCaseFacts(state) {
  if (!state) return [];
  const out = [];
  const settledNoAnswer = (topic) => {
    const e = state.ledger?.[topic];
    return (e?.status === "declined" || e?.status === "unavailable") && e?.verified === true;
  };
  const line = (label, value, topic) => {
    if (hasText(value)) out.push({ label, value: String(value).trim().slice(0, 80) });
    else if (topic && settledNoAnswer(topic)) out.push({ label, value: "you chose not to say" });
  };
  line("Role", state.roleTarget, "role");
  line("Location", state.location, "location");
  line("Experience", state.experienceLevel, "experience");

  const outcome = [];
  if (state.responses != null) outcome.push(`${state.responses} responses`);
  if (state.viewedCount != null) outcome.push(`${state.viewedCount} marked viewed`);
  if (state.interviews != null) outcome.push(`${state.interviews} interviews`);
  if (state.applicationsTotal != null) outcome.unshift(`${state.applicationsTotal} applications`);
  if (outcome.length) out.push({ label: "So far", value: outcome.join(", ") });
  else if (settledNoAnswer("outcomes")) out.push({ label: "So far", value: "you chose not to say" });
  return out;
}
