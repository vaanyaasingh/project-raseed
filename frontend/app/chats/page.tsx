"use client";

import { useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { TopicBadge } from "@/components/ChatSidebar";
import { listChats, getChat, deleteSavedChat, type ChatRecord, type ChatTopic } from "@/lib/api";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "This week";
  if (diffDays < 30) return "This month";
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return formatTime(iso);
  if (diffDays < 7) return d.toLocaleDateString("en-IN", { weekday: "short" }) + ", " + formatTime(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function groupByDate(chats: ChatRecord[]): { label: string; items: ChatRecord[] }[] {
  const groups: Map<string, ChatRecord[]> = new Map();
  for (const c of chats) {
    const label = formatRelativeDate(c.updated_at);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(c);
  }
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

// ── Chat card ──────────────────────────────────────────────────────────────────

function ChatCard({
  chat,
  onOpen,
  onDelete,
}: {
  chat: ChatRecord;
  onOpen: (chat: ChatRecord) => void;
  onDelete: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setDeleting(true);
    try {
      await deleteSavedChat(chat.id);
      onDelete(chat.id);
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div
      onClick={() => onOpen(chat)}
      style={{
        padding: "12px 16px",
        borderBottom: "1px solid var(--border)",
        cursor: "pointer",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        transition: "background 120ms",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-2)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {/* Topic icon circle */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: 1,
          color: "var(--primary)",
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <TopicBadge topic={chat.topic as ChatTopic} />
          <span style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: "auto", flexShrink: 0 }}>
            {formatDate(chat.updated_at)}
          </span>
        </div>
        <p
          style={{
            fontSize: 13,
            color: "var(--ink)",
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            margin: 0,
          }}
        >
          {chat.title || "Untitled conversation"}
        </p>
      </div>

      {/* Delete */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        title="Delete conversation"
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          color: "var(--ink-3)",
          opacity: deleting ? 0.5 : 1,
          transition: "background 120ms, color 120ms",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--danger-50)"; e.currentTarget.style.color = "var(--danger)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--ink-3)"; }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14H6L5 6" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      </button>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ onStartChat }: { onStartChat: () => void }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 24px" }}>
      <div
        style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "var(--bg-2)", border: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px", color: "var(--ink-3)",
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      </div>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>
        No saved chats yet
      </h3>
      <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5, marginBottom: 20, maxWidth: 280, margin: "0 auto 20px" }}>
        Your conversations with Raseed AI will appear here once you start chatting.
      </p>
      <button
        onClick={onStartChat}
        className="btn-primary"
        style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
        Start a conversation
      </button>
    </div>
  );
}

// ── Main page content ──────────────────────────────────────────────────────────

function ChatsContent() {
  const [chats, setChats] = useState<ChatRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listChats()
      .then(setChats)
      .catch(() => setError("Could not load chat history."))
      .finally(() => setLoading(false));
  }, []);

  async function handleOpen(chat: ChatRecord) {
    try {
      // Fetch full chat with messages
      const full = await getChat(chat.id);
      window.dispatchEvent(
        new CustomEvent("raseed:load-chat", {
          detail: {
            id: full.id,
            topic: full.topic as ChatTopic,
            messages: full.messages ?? [],
          },
        }),
      );
    } catch {
      // Fallback: open without messages
      window.dispatchEvent(
        new CustomEvent("raseed:chat", {
          detail: { topic: chat.topic as ChatTopic },
        }),
      );
    }
  }

  function handleDelete(id: string) {
    setChats((prev) => prev.filter((c) => c.id !== id));
  }

  function handleStartChat() {
    window.dispatchEvent(new CustomEvent("raseed:chat", { detail: { topic: "misc" } }));
  }

  const groups = groupByDate(chats);

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-20 px-6 py-4"
        style={{
          background: "rgba(250,247,241,0.92)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em" }}>
              Chat history
            </h1>
            <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 2 }}>
              Your past conversations with Raseed AI
            </p>
          </div>
          {chats.length > 0 && (
            <button
              onClick={handleStartChat}
              className="btn-primary"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New chat
            </button>
          )}
        </div>
      </header>

      <div className="max-w-2xl mx-auto py-6 px-4">
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--ink-3)", fontSize: 14 }}>
            Loading…
          </div>
        ) : error ? (
          <div style={{ textAlign: "center", padding: "40px", color: "var(--danger)", fontSize: 14 }}>
            {error}
          </div>
        ) : chats.length === 0 ? (
          <EmptyState onStartChat={handleStartChat} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {groups.map(({ label, items }) => (
              <div key={label}>
                {/* Group label */}
                <div
                  style={{
                    fontSize: 11, fontWeight: 700, color: "var(--ink-3)",
                    textTransform: "uppercase", letterSpacing: "0.06em",
                    marginBottom: 8, paddingLeft: 4,
                  }}
                >
                  {label}
                </div>

                {/* Cards */}
                <div
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-lg)",
                    overflow: "hidden",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  {items.map((chat) => (
                    <ChatCard
                      key={chat.id}
                      chat={chat}
                      onOpen={handleOpen}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatsPage() {
  return (
    <AuthGuard>
      <ChatsContent />
    </AuthGuard>
  );
}
