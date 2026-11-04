// lib/evidenceGate.js
// Pure rules for how far a hypothesis may be trusted. The model's claimed
// status/confidence is only a proposal; these functions can only downgrade it.

export const STATUS_RANK = { untested: 0, investigating: 1, weak: 1, plausible: 2, supported: 3, confirmed: 4 };
export const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 };
const STATUS_ORDER = ["untested", "investigating", "plausible", "supported", "confirmed"];
const CONFIDENCE_ORDER = ["low", "medium", "high"];

export function capStatus(status, maxRank) {
  if ((STATUS_RANK[status] ?? 0) <= maxRank) return status;
  for (let i = STATUS_ORDER.length - 1; i >= 0; i--) {
    if ((STATUS_RANK[STATUS_ORDER[i]] ?? 0) <= maxRank) return STATUS_ORDER[i];
  }
  return "untested";
}
export function capConfidence(confidence, maxRank) {
  if ((CONFIDENCE_RANK[confidence] ?? 0) <= maxRank) return confidence;
  for (let i = CONFIDENCE_ORDER.length - 1; i >= 0; i--) {
    if ((CONFIDENCE_RANK[CONFIDENCE_ORDER[i]] ?? 0) <= maxRank) return CONFIDENCE_ORDER[i];
  }
  return "low";
}

export function enforceHypothesisEvidenceLadder(h) {
  const hasSupport = !!h.supportingEvidence;
  const hasMissing = !!h.missingEvidence;
  const hasContradiction = !!h.contradictingEvidence;

  let maxStatusRank;
  let maxConfidenceRank;

  if (!hasSupport) {
    // No claim-specific supporting evidence at all → can't be more than
    // "investigating", confidence must stay "low".
    maxStatusRank = STATUS_RANK.investigating;
    maxConfidenceRank = CONFIDENCE_RANK.low;
  } else if (hasMissing) {
    // Support exists, but the model itself flags evidence still missing —
    // "worth investigating" is not "medium confidence".
    maxStatusRank = STATUS_RANK.plausible;
    maxConfidenceRank = CONFIDENCE_RANK.low;
  } else if (hasContradiction) {
    // Nothing flagged missing, but there's a live, unresolved contradiction
    // — can be taken seriously, but not confirmed.
    maxStatusRank = STATUS_RANK.plausible;
    maxConfidenceRank = CONFIDENCE_RANK.medium;
  } else {
    // Support present, nothing missing, no live contradiction. An empty
    // "missing" field is the model's own say-so, so it can reach "supported"
    // at most, and never "high" confidence, on its own claim.
    maxStatusRank = STATUS_RANK.supported;
    maxConfidenceRank = CONFIDENCE_RANK.medium;
  }

  return {
    ...h,
    status: capStatus(h.status, maxStatusRank),
    confidence: capConfidence(h.confidence, maxConfidenceRank),
  };
}

// A hypothesis can move up at most ONE step per turn, and a brand-new one
// starts at "investigating". In the UNDERSTAND phase nothing goes above
// "investigating". So a diagnosis can never be earned in the same turn the
// idea first appears: the user's later answers have to keep supporting it.
export function limitPromotion(hypotheses, previous, phase) {
  const prev = new Map((Array.isArray(previous) ? previous : []).map((h) => [h.id, h]));
  return (hypotheses || []).map((h) => {
    const before = prev.get(h.id);
    let maxStatus = before ? Math.min((STATUS_RANK[before.status] ?? 0) + 1, STATUS_RANK.confirmed) : STATUS_RANK.investigating;
    let maxConf = before ? Math.min((CONFIDENCE_RANK[before.confidence] ?? 0) + 1, CONFIDENCE_RANK.high) : CONFIDENCE_RANK.low;
    if (phase !== "investigate") { maxStatus = Math.min(maxStatus, STATUS_RANK.investigating); maxConf = CONFIDENCE_RANK.low; }
    return { ...h, status: capStatus(h.status, maxStatus), confidence: capConfidence(h.confidence, maxConf) };
  });
}

