"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { getUserId } from "../lib/user";

const STORAGE_KEY = "lifepath_v1_session";
const MAX_MESSAGES = 40;

const EMPTY_SESSION = {
  messages: [],
  profile: {
    name: "",
    education: "",
    experience: "",
    skills: "",
    location: "",
    role: "",
    status: "",
  },
  pillarId: "jobs",
  started: false,
};

const QUICK_STARTS = [
  "I've applied to 200 jobs and nobody is responding",
  "I need a job but I don't know what role to target",
  "I have a CV but I'm not getting interviews",
  "I need to increase my income",
];

const PILLARS = {
  jobs: { label: "Job search", icon: "↗" },
  cv: { label: "CV / resume", icon: "▤" },
  career: { label: "Career direction", icon: "◇" },
  wealth: { label: "Money", icon: "₹" },
  hustle: { label: "Side income", icon: "＋" },
  startup: { label: "Startup", icon: "◎" },
};

function safeRead() {
  if (typeof window === "undefined") return EMPTY_SESSION;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) return EMPTY_SESSION;

    const parsed = JSON.parse(raw);

    return {
      ...EMPTY_SESSION,
      ...parsed,
      profile: {
        ...EMPTY_SESSION.profile,
        ...(parsed.profile || {}),
      },
      messages: Array.isArray(parsed.messages)
        ? parsed.messages.slice(-MAX_MESSAGES)
        : [],
    };
  } catch {
    return EMPTY_SESSION;
  }
}

function safeWrite(session) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(session)
    );
  } catch {}
}

function detectPillar(text) {
  const value = text.toLowerCase();

  if (
    /\b(cv|resume|curriculum vitae|ats|keywords in my resume)\b/.test(
      value
    )
  ) {
    return "cv";
  }

  if (
    /\b(startup|business idea|validate my idea|customers for my idea|mvp)\b/.test(
      value
    )
  ) {
    return "startup";
  }

  if (
    /\b(side hustle|side income|extra income|freelanc|earn extra|make money online)\b/.test(
      value
    )
  ) {
    return "hustle";
  }

  if (
    /\b(save money|saving|savings|budget|debt|invest|investment|sip|money problem|income problem)\b/.test(
      value
    )
  ) {
    return "wealth";
  }

  if (
    /\b(job|jobs|job search|job hunt|jobless|unemployed|application|applications|applied|interview|callback|career opening|looking for work|find work)\b/.test(
      value
    )
  ) {
    return "jobs";
  }

  return "career";
}

function mergeKnownProfile(profile, result) {
  const next = { ...profile };

  if (result?.role_value) {
    next.role = result.role_value;
  }

  if (result?.location_value) {
    next.location = result.location_value;
  }

  if (result?.status_value) {
    next.status = result.status_value;
  }

  return next;
}

function formatStructured(structured) {
  if (!structured) return "";

  if (structured.needs_more_info) {
    return (
      structured.follow_up_question ||
      structured.summary ||
      "Tell me a little more so I can understand the problem."
    );
  }

  const parts = [];

  if (structured.summary) {
    parts.push(structured.summary);
  }

  if (structured.insight) {
    parts.push(
      `**What I found**\n${structured.insight}`
    );
  }

  if (structured.task) {
    parts.push(
      `**Next step**\n${structured.task}`
    );
  }

  if (structured.how_to_do) {
    parts.push(structured.how_to_do);
  }

  if (structured.what_to_do) {
    parts.push(structured.what_to_do);
  }

  if (structured.where_to_do) {
    parts.push(structured.where_to_do);
  }

  if (structured.success) {
    parts.push(
      `**You'll know it worked when:** ${structured.success}`
    );
  }

  if (structured.why_this_task) {
    parts.push(
      `**Why this matters:** ${structured.why_this_task}`
    );
  }

  if (structured.motivation) {
    parts.push(structured.motivation);
  }

  if (structured.next_step) {
    parts.push(structured.next_step);
  }

  if (structured.task_link) {
    parts.push(
      `[${structured.task_link_label || "Open this"}](${structured.task_link})`
    );
  }

  return parts.join("\n\n");
}

