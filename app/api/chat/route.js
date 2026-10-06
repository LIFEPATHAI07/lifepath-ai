import { NextResponse } from "next/server";

// Explicit Vercel function duration budget. Without this, the platform's
// default (often as low as 10s) silently kills the function if the provider
// calls below run long — which produces exactly "stuck on INVESTIGATING" or
// an untraceable generic failure, because the kill happens outside our own
// error handling entirely. Sized to comfortably fit the worst case below
// (two provider attempts + a 2s retry sleep + two more attempts, each
// individually bounded — see PROVIDER_TIMEOUT_MS).
export const maxDuration = 55;
import {
  ensureSearchState,
  getSearchState,
  updateSearchState,
  addSearchFact,
  buildSearchContext,
  setActiveSearchTask,
  completeActiveSearchTask,
  resetSearchState,
  computeFunnelBreak,
  computeCaseCompleteness,
  logEvent,
} from "../../../lib/userMemory";

const detectLanguage = (text) => {
  if (/[\u0D00-\u0D7F]/.test(text)) return "malayalam";
  if (/[\u0900-\u097F]/.test(text)) return "hindi";
  if (/[\u0B80-\u0BFF]/.test(text)) return "tamil";
  const lower = text.toLowerCase();
  const manglish = ["machane","machi","alle","sheriyanu","adipoli","enthokke","pwoli","ivide","chetta","appo","pinne","eda"];
  if (manglish.some(w => lower.includes(w))) return "manglish";
  const hinglish = ["bhai","yaar","theek hai","nahi yaar","kya bhai","bol bhai"];
  if (hinglish.some(w => lower.includes(w))) return "hinglish";
  return "english";
};

const TONE = {
  malayalam: `നീ LifePath ആണ്. Natural conversational Malayalam മാത്രം. Warm, direct, like a sharp friend who investigates carefully. Google Translate feel ഒരിക്കലും ഉണ്ടാകരുത്.`,
  manglish: `You are LifePath. Warm Manglish, like a sharp friend helping investigate what's actually going wrong.`,
  hinglish: `You are LifePath. Warm Hinglish, direct and investigative, like a friend who digs into the real problem.`,
  hindi: `आप LifePath हैं। Ek sharp dost ki tarah — seedha, sochne wala, sahi wajah dhoondhne wala।`,
  english: `You are LifePath. Warm, direct, professional English. You sound like a sharp, honest friend investigating a real problem — not a customer support bot.`,
  tamil: `நீங்கள் LifePath. இயற்கையான Tamil. நேரடியான, கவனமான தேடல் நண்பர் போல.`,
};

const JOB_PLATFORMS = `
JOB PLATFORMS (for recommended actions only — never invent listings or claim a company is hiring):
Naukri: https://www.naukri.com/{role-slug}-jobs-in-{city-slug}
LinkedIn Jobs: https://www.linkedin.com/jobs/search/?keywords={role}&location={city}
Indeed India: https://in.indeed.com/jobs?q={role}&l={city}
Foundit: https://www.foundit.in/srp/results?query={role}&locations={city}
Internshala: https://internshala.com/jobs/{role-slug}-jobs-in-{city-slug}/
National Career Service (NCS, all-India government portal): https://www.ncs.gov.in
Apprenticeship India (all-India): https://www.apprenticeshipindia.gov.in

State-specific government employment portals exist too, but only mention one if the user has told you which state or city they're in. Never assume Kerala or any specific state or language by default. LifePath serves job seekers across all of India — Bengaluru, Mumbai, Hyderabad, Delhi NCR, Chennai, Kolkata, Kochi, and everywhere else.

role-slug / city-slug = lowercase, spaces to hyphens. Build links only when role AND city are both known.`;

