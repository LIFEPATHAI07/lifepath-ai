"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getUserId } from "../lib/user";

const STORAGE_KEY = "lifepath_v1_session";
const FREE_LIMIT = 100;

const QUICK_STARTS = [
  {
    text: "I've applied to 200 jobs and nobody is responding",
    label: "Job search",
  },
  {
    text: "I need a job but I don't know what role to target",
    label: "Career",
  },
  {
    text: "I have a CV but I'm not getting interviews",
    label: "CV",
  },
  {
    text: "I need to increase my income",
    label: "Money",
  },
];

const DEFAULT_SESSION = {
  screen: "home",
  problem: "",
  category: "career",
  messages: [],
};

const storage = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};

function detectCategory(text = "") {
  const value = text.toLowerCase();

  if (
    value.includes("cv") ||
    value.includes("resume") ||
    value.includes("interview") ||
    value.includes("ats")
  ) {
    return "cv";
  }

  if (
    value.includes("startup") ||
    value.includes("business idea") ||
    value.includes("customer") ||
    value.includes("founder")
  ) {
    return "startup";
  }

  if (
    value.includes("income") ||
    value.includes("money") ||
    value.includes("salary") ||
    value.includes("saving") ||
    value.includes("debt")
  ) {
    return "wealth";
  }

  if (
    value.includes("side hustle") ||
    value.includes("freelance") ||
    value.includes("earn extra")
  ) {
    return "hustle";
  }

  if (
    value.includes("job") ||
    value.includes("application") ||
    value.includes("applied") ||
    value.includes("hiring") ||
    value.includes("career")
  ) {
    return "jobs";
  }

  return "career";
}

function categoryLabel(category) {
  const labels = {
    jobs: "Job search",
    cv: "CV",
    wealth: "Income & money",
    hustle: "Side income",
    startup: "Startup",
    career: "Career",
  };

  return labels[category] || "Career";
}

function cleanText(value) {
  if (!value) return "";

  return String(value)
    .replace(/\r/g, "")
    .replace(/\n{4,}/g, "\n\n")
    .trim();
}

function buildApiHistory(messages) {
  return messages
    .filter((message) => message.content)
    .slice(-12)
    .map((message) => ({
      role: message.role,
      content: String(message.content).slice(0, 1800),
    }));
}

function formatStructured(data) {
  if (!data) return null;

  return {
    summary: cleanText(data.summary),
    insight: cleanText(data.insight),
    coach_note: cleanText(data.coach_note),
    task: cleanText(data.task),
    how_to_do: cleanText(data.how_to_do),
    what_to_do: cleanText(data.what_to_do),
    where_to_do: cleanText(data.where_to_do),
    success: cleanText(data.success),
    why_this_task: cleanText(data.why_this_task),
    next_step: cleanText(data.next_step),
    follow_up_question: cleanText(data.follow_up_question),
    help_hint: cleanText(data.help_hint),
    task_link: data.task_link || "",
    task_link_label: data.task_link_label || "",
    needs_more_info: data.needs_more_info,
  };
}

function LoadingDots() {
  return (
    <div className="ai-loading">
      <span />
      <span />
      <span />
    </div>
  );
}

function Logo({ small = false }) {
  return (
    <div className={small ? "logo logo-small" : "logo"}>
      <div className="logo-mark">L</div>
      <div className="logo-word">LifePath</div>
    </div>
  );
}

function InsightBlock({ label, children, type = "normal" }) {
  if (!children) return null;

  return (
    <div className={`insight-block ${type}`}>
      <div className="block-label">{label}</div>
      <div className="block-text">{children}</div>
    </div>
  );
}

