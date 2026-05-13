"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import NoticeExplainer from "@/components/NoticeExplainer";
import ActionChecklist, { type ChecklistItem } from "@/components/ActionChecklist";
import {
  queryGSTNotice,
  getDeadlines,
  ApiError,
  type GSTNoticeResponse,
  type GSTStructuredData,
  type ComplianceStructuredData,
  type DeadlinesResponse,
} from "@/lib/api";

// ── Spinner ────────────────────────────────────────────────────────────────

function Spinner({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      style={{ animation: "spin 0.8s linear infinite", color: "var(--primary)" }}
    >
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <path d="M12 2a10 10 0 0110 10" />
    </svg>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function Skeleton({ w, h = 16 }: { w: string | number; h?: number }) {
  return (
    <div
      className="animate-pulse"
      style={{
        width: w, height: h, borderRadius: 6,
        background: "var(--bg-3)",
      }}
    />
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5">
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 18 }} className="space-y-4">
        <Skeleton w={120} h={26} />
        <Skeleton w="90%" h={20} />
        <Skeleton w="70%" h={20} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 18 }} className="space-y-3">
          <Skeleton w={100} /><Skeleton w={80} h={40} /><Skeleton w={140} />
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 18 }} className="space-y-3">
          <Skeleton w={100} /><Skeleton w={80} h={40} /><Skeleton w={140} />
        </div>
      </div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 18 }} className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton w={20} h={20} />
            <Skeleton w="75%" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Deadline pill (from /compliance/deadlines) ─────────────────────────────

function DeadlinePill({ form, days, urgency }: { form: string; days: number; urgency: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    overdue:  { bg: "var(--danger-50)",  fg: "var(--danger)"  },
    urgent:   { bg: "#FBF1E4",           fg: "var(--accent)"  },
    soon:     { bg: "#FBF1E4",           fg: "var(--accent)"  },
    upcoming: { bg: "var(--primary-50)", fg: "var(--primary)" },
  };
  const { bg, fg } = colors[urgency] ?? colors.upcoming;
  return (
    <div
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "6px 12px",
        borderRadius: 999,
        background: bg, color: fg,
        fontSize: 13, fontWeight: 600,
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
      </svg>
      {form} · {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "today" : `${days}d`}
    </div>
  );
}

// ── Main compliance page ───────────────────────────────────────────────────