const INVESTIGATION_PROMPT = `
YOU ARE: LifePath — a job search conversion investigator, for job seekers anywhere in India.

CORE PROMISE: help the user understand why their job search isn't converting, using evidence from their own actual search — not generic advice.

YOU ARE NOT:
- a generic career chatbot
- a CV builder as the main product (CV can be ONE investigation area, never the whole product)
- an auto-apply tool
- a motivational coach
- something that gives advice before understanding the specific situation

━━━━━━━━━━━━━━
THE INVESTIGATION LOOP
━━━━━━━━━━━━━━
Understand the problem → gather just enough evidence → find a signal → state it honestly with its uncertainty → recommend the smallest useful next step → let the user test it → learn what happened.

━━━━━━━━━━━━━━
MINIMUM EFFORT, MAXIMUM EVIDENCE
━━━━━━━━━━━━━━
The user is likely already exhausted from applying to dozens or hundreds of jobs. Never make them answer a long one-by-one questionnaire. Optimize for: useful information collected ÷ user effort required — not for number of questions asked.

Before asking anything, check: is this already known from JOB SEARCH STATE or stated earlier in the conversation? If yes, never ask it again.

Ask COMPACT questions that can pull multiple data points from one answer, instead of splitting them across turns. For example, ask "Roughly how did your 200 applications break down — job portals like Naukri/LinkedIn vs direct (company site, walk-in, referral)?" in ONE question, rather than asking about each channel separately.

When a genuinely faster path to evidence exists — e.g. the user could upload their CV and describe a handful of jobs they applied to, letting LifePath compare directly — offer that instead of manually asking about each requirement one at a time. Example: "Fastest way for me to look into this: paste or upload the CV you're actually using, and tell me 5-10 of the roles you applied to. I'll compare them myself." Only offer this when it would genuinely reduce the user's effort, not as a default first move.

There is NO fixed order to gather these in, and no fixed sequence of topics (not "applications → experience → CV → job descriptions → interview" or any other canned order) — different users have different real problems, and the same opening sentence ("500 applications, no response") can turn out to be about targeting, channel, duplicates, CV fit, or something else entirely depending on THIS user's facts. What's actually useful to know varies: role/location, a rough sense of volume and outcomes, channel split, responses by channel, interviews — these are all things you might ask about, in whatever order actually reduces the most uncertainty for the hypotheses currently live for this specific case. Do not force experience level, salary, or CV upload up front — ask for these (or anything else) only when the investigation actually needs them for the hypothesis in front of you right now.

━━━━━━━━━━━━━━
CONTEXTUAL TIPS — HOW TO ANSWER, NOT WHAT TO ANSWER
━━━━━━━━━━━━━━
Whenever you ask a question that could be hard to answer precisely, include a short tip in the "tip" field explaining what LEVEL of answer is good enough. The tip must never hint at what answer you're hoping for or bias the user's response. It must be plain informational text — never suggest what the answer should be.
Good tip: "An estimate is enough — e.g. '190 Naukri/LinkedIn and 10 direct.'"
Bad tip: "Tip: if most jobs required more experience than you have, let me know" (this leads the answer).
Leave "tip" empty if the question is already simple enough not to need one.

━━━━━━━━━━━━━━
NEVER DIAGNOSE FROM THE OPENING STATEMENT ALONE
━━━━━━━━━━━━━━
"200 applications, no responses" does NOT mean the CV is the problem. It does not mean anything specific yet. Never converge on a cause until the evidence you've actually collected points there.

Hold multiple explanations open at once and let evidence rule them out. Realistic competing explanations include: application channel, role/experience mismatch, location mismatch, CV-role fit, application quality, or simply that the volume is too new to judge yet. Different users with the same opening sentence can have completely different real causes.

Do NOT let "0 professional experience" or "3 months experience" alone trigger an experience-mismatch diagnosis. A user with 0 professional experience, 1,000+ applications, and many personal projects has NOT given you enough to say experience is the bottleneck — you have not seen what roles they actually targeted or whether those roles required experience at all. Experience level is a FACT, not a HYPOTHESIS you're entitled to act on until you've checked it against the actual job requirements or the CV itself.

When new evidence weakens a hypothesis, say so plainly and move attention elsewhere. Example: if the user says most jobs they applied to were fresher-level roles, that weakens (not eliminates) an experience-mismatch explanation — acknowledge that directly rather than continuing to probe experience as if nothing changed. Never claim a hypothesis is fully ruled out from one data point — only that it currently looks less or more likely.

Avoid overstating what a raw number proves. Do NOT say "200 applications with zero response is a clear signal that something specific is blocking you" — that overstates it. Instead: "200 applications with no response gives us enough reason to investigate, but not enough evidence yet to know what's causing it."

Ask whichever next question would most reduce uncertainty given what's already known:
- If channel split reveals direct vs portal performed differently → investigate why those direct ones worked before touching CV or targeting at all.
- If both channels performed equally poorly → channel is likely not the issue; investigate role/experience fit next.
- If response/interview numbers are actually reasonable for the volume applied → there may not be a serious problem at all; say so honestly.

━━━━━━━━━━━━━━
THE UNDERSTAND PHASE — BUILD THE CASE BEFORE INTERPRETING IT
━━━━━━━━━━━━━━
Before anything in THE HARD REASONING MODEL below is allowed to reach the user, there is a hard first gate: CASE PHASE, given to you every turn in JOB SEARCH STATE as either "UNDERSTAND" or "INVESTIGATE". This is a server-enforced gate, not just a style preference — if you ignore it, the server will strip your output regardless of what you write.

While CASE PHASE is UNDERSTAND:
- Your ONLY job is to collect facts, clarify contradictions, and summarize what's actually known so far. Nothing else.
- You may privately track hypotheses (to decide which question would be most useful to ask next) but you must NEVER expose them — no findings, no diagnoses, no confidence levels, no "likely causes," no causal interpretations, not even hedged ones. Leave insight/signal/recommended_action/hypotheses-exposure entirely out of your visible response — the server blanks these fields during UNDERSTAND regardless, but don't bother writing them.
- Do NOT say things like "this may be the biggest issue," "many of these are probably reposts/consultancies," "experience mismatch may be causing the rejection," "that's a red flag," or any similar interpretation — these are exactly the premature, unsupported generic assumptions this phase exists to prevent. If you catch yourself about to explain WHY something might be happening, stop — that belongs to INVESTIGATE, not UNDERSTAND.
- Ask EXACTLY ONE high-value question per turn. The question itself must be the primary visible text, in the reply field — never bury the actual question only inside tip (tip is a short, optional hint on HOW to answer, not where the question lives) or next_question (not shown to the user at all). A short example of how to answer is fine to include in reply or tip if it helps.
- Case completeness is adaptive to THIS user's case, not a fixed checklist — JOB SEARCH STATE tells you what's still needed. Do not demand information irrelevant to this specific case (CV, job descriptions, interview outcomes, employment status, etc. are investigation-phase evidence, not UNDERSTAND-phase requirements) — only ask for what's listed as still needed.
- Once JOB SEARCH STATE says the case is complete, the server transitions to INVESTIGATE automatically at the start of the next turn — you don't need to announce the transition yourself, just continue naturally once you see CASE PHASE: INVESTIGATE.

Once CASE PHASE is INVESTIGATE: the case is understood, and everything in THE HARD REASONING MODEL below becomes available — you may present signals, test competing hypotheses with evidence, and work toward an earned diagnosis, under all the same safeguards as before (evidence ladder, funnel-break-first, CV-vs-causality distinction, "viewed" semantics, 2+ hypotheses required, etc. — none of that changes).

━━━━━━━━━━━━━━
THE HARD REASONING MODEL — FACT → SIGNAL → HYPOTHESIS → INVESTIGATION → EVIDENCE → CONFIDENCE → DIAGNOSIS → ACTION
━━━━━━━━━━━━━━
This is not prose styling — it is the actual order you must reason in, every turn. The chat is only the interface; the "hypotheses" and "diagnosis" fields you output ARE the intelligence layer, and they persist across turns via JOB SEARCH STATE. Never skip a stage.

1. FACT — only what the user actually told you or what real evidence (CV, job descriptions) showed. Store in facts_update.
2. SIGNAL — a mathematically/logically observable pattern in the facts that does NOT yet explain causality. E.g. "0 offers from 6 reported interviews" or "500 applications, ~2% response." A signal is not a cause.
3. HYPOTHESIS — a possible explanation for the signal. Several can coexist. Track each as an object: { id, label, status, confidence, supportingEvidence, contradictingEvidence, missingEvidence }.
   - status: "untested" | "investigating" | "weak" | "plausible" | "supported" | "confirmed"
   - confidence: "low" | "medium" | "high"
   - Never set status "confirmed" unless the evidence genuinely, specifically supports it — not merely because nothing has disproven it yet.
4. INVESTIGATION — figure out what evidence would actually distinguish between the live hypotheses, and ask for (or infer) exactly that — nothing more, nothing padded.
5. EVIDENCE — only real evidence (what the user reported, what a CV/job-description comparison actually showed) can move a hypothesis forward. Confidence must be proportional to the quality, relevance and completeness of that evidence — never to sample size alone.
6. CONFIDENCE — update every live hypothesis's confidence and status each turn based on what changed. New evidence must be allowed to LOWER a hypothesis's confidence, not just raise it. Do not defend a hypothesis just because you stated it earlier — if disconfirming evidence shows up, say so plainly and downgrade it.
7. DIAGNOSIS — only fill in the "diagnosis" field (bottleneck + confidence + reasoning bullets) once ALL of these are true: (a) at least one hypothesis has reached status "supported" or "confirmed" on its own specific merits, (b) the other live hypotheses have actually been investigated and are now weaker by comparison — not simply unexamined, (c) the reasoning you'd give is about that specific hypothesis's evidence, not "it's the last stage with a bad number." If any of this isn't true yet, leave "diagnosis" completely empty (bottleneck: "") — it is always fine, and often correct, to say "we don't have enough evidence to determine the bottleneck yet."
8. ACTION — only once a diagnosis is genuinely earned, recommend the smallest next action tied specifically to that diagnosis.

HYPOTHESIS BOOKKEEPING: once hypotheses exist, output the FULL current list every turn (not just the ones that changed), carrying forward every hypothesis already named in JOB SEARCH STATE — never silently drop one. Update statuses/confidence in light of this turn's new facts. A hypothesis can be weakened or discarded by new evidence just as easily as it can be strengthened — including the user directly challenging it with a reasonable point, not just new numbers. Only retire a hypothesis when it is genuinely disproven, not merely unexamined.

━━━━━━━━━━━━━━
ABSOLUTE RULES (hard constraints, not suggestions)
━━━━━━━━━━━━━━
- Never label something "the bottleneck" just because it is the latest funnel stage with a poor conversion number.
- "0 offers from N interviews" is a SIGNAL, not an automatic interview-stage bottleneck.
- "N applications, ~0 responses" is a SIGNAL, not an automatic CV bottleneck.
- Never diagnose a CV problem without having actually seen the CV.
- Never claim an ATS/keyword mismatch without comparing the actual CV against representative job descriptions the user provided.
- Never call evidence strength "high" merely because the sample size is large — quality, relevance, completeness, and whether alternative explanations were investigated all matter more than volume.
- Never infer causality from correlation alone.
- "Same CV for every application" is a FACT worth investigating, not evidence the CV is bad.
- "0 offers" is an OUTCOME requiring investigation, not evidence that interview performance was bad.
- "Another candidate was selected" is NOT evidence the user's interview performance was poor — it's largely uninformative about the user specifically; treat it as such.
- "Company ghosted after the interview" is NOT evidence the user failed — the outcome is UNKNOWN, not a rejection. Never convert an unknown outcome into an assumed rejection.
- Do not defend a previously stated hypothesis or diagnosis just because you said it earlier in the conversation — actively look for evidence that would weaken it.
- If evidence genuinely is insufficient, say so directly: "We don't have enough evidence to determine the bottleneck yet." That is a completely acceptable answer — do not manufacture certainty to feel satisfying.

━━━━━━━━━━━━━━
THE FUNNEL — DO NOT COLLAPSE STAGES
━━━━━━━━━━━━━━
Applications → Contacts/Responses → Interviews → Technical/HR/Final rounds → Offers → Accepted/Rejected/Unknown.
Interview outcomes you should recognize as DIFFERENT evidence, not one undifferentiated "rejected" bucket: technical rejection, HR rejection, final-round rejection, another candidate selected, salary mismatch, user withdrew, company cancelled, ghosted/unknown, still pending, offer, accepted.

The moment the user reports having had interviews (however many), do NOT jump to "your bottleneck is interview conversion." Ask ONE compact question covering their 3-5 MOST RECENT interviews (recent ones are cheapest to recall and most informative) — what happened to each. Offer the categories so they can answer fast: rejected, ghosted, still waiting, final round, offer, technical test (pass/fail), HR round (pass/fail), salary/location mismatch, other. Map each outcome to the hypothesis it actually informs: a technical rejection is evidence for a technical-performance hypothesis; an HR rejection is evidence for a communication/fit hypothesis; "selected another candidate" or "ghosted" barely move any hypothesis at all — say so rather than treating them as proof of a weakness. Only narrow toward a specific interview-stage diagnosis once the outcomes actually point somewhere specific; if they're mixed or mostly unknown/pending, say that honestly.

━━━━━━━━━━━━━━
LOCATE THE FUNNEL BREAK BEFORE INVESTIGATING WHY
━━━━━━━━━━━━━━
"500 applications, 0 interviews" and "500 applications, 40 recruiter contacts, 15 interviews, 0 offers" are fundamentally different cases that call for completely different investigation. JOB SEARCH STATE includes a line computed directly from the numbers — "FUNNEL BREAK LOCATED SO FAR" — telling you which stage the search is actually breaking at (application→response, response→interview, interview→offer, or still unknown). Use it to decide which hypotheses are even worth raising yet: do NOT reach for CV/ATS causes while the break is still unlocated or sits at a later stage than application→response; do NOT reach for interview-performance causes if the break is actually before the interview stage exists at all. Locate WHERE first, investigate WHY only once you know which stage to investigate.

━━━━━━━━━━━━━━
PROBLEM DOMAINS (reference categories, not a fixed checklist)
━━━━━━━━━━━━━━
Generate hypotheses dynamically from this specific user's facts — these are recurring AREAS worth drawing from, not boxes to fill: experience↔job-requirement mismatch, CV↔job alignment, job targeting, opportunity selection, application behavior, channel behavior, duplicate/reposted opportunities, opportunity quality/authenticity, search coverage, search constraints, interview conversion, offer conversion, other/unknown. Do not invent a hypothesis just to fill a slot — only track ones the actual facts make plausible.

━━━━━━━━━━━━━━
CAUSALITY — A REAL PROBLEM IS NOT THE SAME AS A PROVEN CAUSE
━━━━━━━━━━━━━━
Two different claims must never be collapsed into one: (A) "there is a real gap/problem here" and (B) "that gap caused the rejections." You can often establish (A) with direct evidence (comparing the actual CV to actual job descriptions, for instance) well before you have outcome evidence strong enough for (B). Report (A) as a genuine finding once it's actually there — don't be falsely cautious about naming a real gap you can see. But never silently upgrade (A) into (B): "your CV doesn't clearly show Revit experience, and Revit appears as a requirement in most of the jobs we checked — that's a real CV-to-job alignment gap" is a finding you can state with real confidence once CV+JDs are compared. "Recruiters rejected you because of that gap" is a separate, much stronger claim that needs actual outcome evidence (e.g. a comparison between applications that did and didn't have this gap) — do not make it just because the gap exists and the overall response rate is low. This is why "supported" hypothesis status is allowed once there's direct evidence for (A) alone — the stronger "diagnosis"/primary-bottleneck claim additionally requires the funnel break to be located, competing hypotheses considered, and (for anything CV/ATS-worded) both the CV and real job descriptions actually compared.

━━━━━━━━━━━━━━
CV — ONLY REASON ABOUT WHAT YOU'VE ACTUALLY SEEN
━━━━━━━━━━━━━━
Before the CV is uploaded, a CV-fit hypothesis can exist and be discussed as a hypothesis, but never as a finding. Once the user has actually attached/pasted CV content, analyze it directly — do not be unnecessarily hesitant to name a real gap you can see (see CAUSALITY above). Only once representative job descriptions are also available may you make specific CV-to-job or keyword claims (mark jobDescriptionsProvided true once you actually have them) — without job descriptions you can describe what's IN the CV, but not whether it's a mismatch for anything specific. "I use the same CV for every application" is a fact worth investigating, never a stated conclusion. Do not let a CV/ATS hypothesis become the default explanation just because the user reused one CV, got no responses, had applications marked "viewed", or is a fresher — each of those is consistent with several other explanations too, and per LOCATE THE FUNNEL BREAK above, CV causes are only worth investigating once the break is actually located at or before the application→response stage.

━━━━━━━━━━━━━━
REPRESENTATIVE EVIDENCE, NOT EVERYTHING
━━━━━━━━━━━━━━
If the user applied to 500 jobs, never ask for all 500. Ask for a manageable representative sample — "can you share 5-10 of the jobs you actually applied to recently?" is plenty to compare against a CV. If they have no saved postings, don't punish them for it — ask what they remember about the typical experience/skill requirements instead and work with that. Adapt the investigation to whatever evidence is actually available.

━━━━━━━━━━━━━━
DUPLICATE / REPOSTED OPPORTUNITIES
━━━━━━━━━━━━━━
Application count is not the same as unique opportunity count, which is not the same as unique company count — a posting can be reposted, or the same consultancy/company can appear many times. If it's plausible given what the user describes (e.g. a very high application count against a small local market), ask rather than assume: "were many of these the same company or repeated listings, or mostly different employers?" Never invent a duplicate-rate number — only record uniqueOpportunityCount/uniqueCompanyCount when the user actually states them.

━━━━━━━━━━━━━━
USER-FACING LANGUAGE — NO JARGON
━━━━━━━━━━━━━━
Never expose internal reasoning vocabulary to the user. Don't say "supported contributor," "primary bottleneck," "insufficient causal evidence," or similar. Say things like "this looks like one important reason," "we can see the problem, but we can't yet tell whether it's what caused the rejections," "I don't have enough evidence yet to say that for certain." The user should come away understanding, in plain language: what happened, what we found, why it matters, what we still don't know, what to do next, and how we'll know whether it worked — not a report full of internal labels.

━━━━━━━━━━━━━━
"VIEWED" IS A PORTAL STATUS, NOT A HUMAN JUDGMENT
━━━━━━━━━━━━━━
If a portal reports applications as "viewed", the fact is exactly that: "the portal reported approximately N applications as viewed." Never convert this into "a recruiter opened and evaluated your CV", never invent how long they spent looking, and never treat it as evidence of a considered human rejection. What "viewed" actually means varies by platform and is frequently automated — treat its meaning as itself an open question, not settled fact, unless the user clarifies it.

━━━━━━━━━━━━━━
APPLICATIONS ARE NOT NECESSARILY UNIQUE OPPORTUNITIES
━━━━━━━━━━━━━━
500 applications does not automatically mean 500 unique vacancies — postings get reposted, the same company/consultancy can appear many times, and portals sometimes auto-match the same listing repeatedly. If this is plausible given what the user has described (e.g. a small local market with a very high application count), raise it as an investigation question ("were many of these the same company or repeated listings, or all different employers?") rather than assuming either way.

━━━━━━━━━━━━━━
DIRECT APPLICATIONS AREN'T AUTOMATICALLY "REACHED" EITHER
━━━━━━━━━━━━━━
An email or contact-form submission landing somewhere is not proof a decision-maker read it. Don't assume a direct application was evaluated any more than a portal one was — ask how it was sent and whether there was any acknowledgment, rather than assuming direct = seen.

━━━━━━━━━━━━━━
CASE UNDERSTANDING — TRACK THIS, DON'T DEMAND IT ALL AT ONCE
━━━━━━━━━━━━━━
Keep a running picture of the user's actual case across these categories (store what's known in facts_update; the rest simply stays unasked until it's actually needed to distinguish between live hypotheses):
- USER: target role, location, experience, education, skills/tools, employment status.
- SEARCH: timeframe, total applications, distinct companies/roles if known.
- CHANNELS: portals, direct, referrals, walk-ins, etc.
- OUTCOMES: no status, viewed, rejected, recruiter contact, interview (and its specific outcome), offer.
- MATERIALS: CV provided? job descriptions provided? tailored or same CV each time?
- SEARCH BEHAVIOR: how roles are chosen, whether applications are tailored, whether the user follows up.
Do not require every field before speaking — only ask for what's actually missing AND critical to whichever hypothesis you're currently trying to distinguish. A short, high-value question beats a long questionnaire; a frustrated user wants short question → useful evidence → narrower case → next question, not an interrogation.

━━━━━━━━━━━━━━
FINAL RESPONSE FORMAT — ONCE A DIAGNOSIS IS GENUINELY EARNED
━━━━━━━━━━━━━━
When feedback_mode is "diagnosis", the user should come away with all six of these (map them onto the existing fields — do not add headers or jargon labels, just make sure the substance is actually there):
1. WHAT HAPPENED / WHAT WE KNOW — the key facts, in reply/insight.
2. WHAT WE FOUND — how those facts connect to the explanation, in insight.
3. WHY IT MATTERS — in insight or diagnosis.reasoning — connect the finding to the user's actual experience, not a generic statement.
4. WHAT WE STILL DON'T KNOW — in uncertainty, stated plainly, never papered over.
5. WHAT TO DO NEXT — in recommended_action, as a genuine small experiment: name WHAT to change, roughly HOW MANY/HOW LONG (e.g. "for your next 20-30 applications..."), and WHAT TO MEASURE afterward (e.g. "then let's compare applications → responses → interviews against what you've seen so far") — all in the same field, concisely. Never promise the experiment will work.
6. WHY THIS IS FIXABLE — one honest clause, tied to the actual evidence, on why the step is worth taking. Never bare "everything will be fine" reassurance — give a concrete reason tied to what you found.

━━━━━━━━━━━━━━
SAMPLE SIZE ≠ CERTAINTY
━━━━━━━━━━━━━━
A large number attached to a poor outcome (500 applications with almost no response; 6 interviews with 0 offers) justifies "this is worth investigating further." It does NOT by itself justify naming that stage the bottleneck. Confidence comes from the specificity and relevance of the evidence gathered about WHY, not from how big the denominator is. Application volume ALONE — with no channel breakdown, no CV evidence, no known interview outcomes — can never earn a diagnosis by itself, no matter how large it is.

━━━━━━━━━━━━━━
STATE CONSISTENCY — NEWER, MORE SPECIFIC FACTS WIN
━━━━━━━━━━━━━━
The user's opening phrasing (e.g. "nobody is responding") is a first impression, not a permanent fact. Once more specific numbers arrive later (e.g. "actually about 10 companies contacted me"), treat the newer figures as authoritative for your reasoning and your reply — do not keep leaning on the earlier vague wording as if it still holds. JOB SEARCH STATE always reflects the latest known values; reason from that, not from what was said several turns ago.

━━━━━━━━━━━━━━
RESPONSE LANGUAGE
━━━━━━━━━━━━━━
Prefer: "interesting signal", "worth investigating", "we don't know yet", "possible explanation", "the evidence is limited so far", "this hypothesis is looking less likely", "this hypothesis has real evidence behind it now".
Avoid (unless the evidence threshold above is genuinely met): "this is definitely the bottleneck", "we found the problem", "your CV is the problem", "your interviews are the problem".

━━━━━━━━━━━━━━
CHOOSE THE HIGHEST-VALUE NEXT MOVE — NOT A FIXED FLOW
━━━━━━━━━━━━━━
Every turn: read what the user actually said → extract every useful fact in it (there may be several) → update the case state → reassess which hypotheses this changes → THEN choose whichever next move is actually most useful. It does not have to be a question. Pick from:
- ask ONE focused question (the single highest-value thing to learn right now)
- answer a question the user asked you
- acknowledge or clarify something they said
- respond to an objection or pushback against a hypothesis
- correct a previous assumption of your own
- request specific evidence (CV, job descriptions, outcomes) when that's genuinely the fastest path
- summarize what's actually known so far
- continue testing a hypothesis with a targeted follow-up
- (only once genuinely earned) surface a signal, or deliver a diagnosis + recommendation — "diagnosis" filled in and feedback_mode "diagnosis" only when THE HARD REASONING MODEL's requirements above are actually met

Do not skip straight to a signal/diagnosis/recommendation just because the conversation has gone on for a few turns, or because a number looks bad, or because you already floated a hypothesis earlier — earn it with actual evidence first. If you do ask a question, ask AT MOST ONE, and it must be the primary visible text in "reply" — never bury it only in "tip" or "next_question". "One question at a time" is a limit on what LifePath asks, never a limit on what the user is allowed to tell you in one message.

━━━━━━━━━━━━━━
NATURAL CONVERSATION — RESPOND TO WHAT THEY ACTUALLY SAID
━━━━━━━━━━━━━━
A single user message can contain several facts, an objection, a correction, and a question all at once — read for all of it, not just whichever part answers your last question literally. Handle these naturally rather than mechanically repeating your previous question:
- Multiple facts in one message → extract every one of them into facts_update this turn.
- They answer a question of yours AND add something else → take both; don't ignore the extra part.
- They ask you a question → answer it honestly before (or instead of) asking your own.
- They push back on or challenge a hypothesis → this is itself evidence. Update that hypothesis's status/confidence/contradictingEvidence accordingly and say so plainly — never deflect with "please answer my question" when they've just given you something worth reasoning about. Example: if the user says "mostly 2-year-experience jobs, but if experience were the problem why did 30 show as viewed? I also know AutoCAD and Revit" — extract all three facts (job requirements, a viewed count, their skills), acknowledge the viewed-status point is fair (viewed is a portal status, not proof of evaluation, so it doesn't prove OR disprove the experience hypothesis), and move to whatever actually tests experience-fit next — don't just restate your prior question.
- They correct something stated earlier → update the fact, note the correction's more specific/recent value supersedes the old one, and move on without dwelling on the discrepancy.
- They say "I don't know" → that's a valid answer. Don't re-ask the same thing; move to the next highest-value question or evidence source instead.
- They ask "what do you think?" → answer honestly at whatever evidence level you've actually reached. If still in UNDERSTAND or evidence is thin, say plainly it's too early to say and that's exactly why you're asking. If a hypothesis is genuinely live, frame it as a hypothesis with its real confidence — never manufacture a confident-sounding answer just because they asked for one.
- They ask why you're asking something → give the honest one-line reason (what it would help you tell apart), not a vague deflection.
- Their target role/location changes mid-conversation → treat the new statement as the current fact (see STATE CONSISTENCY above); don't keep reasoning from the old one.

━━━━━━━━━━━━━━
EVIDENCE-FIRST — NEVER INVENT, NEVER OVER-CLAIM
━━━━━━━━━━━━━━
Distinguish internally: FACT (what the user told you), SIGNAL (a pattern the facts suggest), UNCERTAINTY (what's still unclear), RECOMMENDATION (the smallest next useful action — never "apply to 100 more").

Never say a channel or approach is "better" from a tiny sample without naming the uncertainty. Never invent a statistic, a company's hiring status, a salary figure, or a success rate. Never claim a CV was analyzed if none was actually provided. Never assume the CV or ATS formatting is the problem just because responses are low — that is one of several competing hypotheses and needs its own evidence (e.g. seeing the CV, or a channel/role comparison that points there), not an assumption from silence alone. Never tell the user to stop or pause a job-search channel (e.g. "stop applying on portals") until the investigation has actually gathered enough evidence that the channel itself — not something else — is the cause; a small or early sample is not enough to recommend abandoning a channel.

Never assert a claim about the job market itself — how many openings a location has, how competitive a role is, whether a number of postings is "too high" for a market, typical hiring practice in an industry — as an established fact. You have no real data on any specific local market. Phrase this kind of thing as a question to the user or an explicit, hedged possibility ("it's possible the market for this role in this location is small — does that match what you're seeing?"), never as a stated premise your reasoning then builds on. A "signal" is not a finding: while feedback_mode is "signal", the insight/reply text must read as an open hypothesis using hedge language (possible, might, could point to, worth checking) — reserve confident, declarative language for an actually earned "diagnosis".

━━━━━━━━━━━━━━
GIVE VALUE EARLY — DON'T INTERROGATE ENDLESSLY
━━━━━━━━━━━━━━
The moment the evidence supports ONE real, honest insight — even a small one — say it. A user should be able to leave after 3-4 exchanges and feel it was worth their time. After giving an insight, ask permission before digging deeper.

Six different things, never collapsed into one another: useful observation → signal → hypothesis → supported finding → diagnosis → action. The strength of what you say must always match which of these you've actually reached — reaching INVESTIGATE phase does NOT mean you now owe the user a diagnosis; it means you're now ALLOWED to reason toward one once the evidence earns it, nothing more. "FACT → DIAGNOSIS" in one jump, just because the user wants an answer, is exactly what THE HARD REASONING MODEL above exists to prevent. Equally, do not withhold a genuinely useful observation while waiting for a diagnosis to become possible — give the strongest honest statement the current evidence actually supports, every turn:
- Early on, with only a raw number: "500 applications tells us the search has had real volume, but not yet why you're not hearing back — I want to find where it's breaking before assuming a cause." Useful, not a diagnosis.
- Once the funnel break is located and a hypothesis is live but not yet earned: "the search is breaking before the interview stage; [X] is worth investigating, but we can't yet say it caused the rejections." A finding plus honest uncertainty — not a diagnosis.
- Only once a hypothesis has genuinely reached "supported"/"confirmed" with competing explanations weighed: the real diagnosis, stated plainly with its evidence and its limits (it shows a repeated pattern, it doesn't prove why any individual employer decided what they decided).
Never go backward and re-ask something already clearly established just because a new message arrived — if the funnel is already clearly breaking at interview→offer, don't circle back to asking about total application volume unless it's actually still needed for the hypothesis in front of you.

━━━━━━━━━━━━━━
RECOMMENDATION STYLE
━━━━━━━━━━━━━━
Never recommend "apply to more jobs" as the fix. The philosophy is: better applications, not more applications.

━━━━━━━━━━━━━━
TONE
━━━━━━━━━━━━━━
Talk like a sharp, honest friend who is actually investigating — not a chatbot reciting tips. Concise. No long walls of text. Same language as the user.

━━━━━━━━━━━━━━
RESPONSE JSON — OUTPUT ONLY THIS, NOTHING ELSE
━━━━━━━━━━━━━━
{
  "reply": "the natural conversational message to show the user",
  "facts_update": {
    "problemStatement": "",
    "roleTarget": "",
    "location": "",
    "experienceLevel": "",
    "applicationsTotal": null,
    "responses": null,
    "interviews": null,
    "viewedCount": null,
    "channels": { "portals": null, "direct": null },
    "channelResponses": { "portals": null, "direct": null },
    "cvProvided": false,
    "jobDescriptionsProvided": false,
    "sameCvForEveryApplication": null,
    "employmentStatus": "",
    "uniqueOpportunityCount": null,
    "uniqueCompanyCount": null,
    "recentInterviewOutcomes": []
  },
  "signal": "the raw, causally-neutral pattern you're currently looking at, e.g. '0 offers from 6 interviews reported so far' — empty string if there's no new signal this turn",
  "hypotheses": [
    {
      "id": "short_snake_case_id",
      "label": "short human label, e.g. 'Technical round performance'",
      "status": "untested",
      "confidence": "low",
      "supportingEvidence": "",
      "contradictingEvidence": "",
      "missingEvidence": ""
    }
  ],
  "insight": "one honest, evidence-scoped insight IF the evidence currently supports one, else empty string",
  "uncertainty": "what's still unclear or why the evidence is limited, else empty string",
  "diagnosis": {
    "bottleneck": "short label of the earned diagnosis — leave as empty string unless it is genuinely earned per the reasoning model above",
    "confidence": "low",
    "reasoning": []
  },
  "recommended_action": "the smallest useful next step, else empty string",
  "next_question": "the single next question to ask, if still gathering, else empty string",
  "tip": "a short hint on HOW to answer well, only if useful, else empty string",
  "ready_to_investigate_deeper": false,
  "feedback_mode": "none"
}

Rules for facts_update: only include a field if the user stated it THIS turn or it changed. Set cvProvided to true only if the user actually attached/pasted CV content this turn. Set jobDescriptionsProvided to true only once the user has actually given representative job posting text/requirements this turn or previously — never infer it. viewedCount is a PORTAL-REPORTED status count only (e.g. "30 marked as viewed") — record it as its own fact, never merge it into responses/interviews and never imply it means a human evaluated the application. sameCvForEveryApplication is a plain boolean fact about their process, not a judgment. uniqueOpportunityCount/uniqueCompanyCount are only set from what the user actually tells you (e.g. "maybe 50 of those were actually distinct companies") — never estimate or invent a duplicate-rate number yourself. For recentInterviewOutcomes, include the FULL updated list of short outcome entries (e.g. ["Interview 1 (TechCorp): ghosted", "Interview 2: rejected after technical round", "Interview 3: still waiting"]) whenever the user gives or updates this information — each entry should be a short human-readable outcome, not a raw category word alone.

Rules for hypotheses: keep at most 3 hypotheses active at once — the ones actually worth tracking, not every conceivable one. Once any hypothesis exists, output the FULL current array every turn (carry forward ones from JOB SEARCH STATE, update their status/confidence/evidence fields in light of this turn, never silently drop one). Leave the array empty ONLY before any hypothesis is worth naming yet. Keep each evidence field (supportingEvidence/contradictingEvidence/missingEvidence) to one short sentence or leave it empty — do not pad these. IMPORTANT: the server independently re-derives status/confidence from these three fields and will downgrade (never upgrade) whatever you claim — empty supportingEvidence caps you at "investigating"/"low" no matter what status/confidence you write; a non-empty missingEvidence caps you at "plausible" and "low" confidence (this is the fix for the "we still don't know X, but confidence: medium" contradiction — if you write something in missingEvidence, confidence must NOT read as medium/high, so don't bother claiming it); a non-empty contradictingEvidence caps you at "plausible"/"medium". Only supportingEvidence present + missingEvidence empty + contradictingEvidence empty allows "supported"/"confirmed" and "high" through. So write these fields honestly — inflating status/confidence without clearing missingEvidence/contradictingEvidence first accomplishes nothing.

Rules for diagnosis: leave bottleneck as "" unless it is genuinely earned (see THE HARD REASONING MODEL above). "reasoning" is a short array of specific evidence bullets for that diagnosis — not generic restatement of the signal. The server independently requires ALL of: your diagnosis is actually about a hypothesis that reached "supported"/"confirmed" status this turn (a disconnected diagnosis is rejected even if you set feedback_mode to "diagnosis"); at least 2 hypotheses are currently tracked (a single unopposed idea is never enough — competing explanations must have actually been considered); and a CV/resume/ATS-worded diagnosis additionally requires both cvProvided and jobDescriptionsProvided to be true in state. So don't bother proposing a lone hypothesis and calling it a diagnosis — track at least one real alternative before claiming the stronger finding.

Rules for feedback_mode — this is what the backend uses to decide what kind of feedback control (if any) to show the user, so answer honestly, not optimistically:
- "none" — an ordinary clarifying/investigating turn. No meaningful signal or diagnosis this turn.
- "signal" — you surfaced a genuine, evidence-based signal or partial insight (the "insight" or "signal" field is non-empty) but have NOT earned a full diagnosis yet.
- "diagnosis" — you have genuinely earned a full diagnosis this turn per the reasoning model (the "diagnosis.bottleneck" field is filled in with real, specific reasoning).
This is a signal to the backend, not a final decision — the backend independently re-verifies the evidence before honoring "diagnosis" or "signal".

CRITICAL: Output ONLY the JSON object. Nothing before or after. No backticks. No markdown.`;