function StructuredResponse({ data, onQuickReply }) {
  const response = formatStructured(data);

  if (!response) return null;

  return (
    <div className="response-card">
      {response.summary && (
        <div className="response-summary">{response.summary}</div>
      )}

      {response.coach_note && (
        <InsightBlock label="LifePath" type="blue">
          {response.coach_note}
        </InsightBlock>
      )}

      {response.insight && (
        <InsightBlock label="What we're seeing" type="insight">
          {response.insight}
        </InsightBlock>
      )}

      {response.task && (
        <div className="action-card">
          <div className="block-label">NEXT STEP</div>

          <div className="action-title">{response.task}</div>

          {response.why_this_task && (
            <div className="action-reason">
              {response.why_this_task}
            </div>
          )}

          {response.how_to_do && (
            <div className="steps">
              {response.how_to_do
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line, index) => {
                  const match = line.match(/^step\s*(\d+)\s*[:.-]?\s*(.*)$/i);

                  if (match) {
                    return (
                      <div className="step" key={index}>
                        <div className="step-number">{match[1]}</div>
                        <div>{match[2]}</div>
                      </div>
                    );
                  }

                  return (
                    <div className="step" key={index}>
                      <div className="step-dot" />
                      <div>{line}</div>
                    </div>
                  );
                })}
            </div>
          )}

          {response.what_to_do && (
            <div className="action-detail">
              <strong>Do:</strong> {response.what_to_do}
            </div>
          )}

          {response.where_to_do && (
            <div className="action-detail">
              <strong>Where:</strong> {response.where_to_do}
            </div>
          )}

          {response.task_link && (
            <a
              className="action-link"
              href={response.task_link}
              target="_blank"
              rel="noopener noreferrer"
            >
              {response.task_link_label || "Open"} →
            </a>
          )}

          {response.success && (
            <div className="success-line">
              ✓ {response.success}
            </div>
          )}
        </div>
      )}

      {response.next_step && (
        <InsightBlock label="After this" type="next">
          {response.next_step}
        </InsightBlock>
      )}

      {response.follow_up_question && response.needs_more_info !== false && (
        <div className="follow-up">
          <div className="block-label">ONE THING I NEED TO KNOW</div>

          <div className="follow-question">
            {response.follow_up_question}
          </div>
        </div>
      )}

      {response.help_hint && (
        <div className="hint">
          {response.help_hint}
        </div>
      )}

      {response.task && (
        <button
          type="button"
          className="small-reply"
          onClick={() =>
            onQuickReply(
              "I completed that step. Here's what happened: "
            )
          }
        >
          Tell LifePath what happened →
        </button>
      )}
    </div>
  );
}

function UserBubble({ children }) {
  return (
    <div className="message-row user-row">
      <div className="user-bubble">{children}</div>
    </div>
  );
}

function AIMarker() {
  return (
    <div className="ai-marker">
      <div className="ai-avatar">L</div>
      <span>LifePath</span>
    </div>
  );
}

function AIMessage({ message, onQuickReply }) {
  if (message.structured) {
    return (
      <div className="message-row ai-row">
        <AIMarker />
        <StructuredResponse
          data={message.structured}
          onQuickReply={onQuickReply}
        />
      </div>
    );
  }

  if (!message.content) return null;

  return (
    <div className="message-row ai-row">
      <AIMarker />
      <div className="ai-text">{message.content}</div>
    </div>
  );
}

