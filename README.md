<div align="center">

# 🧭 LifePath AI

**An AI job-search coach for Indian job seekers.**
It works out *why* your search isn't getting results, checks your CV against the jobs you apply to, and flags suspicious job offers. It asks before it advises, and it never sounds more certain than the evidence allows.

Next.js 14 · Firebase · Gemini + Groq · Vercel

</div>

---

## Table of contents

1. [The problem](#the-problem)
2. [What LifePath does](#what-lifepath-does)
3. [How a conversation works](#how-a-conversation-works)
4. [Safeguards](#safeguards)
5. [What it does not do](#what-it-does-not-do)
6. [Architecture](#architecture)
7. [Project structure](#project-structure)
8. [Getting started](#getting-started)
9. [Environment variables](#environment-variables)
10. [Testing](#testing)
11. [Deploying](#deploying)
12. [Privacy and security](#privacy-and-security)
13. [Known limitations](#known-limitations)

---

## The problem

Many Indian job seekers send dozens or hundreds of applications and hear nothing, with no idea why. Generic AI chat gives generic advice ("improve your CV, network more") and often sounds sure about things it cannot know. At the same time, fake job offers that ask for fees, OTPs or bank details are common, and many people struggle to tell real recruiters from scammers.

LifePath is built around one idea: **diagnose before you advise.** It learns your situation, tests possible explanations one at a time, and tells you plainly what it knows, what it doesn't, and what to do next.

## What LifePath does

| Feature | What you get |
| --- | --- |
| **Job-search diagnosis** | It first understands your target role, location, experience level and results so far (applications, replies, interviews). Only then does it test explanations for a stalled search, one step at a time. |
| **CV and job-description comparison** | Attach up to 3 files (PDF or TXT), each marked as "CV" or "Job post", or paste the text. It compares the two using only what is written in them. |
| **Natural conversation** | Plain replies in your language and tone, not a form or a fixed script. |
| **Case continuity** | It remembers your case across turns, so it doesn't re-ask what you already answered. |
| **Seven job-offer warning signs** | Suspicious fees; requests for OTPs, passwords or bank details; suspicious links; recruiters who can't be verified; address mismatches; unusual interview arrangements; questionable job listings. Wording is neutral and based only on what you reported. |
| **Feedback** | You can flag a reply and say what was wrong, so problems can be reviewed. |

## How a conversation works

LifePath moves through two phases. The server enforces them, not just the prompt.

### 1. Understand

The AI gathers facts and gives no verdict. Four things are needed before the investigation can start: **target role, location, experience level, and at least one outcome** (such as replies, views or interviews). Until then it may say what the facts do and don't show, but it does not name causes or give a diagnosis.

### 2. Investigate

You tap **begin investigation** once the case is complete. LifePath then follows a chain: **fact → signal → hypothesis → evidence → action**.

- Hypotheses are tracked privately and can move up **only one step per turn**. A new idea starts at "investigating" and needs your later answers to climb to "supported".
- A diagnosis needs a supported hypothesis, at least one competing explanation that was actually examined, and the required evidence from your own messages.
- It never gives a diagnosis on the same turn you tap the button.

### Every answer leaves you knowing three things

1. **What is known** so far.
2. **What is still unclear**, including other plausible explanations the evidence can't tell apart.
3. **What happens next**: one small, specific action, plus **how to check whether it worked** (what to track and when to reassess).

If the evidence is not enough, you get an interim answer and the single most useful next question, not a made-up diagnosis. When you bring new information or report trying a step, it updates its view and continues, and says so if the evidence changes its conclusion.

## Safeguards

- **Evidence ladder.** The model's claimed confidence is only a proposal. Code caps it, and the model can't mark a hypothesis "confirmed" or "high confidence" by itself.
- **Quote verification.** Facts it extracts must come with a quote that really appears in your own messages. Quotes are matched on whole words, and CV/job-comparison quotes need at least 8 characters.
- **Sentence-level repair.** Unsupported claims (invented recruiter behaviour, ATS guesses, market statistics, made-up CV details) are removed sentence by sentence. A useful reply is never silently deleted as a whole.
- **No repeated questions.** A question is dropped if the fact is already known, the topic is closed, or the same question was asked earlier, even when the model forgets to label its topic.
- **Documents only if readable.** It may use CV or job-post content only when the text is actually in the conversation. If it can't see the text, it says so and asks you to paste it.
- **Neutral warnings.** Job-offer warnings describe signs, not verdicts. LifePath can't look up companies or recruiters, and it says so.
- **Request limits.** Request validation plus a best-effort rate limit per user and per network address.

## What it does not do

LifePath is not a general chatbot. It does not give financial, side-hustle or business advice. It does not issue ghost-job verdicts, investigate crimes or handle emergencies, and it cannot confirm that a company or recruiter is genuine.

## Architecture

```
Browser (app/page.js)
  chat UI · file reading (pdf.js) · session state
        │  POST /api/chat  (messages + optional Firebase sign-in token)
        ▼
app/api/chat/route.js
  1. validate request, check rate limit           lib/requestGuards.js, lib/auth.js
  2. load case state and decide the phase         lib/userMemory.js, lib/caseLedger.js
  3. build the prompt for that phase              lib/prompts.js
  4. call the AI (Gemini, falling back to Groq)
  5. gate the output:                             lib/evidenceGate.js
       evidence ladder · quote checks · question gate ·
       sentence repair · warning-sign check       lib/caseLedger.js, lib/warningSigns.js
  6. save facts, hypotheses and the next step     lib/userMemory.js
        │
        ▼
Structured reply → insight, signal, uncertainty, hypotheses, diagnosis,
                   next step, how to check it worked, warning signs
```

The AI returns structured JSON. The server treats that JSON as a *proposal* and checks it against your actual messages before showing anything.

## Project structure

```
app/
  page.js                 Chat UI and reply cards
  api/chat/route.js       Chat API: phases, gating, persistence
  admin/feedback/page.js  Feedback review page (see Privacy and security)
  privacy/  terms/        Legal pages
lib/
  prompts.js              System prompts and the reply schema
  caseLedger.js           Pure logic: question gate, quote checks, sentence repair
  evidenceGate.js         Pure logic: hypothesis status and confidence limits
  requestGuards.js        Request validation and rate limiter
  warningSigns.js         The seven job-offer warning signs
  userMemory.js           Per-user case memory in Firestore
  auth.js                 Server-side identity (Firebase sign-in token)
  firebase.js  user.js  profile.js  taskManager.js
tests/                    Test files and the test runner
docs/firestore-security.md  What to check before going public
```

## Getting started

**Requirements:** Node.js 18 or newer, a Firebase project with Firestore, and an API key for Gemini and/or Groq.

```bash
git clone <your-repo-url>
cd lifepath-ai
npm install
cp .env.example .env.local   # then fill in your keys (see the table below)
npm run dev                  # http://localhost:3000
```

## Environment variables

Set these in `.env.local` locally and in your Vercel project settings for deployment.

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes (or Groq) | Main AI provider |
| `GEMINI_MODEL` | Optional | Which Gemini model to use |
| `GROQ_API_KEY` | Recommended | Fallback AI provider if Gemini fails |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Yes | Firebase web config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Yes | Firebase web config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Yes | Firebase web config |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Yes | Firebase web config |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Yes | Firebase web config |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Yes | Firebase web config |
| `FIREBASE_WEB_API_KEY` | For sign-in checks | Lets the server verify a user's sign-in token |
| `LIFEPATH_REQUIRE_AUTH` | Optional | Set to `true` to reject requests without a valid sign-in token |
| `LIFEPATH_RATE_LIMIT` | Optional | Requests per minute per user (default 20; the per-address limit is 3× this) |
| `CHAT_TEMPERATURE` | Optional | Model temperature |

## Testing

```bash
npm test
```

The checks cover the evidence rules (no self-awarded confidence, one step per turn), quote matching, the question gate, duplicate hypotheses, request validation, the rate limiter, and the sentence guards. They run automatically on GitHub through `.github/workflows/main.yml`.

When you find a bug, **add a test that fails first, then fix it.** That is how we stop the same bug from coming back after a deploy.

## Deploying

1. Push to a **separate branch** and open a Vercel preview deployment. Don't deploy straight to production.
2. On the preview, test the main flow:
   - Give a role, location, experience and an outcome, then tap begin investigation.
   - Attach a CV and a job post, ask a follow-up, and check it still knows the files and doesn't repeat a question.
   - Check that no diagnosis appears the moment you tap the button.
3. Before sharing the app publicly, complete the checks in `docs/firestore-security.md` and turn on `LIFEPATH_REQUIRE_AUTH`.
4. Merge to your production branch once the preview behaves.

## Privacy and security

- CV and job-post text is used for the current session and is **not saved** to the database.
- Facts and hypotheses about your search are stored per user in Firestore.
- **Feedback review page.** `app/admin/feedback/page.js` reads the feedback collection from the browser without a login. Check your Firestore rules (Firebase console > Firestore > Rules) so feedback isn't publicly readable, and read `docs/firestore-security.md`.
- **Per-user privacy.** The server currently reaches Firestore through the browser SDK, so database rules can't tell users apart. Until the server moves to the Firebase Admin SDK, treat stored case data as not fully private.
- Never commit API keys. Keep `.env.local` out of git.

## Known limitations

- It can't look up companies, recruiters or websites, so warning signs are based only on what you tell it.
- Scanned PDFs without selectable text can't be read. Paste the text instead.
- Only the first 8 pages of a PDF are read, and long documents are shortened to fit.
- The rate limiter is per server instance, so it slows runaway requests but isn't a hard cap.
- Answers come from an AI model and can still be wrong. Treat them as guidance, not advice you must follow.