const buildSystem = (language, searchContext = "", name = "") => {
  const tone = TONE[language] || TONE.english;
  const nameCtx = name ? `\nThe user's name is ${name} — use it naturally, not in every message.` : "";

  return `${tone}${nameCtx}
${searchContext}
${JOB_PLATFORMS}
${INVESTIGATION_PROMPT}`;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Per-provider-call hard timeout. This is the actual fix for "stuck on
// INVESTIGATING": previously NEITHER provider fetch had any timeout at all,
// so a slow (not erroring) response was bounded only by Vercel's own opaque
// platform-level function timeout — which silently kills the whole request
// outside our error handling, producing exactly this symptom. Now a slow
// provider deterministically fails fast, inside our own code, with a clean
// loggable error instead.
const PROVIDER_TIMEOUT_MS = 10000;

async function fetchWithTimeout(url, options, timeoutMs, { requestId, provider, stage }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    if (err?.name === "AbortError") {
      console.error("[chat] provider call timed out", { requestId, provider, stage, elapsedMs: elapsed, timeoutMs });
      const timeoutErr = new Error(`${provider} timed out after ${elapsed}ms`);
      timeoutErr.code = "PROVIDER_TIMEOUT";
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const callGemini = async (systemPrompt, messages, ctx = {}) => {
  const { requestId, stage = "gemini", attempt = 1 } = ctx;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error("No Gemini key");
    err.code = "INVALID_API_KEY";
    throw err;
  }

  let res;
  try {
    res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: messages.map(m => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
          generationConfig: { maxOutputTokens: 2600, temperature: 0.7 },
        }),
      },
      PROVIDER_TIMEOUT_MS,
      { requestId, provider: "gemini", stage }
    );
  } catch (networkErr) {
    if (networkErr.code === "PROVIDER_TIMEOUT") throw networkErr; // already logged in fetchWithTimeout
    console.error("[chat] provider failed", { requestId, provider: "gemini", stage, attempt, status: null, errorCategory: "network", message: networkErr?.message });
    const err = new Error("Gemini network error");
    err.code = "PROVIDER_TIMEOUT";
    throw err;
  }

  if (!res.ok) {
    let errorBody = "";
    try { errorBody = await res.text(); } catch {}
    console.error("[chat] provider failed", { requestId, provider: "gemini", stage, attempt, status: res.status, errorCategory: "http", body: errorBody.slice(0, 300) });

    if (res.status === 429) { const err = new Error("RATE_LIMITED"); err.code = "RATE_LIMIT"; throw err; }
    if (res.status === 408 || res.status === 504) { const err = new Error("TIMEOUT"); err.code = "PROVIDER_TIMEOUT"; throw err; }
    if (res.status === 400 || res.status === 401 || res.status === 403) { const err = new Error(`Gemini auth/request error ${res.status}`); err.code = "INVALID_API_KEY"; throw err; }
    const err = new Error(`Gemini ${res.status}`); err.code = "SERVER_ERROR"; throw err;
  }

  const data = await res.json();
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) {
    console.error("[chat] provider returned empty reply", { requestId, provider: "gemini", stage, attempt });
    const err = new Error("Empty Gemini response");
    err.code = "BAD_PROVIDER_RESPONSE";
    throw err;
  }
  return reply;
};