function renderInlineMarkdown(text) {
  if (!text) return null;

  const lines = text.split("\n");

  return lines.map((line, index) => {
    const trimmed = line.trim();

    const isBullet =
      /^([→•\-])\s/.test(trimmed);

    const content = isBullet
      ? trimmed.replace(/^([→•\-])\s/, "")
      : trimmed;

    const pieces = content.split(
      /(\*\*[^*]+\*\*)/g
    );

    return (
      <div
        key={`${index}-${line}`}
        className={
          isBullet
            ? "lp-bullet"
            : "lp-line"
        }
      >
        {isBullet && (
          <span className="lp-bullet-dot">
            •
          </span>
        )}

        <span>
          {pieces.map((piece, i) => {
            if (
              piece.startsWith("**") &&
              piece.endsWith("**")
            ) {
              return (
                <strong key={i}>
                  {piece.slice(2, -2)}
                </strong>
              );
            }

            return piece;
          })}
        </span>
      </div>
    );
  });
}

function Message({ message }) {
  const isUser =
    message.role === "user";

  return (
    <div
      className={`lp-message-row ${
        isUser ? "user" : "assistant"
      }`}
    >
      {!isUser && (
        <div className="lp-avatar small">
          L
        </div>
      )}

      <div
        className={`lp-message ${
          isUser
            ? "user"
            : "assistant"
        }`}
      >
        {renderInlineMarkdown(
          message.content
        )}

        {message.link && (
          <a
            className="lp-action-link"
            href={message.link}
            target="_blank"
            rel="noreferrer"
          >
            {message.linkLabel ||
              "Open"}{" "}
            ↗
          </a>
        )}
      </div>
    </div>
  );
}

function InsightCard({ structured }) {
  if (
    !structured ||
    structured.needs_more_info ||
    !structured.insight
  ) {
    return null;
  }

  return (
    <div className="lp-insight-card">
      <div className="lp-insight-kicker">
        SIGNAL
      </div>

      <div className="lp-insight-text">
        {renderInlineMarkdown(
          structured.insight
        )}
      </div>
    </div>
  );
}

function TaskCard({ structured }) {
  if (
    !structured ||
    structured.needs_more_info ||
    !structured.task
  ) {
    return null;
  }

  return (
    <div className="lp-task-card">
      <div className="lp-task-top">
        <span className="lp-task-kicker">
          ONE NEXT STEP
        </span>

        <span className="lp-task-dot" />
      </div>

      <h3>{structured.task}</h3>

      {structured.why_this_task && (
        <p className="lp-muted">
          {structured.why_this_task}
        </p>
      )}

      {structured.how_to_do && (
        <div className="lp-task-section">
          <span>HOW</span>
          {renderInlineMarkdown(
            structured.how_to_do
          )}
        </div>
      )}

      {structured.what_to_do && (
        <div className="lp-task-section">
          <span>DO</span>
          {renderInlineMarkdown(
            structured.what_to_do
          )}
        </div>
      )}

      {structured.where_to_do && (
        <div className="lp-task-section">
          <span>WHERE</span>
          {renderInlineMarkdown(
            structured.where_to_do
          )}
        </div>
      )}

      {structured.success && (
        <div className="lp-success">
          <b>
            Success looks like:
          </b>{" "}
          {structured.success}
        </div>
      )}

      {structured.task_link && (
        <a
          className="lp-primary-link"
          href={structured.task_link}
          target="_blank"
          rel="noreferrer"
        >
          {structured.task_link_label ||
            "Open"}{" "}
          ↗
        </a>
      )}
    </div>
  );
}

