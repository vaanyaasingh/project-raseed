"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { streamChat, saveChat, type ChatTopic, type ChatMessage } from "@/lib/api";

// ── Topic config ──────────────────────────────────────────────────────────────

interface TopicConfig {
  id: ChatTopic;
  label: string;
  welcome: string;
  icon: React.ReactNode;
}

const TOPICS: TopicConfig[] = [
  {
    id: "compliance",
    label: "Compliance",
    welcome: "Ask me about GST notices, filing deadlines, ITC rules, or any compliance question.",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    id: "invoice",
    label: "Invoice",
    welcome: "Ask me about GST-compliant invoices, HSN codes, tax rates, or e-invoicing requirements.",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    id: "finance",
    label: "Finance",
    welcome: "Ask me about cash flow, bank statement analysis, or improving financial health.",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    ),
  },
  {
    id: "misc",
    label: "General",
    welcome: "Ask me anything about your business, GST, compliance, finance, or general advice.",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
];

// ── Internal message type ─────────────────────────────────────────────────────

interface InternalMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  topic: ChatTopic;
  streaming?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function generateChatId() {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// ── Message bubble ─────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: InternalMessage }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: 10 }}>
      <div
        style={{
          maxWidth: "82%",
          padding: "9px 13px",
          borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          background: isUser ? "var(--primary)" : "var(--bg-2)",
          color: isUser ? "#FCFAF4" : "var(--ink)",
          fontSize: 13,
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          border: isUser ? "none" : "1px solid var(--border)",
          boxShadow: isUser ? "0 1px 4px rgba(0,0,0,0.12)" : "none",
        }}
      >
        {msg.content}
        {msg.streaming && (
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 13,
              background: "var(--ink-3)",
              borderRadius: 1,
              marginLeft: 3,
              verticalAlign: "middle",
              animation: "blink 0.8s step-end infinite",
            }}
          />
        )}
      </div>
    </div>
  );
}

// ── Topic divider ──────────────────────────────────────────────────────────────