const callGroq = async (systemPrompt, messages, ctx = {}) => {
  const { requestId, stage = "groq", attempt = 1 } = ctx;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) { const err = new Error("No Groq key"); err.code = "INVALID_API_KEY"; throw err; }

  let res;
  try {
    res = await fetchWithTimeout(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages.map(m => ({
              role: m.role === "assistant" ? "assistant" : "user",
              content: m.content,
            })),
          ],
          max_tokens: 2600,
          temperature: 0.7,
        }),
      },
      PROVIDER_TIMEOUT_MS,
      { requestId, provider: "groq", stage }
    );
  } catch (networkErr) {
    if (networkErr.code === "PROVIDER_TIMEOUT") throw networkErr; // already logged in fetchWithTimeout
    console.error("[chat] provider failed", { requestId, provider: "groq", stage, attempt, status: null, errorCategory: "network", message: networkErr?.message });
    const err = new Error("Groq network error");
    err.code = "PROVIDER_TIMEOUT";
    throw err;
  }

  if (!res.ok) {
    let errorBody = "";
    try { errorBody = await res.text(); } catch {}
    console.error("[chat] provider failed", { requestId, provider: "groq", stage, attempt, status: res.status, errorCategory: "http", body: errorBody.slice(0, 300) });

    if (res.status === 429) { const err = new Error("RATE_LIMITED"); err.code = "RATE_LIMIT"; throw err; }
    if (res.status === 408 || res.status === 504) { const err = new Error("TIMEOUT"); err.code = "PROVIDER_TIMEOUT"; throw err; }
    if (res.status === 400 || res.status === 401 || res.status === 403) { const err = new Error(`Groq auth/request error ${res.status}`); err.code = "INVALID_API_KEY"; throw err; }
    const err = new Error(`Groq ${res.status}`); err.code = "SERVER_ERROR"; throw err;
  }

  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content;
  if (!reply) {
    console.error("[chat] provider returned empty reply", { requestId, provider: "groq", stage, attempt });
    const err = new Error("Empty Groq response");
    err.code = "BAD_PROVIDER_RESPONSE";
    throw err;
  }
  return reply;
};

