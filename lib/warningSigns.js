// lib/warningSigns.js
//
// The seven job-offer warning signs LifePath can point out. Nothing else.
//
//   1. a fee or deposit is requested
//   2. OTP, password, bank or ID details are requested
//   3. an app to install or a suspicious link is requested
//   4. the recruiter's identity can't be verified
//   5. the address doesn't match the company details
//   6. the job advertisement may be copied
//   7. the interview invitation may not be genuine
//
// How it works (pure logic, no network, no database):
//   - The model may report a sign only with a verbatim quote of the USER'S OWN
//     words; the server keeps a sign only if that quote really appears in the
//     user's recent messages.
//   - Wording is neutral: "warning signs identified" and "could not verify".
//     There is no risk score, no fraud/scam/ghost-job verdict, and no claim
//     that anything was checked. LifePath cannot browse, call employers or
//     look anything up.

import { verifyQuote } from "./caseLedger";

// id -> plain-English description shown on the card
export const WARNING_SIGNS = {
  fee_requested: "a fee or deposit was requested",
  sensitive_info_requested: "OTP, password, bank or ID details were requested",
  suspicious_link_or_app: "asked to open a suspicious link or install an app",
  unverifiable_recruiter: "the recruiter's identity could not be verified",
  address_mismatch: "the address doesn't match the company details",
  copied_ad_suspected: "the job advertisement may be copied",
  interview_invitation_doubtful: "the interview invitation may not be genuine",
};

export const WARNING_CARD_TITLE = "Warning signs identified";

// Shown on every warning-signs card.
export const VERIFICATION_NOTE = "LifePath can't look up companies, recruiters or websites, so none of this has been independently verified. It is based only on what you told me, and warning signs are not proof either way.";

// Keep only signs backed by a verbatim quote of the user's own words.
export function verifyWarningSigns(list, userTexts) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(list) ? list : []) {
    if (!item || typeof item.id !== "string" || !(item.id in WARNING_SIGNS) || seen.has(item.id)) continue;
    if (!verifyQuote(item.quote, userTexts)) continue;
    seen.add(item.id);
    out.push(item.id);
  }
  return out;
}