function TopicDivider({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0 8px" }}>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      <span style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600, whiteSpace: "nowrap" }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );
}

// ── Typing dots ────────────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 10 }}>
      <div
        style={{
          padding: "10px 14px",
          borderRadius: "16px 16px 16px 4px",
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 6, height: 6, borderRadius: "50%", background: "var(--ink-3)",
              animation: `bounce 1.2s ${i * 0.2}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Topic badge (used in saved-chat UI) ───────────────────────────────────────

export function TopicBadge({ topic }: { topic: ChatTopic }) {
  const colors: Record<ChatTopic, { bg: string; color: string }> = {
    compliance: { bg: "#EEF3FF", color: "#3B5BDB" },
    invoice:    { bg: "#FFF0F6", color: "#C2255C" },
    finance:    { bg: "#EBFBEE", color: "#2F9E44" },
    misc:       { bg: "#FFF9DB", color: "#E67700" },
  };
  const cfg = colors[topic];
  const label = TOPICS.find((t) => t.id === topic)?.label ?? topic;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 8px", borderRadius: 20,
      background: cfg.bg, color: cfg.color,
      fontSize: 11, fontWeight: 700,
    }}>
      {label}
    </span>
  );
}

// ── Main ChatSidebar ──────────────────────────────────────────────────────────

export default function ChatSidebar() {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState<ChatTopic>("compliance");
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [chatId, setChatId] = useState<string>(() => generateChatId());

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auto-scroll ─────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Focus input on open ──────────────────────────────────────────────────────
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  // ── Listen for quick-action events from other pages ──────────────────────────
  useEffect(() => {
    const handleOpen = (e: Event) => {
      const { topic: t, prefill } = (e as CustomEvent<{ topic?: ChatTopic; prefill?: string }>).detail;
      setOpen(true);
      if (t) setTopic(t);
      if (prefill) setInput(prefill);
      setTimeout(() => inputRef.current?.focus(), 150);
    };

    const handleLoad = (e: Event) => {
      const { id, topic: t, messages: msgs } = (e as CustomEvent<{
        id: string;
        topic: ChatTopic;
        messages: ChatMessage[];
      }>).detail;
      setChatId(id);
      setTopic(t);
      setMessages(
        msgs.map((m) => ({ id: uid(), role: m.role, content: m.content, topic: t })),
      );
      setInput("");
      setOpen(true);
      setTimeout(() => inputRef.current?.focus(), 150);
    };

    window.addEventListener("raseed:chat", handleOpen);
    window.addEventListener("raseed:load-chat", handleLoad);
    return () => {
      window.removeEventListener("raseed:chat", handleOpen);
      window.removeEventListener("raseed:load-chat", handleLoad);
    };
  }, []);

  // ── Debounced auto-save ──────────────────────────────────────────────────────
  const scheduleSave = useCallback(
    (currentMessages: InternalMessage[], currentTopic: ChatTopic, currentChatId: string) => {
      const completed = currentMessages.filter((m) => !m.streaming);
      if (completed.length < 2) return; // need at least 1 exchange to bother saving
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        const title =
          completed.find((m) => m.role === "user")?.content.slice(0, 80) ?? "Conversation";
        try {
          await saveChat(
            currentChatId,
            currentTopic,
            title,
            completed.map((m) => ({ role: m.role, content: m.content })),
          );
        } catch {
          // Non-fatal — continue silently
        }
      }, 1500);
    },
    [],
  );

  // ── History for API ──────────────────────────────────────────────────────────
  const getHistory = useCallback(
    (msgs: InternalMessage[]): ChatMessage[] =>
      msgs.filter((m) => !m.streaming).map((m) => ({ role: m.role, content: m.content })),
    [],
  );

  // ── Topic switch ─────────────────────────────────────────────────────────────
  function handleTopicChange(newTopic: ChatTopic) {
    if (newTopic === topic) return;
    setTopic(newTopic);
  }

  // ── New chat ─────────────────────────────────────────────────────────────────
  function handleNewChat() {
    setMessages([]);
    setInput("");
    setChatId(generateChatId());
    setTopic("compliance");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  // ── Send message ─────────────────────────────────────────────────────────────
  async function sendMessage() {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    const userMsg: InternalMessage = { id: uid(), role: "user", content: text, topic };
    const assistantId = uid();
    const assistantMsg: InternalMessage = {
      id: assistantId, role: "assistant", content: "", topic, streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    try {
      const history = getHistory(messages);
      const reader = await streamChat(text, topic, history);

      let accumulated = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        accumulated += value;
        setMessages((prev) =>
          prev.map((m) => m.id === assistantId ? { ...m, content: accumulated, streaming: true } : m),
        );
      }

      // Mark streaming done
      setMessages((prev) => {
        const updated = prev.map((m) => m.id === assistantId ? { ...m, streaming: false } : m);
        scheduleSave(updated, topic, chatId);
        return updated;
      });
    } catch (err) {
      const errText = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, content: errText, streaming: false } : m),
      );
    } finally {
      setIsStreaming(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const topicConfig = TOPICS.find((t) => t.id === topic)!;
  const hasMessages = messages.length > 0;

  // Build rendered list with topic dividers
  const renderedItems: React.ReactNode[] = [];
  let lastTopic: ChatTopic | null = null;
  for (const msg of messages) {
    if (msg.topic !== lastTopic) {
      const cfg = TOPICS.find((t) => t.id === msg.topic)!;
      if (lastTopic !== null) {
        renderedItems.push(
          <TopicDivider key={`div-${msg.id}`} label={`Switched to ${cfg.label}`} />,
        );
      }
      lastTopic = msg.topic;
    }
    renderedItems.push(<MessageBubble key={msg.id} msg={msg} />);
  }

  return (
    <>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }
        @keyframes chatSlideIn { from{transform:translateX(24px) scale(0.97);opacity:0} to{transform:none;opacity:1} }
        @keyframes chatFadeUp  { from{transform:translateY(12px);opacity:0} to{transform:none;opacity:1} }
        @keyframes spin { to{transform:rotate(360deg)} }
      `}</style>

      {/* Toggle bubble */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close AI assistant" : "Open AI assistant"}
        title={open ? "Close AI assistant" : "Ask Raseed AI"}
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          width: 52, height: 52, borderRadius: "50%",
          background: open ? "var(--ink)" : "var(--primary)",
          border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 20px rgba(0,0,0,0.20)",
          transition: "background 200ms",
        }}
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FCFAF4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FCFAF4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          style={{
            position: "fixed", bottom: 88, right: 24, zIndex: 9998,
            width: "min(340px, calc(100vw - 32px))",
            height: "min(560px, calc(100vh - 120px))",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.16)",
            display: "flex", flexDirection: "column", overflow: "hidden",
            animation: "chatSlideIn 200ms ease-out",
          }}
        >
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              {/* Logo mark */}
              <div style={{
                width: 28, height: 28, borderRadius: 8, background: "var(--primary)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <span style={{ color: "#FCFAF4", fontWeight: 800, fontSize: 14, lineHeight: 1 }}>₹</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", lineHeight: 1.2 }}>
                  Raseed AI
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{topicConfig.label} mode</div>
              </div>
              {/* New chat button */}
              <button
                onClick={handleNewChat}
                title="New conversation"
                style={{
                  width: 28, height: 28, borderRadius: 8, border: "1px solid var(--border)",
                  background: "var(--bg-2)", cursor: "pointer", display: "flex",
                  alignItems: "center", justifyContent: "center", flexShrink: 0, color: "var(--ink-3)",
                  transition: "background 120ms, color 120ms",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-3)"; e.currentTarget.style.color = "var(--ink)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-2)"; e.currentTarget.style.color = "var(--ink-3)"; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>

            {/* Topic pills */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {TOPICS.map((t) => {
                const active = t.id === topic;
                return (
                  <button
                    key={t.id}
                    onClick={() => handleTopicChange(t.id)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      padding: "4px 10px", borderRadius: 20,
                      border: active ? "1.5px solid var(--primary)" : "1.5px solid var(--border)",
                      background: active ? "rgba(var(--primary-rgb, 180,130,60),0.08)" : "transparent",
                      color: active ? "var(--primary)" : "var(--ink-3)",
                      fontSize: 11, fontWeight: active ? 700 : 500,
                      cursor: "pointer", fontFamily: "inherit",
                      transition: "all 120ms", whiteSpace: "nowrap",
                    }}
                  >
                    {t.icon}{t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Messages ────────────────────────────────────────────────────── */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px 4px", display: "flex", flexDirection: "column" }}>
            {/* Welcome */}
            {!hasMessages && (
              <div style={{ margin: "auto 0", textAlign: "center", padding: "20px 8px", animation: "chatFadeUp 250ms ease-out" }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%",
                  background: "var(--bg-2)", border: "1px solid var(--border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 12px", color: "var(--primary)",
                }}>
                  {topicConfig.icon}
                </div>
                <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5, maxWidth: 240, margin: "0 auto" }}>
                  {topicConfig.welcome}
                </p>
              </div>
            )}

            {renderedItems}

            {/* Typing indicator: only when streaming but no content yet */}
            {isStreaming && messages[messages.length - 1]?.content === "" && (
              <TypingIndicator />
            )}

            <div ref={bottomRef} />
          </div>

          {/* ── Input ───────────────────────────────────────────────────────── */}
          <div style={{ borderTop: "1px solid var(--border)", padding: "10px 12px", flexShrink: 0, background: "var(--surface)" }}>
            <div
              style={{
                display: "flex", alignItems: "flex-end", gap: 8,
                background: "var(--bg-2)", border: "1px solid var(--border)",
                borderRadius: 12, padding: "6px 6px 6px 12px",
                transition: "border-color 120ms",
              }}
              onFocusCapture={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; }}
              onBlurCapture={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                }}
                onKeyDown={handleKeyDown}
                placeholder={`Ask about ${topicConfig.label.toLowerCase()}…`}
                disabled={isStreaming}
                rows={1}
                style={{
                  flex: 1, border: "none", background: "transparent", resize: "none",
                  outline: "none", fontSize: 13, color: "var(--ink)", fontFamily: "inherit",
                  lineHeight: 1.5, maxHeight: 120, overflowY: "auto", padding: 0,
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isStreaming}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: input.trim() && !isStreaming ? "var(--primary)" : "var(--border)",
                  border: "none",
                  cursor: input.trim() && !isStreaming ? "pointer" : "default",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, transition: "background 150ms",
                }}
              >
                {isStreaming ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.8s linear infinite" }}>
                    <path d="M12 2a10 10 0 0110 10" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={input.trim() ? "#FCFAF4" : "var(--ink-3)"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                )}
              </button>
            </div>
            <p style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 5, textAlign: "center" }}>
              Shift+Enter for new line · Enter to send
            </p>
          </div>
        </div>
      )}
    </>
  );
}