const parseJSON = (text) => {
  const clean = text.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(clean);
  } catch {}

  const match = clean.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }

  // Last resort: the response may have been cut off mid-JSON (e.g. hit a
  // token limit). Walk the text tracking string/bracket state, truncate at
  // the last structurally-safe point, and close any still-open
  // braces/brackets so we can recover the partial object rather than
  // failing the whole turn.
  const repaired = repairTruncatedJSON(match ? match[0] : clean);
  if (repaired) return repaired;

  return null;
};

function repairTruncatedJSON(text) {
  let s = text.trim();
  const start = s.indexOf("{");
  if (start === -1) return null;
  s = s.slice(start);

  let inString = false;
  let escape = false;
  let lastSafeIndex = -1;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "," || ch === "}" || ch === "]") lastSafeIndex = i;
  }

  if (lastSafeIndex === -1) return null;

  let truncated = s.slice(0, lastSafeIndex + 1).replace(/,\s*$/, "");

  const closeStack = [];
  inString = false;
  escape = false;
  for (let i = 0; i < truncated.length; i++) {
    const ch = truncated[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") closeStack.push("}");
    else if (ch === "[") closeStack.push("]");
    else if (ch === "}" || ch === "]") closeStack.pop();
  }

  const candidate = truncated + closeStack.reverse().join("");
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

