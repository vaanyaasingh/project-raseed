"use client";

import { useState, useMemo } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ChecklistItem {
  task: string;
  deadline: string;
  priority: "high" | "medium" | "low";
}

interface ActionChecklistProps {
  items: ChecklistItem[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<ChecklistItem["priority"], number> = {
  high: 0, medium: 1, low: 2,
};

const PRIORITY_STYLE: Record<ChecklistItem["priority"], { bg: string; fg: string; label: string }> = {
  high:   { bg: "var(--danger-50)",  fg: "var(--danger)",  label: "High"   },
  medium: { bg: "#FBF1E4",           fg: "var(--accent)",  label: "Medium" },
  low:    { bg: "var(--success-50)", fg: "var(--success)", label: "Low"    },
};

function daysUntil(dateStr: string): number {
  const due  = new Date(dateStr);
  const now  = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / 86_400_000);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ActionChecklist({ items }: ActionChecklistProps) {
  const sorted = useMemo(
    () => [...items].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]),
    [items]
  );

  const [checked, setChecked] = useState<Record<number, boolean>>({});

  function toggle(idx: number) {
    setChecked((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }

  const doneCount  = Object.values(checked).filter(Boolean).length;
  const totalCount = sorted.length;
  const pct        = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  if (sorted.length === 0) return null;

  return (
    <div>
      {/* Progress bar */}
      <div className="flex items-center justify-between mb-2">
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)" }}>
          {doneCount} of {totalCount} completed
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: pct === 100 ? "var(--success)" : "var(--ink-2)" }}>
          {pct}%
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: "var(--bg-3)",
          borderRadius: 999,
          overflow: "hidden",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: pct === 100 ? "var(--success)" : "var(--primary)",
            borderRadius: 999,
            transition: "width 300ms var(--ease)",
          }}
        />
      </div>

      {/* Items */}
      <div className="space-y-2">
        {sorted.map((item, idx) => {
          const done   = !!checked[idx];
          const days   = item.deadline ? daysUntil(item.deadline) : null;
          const pStyle = PRIORITY_STYLE[item.priority];
          const overdue = days !== null && days < 0;

          return (
            <div
              key={idx}
              onClick={() => toggle(idx)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "12px 14px",
                background: done ? "var(--bg-2)" : "var(--surface)",
                border: `1px solid ${done ? "var(--border)" : overdue ? "#DFA098" : "var(--border)"}`,
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
                opacity: done ? 0.6 : 1,
                transition: "opacity 150ms var(--ease), background 150ms var(--ease)",
                userSelect: "none",
              }}
            >
              {/* Checkbox */}
              <div
                style={{
                  width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
                  border: `2px solid ${done ? "var(--success)" : "var(--border-strong)"}`,
                  background: done ? "var(--success)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background 150ms var(--ease), border-color 150ms var(--ease)",
                }}
              >
                {done && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FCFAF4" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div
                  style={{
                    fontSize: 14, fontWeight: 500, color: "var(--ink)",
                    textDecoration: done ? "line-through" : "none",
                    lineHeight: 1.4,
                  }}
                >
                  {item.task}
                </div>

                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {/* Priority badge */}
                  <span
                    style={{
                      fontSize: 11, fontWeight: 700, padding: "1px 7px",
                      borderRadius: 999, background: pStyle.bg, color: pStyle.fg,
                      letterSpacing: "0.03em", textTransform: "uppercase",
                    }}
                  >
                    {pStyle.label}
                  </span>

                  {/* Deadline */}
                  {item.deadline && (
                    <span
                      style={{
                        fontSize: 12,
                        color: overdue ? "var(--danger)" : days !== null && days <= 3 ? "var(--accent)" : "var(--ink-3)",
                        fontWeight: overdue ? 600 : 400,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {overdue
                        ? `⚠ ${Math.abs(days!)}d overdue`
                        : days === 0
                        ? "Due today"
                        : days !== null && days <= 7
                        ? `Due in ${days}d`
                        : formatDate(item.deadline)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