export default function LifePath() {
  const [session, setSession] = useState(() =>
    storage.get(STORAGE_KEY, DEFAULT_SESSION)
  );

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [error, setError] = useState("");
  const [usage, setUsage] = useState(0);

  const textareaRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    const today = new Date().toDateString();

    const saved = storage.get("lifepath_v1_usage", {
      date: today,
      count: 0,
    });

    if (saved.date !== today) {
      storage.set("lifepath_v1_usage", {
        date: today,
        count: 0,
      });
      setUsage(0);
    } else {
      setUsage(saved.count || 0);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1800);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    storage.set(STORAGE_KEY, session);
  }, [session]);

  useEffect(() => {
    if (!showSplash) {
      bottomRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }
  }, [session.messages, loading, showSplash]);

  const updateUsage = useCallback(() => {
    const today = new Date().toDateString();

    const next = {
      date: today,
      count: usage + 1,
    };

    setUsage(next.count);
    storage.set("lifepath_v1_usage", next);
  }, [usage]);

  const startProblem = useCallback((problem) => {
    const category = detectCategory(problem);

    setSession({
      screen: "chat",
      problem,
      category,
      messages: [
        {
          role: "user",
          content: problem,
        },
      ],
    });

    setInput("");
    setError("");
  }, []);

  const sendMessage = useCallback(
    async (overrideText = null) => {
      const text = (overrideText ?? input).trim();

      if (!text || loading) return;

      if (usage >= FREE_LIMIT) {
        setError(
          "You've reached today's limit. Come back tomorrow."
        );
        return;
      }

      setError("");
      setInput("");

      const category =
        session.category === "career" && !session.messages.length
          ? detectCategory(text)
          : session.category || detectCategory(text);

      const currentMessages = session.messages;

      const nextUserMessage = {
        role: "user",
        content: text,
      };

      const nextMessages = [
        ...currentMessages,
        nextUserMessage,
      ];

      setSession((previous) => ({
        ...previous,
        screen: "chat",
        problem: previous.problem || text,
        category,
        messages: nextMessages,
      }));

      setLoading(true);
      updateUsage();

      try {
        const apiMessages = buildApiHistory(nextMessages);

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: apiMessages,
            pillarId: category,
            profile: {
              problem: session.problem || text,
              category,
            },
            userId: getUserId(),
          }),
        });

        let data = null;

        try {
          data = await response.json();
        } catch {
          throw new Error(
            "LifePath couldn't read the server response."
          );
        }

        if (!response.ok || data?.error) {
          throw new Error(
            data?.message ||
              data?.error ||
              "The AI service is temporarily unavailable."
          );
        }

        const structured = data?.structured
          ? formatStructured(data.structured)
          : null;

        const aiMessage = {
          role: "assistant",
          content: data?.reply || "",
          structured,
        };

        setSession((previous) => ({
          ...previous,
          category:
            data?.pillarId ||
            data?.category ||
            previous.category ||
            category,
          messages: [
            ...previous.messages,
            aiMessage,
          ],
        }));
      } catch (err) {
        console.error("LifePath chat error:", err);

        setError(
          err?.message ||
            "Something went wrong. Please try again."
        );

        setSession((previous) => ({
          ...previous,
          messages: previous.messages.filter(
            (message, index) =>
              !(
                message.role === "user" &&
                index === previous.messages.length - 1 &&
                message.content === text
              )
          ),
        }));
      } finally {
        setLoading(false);
      }
    },
    [
      input,
      loading,
      usage,
      session,
      updateUsage,
    ]
  );

  const handleSubmit = (event) => {
    event.preventDefault();
    sendMessage();
  };

  const handleKeyDown = (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      sendMessage();
    }
  };

  const reset = () => {
    setSession(DEFAULT_SESSION);
    setInput("");
    setError("");
    setLoading(false);
    storage.set(STORAGE_KEY, DEFAULT_SESSION);
  };

  const backHome = () => {
    setSession((previous) => ({
      ...previous,
      screen: "home",
    }));
    setInput("");
    setError("");
  };

  if (showSplash) {
    return (
      <>
        <style>{CSS}</style>

        <main className="splash">
          <div className="splash-glow" />

          <div className="splash-content">
            <div className="splash-logo">
              <div className="splash-mark">L</div>
              <div className="splash-name">LifePath</div>
            </div>

            <div className="splash-line">
              Figure out what actually matters next.
            </div>

            <div className="splash-loader">
              <span />
              <span />
              <span />
            </div>
          </div>
        </main>
      </>
    );
  }

  if (session.screen === "home") {
    return (
      <>
        <style>{CSS}</style>

        <main className="app-shell">
          <header className="topbar">
            <Logo />

            {session.messages.length > 0 && (
              <button
                type="button"
                className="top-button"
                onClick={() => {
                  setSession((previous) => ({
                    ...previous,
                    screen: "chat",
                  }));
                }}
              >
                Continue
              </button>
            )}
          </header>

          <section className="home">
            <div className="eyebrow">
              FIGURE OUT WHAT ACTUALLY MATTERS NEXT
            </div>

            <h1>
              Don't know what to do
              <br />
              next?
              <br />
              <span>Start with the problem.</span>
            </h1>

            <p className="hero-copy">
              Tell LifePath what's actually happening.
              <br />
              We'll understand the situation first,
              find the useful signal,
              and help you take the next step.
            </p>

            <form
              className="problem-box"
              onSubmit={(event) => {
                event.preventDefault();

                if (input.trim()) {
                  startProblem(input.trim());
                }
              }}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) =>
                  setInput(event.target.value)
                }
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey
                  ) {
                    event.preventDefault();

                    if (input.trim()) {
                      startProblem(input.trim());
                    }
                  }
                }}
                placeholder="Tell me what's going on — in your own words."
                rows={4}
              />

              <div className="problem-footer">
                <div className="problem-hint">
                  No forms. No perfect answer needed.
                </div>

                <button
                  type="submit"
                  className="start-button"
                  disabled={!input.trim()}
                >
                  Start
                  <span>→</span>
                </button>
              </div>
            </form>

            <div className="quick-section">
              <div className="quick-label">
                Or start with something common
              </div>

              <div className="quick-list">
                {QUICK_STARTS.map((item) => (
                  <button
                    key={item.text}
                    type="button"
                    className="quick-item"
                    onClick={() => startProblem(item.text)}
                  >
                    <span className="quick-category">
                      {item.label}
                    </span>

                    <span className="quick-text">
                      {item.text}
                    </span>

                    <span className="quick-arrow">
                      →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <footer className="footer">
            <span>LifePath</span>
            <span>Practical help based on what you actually tell us.</span>
          </footer>
        </main>
      </>
    );
  }

  return (
    <>
      <style>{CSS}</style>

      <main className="app-shell chat-shell">
        <header className="topbar chat-topbar">
          <button
            type="button"
            className="brand-button"
            onClick={backHome}
          >
            <Logo small />
          </button>

          <div className="chat-context">
            <div className="context-category">
              {categoryLabel(session.category)}
            </div>

            <div className="context-status">
              LifePath is figuring this out with you
            </div>
          </div>

          <button
            type="button"
            className="top-button"
            onClick={reset}
          >
            Start over
          </button>
        </header>

        <section className="chat-area">
          <div className="chat-inner">
            {session.messages.map((message, index) => {
              if (message.role === "user") {
                return (
                  <UserBubble key={index}>
                    {message.content}
                  </UserBubble>
                );
              }

              return (
                <AIMessage
                  key={index}
                  message={message}
                  onQuickReply={(text) => {
                    setInput(text);

                    setTimeout(() => {
                      textareaRef.current?.focus();
                    }, 50);
                  }}
                />
              );
            })}

            {loading && (
              <div className="message-row ai-row">
                <AIMarker />

                <div className="loading-card">
                  <div className="loading-title">
                    LifePath is thinking
                  </div>

                  <LoadingDots />
                </div>
              </div>
            )}

            {error && (
              <div className="error-card">
                <div className="error-title">
                  Something went wrong
                </div>

                <div className="error-text">
                  {error}
                </div>

                <button
                  type="button"
                  className="retry-button"
                  onClick={() => {
                    setError("");
                    textareaRef.current?.focus();
                  }}
                >
                  Try again
                </button>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </section>

        <div className="composer-wrap">
          <form
            className="composer"
            onSubmit={handleSubmit}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) =>
                setInput(event.target.value)
              }
              onKeyDown={handleKeyDown}
              disabled={loading}
              placeholder="Tell me what happened..."
              rows={3}
            />

            <div className="composer-footer">
              <div className="composer-hint">
                Enter to send · Shift + Enter for a new line
              </div>

              <button
                type="submit"
                className="send-button"
                disabled={!input.trim() || loading}
              >
                {loading ? "..." : "Send"}
                <span>→</span>
              </button>
            </div>
          </form>

          <div className="chat-disclaimer">
            LifePath · Practical help based on what you
            actually tell us.
          </div>
        </div>
      </main>
    </>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap');

:root {
  --bg: #070b12;
  --bg-soft: #0b111b;
  --panel: #0d141f;
  --panel-2: #101925;
  --border: rgba(255,255,255,.085);
  --border-soft: rgba(255,255,255,.055);
  --text: #f4f7fb;
  --muted: #8995a7;
  --muted-2: #5d6878;
  --accent: #8b7cff;
  --accent-2: #a497ff;
  --accent-soft: rgba(139,124,255,.11);
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  min-height: 100%;
  background: var(--bg);
}

body {
  color: var(--text);
  font-family: "DM Sans", system-ui, sans-serif;
}

button,
textarea {
  font: inherit;
}

button {
  -webkit-tap-highlight-color: transparent;
}

textarea {
  resize: none;
}

.app-shell {
  min-height: 100vh;
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  background:
    radial-gradient(
      circle at 50% -10%,
      rgba(139,124,255,.075),
      transparent 38%
    ),
    var(--bg);
  display: flex;
  flex-direction: column;
}

.topbar {
  min-height: 76px;
  padding: 18px 24px;
  border-bottom: 1px solid var(--border-soft);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 11px;
}

.logo-small {
  gap: 8px;
}

.logo-mark {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.14);
  display: grid;
  place-items: center;
  font-family: "Manrope", sans-serif;
  font-size: 17px;
  font-weight: 800;
  color: white;
  background:
    linear-gradient(
      145deg,
      rgba(139,124,255,.18),
      rgba(255,255,255,.025)
    );
}

.logo-small .logo-mark {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  font-size: 14px;
}

.logo-word {
  font-family: "Manrope", sans-serif;
  font-weight: 700;
  font-size: 19px;
  letter-spacing: -.5px;
}

.logo-small .logo-word {
  font-size: 16px;
}

.top-button,
.brand-button {
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.top-button {
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 13px;
}

.top-button:hover {
  background: rgba(255,255,255,.045);
  color: var(--text);
}

.brand-button {
  padding: 0;
}

.home {
  flex: 1;
  padding: 92px 24px 55px;
  text-align: center;
}

.eyebrow {
  color: #7e8999;
  font-size: 11px;
  letter-spacing: .23em;
  font-weight: 600;
  margin-bottom: 30px;
}

h1 {
  margin: 0;
  font-family: "Manrope", sans-serif;
  font-size: clamp(42px, 8vw, 70px);
  line-height: .98;
  letter-spacing: -3.5px;
  font-weight: 800;
}

h1 span {
  color: #c5c9d3;
}

.hero-copy {
  color: #8994a4;
  font-size: 16px;
  line-height: 1.75;
  max-width: 620px;
  margin: 30px auto 42px;
}

.problem-box {
  max-width: 640px;
  margin: 0 auto;
  padding: 5px;
  border: 1px solid rgba(255,255,255,.11);
  border-radius: 22px;
  background: rgba(13,20,31,.88);
  box-shadow:
    0 25px 80px rgba(0,0,0,.26),
    inset 0 1px rgba(255,255,255,.025);
  text-align: left;
}

.problem-box textarea {
  width: 100%;
  min-height: 110px;
  padding: 21px 20px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font-size: 17px;
  line-height: 1.55;
}

.problem-box textarea::placeholder,
.composer textarea::placeholder {
  color: #596474;
}

.problem-footer {
  padding: 10px 10px 10px 17px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.problem-hint {
  color: #596474;
  font-size: 12px;
}

.start-button,
.send-button {
  border: 0;
  border-radius: 14px;
  background: #e9ecf2;
  color: #0b0f16;
  min-width: 112px;
  padding: 14px 18px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  transition: transform .15s, opacity .15s;
}

.start-button:hover,
.send-button:hover {
  transform: translateY(-1px);
}

.start-button:disabled,
.send-button:disabled {
  opacity: .35;
  cursor: not-allowed;
  transform: none;
}

.quick-section {
  max-width: 640px;
  margin: 42px auto 0;
  text-align: left;
}

.quick-label {
  color: #596474;
  font-size: 12px;
  margin-bottom: 13px;
}

.quick-list {
  display: grid;
  gap: 8px;
}

.quick-item {
  width: 100%;
  border: 1px solid var(--border-soft);
  background: rgba(255,255,255,.018);
  border-radius: 14px;
  padding: 15px 16px;
  color: var(--text);
  cursor: pointer;
  text-align: left;
  display: grid;
  grid-template-columns: 100px 1fr 20px;
  align-items: center;
  gap: 12px;
  transition: background .15s, border-color .15s;
}

.quick-item:hover {
  background: rgba(255,255,255,.035);
  border-color: rgba(139,124,255,.25);
}

.quick-category {
  color: #8d82e9;
  font-size: 11px;
  font-weight: 600;
}

.quick-text {
  color: #a8b1be;
  font-size: 13px;
}

.quick-arrow {
  color: #626d7c;
  text-align: right;
}

.footer {
  padding: 22px 24px 30px;
  color: #4d5868;
  font-size: 11px;
  display: flex;
  justify-content: center;
  gap: 8px;
}

.chat-shell {
  height: 100vh;
  min-height: 100vh;
}

.chat-topbar {
  flex-shrink: 0;
}

.chat-context {
  flex: 1;
  min-width: 0;
}

.context-category {
  color: #b8c0cc;
  font-size: 13px;
  font-weight: 600;
}

.context-status {
  color: #4f5a69;
  font-size: 11px;
  margin-top: 3px;
}

.chat-area {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.chat-inner {
  width: 100%;
  max-width: 690px;
  margin: 0 auto;
  padding: 28px 20px 35px;
}

.message-row {
  margin-bottom: 25px;
  animation: messageIn .25s ease both;
}

@keyframes messageIn {
  from {
    opacity: 0;
    transform: translateY(7px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.user-row {
  display: flex;
  justify-content: flex-end;
}

.user-bubble {
  max-width: 78%;
  padding: 14px 17px;
  border-radius: 18px 18px 5px 18px;
  background: #e8ebf1;
  color: #10151e;
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
}

.ai-row {
  max-width: 100%;
}

.ai-marker {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #747f8e;
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 9px;
}

.ai-avatar {
  width: 27px;
  height: 27px;
  border-radius: 9px;
  border: 1px solid rgba(139,124,255,.3);
  background: rgba(139,124,255,.1);
  color: #a497ff;
  display: grid;
  place-items: center;
  font-family: "Manrope", sans-serif;
  font-size: 11px;
  font-weight: 800;
}

.ai-text {
  color: #b4bdca;
  font-size: 14px;
  line-height: 1.8;
  white-space: pre-wrap;
  padding-left: 35px;
}

.response-card {
  margin-left: 35px;
  border: 1px solid var(--border);
  background: rgba(13,20,31,.82);
  border-radius: 17px;
  overflow: hidden;
}

.response-summary {
  padding: 19px 18px;
  color: #eef1f6;
  font-size: 15px;
  line-height: 1.65;
  font-weight: 600;
}

.insight-block {
  padding: 15px 18px;
  border-top: 1px solid var(--border-soft);
  background: rgba(255,255,255,.012);
}

.insight-block.blue {
  background: rgba(139,124,255,.035);
}

.insight-block.insight {
  background: rgba(255,255,255,.018);
}

.insight-block.next {
  background: rgba(139,124,255,.025);
}

.block-label {
  color: #687383;
  font-size: 9px;
  letter-spacing: .17em;
  font-weight: 700;
  margin-bottom: 7px;
}

.block-text {
  color: #aab4c2;
  font-size: 13px;
  line-height: 1.7;
}

.action-card {
  margin: 12px;
  padding: 19px;
  border: 1px solid rgba(139,124,255,.2);
  border-radius: 15px;
  background:
    linear-gradient(
      145deg,
      rgba(139,124,255,.075),
      rgba(255,255,255,.015)
    );
}

.action-title {
  color: #f7f8fb;
  font-family: "Manrope", sans-serif;
  font-size: 18px;
  line-height: 1.45;
  font-weight: 700;
  margin-bottom: 8px;
}

.action-reason {
  color: #737e8e;
  font-size: 12px;
  line-height: 1.65;
  margin-bottom: 17px;
}

.steps {
  display: grid;
  gap: 11px;
  margin: 16px 0;
}

.step {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  color: #a9b3c0;
  font-size: 12px;
  line-height: 1.65;
}

.step-number {
  flex: 0 0 23px;
  height: 23px;
  border-radius: 50%;
  background: rgba(139,124,255,.13);
  border: 1px solid rgba(139,124,255,.25);
  color: #a497ff;
  display: grid;
  place-items: center;
  font-size: 10px;
  font-weight: 700;
}

.step-dot {
  width: 6px;
  height: 6px;
  margin-top: 8px;
  border-radius: 50%;
  background: #5e6878;
  flex-shrink: 0;
}

.action-detail {
  color: #7f8a99;
  font-size: 12px;
  line-height: 1.7;
  margin-top: 9px;
}

.action-detail strong {
  color: #b5bdc9;
}

.action-link {
  display: inline-flex;
  margin-top: 17px;
  padding: 10px 15px;
  border-radius: 10px;
  background: #e9ecf2;
  color: #0b1017;
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
}

.success-line {
  color: #7fd3b1;
  font-size: 11px;
  margin-top: 15px;
}

.follow-up {
  padding: 16px 18px;
  border-top: 1px solid var(--border-soft);
}

.follow-question {
  color: #d0d5dd;
  font-size: 14px;
  line-height: 1.65;
}

.hint {
  padding: 12px 18px 16px;
  color: #5f6a79;
  font-size: 11px;
  line-height: 1.6;
}

.small-reply {
  margin: 0 18px 18px;
  border: 1px solid rgba(139,124,255,.18);
  border-radius: 10px;
  background: rgba(139,124,255,.055);
  color: #958aff;
  padding: 9px 12px;
  font-size: 11px;
  cursor: pointer;
}

.loading-card {
  margin-left: 35px;
  border: 1px solid var(--border-soft);
  background: rgba(255,255,255,.015);
  border-radius: 14px;
  padding: 14px 16px;
  display: inline-flex;
  align-items: center;
  gap: 14px;
}

.loading-title {
  color: #687383;
  font-size: 12px;
}

.ai-loading {
  display: flex;
  gap: 4px;
}

.ai-loading span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #8980d9;
  animation: bounce 1.2s infinite;
}

.ai-loading span:nth-child(2) {
  animation-delay: .15s;
}

.ai-loading span:nth-child(3) {
  animation-delay: .3s;
}

@keyframes bounce {
  0%, 60%, 100% {
    opacity: .3;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-4px);
  }
}

.error-card {
  margin: 8px 35px 22px;
  padding: 14px 16px;
  border: 1px solid rgba(255,100,100,.16);
  background: rgba(255,70,70,.035);
  border-radius: 13px;
}

.error-title {
  color: #d9a2a2;
  font-size: 12px;
  font-weight: 600;
}

.error-text {
  color: #7d6870;
  font-size: 11px;
  line-height: 1.6;
  margin-top: 4px;
}

.retry-button {
  margin-top: 10px;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.04);
  color: #9da7b4;
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 11px;
  cursor: pointer;
}

.composer-wrap {
  flex-shrink: 0;
  padding: 0 20px 18px;
  background:
    linear-gradient(
      to bottom,
      transparent,
      rgba(7,11,18,.96) 18%
    );
}

.composer {
  max-width: 690px;
  margin: 0 auto;
  border: 1px solid rgba(255,255,255,.095);
  background: rgba(13,20,31,.94);
  border-radius: 18px;
  padding: 5px;
}

.composer textarea {
  width: 100%;
  min-height: 75px;
  border: 0;
  outline: 0;
  padding: 15px 15px 5px;
  background: transparent;
  color: #eef1f5;
  font-size: 14px;
  line-height: 1.6;
}

.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 7px 7px 13px;
}

.composer-hint {
  color: #4f5a69;
  font-size: 10px;
}

.send-button {
  min-width: 100px;
  padding: 12px 15px;
  border-radius: 12px;
}

.chat-disclaimer {
  max-width: 690px;
  margin: 9px auto 0;
  color: #394352;
  font-size: 10px;
  text-align: center;
}

.splash {
  min-height: 100vh;
  background: #070b12;
  display: grid;
  place-items: center;
  position: relative;
  overflow: hidden;
}

.splash-glow {
  position: absolute;
  width: 500px;
  height: 500px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(139,124,255,.09),
    transparent 68%
  );
  animation: glow 2s ease infinite;
}

@keyframes glow {
  0%, 100% {
    opacity: .35;
    transform: scale(.92);
  }
  50% {
    opacity: .8;
    transform: scale(1);
  }
}

.splash-content {
  position: relative;
  text-align: center;
  animation: splashIn .8s ease both;
}

@keyframes splashIn {
  from {
    opacity: 0;
    transform: translateY(14px) scale(.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.splash-logo {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 14px;
}

.splash-mark {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255,255,255,.15);
  background: rgba(139,124,255,.1);
  font-family: "Manrope", sans-serif;
  font-weight: 800;
  font-size: 23px;
}

.splash-name {
  font-family: "Manrope", sans-serif;
  font-weight: 800;
  font-size: 35px;
  letter-spacing: -1.8px;
}

.splash-line {
  color: #596474;
  margin-top: 17px;
  font-size: 11px;
  letter-spacing: .16em;
  text-transform: uppercase;
}

.splash-loader {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin-top: 35px;
}

.splash-loader span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #9389ed;
  animation: bounce 1.2s infinite;
}

.splash-loader span:nth-child(2) {
  animation-delay: .15s;
}

.splash-loader span:nth-child(3) {
  animation-delay: .3s;
}

@media (max-width: 600px) {
  .topbar {
    padding: 16px 17px;
  }

  .home {
    padding: 65px 17px 35px;
  }

  h1 {
    font-size: 44px;
    letter-spacing: -2.5px;
  }

  .hero-copy {
    font-size: 14px;
    margin: 24px auto 32px;
  }

  .eyebrow {
    font-size: 9px;
    margin-bottom: 23px;
  }

  .problem-box {
    border-radius: 18px;
  }

  .problem-box textarea {
    font-size: 15px;
  }

  .problem-footer {
    align-items: flex-end;
  }

  .problem-hint {
    max-width: 170px;
    line-height: 1.5;
  }

  .start-button {
    min-width: 96px;
  }

  .quick-item {
    grid-template-columns: 82px 1fr 16px;
    padding: 13px;
  }

  .quick-text {
    font-size: 12px;
  }

  .footer {
    flex-direction: column;
    text-align: center;
  }

  .chat-context {
    display: none;
  }

  .chat-inner {
    padding: 20px 14px 25px;
  }

  .user-bubble {
    max-width: 88%;
    font-size: 13px;
  }

  .response-card {
    margin-left: 0;
  }

  .ai-text {
    padding-left: 0;
  }

  .loading-card,
  .error-card {
    margin-left: 0;
  }

  .composer-wrap {
    padding: 0 10px 12px;
  }

  .composer-hint {
    font-size: 9px;
  }

  .send-button {
    min-width: 82px;
  }
}
`;