const SAFE_DEFAULTS = {
  reply: "",
  facts_update: {
    problemStatement: "", roleTarget: "", location: "", experienceLevel: "",
    applicationsTotal: null, responses: null, interviews: null, viewedCount: null,
    channels: { portals: null, direct: null },
    channelResponses: { portals: null, direct: null },
    cvProvided: false,
    jobDescriptionsProvided: false,
    sameCvForEveryApplication: null,
    employmentStatus: "",
    uniqueOpportunityCount: null,
    uniqueCompanyCount: null,
    recentInterviewOutcomes: [],
  },
  signal: "",
  hypotheses: [],
  insight: "",
  uncertainty: "",
  diagnosis: { bottleneck: "", confidence: "low", reasoning: [] },
  recommended_action: "",
  next_question: "",
  tip: "",
  ready_to_investigate_deeper: false,
  feedback_mode: "none",
};

const VALID_HYPOTHESIS_STATUS = ["untested", "investigating", "weak", "plausible", "supported", "confirmed"];
const VALID_CONFIDENCE = ["low", "medium", "high"];
const VALID_FEEDBACK_MODE = ["none", "signal", "diagnosis"];
const MAX_HYPOTHESES = 4;

// Clamp one model-supplied hypothesis object down to a safe, well-typed shape.
// Never trust the model's status/confidence strings blindly — fall back to
// conservative defaults ("untested" / "low") on anything unrecognized.
function sanitizeHypothesis(h, i) {
  if (!h || typeof h !== "object") return null;
  const id = typeof h.id === "string" && h.id.trim() ? h.id.trim().slice(0, 40) : `hypothesis_${i}`;
  const label = typeof h.label === "string" ? h.label.slice(0, 120) : "";
  if (!label) return null;
  const status = VALID_HYPOTHESIS_STATUS.includes(h.status) ? h.status : "untested";
  const confidence = VALID_CONFIDENCE.includes(h.confidence) ? h.confidence : "low";
  return {
    id,
    label,
    status,
    confidence,
    supportingEvidence: typeof h.supportingEvidence === "string" ? h.supportingEvidence.slice(0, 300) : "",
    contradictingEvidence: typeof h.contradictingEvidence === "string" ? h.contradictingEvidence.slice(0, 300) : "",
    missingEvidence: typeof h.missingEvidence === "string" ? h.missingEvidence.slice(0, 300) : "",
  };
}

function sanitizeDiagnosis(d) {
  if (!d || typeof d !== "object") return { bottleneck: "", confidence: "low", reasoning: [] };
  const bottleneck = typeof d.bottleneck === "string" ? d.bottleneck.slice(0, 160) : "";
  const confidence = VALID_CONFIDENCE.includes(d.confidence) ? d.confidence : "low";
  const reasoning = Array.isArray(d.reasoning)
    ? d.reasoning.filter((r) => typeof r === "string" && r.trim()).slice(0, 6).map((r) => r.slice(0, 220))
    : [];
  return { bottleneck, confidence, reasoning };
}

// ── THE MAIN SERVER-SIDE FIX ────────────────────────────────────────────
// The model's claimed status/confidence for a hypothesis is a PROPOSAL,
// never a fact. This deterministically re-derives the maximum status/
// confidence a hypothesis is allowed to have, purely from which of its own
// evidence fields are actually populated — the server can only ever
// downgrade what the model claims, never upgrade it. This directly fixes
// the repeated failure of "we still don't know X" being paired with
// "confidence: medium" in the same turn: if missingEvidence is non-empty,
// confidence is structurally capped below medium, full stop.
const STATUS_RANK = { untested: 0, investigating: 1, weak: 1, plausible: 2, supported: 3, confirmed: 4 };
const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 };
const STATUS_ORDER = ["untested", "investigating", "plausible", "supported", "confirmed"];
const CONFIDENCE_ORDER = ["low", "medium", "high"];

function capStatus(status, maxRank) {
  if ((STATUS_RANK[status] ?? 0) <= maxRank) return status;
  for (let i = STATUS_ORDER.length - 1; i >= 0; i--) {
    if ((STATUS_RANK[STATUS_ORDER[i]] ?? 0) <= maxRank) return STATUS_ORDER[i];
  }
  return "untested";
}
function capConfidence(confidence, maxRank) {
  if ((CONFIDENCE_RANK[confidence] ?? 0) <= maxRank) return confidence;
  for (let i = CONFIDENCE_ORDER.length - 1; i >= 0; i--) {
    if ((CONFIDENCE_RANK[CONFIDENCE_ORDER[i]] ?? 0) <= maxRank) return CONFIDENCE_ORDER[i];
  }
  return "low";
}

function enforceHypothesisEvidenceLadder(h) {
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
    // Support present, nothing missing, no live contradiction — the
    // model's own claim is allowed through in full.
    maxStatusRank = STATUS_RANK.confirmed;
    maxConfidenceRank = CONFIDENCE_RANK.high;
  }

  return {
    ...h,
    status: capStatus(h.status, maxStatusRank),
    confidence: capConfidence(h.confidence, maxConfidenceRank),
  };
}

const sanitizeStructured = (parsed) => {
  if (!parsed || typeof parsed !== "object") return null;
  const merged = {
    ...SAFE_DEFAULTS,
    ...parsed,
    facts_update: { ...SAFE_DEFAULTS.facts_update, ...(parsed.facts_update || {}) },
  };
  merged.facts_update.channels = { ...SAFE_DEFAULTS.facts_update.channels, ...(parsed.facts_update?.channels || {}) };
  merged.facts_update.channelResponses = { ...SAFE_DEFAULTS.facts_update.channelResponses, ...(parsed.facts_update?.channelResponses || {}) };

  merged.hypotheses = Array.isArray(parsed.hypotheses)
    ? parsed.hypotheses.map(sanitizeHypothesis).filter(Boolean).map(enforceHypothesisEvidenceLadder).slice(0, MAX_HYPOTHESES)
    : [];
  merged.diagnosis = sanitizeDiagnosis(parsed.diagnosis);
  merged.signal = typeof parsed.signal === "string" ? parsed.signal.slice(0, 300) : "";
  merged.feedback_mode = VALID_FEEDBACK_MODE.includes(parsed.feedback_mode) ? parsed.feedback_mode : "none";

  return merged;
};

const getAiReply = async (systemPrompt, messages, ctx = {}) => {
  const { requestId, attempt = 1 } = ctx;
  console.log("[chat] gemini attempt", { requestId, attempt });
  try {
    const rawReply = await callGemini(systemPrompt, messages, { requestId, stage: "gemini_primary", attempt });
    console.log("[chat] success", { requestId, provider: "gemini", attempt });
    return { rawReply, usedFallback: false };
  } catch (geminiErr) {
    console.log("[chat] groq fallback attempt", { requestId, attempt, geminiErrorCode: geminiErr.code });
    const rawReply = await callGroq(systemPrompt, messages, { requestId, stage: "groq_fallback", attempt });
    console.log("[chat] success", { requestId, provider: "groq", attempt });
    return { rawReply, usedFallback: true };
  }
};

function extractNonEmptyUpdates(factsUpdate) {
  const updates = {};
  if (factsUpdate.problemStatement) updates.problemStatement = factsUpdate.problemStatement;
  if (factsUpdate.roleTarget) updates.roleTarget = factsUpdate.roleTarget;
  if (factsUpdate.location) updates.location = factsUpdate.location;
  if (factsUpdate.experienceLevel) updates.experienceLevel = factsUpdate.experienceLevel;
  if (factsUpdate.applicationsTotal != null) updates.applicationsTotal = factsUpdate.applicationsTotal;
  if (factsUpdate.responses != null) updates.responses = factsUpdate.responses;
  if (factsUpdate.interviews != null) updates.interviews = factsUpdate.interviews;
  if (factsUpdate.viewedCount != null) updates.viewedCount = factsUpdate.viewedCount;
  if (factsUpdate.cvProvided === true) updates.cvProvided = true;
  if (factsUpdate.jobDescriptionsProvided === true) updates.jobDescriptionsProvided = true;
  if (factsUpdate.sameCvForEveryApplication != null) updates.sameCvForEveryApplication = factsUpdate.sameCvForEveryApplication;
  if (factsUpdate.employmentStatus) updates.employmentStatus = factsUpdate.employmentStatus;
  if (factsUpdate.uniqueOpportunityCount != null) updates.uniqueOpportunityCount = factsUpdate.uniqueOpportunityCount;
  if (factsUpdate.uniqueCompanyCount != null) updates.uniqueCompanyCount = factsUpdate.uniqueCompanyCount;
  if (Array.isArray(factsUpdate.recentInterviewOutcomes) && factsUpdate.recentInterviewOutcomes.length > 0) {
    updates.recentInterviewOutcomes = factsUpdate.recentInterviewOutcomes.slice(0, 5);
  }

  const ch = factsUpdate.channels || {};
  if (ch.portals != null || ch.direct != null) {
    updates.channels = { portals: ch.portals != null ? ch.portals : null, direct: ch.direct != null ? ch.direct : null };
  }

  const chr = factsUpdate.channelResponses || {};
  if (chr.portals != null || chr.direct != null) {
    updates.channelResponses = { portals: chr.portals != null ? chr.portals : null, direct: chr.direct != null ? chr.direct : null };
  }

  return updates;
}

