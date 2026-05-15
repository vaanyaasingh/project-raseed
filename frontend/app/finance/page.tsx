"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CashFlowChart, { type MonthBar } from "@/components/CashFlowChart";
import { type FinanceStructuredData } from "@/lib/api";
import { getUploadsWithAnalyses, type DbUpload, type DbAnalysis } from "@/lib/supabase";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatINR(n: number): string {
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)}L`;
  if (n >= 1_000)    return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function formatDate(s: string): string {
  return new Date(s).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function formatDateShort(s: string): string {
  return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function Sk({ w, h = 14 }: { w: string | number; h?: number }) {
  return (
    <div
      className="animate-pulse"
      style={{ width: w, height: h, borderRadius: 6, background: "var(--bg-3)" }}
    />
  );
}

function CardSkeleton() {
  return (
    <div
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: 18,
      }}
      className="space-y-3"
    >
      <div className="flex items-center justify-between">
        <Sk w={200} h={18} />
        <Sk w={64} h={22} />
      </div>
      <Sk w="60%" h={14} />
      <Sk w={100} h={14} />
    </div>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DbUpload["analysis_status"] }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    complete: { bg: "var(--success-50)", fg: "var(--success)", label: "Complete" },
    pending:  { bg: "#FBF1E4",           fg: "var(--accent)",  label: "Pending"  },
    failed:   { bg: "var(--danger-50)",  fg: "var(--danger)",  label: "Failed"   },
  };
  const { bg, fg, label } = map[status] ?? map.pending;
  return (
    <span style={{
      padding: "3px 10px", borderRadius: 999,
      background: bg, color: fg,
      fontSize: 12, fontWeight: 700,
    }}>
      {label}
    </span>
  );
}

// ── Health score component ─────────────────────────────────────────────────

function HealthScore({ score, reason }: { score: number; reason?: string }) {
  const color =
    score > 7 ? "var(--success)" :
    score >= 4 ? "var(--accent)"  :
    "var(--danger)";

  const bgColor =
    score > 7 ? "var(--success-50)" :
    score >= 4 ? "#FBF1E4"           :
    "var(--danger-50)";

  const label =
    score > 7 ? "Healthy" :
    score >= 4 ? "Moderate" :
    "Needs attention";

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)",
      padding: "20px", display: "flex", gap: 20, alignItems: "center",
    }}>
      <div style={{
        width: 88, height: 88, borderRadius: "50%", flexShrink: 0,
        background: bgColor, border: `3px solid ${color}`,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}>
        <span className="num" style={{ fontSize: 34, fontWeight: 800, color, lineHeight: 1, letterSpacing: "-0.03em" }}>
          {score}
        </span>
        <span style={{ fontSize: 10, color, fontWeight: 600, opacity: 0.7 }}>/10</span>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
          Cash flow health
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color, marginBottom: 6 }}>{label}</div>
        {reason && (
          <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5, maxWidth: 340 }}>
            {reason}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Anomaly row ────────────────────────────────────────────────────────────

interface Anomaly {
  date: string;
  description: string;
  reason: string;
  amount: number;
}

function AnomalyRow({ a, index }: { a: Anomaly; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: index > 0 ? "1px solid var(--border)" : undefined }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, padding: "12px 0",
          background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: "var(--accent)" }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }} className="truncate">
              {a.description}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 1 }}>
              {a.date ? formatDateShort(a.date) : ""}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span className="num" style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
            {formatINR(a.amount)}
          </span>
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 200ms" }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>
      {open && (
        <div style={{
          padding: "6px 0 14px 20px",
          fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5,
          borderLeft: "2px solid var(--accent)", marginLeft: 4, marginBottom: 4,
        }}>
          {a.reason}
        </div>
      )}
    </div>
  );
}

// ── Expanded analysis panel ────────────────────────────────────────────────

function AnalysisPanel({ analysis }: { analysis: DbAnalysis }) {
  const result    = analysis.result_json;
  const finAgent  = result.responses.find((r) => r.agent === "finance_agent");
  const finData   = (finAgent?.structured_data ?? {}) as FinanceStructuredData & {
    health_reason?: string;
    top_categories?: { category: string; amount: number }[];
  };

  const inflow    = finData.total_inflow  ?? 0;
  const outflow   = finData.total_outflow ?? 0;
  const net       = finData.net           ?? (inflow - outflow);
  const score     = finData.health_score  ?? 0;
  const anomalies = (finData.anomalies ?? []) as Anomaly[];
  const monthlyData: MonthBar[] = [];

  return (
    <div style={{ borderTop: "1px solid var(--border)", padding: "18px" }} className="space-y-5">
      {/* Health score */}
      {score > 0 && (
        <HealthScore score={score} reason={finData.health_reason} />
      )}

      {/* Cash flow chart */}
      <div style={{
        background: "var(--bg)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: 18,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 14 }}>
          Cash flow overview
        </div>
        {inflow === 0 && outflow === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-3)" }}>No transaction data available.</p>
        ) : (
          <CashFlowChart
            totalInflow={inflow}
            totalOutflow={outflow}
            net={net}
            monthlyData={monthlyData}
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Anomalies */}
        <div style={{
          background: "var(--bg)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", overflow: "hidden",
        }}>
          <div style={{
            padding: "12px 16px", borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
              Anomalies detected
            </span>
            {anomalies.length > 0 && (
              <span style={{
                fontSize: 12, fontWeight: 700, padding: "2px 8px",
                borderRadius: 999, background: "#FBF1E4", color: "var(--accent)",
              }}>
                {anomalies.length}
              </span>
            )}
          </div>
          <div style={{ padding: "4px 16px 4px" }}>
            {anomalies.length > 0 ? (
              anomalies.map((a, i) => <AnomalyRow key={i} a={a} index={i} />)
            ) : (
              <div style={{ padding: "28px 0", textAlign: "center" }}>
                <div style={{ fontSize: 13, color: "var(--success)", fontWeight: 600 }}>✓ No anomalies detected</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>All transactions look normal.</div>
              </div>
            )}
          </div>
        </div>

        {/* Recommendations */}
        <div style={{
          background: "var(--bg)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", overflow: "hidden",
        }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>Recommendations</span>
          </div>
          <div style={{ padding: "10px 16px" }} className="space-y-2">
            {(finAgent?.action_items ?? []).length > 0 ? (
              (finAgent?.action_items ?? []).map((item, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "8px 0",
                  borderBottom: i < (finAgent?.action_items.length ?? 1) - 1 ? "1px solid var(--border)" : "none",
                }}>
                  <span style={{ color: "var(--primary)", flexShrink: 0, marginTop: 2 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </span>
                  <span style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.5 }}>{item}</span>
                </div>
              ))
            ) : (
              <p style={{ fontSize: 13, color: "var(--ink-3)", padding: "14px 0" }}>No specific recommendations.</p>
            )}
          </div>
        </div>
      </div>

      {/* Agent summary */}
      {finAgent?.summary && (
        <div style={{
          padding: "12px 16px",
          background: "var(--primary-50)", border: "1px solid #B4BDEA",
          borderRadius: "var(--radius-md)",
        }}>
          <p style={{ fontSize: 13, color: "var(--primary)", lineHeight: 1.6 }}>
            {finAgent.summary}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Upload card ────────────────────────────────────────────────────────────

function UploadCard({ upload }: { upload: DbUpload }) {
  const [expanded, setExpanded] = useState(false);

  const analysis  = upload.analyses?.[0];
  const finAgent  = analysis?.result_json.responses.find((r) => r.agent === "finance_agent");
  const finData   = (finAgent?.structured_data ?? {}) as FinanceStructuredData;
  const score     = finData.health_score;
  const anomalyCount = ((finData.anomalies ?? []) as unknown[]).length;

  const scoreColor =
    !score      ? "var(--ink-3)" :
    score > 7   ? "var(--success)" :
    score >= 4  ? "var(--accent)"  :
    "var(--danger)";

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden",
    }}>
      {/* Card header */}
      <div style={{ padding: "16px 18px" }}>
        <div className="flex items-start justify-between gap-3">
          <div style={{ minWidth: 0 }}>
            <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
              <span style={{
                fontSize: 15, fontWeight: 600, color: "var(--ink)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                maxWidth: 280,
              }}>
                {upload.filename}
              </span>
              <StatusBadge status={upload.analysis_status} />
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
              Uploaded {formatDate(upload.uploaded_at)}
            </div>
          </div>

          {/* Health score badge */}
          {upload.analysis_status === "complete" && score !== undefined && (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              padding: "6px 12px",
              background: "var(--bg-2)", borderRadius: "var(--radius-md)",
              flexShrink: 0,
            }}>
              <span className="num" style={{ fontSize: 22, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>
                {score}
              </span>
              <span style={{ fontSize: 10, color: "var(--ink-3)", fontWeight: 600 }}>/10</span>
            </div>
          )}
        </div>

        {/* Stats row */}
        {upload.analysis_status === "complete" && analysis && (
          <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
            <div style={{ display: "flex", gap: 12 }}>
              {anomalyCount > 0 && (
                <span style={{
                  fontSize: 12, fontWeight: 600, padding: "3px 10px",
                  borderRadius: 999, background: "#FBF1E4", color: "var(--accent)",
                }}>
                  {anomalyCount} anomal{anomalyCount !== 1 ? "ies" : "y"}
                </span>
              )}
            </div>
            <button
              onClick={() => setExpanded((v) => !v)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 13, fontWeight: 600, color: "var(--primary)",
                background: "none", border: "none", cursor: "pointer",
                padding: 0, fontFamily: "inherit",
              }}
            >
              {expanded ? "Hide analysis" : "View analysis"}
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 200ms" }}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>
        )}

        {upload.analysis_status === "failed" && (
          <p style={{ fontSize: 13, color: "var(--danger)", marginTop: 8 }}>
            Analysis failed. Try re-uploading this bank statement.
          </p>
        )}

        {upload.analysis_status === "pending" && (
          <p style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 8 }}>
            Analysis is in progress…
          </p>
        )}
      </div>

      {/* Expanded analysis */}
      {expanded && analysis && <AnalysisPanel analysis={analysis} />}
    </div>
  );
}

// ── Main finance page ──────────────────────────────────────────────────────

export default function FinancePage() {
  const [uploads, setUploads] = useState<DbUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    getUploadsWithAnalyses("bank_statement")
      .then(setUploads)
      .catch((e) => setError(e?.message ?? "Could not load statements."))
      .finally(() => setLoading(false));
  }, []);

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
        <div className="flex items-start justify-between gap-4 max-w-5xl mx-auto">
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em" }}>
              Finance Analysis
            </h1>
            <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 2 }}>
              Cash flow, anomaly detection, and category breakdown
            </p>
          </div>
          <Link
            href="/upload?type=bank_statement"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "9px 16px",
              background: "var(--primary)", color: "#FCFAF4",
              borderRadius: "var(--radius-md)",
              fontSize: 14, fontWeight: 600, textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
            </svg>
            Upload bank statement
          </Link>
        </div>
      </header>

      <div className="px-6 py-6 max-w-5xl mx-auto space-y-6">
        {/* Error */}
        {error && (
          <div style={{
            background: "var(--danger-50)", border: "1px solid #DFA098",
            borderRadius: "var(--radius-lg)", padding: "14px 18px",
            fontSize: 14, color: "var(--danger)", fontWeight: 500,
          }}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-4">
            {[1, 2].map((i) => <CardSkeleton key={i} />)}
          </div>
        )}

        {/* List */}
        {!loading && !error && (
          <>
            {uploads.length === 0 ? (
              <div style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)",
                padding: "56px 24px", textAlign: "center",
              }}>
                <div style={{
                  width: 56, height: 56, borderRadius: "var(--radius-lg)",
                  background: "var(--bg-2)", color: "var(--ink-3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 16px",
                }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>
                  No bank statements yet
                </h3>
                <p style={{ fontSize: 14, color: "var(--ink-2)", marginBottom: 20, lineHeight: 1.6 }}>
                  Upload a CSV bank statement to see cash flow analysis,<br />
                  anomaly detection, and category breakdown.
                </p>
                <Link
                  href="/upload?type=bank_statement"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "10px 20px",
                    background: "var(--primary)", color: "#FCFAF4",
                    borderRadius: "var(--radius-md)",
                    fontSize: 14, fontWeight: 600, textDecoration: "none",
                  }}
                >
                  Upload bank statement
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {uploads.map((upload) => (
                  <UploadCard key={upload.id} upload={upload} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
