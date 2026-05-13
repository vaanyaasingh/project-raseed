"use client";

import { useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

export interface NoticeData {
  notice_type?: string;
  reason?: string;
  deadline?: string;
  tax_amount?: number;
  applicable_sections?: string[];
  requires_legal_help?: boolean;
}

export interface ComplianceData {
  draft_reply?: string;
  documents_needed?: string[];
}

interface NoticeExplainerProps {
  notice: NoticeData;
  compliance: ComplianceData;
  gstSummary?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const due = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - now.getTime()) / 86_400_000);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function formatINR(amount: number): string {
  return "₹" + amount.toLocaleString("en-IN");
}

// ── Copy button ────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border)",
        background: copied ? "var(--success-50)" : "var(--surface)",
        color: copied ? "var(--success)" : "var(--ink-2)",
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        transition: "all 150ms var(--ease)",
        fontFamily: "inherit",
        whiteSpace: "nowrap",
      }}
    >
      {copied ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
          Copy to clipboard
        </>
      )}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function NoticeExplainer({ notice, compliance, gstSummary }: NoticeExplainerProps) {
  const [draftOpen, setDraftOpen] = useState(false);

  const days     = notice.deadline ? daysUntil(notice.deadline) : null;
  const overdue  = days !== null && days < 0;
  const urgent   = days !== null && days >= 0 && days <= 7;

  const deadlineColor = overdue ? "var(--danger)" : urgent ? "var(--accent)" : "var(--ink)";

  // Detect notice form code from notice_type (e.g. "FORM GST ASMT-10" → "ASMT-10")
  const formCode = notice.notice_type
    ? (notice.notice_type.match(/\b(ASMT-\d+|DRC-\d+|GSTR-\d+[A-Z]?)\b/i)?.[0] ?? notice.notice_type)
    : null;

  return (
    <div className="space-y-5">
      {/* ── Notice type + reason ─────────────────────────────────────────── */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-sm)",
          overflow: "hidden",
        }}
      >
        {/* Coloured top band */}
        <div
          style={{
            background: "var(--danger-50)",
            borderBottom: "1px solid #DFA098",
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          {/* Notice type badge */}
          {formCode && (
            <span
              style={{
                background: "var(--danger)",
                color: "#FCFAF4",
                fontSize: 12,
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: 999,
                letterSpacing: "0.04em",
                whiteSpace: "nowrap",
              }}
            >
              {formCode}
            </span>
          )}
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--danger)" }}>
            GST Notice received
          </span>
        </div>

        <div style={{ padding: "18px" }} className="space-y-5">
          {/* Plain-language reason */}
          {notice.reason && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                What this is about
              </div>
              <p style={{ fontSize: 17, lineHeight: 1.6, color: "var(--ink)", fontWeight: 400 }}>
                {notice.reason}
              </p>
            </div>
          )}

          {/* GST agent summary */}
          {gstSummary && !notice.reason && (
            <p style={{ fontSize: 16, lineHeight: 1.6, color: "var(--ink)" }}>{gstSummary}</p>
          )}

          {/* Applicable sections */}
          {notice.applicable_sections && notice.applicable_sections.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {notice.applicable_sections.map((s) => (
                <span
                  key={s}
                  style={{
                    fontSize: 12, padding: "3px 10px", borderRadius: 999,
                    background: "var(--primary-50)", color: "var(--primary)",
                    fontWeight: 500,
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Deadline + tax amount row ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Deadline card */}
        {notice.deadline && (
          <div
            style={{
              background: "var(--surface)",
              border: `1px solid ${overdue ? "#DFA098" : urgent ? "#ECC68A" : "var(--border)"}`,
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
              padding: "18px",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              Response deadline
            </div>

            {/* Large countdown */}
            <div
              className="num"
              style={{ fontSize: 40, fontWeight: 800, color: deadlineColor, lineHeight: 1, letterSpacing: "-0.02em" }}
            >
              {overdue
                ? `${Math.abs(days!)}d overdue`
                : days === 0
                ? "Due today"
                : `${days} days`}
            </div>

            <div style={{ fontSize: 14, color: "var(--ink-2)", marginTop: 6 }}>
              {overdue ? "Was due on " : "Due on "}
              <strong style={{ color: deadlineColor }}>{formatDate(notice.deadline)}</strong>
            </div>

            {overdue && (
              <div
                style={{
                  marginTop: 10,
                  padding: "6px 10px",
                  background: "var(--danger-50)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 12,
                  color: "var(--danger)",
                  fontWeight: 500,
                }}
              >
                Filing a reply immediately may reduce penalties.
              </div>
            )}
          </div>
        )}

        {/* Tax / penalty amount card */}
        {notice.tax_amount != null && notice.tax_amount > 0 && (
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid #ECC68A",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
              padding: "18px",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              Tax liability / penalty
            </div>
            <div
              className="num"
              style={{ fontSize: 36, fontWeight: 800, color: "var(--accent)", lineHeight: 1, letterSpacing: "-0.02em" }}
            >
              {formatINR(notice.tax_amount)}
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 6 }}>
              Amount indicated in the notice
            </div>
          </div>
        )}
      </div>

      {/* ── Legal help banner ─────────────────────────────────────────────── */}
      {notice.requires_legal_help && (
        <div
          style={{
            background: "#FBF1E4",
            border: "1px solid #ECC68A",
            borderRadius: "var(--radius-lg)",
            padding: "14px 18px",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div style={{ color: "var(--accent)", marginTop: 1, flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--accent)" }}>
              Professional advice recommended
            </div>
            <div style={{ fontSize: 13, color: "#A75D1F", marginTop: 3, lineHeight: 1.5 }}>
              This notice involves complex legal provisions. We recommend consulting a
              qualified CA or GST practitioner before filing your reply.
            </div>
          </div>
        </div>
      )}

      {/* ── Documents needed ─────────────────────────────────────────────── */}
      {compliance.documents_needed && compliance.documents_needed.length > 0 && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-sm)",
            padding: "18px",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 12 }}>
            Documents to gather
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }} className="space-y-2">
            {compliance.documents_needed.map((doc, i) => (
              <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ color: "var(--primary)", marginTop: 3, flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6" />
                  </svg>
                </span>
                <span style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.4 }}>{doc}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Draft reply ────────────────────────────────────────────────────── */}
      {compliance.draft_reply && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-sm)",
            overflow: "hidden",
          }}
        >
          <button
            onClick={() => setDraftOpen((v) => !v)}
            style={{
              width: "100%",
              padding: "14px 18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "none",
              border: "none",
              borderBottom: draftOpen ? "1px solid var(--border)" : "none",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "var(--primary)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </span>
              <span style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>
                AI draft reply
              </span>
              <span
                style={{
                  fontSize: 11, padding: "2px 8px", borderRadius: 999,
                  background: "var(--primary-50)", color: "var(--primary)",
                  fontWeight: 600,
                }}
              >
                Ready to use
              </span>
            </div>
            <svg
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: draftOpen ? "rotate(180deg)" : "none", transition: "transform 200ms var(--ease)" }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {draftOpen && (
            <div style={{ padding: "16px 18px" }} className="space-y-3">
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                Review carefully before sending. This is an AI-generated draft — verify all facts.
              </div>
              <textarea
                readOnly
                value={compliance.draft_reply}
                rows={Math.min(20, compliance.draft_reply.split("\n").length + 3)}
                style={{
                  width: "100%",
                  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                  fontSize: 13,
                  lineHeight: 1.7,
                  color: "var(--ink)",
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  padding: "12px 14px",
                  resize: "vertical",
                  outline: "none",
                }}
              />
              <div className="flex justify-end">
                <CopyButton text={compliance.draft_reply} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