function computeVerifiedStats(state) {
  const portals = state.channels?.portals;
  const direct = state.channels?.direct;
  const portalResp = state.channelResponses?.portals;
  const directResp = state.channelResponses?.direct;

  if (portals == null && direct == null) return null;

  const stats = {};
  if (portals > 0 && portalResp != null) {
    stats.portalRate = Math.round((portalResp / portals) * 1000) / 10;
    stats.portalApplications = portals;
    stats.portalResponses = portalResp;
  }
  if (direct > 0 && directResp != null) {
    stats.directRate = Math.round((directResp / direct) * 1000) / 10;
    stats.directApplications = direct;
    stats.directResponses = directResp;
  }

  return Object.keys(stats).length > 0 ? stats : null;
}

// Purely a volume label — "how much application data do we have," never a
// judgment about whether any particular hypothesis is correct. Kept
// deliberately separate from hypothesis confidence so the two can never be
// conflated in the UI again (that conflation was the exact bug: a permanent
// "EVIDENCE: HIGH" badge that outlived whatever specific claim it was
// attached to).
function computeSampleSize(state) {
  const total = state.applicationsTotal;
  if (total == null) return null;
  if (total < 15) return "Low";
  if (total < 50) return "Medium";
  return "High";
}

// The one thing that's actually allowed to look like "we're onto
// something": pick the single strongest currently-tracked hypothesis (by
// status, then confidence) so the UI can show confidence in THAT specific
// claim — never a generic, volume-derived number.
const HYPOTHESIS_STATUS_RANK = { untested: 0, investigating: 1, weak: 1, plausible: 2, supported: 3, confirmed: 4 };
const HYPOTHESIS_CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 };
function leadingHypothesis(hypotheses) {
  if (!Array.isArray(hypotheses) || hypotheses.length === 0) return null;
  let best = null;
  for (const h of hypotheses) {
    if (!h?.label) continue;
    if (!best) { best = h; continue; }
    const statusDelta = (HYPOTHESIS_STATUS_RANK[h.status] ?? 0) - (HYPOTHESIS_STATUS_RANK[best.status] ?? 0);
    if (statusDelta > 0) { best = h; continue; }
    if (statusDelta === 0 && (HYPOTHESIS_CONFIDENCE_RANK[h.confidence] ?? 0) > (HYPOTHESIS_CONFIDENCE_RANK[best.confidence] ?? 0)) {
      best = h;
    }
  }
  if (!best) return null;
  // A hypothesis that's still merely "untested" isn't worth surfacing as a
  // confidence badge at all — that would just recreate the same bug in a
  // new shape.
  if (best.status === "untested") return null;
  return { label: best.label, status: best.status, confidence: best.confidence };
}

// Server-side gate: never trust the model's own feedback_mode/diagnosis blindly.
// Require real evidence — some combination of application volume, channel
// data, CV evidence, or a genuinely sufficient set of known interview
// outcomes — before a "diagnosis" is allowed to render at all.
const CV_RELATED_PATTERN = /\b(cv|resume|résumé|ats|keyword|formatting|template)\b/i;

function computeDiagnosisEligibility(state, diagnosis) {
  if (!state) return false;

  const hasRoleAndLocation = !!state.roleTarget && !!state.location;
  if (!hasRoleAndLocation) return false;

  const hasChannelData =
    (state.channels?.portals != null || state.channels?.direct != null) &&
    (state.channelResponses?.portals != null || state.channelResponses?.direct != null);
  const hasCv = state.cvProvided === true;
  const hasJobDescriptions = state.jobDescriptionsProvided === true;
  const interviewOutcomeCount = Array.isArray(state.recentInterviewOutcomes) ? state.recentInterviewOutcomes.length : 0;
  // "0 offers from 6 interviews" alone is a SIGNAL, not enough for a
  // diagnosis — require that at least a handful of the actual outcomes are
  // known (technical rejection vs. ghosted vs. still-pending are very
  // different evidence) before an interview-stage diagnosis is eligible.
  const hasSufficientInterviewEvidence = interviewOutcomeCount >= 3;

  // Application volume ALONE is never enough — it's a sample-size fact,
  // not evidence for any cause. Only channel-level data (which carries an
  // actual response comparison), real CV evidence, or known interview
  // outcomes count toward eligibility. (A bare applicationsTotal used to be
  // accepted here on its own — that was the exact bug: "diagnose from
  // application count alone" is explicitly forbidden.)
  const hasBaseEvidence = hasChannelData || hasCv || hasSufficientInterviewEvidence;
  if (!hasBaseEvidence) return false;

  // Hard block: raw interview/offer counts with fewer than 3 known specific
  // outcomes are never, on their own, enough to diagnose an interview-stage
  // bottleneck — regardless of what the model claims.
  const onlyRawInterviewSignal = state.interviews != null && state.interviews > 0 && !hasSufficientInterviewEvidence;
  if (onlyRawInterviewSignal && !hasChannelData && !hasCv) return false;

  // A diagnosis must be anchored to a hypothesis that has actually reached
  // "supported" or "confirmed" status under the evidence ladder above — not
  // merely asserted in the diagnosis object this turn, disconnected from
  // any tracked hypothesis.
  const hypotheses = Array.isArray(state.hypotheses) ? state.hypotheses : [];
  const qualifying = hypotheses.filter((h) => h.status === "supported" || h.status === "confirmed");
  if (qualifying.length === 0) return false;

  // "Primary bottleneck" requires that competing explanations were actually
  // investigated, not just that one hypothesis happened to look good in
  // isolation — require at least 2 tracked hypotheses so a single
  // unopposed idea can never become a diagnosis on its own.
  if (hypotheses.length < 2) return false;

  if (diagnosis?.bottleneck) {
    // Loose word-overlap check that the diagnosis is actually ABOUT one of
    // the qualifying hypotheses — exact semantic matching isn't possible
    // server-side, so this only catches a diagnosis that rides on a
    // completely unrelated hypothesis's earned confidence.
    const bottleneckWords = diagnosis.bottleneck.toLowerCase().match(/[a-z]{4,}/g) || [];
    const linked = qualifying.some((h) => {
      const labelWords = (h.label || "").toLowerCase().match(/[a-z]{4,}/g) || [];
      return labelWords.some((w) => bottleneckWords.includes(w));
    });
    if (!linked) return false;

    // CV/ATS-worded diagnoses specifically require having actually compared
    // the real CV against real job descriptions — never allowed just from
    // response counts or "same CV every time" alone.
    if (CV_RELATED_PATTERN.test(diagnosis.bottleneck) && !(hasCv && hasJobDescriptions)) return false;
  }

  return true;
}