function CompliancePageContent() {
  const searchParams = useSearchParams();
  const uploadId = searchParams.get("upload_id");

  const [analysisResult, setAnalysisResult] = useState<GSTNoticeResponse | null>(null);
  const [deadlines, setDeadlines] = useState<DeadlinesResponse | null>(null);
  const [loading, setLoading] = useState(!!uploadId);
  const [error, setError] = useState<string | null>(null);

  // Always fetch standard deadlines
  useEffect(() => {
    getDeadlines().then(setDeadlines).catch(() => null);
  }, []);

  // Fetch notice analysis if upload_id is provided
  useEffect(() => {
    if (!uploadId) return;
    setLoading(true);
    setError(null);

    queryGSTNotice(uploadId)
      .then(setAnalysisResult)
      .catch((e) => {
        setError(
          e instanceof ApiError
            ? e.message
            : "Could not analyse the notice. Please try again."
        );
      })
      .finally(() => setLoading(false));
  }, [uploadId]);

  // Pull structured_data out of the orchestrator response
  const gstData   = (analysisResult?.responses.find((r) => r.agent === "gst_tax_agent")?.structured_data  ?? {}) as GSTStructuredData;
  const compData  = (analysisResult?.responses.find((r) => r.agent === "compliance_agent")?.structured_data ?? {}) as ComplianceStructuredData;
  const gstSummary = analysisResult?.responses.find((r) => r.agent === "gst_tax_agent")?.summary;

  const checklist: ChecklistItem[] = (compData.action_checklist ?? []).map((item) => ({
    task:     item.task,
    deadline: item.deadline,
    priority: item.priority,
  }));

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      {/* ── Header ───────────────────────────────────────────────────────── */}
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
              GST Compliance
            </h1>
            <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 2 }}>
              {uploadId
                ? "Notice analysis, action checklist, and draft reply"
                : "Filing deadlines and compliance overview"}
            </p>
          </div>
          {!uploadId && (
            <Link
              href="/upload?type=gst_notice"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "9px 16px",
                background: "var(--primary)", color: "#FCFAF4",
                borderRadius: "var(--radius-md)",
                fontSize: 14, fontWeight: 600,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              Upload a notice
            </Link>
          )}
        </div>
      </header>

      <div className="px-6 py-6 max-w-5xl mx-auto space-y-8">
        {/* ── Standard filing deadlines (always shown) ─────────────────── */}
        {deadlines && deadlines.deadlines.length > 0 && (
          <section>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 12 }}>
              Upcoming GST filing deadlines
            </h2>
            <div className="flex flex-wrap gap-2">
              {deadlines.deadlines.map((d) => (
                <DeadlinePill
                  key={d.form}
                  form={d.form}
                  days={d.days_remaining}
                  urgency={d.urgency}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── No upload_id — prompt to upload ─────────────────────────── */}
        {!uploadId && !loading && (
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-sm)",
              padding: "48px 24px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 56, height: 56, borderRadius: "var(--radius-lg)",
                background: "var(--bg-2)", color: "var(--ink-3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 16px",
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
              </svg>
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>
              No notice loaded
            </h3>
            <p style={{ fontSize: 14, color: "var(--ink-2)", marginBottom: 20, lineHeight: 1.6 }}>
              Upload a GST notice to see a plain-language explanation,<br />
              action checklist, and an AI-drafted reply.
            </p>
            <Link
              href="/upload?type=gst_notice"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "10px 20px",
                background: "var(--primary)", color: "#FCFAF4",
                borderRadius: "var(--radius-md)",
                fontSize: 14, fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Upload a GST notice
            </Link>
          </div>
        )}

        {/* ── Loading state ─────────────────────────────────────────────── */}
        {loading && (
          <div className="space-y-5">
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: "32px",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
              }}
            >
              <Spinner size={36} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink)" }}>
                  Analysing your GST notice…
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 4 }}>
                  GST Tax Agent + Compliance Agent running — this takes ~30 s
                </div>
              </div>
            </div>
            <LoadingSkeleton />
          </div>
        )}

        {/* ── Error state ───────────────────────────────────────────────── */}
        {error && !loading && (
          <div
            style={{
              background: "var(--danger-50)",
              border: "1px solid #DFA098",
              borderRadius: "var(--radius-lg)",
              padding: "16px 18px",
              display: "flex", gap: 12, alignItems: "flex-start",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
            </svg>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--danger)" }}>Analysis failed</div>
              <div style={{ fontSize: 13, color: "var(--danger)", marginTop: 2 }}>{error}</div>
            </div>
          </div>
        )}

        {/* ── Analysis results ──────────────────────────────────────────── */}
        {analysisResult && !loading && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: notice explainer (2/3 width on desktop) */}
            <div className="lg:col-span-2 space-y-5">
              <section>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 14 }}>
                  Notice breakdown
                </h2>
                <NoticeExplainer
                  notice={gstData}
                  compliance={compData}
                  gstSummary={gstSummary}
                />
              </section>
            </div>

            {/* Right: action checklist (1/3 width on desktop) */}
            <div className="space-y-5">
              <section>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 14 }}>
                  Action checklist
                </h2>
                <div
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-lg)",
                    boxShadow: "var(--shadow-sm)",
                    padding: "18px",
                  }}
                >
                  {checklist.length > 0 ? (
                    <ActionChecklist items={checklist} />
                  ) : (
                    <p style={{ fontSize: 13, color: "var(--ink-3)", textAlign: "center", padding: "16px 0" }}>
                      No checklist items returned.
                    </p>
                  )}
                </div>
              </section>

              {/* Integrated insight */}
              {analysisResult.integrated_insight && (
                <section>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 14 }}>
                    Cross-domain insight
                  </h2>
                  <div
                    style={{
                      background: "var(--primary-50)",
                      border: "1px solid #B4BDEA",
                      borderRadius: "var(--radius-lg)",
                      padding: "16px 18px",
                    }}
                  >
                    <p style={{ fontSize: 13, color: "var(--primary)", lineHeight: 1.6 }}>
                      {analysisResult.integrated_insight}
                    </p>
                  </div>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CompliancePage() {
  return (
    <Suspense>
      <CompliancePageContent />
    </Suspense>
  );
}
