"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NoticeExplainer from "@/components/NoticeExplainer";
import ActionChecklist, { type ChecklistItem } from "@/components/ActionChecklist";
import { getDeadlines, type GSTStructuredData, type ComplianceStructuredData, type DeadlinesResponse } from "@/lib/api";
import { getUploadsWithAnalyses, type DbUpload, type DbAnalysis } from "@/lib/supabase";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(s: string): string {
  return new Date(s).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

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
        <Skeleton w={180} h={18} />
        <Skeleton w={64} h={22} />
      </div>
      <Skeleton w="75%" h={14} />
      <Skeleton w={120} h={14} />
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

// ── Deadline pill ──────────────────────────────────────────────────────────

function DeadlinePill({ form, days, urgency }: { form: string; days: number; urgency: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    overdue:  { bg: "var(--danger-50)",  fg: "var(--danger)"  },
    urgent:   { bg: "#FBF1E4",           fg: "var(--accent)"  },
    soon:     { bg: "#FBF1E4",           fg: "var(--accent)"  },
    upcoming: { bg: "var(--primary-50)", fg: "var(--primary)" },
  };
  const { bg, fg } = colors[urgency] ?? colors.upcoming;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      padding: "6px 12px", borderRadius: 999,
      background: bg, color: fg,
      fontSize: 13, fontWeight: 600,
    }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
      </svg>
      {form} · {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "today" : `${days}d`}
    </div>
  );
}

// ── Upload card with expandable analysis ───────────────────────────────────

function UploadCard({ upload }: { upload: DbUpload }) {
  const [expanded, setExpanded] = useState(false);

  const analysis: DbAnalysis | undefined = upload.analyses?.[0];
  const result = analysis?.result_json;

  const gstAgent    = result?.responses.find((r) => r.agent === "gst_tax_agent");
  const compAgent   = result?.responses.find((r) => r.agent === "compliance_agent");

  const gstData   = (gstAgent?.structured_data  ?? {}) as GSTStructuredData;
  const compData  = (compAgent?.structured_data ?? {}) as ComplianceStructuredData;
  const gstSummary = gstAgent?.summary;

  const todoItems = analysis?.todo_items ?? [];
  const checklist: ChecklistItem[] = todoItems.map((item) => ({
    task:     item.task,
    deadline: item.deadline ?? "",
    priority: item.priority ?? "medium",
  }));

  // Fallback: build checklist from compData if todo_items is empty
  const finalChecklist: ChecklistItem[] = checklist.length > 0
    ? checklist
    : (compData.action_checklist ?? []).map((item) => ({
        task:     item.task,
        deadline: item.deadline,
        priority: item.priority,
      }));

  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-sm)",
      overflow: "hidden",
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
        </div>

        {/* Summary line (complete only) */}
        {upload.analysis_status === "complete" && gstSummary && (
          <p style={{
            fontSize: 13, color: "var(--ink-2)", marginTop: 10,
            lineHeight: 1.5,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}>
            {gstSummary}
          </p>
        )}

        {/* Action items count + expand button */}
        {upload.analysis_status === "complete" && analysis && (
          <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
            {todoItems.length > 0 && (
              <span style={{
                fontSize: 12, fontWeight: 600,
                padding: "3px 10px", borderRadius: 999,
                background: "var(--primary-50)", color: "var(--primary)",
              }}>
                {todoItems.length} action item{todoItems.length !== 1 ? "s" : ""}
              </span>
            )}
            <button
              onClick={() => setExpanded((v) => !v)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 13, fontWeight: 600, color: "var(--primary)",
                background: "none", border: "none", cursor: "pointer",
                padding: 0, fontFamily: "inherit",
                marginLeft: "auto",
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
            Analysis failed. Try re-uploading this notice.
          </p>
        )}

        {upload.analysis_status === "pending" && (
          <p style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 8 }}>
            Analysis is in progress…
          </p>
        )}
      </div>

      {/* Expanded analysis */}
      {expanded && analysis && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "18px" }}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Notice explainer (2/3) */}
            <div className="lg:col-span-2 space-y-4">
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Notice breakdown
              </div>
              <NoticeExplainer
                notice={gstData}
                compliance={compData}
                gstSummary={gstSummary}
              />
            </div>

            {/* Action checklist (1/3) */}
            <div className="space-y-4">
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Action checklist
              </div>
              <div style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: "16px",
              }}>
                {finalChecklist.length > 0 ? (
                  <ActionChecklist items={finalChecklist} />
                ) : (
                  <p style={{ fontSize: 13, color: "var(--ink-3)", textAlign: "center", padding: "12px 0" }}>
                    No checklist items.
                  </p>
                )}
              </div>

              {/* Integrated insight */}
              {result?.integrated_insight && (
                <div style={{
                  background: "var(--primary-50)",
                  border: "1px solid #B4BDEA",
                  borderRadius: "var(--radius-lg)",
                  padding: "14px 16px",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                    Cross-domain insight
                  </div>
                  <p style={{ fontSize: 13, color: "var(--primary)", lineHeight: 1.6 }}>
                    {result.integrated_insight}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main compliance page ───────────────────────────────────────────────────

export default function CompliancePage() {
  const [uploads, setUploads]   = useState<DbUpload[]>([]);
  const [deadlines, setDeadlines] = useState<DeadlinesResponse | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    // Fetch deadlines and uploads in parallel
    getDeadlines().then(setDeadlines).catch(() => null);
    getUploadsWithAnalyses("gst_notice")
      .then(setUploads)
      .catch((e) => setError(e?.message ?? "Could not load notices."))
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
              GST Compliance
            </h1>
            <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 2 }}>
              Notice analyses, action checklists, and filing deadlines
            </p>
          </div>
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
        </div>
      </header>

      <div className="px-6 py-6 max-w-5xl mx-auto space-y-8">
        {/* Filing deadlines */}
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
            {[1, 2, 3].map((i) => <CardSkeleton key={i} />)}
          </div>
        )}

        {/* Notices list */}
        {!loading && !error && (
          <section>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 12 }}>
              Your GST notices
            </h2>

            {uploads.length === 0 ? (
              /* Empty state */
              <div style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)",
                padding: "48px 24px", textAlign: "center",
              }}>
                <div style={{
                  width: 56, height: 56, borderRadius: "var(--radius-lg)",
                  background: "var(--bg-2)", color: "var(--ink-3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 16px",
                }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
                  </svg>
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>
                  No notices yet
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
                    fontSize: 14, fontWeight: 600, textDecoration: "none",
                  }}
                >
                  Upload a GST notice
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {uploads.map((upload) => (
                  <UploadCard key={upload.id} upload={upload} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