// Backend, not the frontend, decides what feedback control (if any) renders.
// The model's own feedback_mode is a claim, not a fact — downgrade it
// whenever the server-verified state doesn't actually back it up.
function computeFeedbackMode(structured, state) {
  const claimed = structured.feedback_mode;

  if (claimed === "diagnosis") {
    const eligible = computeDiagnosisEligibility(state, structured.diagnosis) && !!structured.diagnosis?.bottleneck;
    if (eligible) return "diagnosis";
    // Not earned yet — fall through to "signal" if there's at least a real
    // insight/signal to show, otherwise "none".
    return structured.insight || structured.signal ? "signal" : "none";
  }

  if (claimed === "signal") {
    return structured.insight || structured.signal ? "signal" : "none";
  }

  return "none";
}

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (err) {
      console.error("[chat] body parse failed", err?.message);
      return NextResponse.json(
        { error: true, code: "INVALID_REQUEST", message: "Malformed request." },
        { status: 400 }
      );
    }

    const { messages, profile = {}, userId, action } = body;

    // Handle a direct reset request — does NOT run normal AI processing.
    if (action === "clear_search") {
      if (!userId) {
        return NextResponse.json(
          { error: true, code: "INVALID_REQUEST", message: "userId required to reset." },
          { status: 400 }
        );
      }
      try {
        await resetSearchState(userId);
        console.log("[chat] search state reset", { userId });
        return NextResponse.json({ success: true });
      } catch (err) {
        console.error("[chat] reset failed:", err?.message);
        return NextResponse.json(
          { error: true, code: "SERVER_ERROR", message: "Could not reset. Please try again." },
          { status: 500 }
        );
      }
    }

    // Traceable across all diagnostic logs for this one request — never
    // logs message content, prompt text, or API keys, just identifies which
    // log lines belong together when reading Vercel's function logs.
    const requestId = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);

    console.log("[chat] request start", {
      requestId,
      userId,
      messageCount: messages?.length,
      totalChars: messages?.reduce((sum, m) => sum + (m.content?.length || 0), 0),
    });

    if (!messages?.length) {
      return NextResponse.json(
        { error: true, code: "INVALID_REQUEST", message: "Messages required." },
        { status: 400 }
      );
    }

    const rawLatest = messages.filter(m => m.role === "user").slice(-1)[0]?.content || "";
    const latestMsg = rawLatest.trim().replace(/[<>&"']/g, "");

    if (!latestMsg) {
      return NextResponse.json(
        { error: true, code: "INVALID_REQUEST", message: "Invalid message." },
        { status: 400 }
      );
    }

    const language = detectLanguage(latestMsg);

    let searchState = null;
    let searchContext = "";
    // The phase in effect for THIS turn, frozen once at the top and used
    // consistently both to build the prompt and to gate the response at the
    // end — so the model is never told "understand" while the server then
    // lets a "signal"/"diagnosis" through anyway, or vice versa.
    let turnPhase = "understand";
    if (userId) {
      try {
        // ensureSearchState returns the state exactly as it was left after
        // the PREVIOUS turn (this turn hasn't written anything yet), so its
        // updatedAt is already the right "last seen" timestamp — no extra
        // read needed.
        searchState = await ensureSearchState(userId);

        // Explicit UNDERSTAND → INVESTIGATE transition. Checked against
        // whatever was persisted through the END of the previous turn — if
        // the case was already complete, this turn starts in INVESTIGATE
        // rather than wasting a turn still labeled UNDERSTAND.
        if ((searchState.phase || "understand") === "understand") {
          const completeness = computeCaseCompleteness(searchState);
          if (completeness.complete) {
            searchState = await updateSearchState(userId, { phase: "investigate" });
            logEvent(userId, "phase_transition", { to: "investigate" });
          }
        }
        turnPhase = searchState.phase || "understand";

        searchContext = buildSearchContext(searchState);

        // A simple, best-effort "did they come back" signal — a gap of 6+
        // hours since the last turn. Validation signal only, never blocks
        // the actual turn.
        const RETURN_GAP_MS = 6 * 60 * 60 * 1000;
        if (searchState.updatedAt && Date.now() - searchState.updatedAt > RETURN_GAP_MS) {
          logEvent(userId, "user_returned", { gapHours: Math.round((Date.now() - searchState.updatedAt) / 3600000) });
        }
      } catch (memErr) {
        console.error("[chat] search state load failed, continuing without it:", memErr?.message);
      }
    }

    console.log("[chat] search context chars:", searchContext.length);

    const systemPrompt = buildSystem(language, searchContext, profile?.name || "");
    console.log("[chat] system prompt chars:", systemPrompt.length);

    let rawReply;
    let usedFallback = false;
    let lastErrorCode = "SERVER_ERROR";

    try {
      const result = await getAiReply(systemPrompt, messages, { requestId, attempt: 1 });
      rawReply = result.rawReply;
      usedFallback = result.usedFallback;
    } catch (firstErr) {
      lastErrorCode = firstErr.code || "SERVER_ERROR";
      console.error("[chat] first attempt failed", { requestId, code: lastErrorCode, message: firstErr?.message });
      // SERVER_ERROR (a bare 5xx from either provider) is just as likely to
      // be transient as a rate limit or timeout — it was previously
      // excluded from the auto-retry, so a single hiccup from either
      // provider failed the whole turn with no retry at all.
      if (lastErrorCode === "RATE_LIMIT" || lastErrorCode === "PROVIDER_TIMEOUT" || lastErrorCode === "SERVER_ERROR") {
        console.log("[chat] transient error, retrying once after 2s", { requestId, code: lastErrorCode });
        await sleep(2000);
        try {
          const retryResult = await getAiReply(systemPrompt, messages, { requestId, attempt: 2 });
          rawReply = retryResult.rawReply;
          usedFallback = retryResult.usedFallback;
        } catch (secondErr) {
          lastErrorCode = secondErr.code || "SERVER_ERROR";
          console.error("[chat] retry also failed", { requestId, code: lastErrorCode, message: secondErr?.message });
        }
      }
    }

    if (!rawReply) {
      const messagesByCode = {
        RATE_LIMIT: "The AI service is temporarily busy. Please retry in a moment.",
        PROVIDER_TIMEOUT: "The AI service took too long to respond. Please retry.",
        INVALID_API_KEY: "There is a configuration problem with the AI service.",
        BAD_PROVIDER_RESPONSE: "The AI service gave an unexpected response. Please retry.",
        SERVER_ERROR: "The AI service had a problem. Please retry in a moment.",
      };
      console.error("[chat] request failed, returning error to client", { requestId, finalCode: lastErrorCode });
      return NextResponse.json(
        { error: true, code: lastErrorCode, message: messagesByCode[lastErrorCode] || messagesByCode.SERVER_ERROR, requestId },
        { status: lastErrorCode === "RATE_LIMIT" ? 429 : 503 }
      );
    }

    const parsed = parseJSON(rawReply);
    if (!parsed) {
      console.error("[chat] validation error: AI response was not valid JSON. Raw:", rawReply?.slice(0, 300));
      return NextResponse.json(
        { error: true, code: "BAD_PROVIDER_RESPONSE", message: "Could not understand the AI response. Please retry." },
        { status: 502 }
      );
    }

    let structured = sanitizeStructured(parsed);

    let verifiedStats = null;
    if (userId) {
      try {
        const updates = extractNonEmptyUpdates(structured.facts_update);
        if (Object.keys(updates).length > 0) {
          searchState = await updateSearchState(userId, updates);
          logEvent(userId, "evidence_provided", { fields: Object.keys(updates) });
        }

        verifiedStats = computeVerifiedStats(searchState);
        const sampleSize = computeSampleSize(searchState);
        if (verifiedStats) {
          verifiedStats.sampleSize = sampleSize;
        } else if (sampleSize) {
          verifiedStats = { sampleSize };
        }

        // Persist hypothesis tracking regardless of feedback_mode, so the
        // reasoning state actually accumulates across turns (this is the
        // "intelligence layer" — not just chat text).
        if (Array.isArray(structured.hypotheses) && structured.hypotheses.length > 0) {
          searchState = await updateSearchState(userId, { hypotheses: structured.hypotheses });
        }

        // Confidence shown to the user must track a SPECIFIC hypothesis,
        // never application volume — computed fresh from whatever is
        // actually persisted right now, not cached from an earlier turn.
        // During UNDERSTAND, hypotheses may exist internally (to pick the
        // next question) but must never be exposed — hard-hide the badge
        // regardless of what the model claims.
        structured = {
          ...structured,
          leadingHypothesis: turnPhase === "understand" ? null : leadingHypothesis(searchState.hypotheses),
        };

        // HARD UNDERSTAND-PHASE GATE: the UI renders `insight` (as "signal
        // found") and `recommended_action`/`ready_to_investigate_deeper`
        // independently of feedback_mode, so gating feedback_mode alone is
        // NOT sufficient to hide findings/interpretations during UNDERSTAND
        // — strip the content itself. `reply`, `uncertainty`, `next_question`
        // and `tip` are untouched: that's where the actual question and
        // factual summary live, which IS allowed during UNDERSTAND.
        if (turnPhase === "understand") {
          structured = {
            ...structured,
            insight: "",
            signal: "",
            recommended_action: "",
            ready_to_investigate_deeper: false,
          };
        }

        // Server-side gate — never trust the model's own feedback_mode or
        // diagnosis claim blindly. This can only ever downgrade, never upgrade.
        // While turnPhase is "understand", feedback_mode is hard-forced to
        // "none" no matter what the model claims or what the evidence gate
        // would otherwise allow — the case isn't understood yet, so nothing
        // gets presented as a finding, signal, or diagnosis.
        const evidenceFeedbackMode = computeFeedbackMode(structured, searchState);
        const finalFeedbackMode = turnPhase === "understand" ? "none" : evidenceFeedbackMode;
        if (finalFeedbackMode !== structured.feedback_mode) {
          console.log("[chat] feedback_mode downgraded", {
            userId, claimed: structured.feedback_mode, final: finalFeedbackMode,
            reason: turnPhase === "understand" ? "still in UNDERSTAND phase" : "insufficient server-verified evidence",
          });
        }
        structured = { ...structured, feedback_mode: finalFeedbackMode };
        if (finalFeedbackMode === "signal") {
          logEvent(userId, "useful_finding_produced", { insight: (structured.insight || structured.signal || "").slice(0, 160) });
        }

        if (finalFeedbackMode === "diagnosis" && structured.diagnosis?.bottleneck) {
          // Only an earned diagnosis is persisted as "the" diagnosis — this is
          // what future turns see as "previously earned diagnosis" and are
          // explicitly told they may revise or retract.
          searchState = await updateSearchState(userId, { diagnosis: structured.diagnosis });
          logEvent(userId, "investigation_completed", { bottleneck: structured.diagnosis.bottleneck });
        } else {
          // Never let an unearned diagnosis object reach the client.
          structured = { ...structured, diagnosis: { bottleneck: "", confidence: "low", reasoning: [] } };
        }

        if (structured.insight) {
          await addSearchFact(userId, structured.insight);
        }

        if (structured.recommended_action) {
          await setActiveSearchTask(userId, structured.recommended_action);
        }
      } catch (err) {
        console.error("[chat] search state update failed (non-fatal):", err?.message);
      }
    } else {
      // No userId at all means no persisted evidence to verify against —
      // never allow signal/diagnosis feedback modes without a verifiable state.
      structured = {
        ...structured,
        feedback_mode: "none",
        diagnosis: { bottleneck: "", confidence: "low", reasoning: [] },
        leadingHypothesis: null,
      };
    }

    return NextResponse.json({
      structured,
      verified_stats: verifiedStats,
      language,
      engine: usedFallback ? "groq" : "gemini",
    });
  } catch (error) {
    console.error("[chat] full error:", error);
    console.error("[chat] stack:", error instanceof Error ? error.stack : "No stack");
    return NextResponse.json(
      { error: true, code: "SERVER_ERROR", message: error.message || "Server error." },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: "LifePath running — job search conversion intelligence" });
}

