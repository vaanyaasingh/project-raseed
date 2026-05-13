"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import CashFlowChart, { type MonthBar } from "@/components/CashFlowChart";
import {
  queryFinance,
  ApiError,
  type FinanceResponse,
  type FinanceStructuredData,
} from "@/lib/api";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatINR(n: number): string {
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)}L`;
  if (n >= 1_000)    return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function formatDate(s: string): string {
  return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ── Health score card ──────────────────────────────────────────────────────

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
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-sm)",
        padding: "20px",
        display: "flex",
        gap: 20,
        alignItems: "center",
      }}
    >
      {/* Score circle */}
      <div
        style={{
          width: 88, height: 88, borderRadius: "50%", flexShrink: 0,
          background: bgColor,
          border: `3px solid ${color}`,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 0,
        }}
      >
        <span
          className="num"
          style={{ fontSize: 34, fontWeight: 800, color, lineHeight: 1, letterSpacing: "-0.03em" }}
        >
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
    <div
      style={{
        borderBottom: index > 0 ? "1px solid var(--border)" : undefined,
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, padding: "12px 0",
          background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div
            style={{
              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
              background: "var(--accent)",
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }} className="truncate">
              {a.description}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 1 }}>
              {a.date ? formatDate(a.date) : ""}
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
        <div
          style={{
            padding: "6px 0 14px 20px",
            fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5,
            borderLeft: "2px solid var(--accent)",
            marginLeft: 4,
            marginBottom: 4,
          }}
        >
          {a.reason}
        </div>
      )}
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function Sk({ w, h = 14 }: { w: string | number; h?: number }) {
  return <div className="animate-pulse" style={{ width: w, height: h, borderRadius: 6, background: "var(--bg-3)" }} />;
}

// ── Main finance page ──────────────────────────────────────────────────────

function FinancePageContent() {
  const searchParams = useSearchParams();
  const uploadId     = searchParams.get("upload_id");

  const [result,  setResult]  = useState<FinanceResponse | null>(null);
  const [loading, setLoading] = useState(!!uploadId);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!uploadId) return;
    setLoading(true);
    queryFinance(uploadId)
      .then(setResult)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Analysis failed."))
      .finally(() => setLoading(false));
  }, [uploadId]);

  const finData = (result?.responses.find((r) => r.agent === "finance_agent")
    ?.structured_data ?? {}) as FinanceStructuredData & { health_reason?: string; top_categories?: { category: string; amount: number }[] };

  const inflow   = finData.total_inflow  ?? 0;
  const outflow  = finData.total_outflow ?? 0;
  const net      = finData.net           ?? inflow - outflow;
  const score    = finData.health_score  ?? 0;
  const anomalies: Anomaly[] = (finData.anomalies ?? []) as Anomaly[];

  // Build dummy monthly data from anomalies/transactions if API gives none
  const monthlyData: MonthBar[] = [];

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
          {!uploadId && (
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
          )}
        </div>
      </header>

      <div className="px-6 py-6 max-w-5xl mx-auto space-y-6">
        {/* Empty state */}
        {!uploadId && !loading && (
          <div
            style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)",
              padding: "56px 24px", textAlign: "center",
            }}
          >
            <div style={{ width: 56, height: 56, borderRadius: "var(--radius-lg)", background: "var(--bg-2)", color: "var(--ink-3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>No bank statement loaded</h3>
            <p style={{ fontSize: 14, color: "var(--ink-2)", marginBottom: 20, lineHeight: 1.6 }}>
              Upload a CSV bank statement to see cash flow analysis,<br />anomaly detection, and category breakdown.
            </p>
            <Link
              href="/upload?type=bank_statement"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", background: "var(--primary)", color: "#FCFAF4", borderRadius: "var(--radius-md)", fontSize: 14, fontWeight: 600, textDecoration: "none" }}
            >
              Upload bank statement
            </Link>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: "var(--danger-50)", border: "1px solid #DFA098", borderRadius: "var(--radius-lg)", padding: "14px 18px", fontSize: 14, color: "var(--danger)", fontWeight: 500 }}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-5">
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 0.8s linear infinite" }}>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                <path d="M12 2a10 10 0 0110 10" />
              </svg>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink)" }}>Analysing your bank statement…</div>
                <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 4 }}>Finance Agent running — detecting anomalies and trends</div>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {[1,2,3].map(i => <div key={i} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 20 }} className="space-y-3"><Sk w={80} h={12} /><Sk w={60} h={36} /><Sk w={140} h={12} /></div>)}
            </div>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div className="space-y-6">
            {/* Health score */}
            {score > 0 && (
              <HealthScore score={score} reason={(finData as Record<string, unknown>).health_reason as string | undefined} />
            )}

            {/* Cash flow chart */}
            <div
              style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", padding: 20,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 16 }}>
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
              <div
                style={{
                  background: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)",
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
                    Anomalies detected
                  </span>
                  {anomalies.length > 0 && (
                    <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#FBF1E4", color: "var(--accent)" }}>
                      {anomalies.length}
                    </span>
                  )}
                </div>
                <div style={{ padding: "4px 18px 4px" }}>
                  {anomalies.length > 0 ? (
                    anomalies.map((a, i) => <AnomalyRow key={i} a={a} index={i} />)
                  ) : (
                    <div style={{ padding: "32px 0", textAlign: "center" }}>
                      <div style={{ fontSize: 13, color: "var(--success)", fontWeight: 600 }}>✓ No anomalies detected</div>
                      <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>All transactions look normal.</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action items from finance agent */}
              <div
                style={{
                  background: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)",
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>Recommendations</span>
                </div>
                <div style={{ padding: "12px 18px" }} className="space-y-2">
                  {(result.responses.find((r) => r.agent === "finance_agent")?.action_items ?? []).length > 0 ? (
                    (result.responses.find((r) => r.agent === "finance_agent")?.action_items ?? []).map((item, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: i < (result.responses.find((r) => r.agent === "finance_agent")?.action_items.length ?? 1) - 1 ? "1px solid var(--border)" : "none" }}>
                        <span style={{ color: "var(--primary)", flexShrink: 0, marginTop: 2 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                        </span>
                        <span style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.5 }}>{item}</span>
                      </div>
                    ))
                  ) : (
                    <p style={{ fontSize: 13, color: "var(--ink-3)", padding: "16px 0" }}>No specific recommendations.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Agent summary */}
            {result.responses.find((r) => r.agent === "finance_agent")?.summary && (
              <div style={{ padding: "12px 16px", background: "var(--primary-50)", border: "1px solid #B4BDEA", borderRadius: "var(--radius-md)" }}>
                <p style={{ fontSize: 13, color: "var(--primary)", lineHeight: 1.6 }}>
                  {result.responses.find((r) => r.agent === "finance_agent")?.summary}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function FinancePage() {
  return (
    <Suspense><FinancePageContent /></Suspense>
  );
}