export default function Home() {
  const [session, setSession] =
    useState(EMPTY_SESSION);

  const [input, setInput] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [started, setStarted] =
    useState(false);

  const [lastStructured, setLastStructured] =
    useState(null);

  const [feedback, setFeedback] =
    useState(null);

  const [showReset, setShowReset] =
    useState(false);

  const inputRef =
    useRef(null);

  const bottomRef =
    useRef(null);

  useEffect(() => {
    const restored = safeRead();

    setSession(restored);

    setStarted(
      Boolean(
        restored.started ||
          restored.messages.length
      )
    );
  }, []);

  useEffect(() => {
    if (started) {
      safeWrite({
        ...session,
        started: true,
      });
    }
  }, [session, started]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [
    session.messages,
    loading,
  ]);

  const currentPillar = useMemo(
    () =>
      PILLARS[
        session.pillarId
      ] || PILLARS.jobs,
    [session.pillarId]
  );

  const sendMessage =
    useCallback(
      async (rawText) => {
        const text =
          rawText.trim();

        if (!text || loading) {
          return;
        }

        const pillarId =
          session.messages.length === 0
            ? detectPillar(text)
            : session.pillarId;

        const userMessage = {
          role: "user",
          content: text,
          id: `u_${Date.now()}`,
        };

        const messages = [
          ...session.messages,
          userMessage,
        ].slice(-MAX_MESSAGES);

        const nextSession = {
          ...session,
          messages,
          pillarId,
          started: true,
        };

        setSession(nextSession);
        setStarted(true);
        setInput("");
        setLoading(true);
        setFeedback(null);

        try {
          const userId =
            getUserId();

          const response =
            await fetch(
              "/api/chat",
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body: JSON.stringify({
                  messages:
                    messages.map(
                      ({
                        role,
                        content,
                      }) => ({
                        role,
                        content,
                      })
                    ),
                  pillarId,
                  profile:
                    nextSession.profile,
                  userId,
                }),
              }
            );

          const data =
            await response.json();

          if (
            !response.ok ||
            data.error
          ) {
            throw new Error(
              data.message ||
                "Something went wrong."
            );
          }

          const structured =
            data.structured ||
            null;

          const content =
            formatStructured(
              structured
            ) ||
            "I understood that. Tell me a little more about what happened.";

          const assistantMessage = {
            role: "assistant",
            content,
            link:
              structured?.task_link ||
              "",
            linkLabel:
              structured?.task_link_label ||
              "",
            id: `a_${Date.now()}`,
          };

          const updatedProfile =
            mergeKnownProfile(
              nextSession.profile,
              data
            );

          setSession(
            (current) => ({
              ...current,
              profile:
                updatedProfile,
              messages: [
                ...current.messages,
                assistantMessage,
              ].slice(
                -MAX_MESSAGES
              ),
            })
          );

          setLastStructured(
            structured
          );
        } catch (error) {
          const assistantMessage = {
            role: "assistant",
            content: `I couldn't complete that request right now. ${
              error.message ||
              "Please try again."
            }`,
            id: `e_${Date.now()}`,
          };

          setSession(
            (current) => ({
              ...current,
              messages: [
                ...current.messages,
                assistantMessage,
              ].slice(
                -MAX_MESSAGES
              ),
            })
          );
        } finally {
          setLoading(false);

          setTimeout(
            () =>
              inputRef.current?.focus(),
            50
          );
        }
      },
      [loading, session]
    );

  const submit = (event) => {
    event.preventDefault();

    sendMessage(input);
  };

  const startWith = (text) => {
    setInput(text);
    setStarted(true);

    setTimeout(
      () =>
        inputRef.current?.focus(),
      0
    );
  };

  const reset = () => {
    try {
      window.localStorage.removeItem(
        STORAGE_KEY
      );
    } catch {}

    setSession(
      EMPTY_SESSION
    );

    setStarted(false);
    setInput("");
    setLastStructured(null);
    setShowReset(false);
  };

  const submitFeedback =
    async (rating) => {
      setFeedback(rating);

      try {
        await addDoc(
          collection(
            db,
            "feedback"
          ),
          {
            userId:
              getUserId(),
            product:
              "lifepath_v1",
            pillar:
              session.pillarId,
            rating,
            timestamp:
              serverTimestamp(),
          }
        );
      } catch {}
    };

  return (
    <main className="lp-shell">
      <style jsx global>{`
        :root {
          color-scheme: dark;
        }

        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          min-height: 100%;
          background: #070a0f;
        }

        body {
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;

          color: #f4f6f8;
        }

        button,
        textarea {
          font: inherit;
        }

        a {
          color: inherit;
        }

        .lp-shell {
          min-height: 100vh;

          background:
            radial-gradient(
              circle at 50% -20%,
              #17202c 0,
              #070a0f 42%,
              #05070a 100%
            );
        }

        .lp-wrap {
          width: min(920px, 100%);
          margin: 0 auto;
          padding: 0 20px;
        }

        .lp-nav {
          height: 72px;

          display: flex;
          align-items: center;
          justify-content: space-between;

          border-bottom:
            1px solid
            rgba(255, 255, 255, 0.07);
        }

        .lp-brand {
          display: flex;
          align-items: center;
          gap: 10px;

          font-weight: 650;
          letter-spacing: -0.02em;
        }

        .lp-mark {
          width: 31px;
          height: 31px;

          border:
            1px solid
            rgba(255, 255, 255, 0.18);

          border-radius: 9px;

          display: grid;
          place-items: center;

          font-size: 14px;

          background:
            rgba(255, 255, 255, 0.04);
        }

        .lp-nav-right {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .lp-status {
          font-size: 12px;
          color: #8f9aa8;

          padding: 7px 10px;

          border:
            1px solid
            rgba(255, 255, 255, 0.08);

          border-radius: 999px;
        }

        .lp-reset {
          background: transparent;
          border: 0;

          color: #778291;

          cursor: pointer;

          font-size: 12px;
        }

        .lp-hero {
          padding: 82px 0 44px;
          text-align: center;
        }

        .lp-eyebrow {
          color: #aab4c0;

          font-size: 12px;

          letter-spacing: 0.16em;
          text-transform: uppercase;

          margin-bottom: 17px;
        }

        .lp-hero h1 {
          margin: 0 auto;

          max-width: 700px;

          font-size:
            clamp(36px, 7vw, 62px);

          line-height: 0.98;

          letter-spacing: -0.055em;

          font-weight: 650;
        }

        .lp-hero p {
          margin: 22px auto 0;

          max-width: 610px;

          color: #98a2af;

          font-size: 17px;

          line-height: 1.6;
        }

        .lp-start-box {
          margin: 38px auto 0;

          max-width: 760px;

          text-align: left;
        }

        .lp-composer {
          border:
            1px solid
            rgba(255, 255, 255, 0.12);

          background:
            rgba(13, 17, 23, 0.82);

          border-radius: 20px;

          padding: 13px;

          box-shadow:
            0 20px 70px
            rgba(0, 0, 0, 0.25);
        }

        .lp-composer textarea {
          width: 100%;

          min-height: 110px;

          resize: vertical;

          border: 0;
          outline: 0;

          background: transparent;

          color: #f5f7fa;

          padding: 8px 10px;

          line-height: 1.55;

          font-size: 16px;
        }

        .lp-composer textarea::placeholder {
          color: #5f6977;
        }

        .lp-compose-bottom {
          display: flex;

          justify-content: space-between;

          align-items: center;

          gap: 12px;

          padding:
            6px 4px 0 10px;
        }

        .lp-compose-hint {
          font-size: 12px;
          color: #697482;
        }

        .lp-send {
          border: 0;

          background: #f2f4f6;
          color: #080b10;

          padding: 10px 16px;

          border-radius: 11px;

          font-weight: 650;

          cursor: pointer;
        }

        .lp-send:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .lp-examples {
          display: flex;

          flex-wrap: wrap;

          gap: 8px;

          margin-top: 13px;

          justify-content: center;
        }

        .lp-example {
          border:
            1px solid
            rgba(255, 255, 255, 0.08);

          background:
            rgba(255, 255, 255, 0.025);

          color: #9aa5b2;

          border-radius: 999px;

          padding: 9px 12px;

          font-size: 12px;

          cursor: pointer;
        }

        .lp-example:hover {
          border-color:
            rgba(255, 255, 255, 0.18);

          color: #dce1e6;
        }

        .lp-principles {
          margin:
            56px 0 80px;

          display: grid;

          grid-template-columns:
            repeat(3, 1fr);

          gap: 1px;

          border:
            1px solid
            rgba(255, 255, 255, 0.07);

          border-radius: 17px;

          overflow: hidden;

          background:
            rgba(255, 255, 255, 0.07);
        }

        .lp-principle {
          background:
            rgba(10, 13, 18, 0.9);

          padding: 22px;
        }

        .lp-principle b {
          display: block;

          font-size: 14px;

          margin-bottom: 8px;
        }

        .lp-principle span {
          color: #778290;

          font-size: 13px;

          line-height: 1.5;
        }

        .lp-chat {
          padding: 25px 0 40px;
        }

        .lp-chat-head {
          display: flex;

          justify-content:
            space-between;

          align-items: center;

          gap: 12px;

          padding:
            8px 0 20px;
        }

        .lp-context {
          display: flex;

          align-items: center;

          gap: 9px;

          color: #a8b1bd;

          font-size: 13px;
        }

        .lp-context-icon {
          width: 28px;
          height: 28px;

          display: grid;
          place-items: center;

          border:
            1px solid
            rgba(255, 255, 255, 0.1);

          border-radius: 8px;

          color: #d9dee4;
        }

        .lp-chat-note {
          color: #65707e;

          font-size: 12px;
        }

        .lp-messages {
          display: flex;

          flex-direction: column;

          gap: 18px;

          min-height: 250px;
        }

        .lp-message-row {
          display: flex;

          gap: 9px;

          align-items:
            flex-start;
        }

        .lp-message-row.user {
          justify-content:
            flex-end;
        }

        .lp-avatar {
          width: 34px;
          height: 34px;

          flex:
            0 0 34px;

          display: grid;
          place-items: center;

          border:
            1px solid
            rgba(255, 255, 255, 0.1);

          border-radius: 10px;

          color: #dce1e6;

          background:
            rgba(255, 255, 255, 0.035);

          font-size: 12px;

          font-weight: 700;
        }

        .lp-avatar.small {
          width: 28px;
          height: 28px;

          flex-basis: 28px;

          border-radius: 8px;
        }

        .lp-message {
          max-width: 78%;

          padding:
            13px 15px;

          border-radius: 15px;

          line-height: 1.58;

          font-size: 14px;
        }

        .lp-message.assistant {
          background:
            rgba(255, 255, 255, 0.035);

          border:
            1px solid
            rgba(255, 255, 255, 0.065);
        }

        .lp-message.user {
          background: #eef1f4;

          color: #0a0d11;
        }

        .lp-line {
          min-height: 1.45em;
        }

        .lp-bullet {
          display: flex;
          gap: 8px;
        }

        .lp-bullet-dot {
          color: #9ba6b2;
        }

        .lp-action-link {
          display: inline-block;

          margin-top: 12px;

          color: inherit;

          font-weight: 650;

          text-decoration: none;

          border-bottom:
            1px solid
            currentColor;
        }

        .lp-insight-card,
        .lp-task-card {
          margin:
            20px 0 0 37px;

          border:
            1px solid
            rgba(255, 255, 255, 0.08);

          background:
            rgba(255, 255, 255, 0.025);

          border-radius: 16px;

          padding: 18px;
        }

        .lp-insight-kicker,
        .lp-task-kicker {
          font-size: 10px;

          letter-spacing: 0.16em;

          color: #7d8997;

          font-weight: 700;
        }

        .lp-insight-text {
          margin-top: 9px;

          color: #d6dce2;

          font-size: 13px;

          line-height: 1.55;
        }

        .lp-task-top {
          display: flex;

          justify-content:
            space-between;

          align-items: center;
        }

        .lp-task-dot {
          width: 7px;
          height: 7px;

          border-radius: 50%;

          background: #b9c3ce;
        }

        .lp-task-card h3 {
          margin:
            10px 0 7px;

          font-size: 17px;

          line-height: 1.35;

          letter-spacing: -0.02em;
        }

        .lp-muted {
          color: #7e8996;

          font-size: 13px;

          line-height: 1.5;

          margin: 0;
        }

        .lp-task-section {
          margin-top: 15px;

          padding-top: 13px;

          border-top:
            1px solid
            rgba(255, 255, 255, 0.06);

          color: #b8c1cb;

          font-size: 13px;
        }

        .lp-task-section > span {
          display: block;

          color: #687482;

          font-size: 10px;

          letter-spacing: 0.12em;

          font-weight: 700;

          margin-bottom: 5px;
        }

        .lp-success {
          margin-top: 15px;

          padding: 11px 12px;

          background:
            rgba(255, 255, 255, 0.035);

          border-radius: 10px;

          color: #aeb8c3;

          font-size: 12px;

          line-height: 1.5;
        }

        .lp-primary-link {
          display: inline-block;

          margin-top: 15px;

          background: #eef1f4;

          color: #090c10;

          text-decoration: none;

          padding: 9px 12px;

          border-radius: 9px;

          font-size: 12px;

          font-weight: 650;
        }

        .lp-chat-composer {
          position: sticky;

          bottom: 0;

          padding:
            15px 0 8px;

          background:
            linear-gradient(
              180deg,
              rgba(7, 10, 15, 0),
              #070a0f 20%
            );
        }

        .lp-feedback {
          display: flex;

          align-items: center;

          justify-content: center;

          gap: 10px;

          margin:
            17px 0 0;

          color: #697482;

          font-size: 11px;
        }

        .lp-feedback button {
          background: transparent;

          border:
            1px solid
            rgba(255, 255, 255, 0.07);

          color: #8a95a2;

          border-radius: 8px;

          padding: 5px 8px;

          cursor: pointer;
        }

        .lp-loading {
          display: flex;

          gap: 5px;

          align-items: center;

          color: #707b88;

          font-size: 12px;
        }

        .lp-loading i {
          width: 5px;
          height: 5px;

          border-radius: 50%;

          background: #aab4bf;

          animation:
            lpPulse
            1s
            infinite
            ease-in-out;
        }

        .lp-loading i:nth-child(2) {
          animation-delay: 0.15s;
        }

        .lp-loading i:nth-child(3) {
          animation-delay: 0.3s;
        }

        @keyframes lpPulse {
          0%,
          100% {
            opacity: 0.25;
            transform:
              translateY(0);
          }

          50% {
            opacity: 1;
            transform:
              translateY(-2px);
          }
        }

        .lp-footer {
          border-top:
            1px solid
            rgba(255, 255, 255, 0.06);

          padding:
            25px 0 45px;

          color: #56606d;

          font-size: 11px;

          text-align: center;
        }

        .lp-confirm {
          position: fixed;

          inset: 0;

          display: grid;

          place-items: center;

          padding: 20px;

          background:
            rgba(0, 0, 0, 0.62);

          z-index: 10;
        }

        .lp-confirm-box {
          width:
            min(390px, 100%);

          border:
            1px solid
            rgba(255, 255, 255, 0.12);

          background: #0c1016;

          border-radius: 17px;

          padding: 20px;
        }

        .lp-confirm-box h3 {
          margin:
            0 0 8px;
        }

        .lp-confirm-box p {
          color: #87919e;

          font-size: 13px;

          line-height: 1.5;
        }

        .lp-confirm-actions {
          display: flex;

          justify-content:
            flex-end;

          gap: 8px;

          margin-top: 17px;
        }

        .lp-confirm-actions button {
          border:
            1px solid
            rgba(255, 255, 255, 0.1);

          background: transparent;

          color: #ccd2d8;

          border-radius: 9px;

          padding: 8px 12px;

          cursor: pointer;
        }

        .lp-confirm-actions .danger {
          background: #f0f2f4;

          color: #080b0f;
        }

        @media (max-width: 680px) {
          .lp-wrap {
            padding:
              0 14px;
          }

          .lp-nav {
            height: 62px;
          }

          .lp-hero {
            padding:
              58px 0 32px;
          }

          .lp-hero p {
            font-size: 15px;
          }

          .lp-principles {
            grid-template-columns:
              1fr;
          }

          .lp-principle {
            padding: 17px;
          }

          .lp-message {
            max-width: 88%;
          }

          .lp-insight-card,
          .lp-task-card {
            margin-left: 0;
          }

          .lp-status {
            display: none;
          }
        }
      `}</style>

      <div className="lp-wrap">
        <header className="lp-nav">
          <div className="lp-brand">
            <span className="lp-mark">
              L
            </span>

            <span>
              LifePath
            </span>
          </div>

          <div className="lp-nav-right">
            {started && (
              <span className="lp-status">
                {currentPillar.icon}{" "}
                {currentPillar.label}
              </span>
            )}

            {started && (
              <button
                className="lp-reset"
                onClick={() =>
                  setShowReset(true)
                }
              >
                Start over
              </button>
            )}
          </div>
        </header>

        {!started ? (
          <>
            <section className="lp-hero">
              <div className="lp-eyebrow">
                Figure out what actually
                matters next
              </div>

              <h1>
                Don't know what to
                do next?
                <br />
                Start with the problem.
              </h1>

              <p>
                Tell LifePath what's
                actually happening.
                We'll understand the
                situation first, find
                the useful signal, and
                help you take the next
                step.
              </p>

              <div className="lp-start-box">
                <form
                  className="lp-composer"
                  onSubmit={submit}
                >
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) =>
                      setInput(
                        e.target.value
                      )
                    }
                    placeholder="Tell me what's going on — in your own words."
                    autoFocus
                  />

                  <div className="lp-compose-bottom">
                    <span className="lp-compose-hint">
                      No forms. No perfect
                      answer needed.
                    </span>

                    <button
                      className="lp-send"
                      disabled={
                        !input.trim() ||
                        loading
                      }
                    >
                      Start →
                    </button>
                  </div>
                </form>

                <div className="lp-examples">
                  {QUICK_STARTS.map(
                    (example) => (
                      <button
                        key={example}
                        className="lp-example"
                        onClick={() =>
                          startWith(
                            example
                          )
                        }
                      >
                        {example}
                      </button>
                    )
                  )}
                </div>
              </div>
            </section>

            <section className="lp-principles">
              <div className="lp-principle">
                <b>
                  Understand
                </b>

                <span>
                  We don't make you
                  fill a long form
                  before understanding
                  the problem.
                </span>
              </div>

              <div className="lp-principle">
                <b>
                  Find the signal
                </b>

                <span>
                  We separate useful
                  evidence from
                  assumptions and
                  guesses.
                </span>
              </div>

              <div className="lp-principle">
                <b>
                  Move forward
                </b>

                <span>
                  When there is enough
                  evidence, you get
                  one practical next
                  step.
                </span>
              </div>
            </section>
          </>
        ) : (
          <section className="lp-chat">
            <div className="lp-chat-head">
              <div className="lp-context">
                <span className="lp-context-icon">
                  {currentPillar.icon}
                </span>

                <span>
                  {currentPillar.label}
                </span>
              </div>

              <span className="lp-chat-note">
                LifePath remembers this
                conversation
              </span>
            </div>

            <div
              className="lp-messages"
              aria-live="polite"
            >
              {session.messages.map(
                (message) => (
                  <Message
                    key={message.id}
                    message={message}
                  />
                )
              )}

              {loading && (
                <div className="lp-message-row assistant">
                  <div className="lp-avatar small">
                    L
                  </div>

                  <div className="lp-message assistant">
                    <div className="lp-loading">
                      <i />
                      <i />
                      <i />
                      thinking
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            <InsightCard
              structured={
                lastStructured
              }
            />

            <TaskCard
              structured={
                lastStructured
              }
            />

            <div className="lp-chat-composer">
              <form
                className="lp-composer"
                onSubmit={submit}
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) =>
                    setInput(
                      e.target.value
                    )
                  }
                  onKeyDown={(e) => {
                    if (
                      e.key ===
                        "Enter" &&
                      !e.shiftKey
                    ) {
                      e.preventDefault();
                      submit(e);
                    }
                  }}
                  placeholder="Tell me what happened…"
                  rows={3}
                  disabled={loading}
                />

                <div className="lp-compose-bottom">
                  <span className="lp-compose-hint">
                    Enter to send · Shift
                    + Enter for a new line
                  </span>

                  <button
                    className="lp-send"
                    disabled={
                      !input.trim() ||
                      loading
                    }
                  >
                    {loading
                      ? "Working…"
                      : "Send →"}
                  </button>
                </div>
              </form>

              {lastStructured &&
                !lastStructured.needs_more_info && (
                  <div className="lp-feedback">
                    <span>
                      Was this useful?
                    </span>

                    <button
                      onClick={() =>
                        submitFeedback(
                          "yes"
                        )
                      }
                      disabled={
                        feedback
                      }
                    >
                      Yes
                    </button>

                    <button
                      onClick={() =>
                        submitFeedback(
                          "no"
                        )
                      }
                      disabled={
                        feedback
                      }
                    >
                      Not really
                    </button>

                    {feedback && (
                      <span>
                        Thanks.
                      </span>
                    )}
                  </div>
                )}
            </div>
          </section>
        )}

        <footer className="lp-footer">
          LifePath · Practical help,
          based on what you actually
          tell us.
        </footer>
      </div>

      {showReset && (
        <div
          className="lp-confirm"
          role="dialog"
          aria-modal="true"
        >
          <div className="lp-confirm-box">
            <h3>
              Start a new
              conversation?
            </h3>

            <p>
              This clears the current
              LifePath conversation from
              this browser. Your
              server-side memory is not
              deleted.
            </p>

            <div className="lp-confirm-actions">
              <button
                onClick={() =>
                  setShowReset(false)
                }
              >
                Cancel
              </button>

              <button
                className="danger"
                onClick={reset}
              >
                Start over
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
      }
