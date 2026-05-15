"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getDeadlines,
  listUploads,
  type DeadlinesResponse,
  type Deadline,
  type UploadRecord,
  ApiError,
} from "@/lib/api";
import { supabase } from "@/lib/supabase";

// ── Small icon helpers (inline SVG, 2px stroke — Lucide style) ────────────

function Icon({ path, size = 20 }: { path: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

const icons = {
  health:   "M22 12h-4l-3 9L9 3l-3 9H2",
  notice:   "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01",
  invoice:  "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z",
  upload:   "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12",
  generate: "M12 5v14M5 12h14",
  arrow:    "M5 12h14M12 5l7 7-7 7",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
};

// ── Stat card ──────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  iconPath: string;
  accent: string;       // CSS color
  accentBg: string;     // CSS color for icon bg
  loading?: boolean;
}

function StatCard({ label, value, sub, iconPath, accent, accentBg, loading }: StatCardProps) {
  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div
          className="flex items-center justify-center rounded-lg"
          style={{ width: 40, height: 40, background: accentBg, color: accent }}
        >
          <Icon path={iconPath} size={20} />
        </div>
      </div>
      <div>
        {loading ? (
          <div className="h-8 rounded-md animate-pulse" style={{ background: "var(--bg-3)", width: 80 }} />
        ) : (
          <div className="num" style={{ fontSize: 28, fontWeight: 700, color: "var(--ink)", lineHeight: 1.1 }}>
            {value}
          </div>
        )}
        <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 4 }}>{label}</div>
        {sub && !loading && (
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{sub}</div>
        )}
      </div>
    </div>
  );
}

// ── Urgency badge ──────────────────────────────────────────────────────────

function UrgencyBadge({ urgency }: { urgency: Deadline["urgency"] }) {
  const map: Record<Deadline["urgency"], { bg: string; fg: string; label: string }> = {
    overdue:  { bg: "var(--danger-50)",  fg: "var(--danger)",  label: "Overdue"  },
    urgent:   { bg: "#FBF1E4",           fg: "var(--accent)",  label: "Urgent"   },
    soon:     { bg: "#FBF1E4",           fg: "var(--accent)",  label: "Soon"     },
    upcoming: { bg: "var(--primary-50)", fg: "var(--primary)", label: "Upcoming" },
  };
  const { bg, fg, label } = map[urgency] ?? map.upcoming;
  return (
    <span className="badge" style={{ background: bg, color: fg }}>
      {label}
    </span>
  );
}

// ── Deadline row ───────────────────────────────────────────────────────────

function DeadlineRow({ d }: { d: Deadline }) {
  return (
    <div
      className="flex items-center justify-between py-3"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center rounded-md shrink-0"
          style={{ width: 36, height: 36, background: "var(--accent-50)", color: "var(--accent)" }}
        >
          <Icon path={icons.calendar} size={16} />
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>{d.form}</div>
          <div style={{ fontSize: 12, color: "var(--ink-2)" }}>{d.description}</div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
        <UrgencyBadge urgency={d.urgency} />
        <div className="num" style={{ fontSize: 12, color: "var(--ink-3)" }}>
          {d.days_remaining === 0
            ? "Due today"
            : d.days_remaining < 0
            ? `${Math.abs(d.days_remaining)}d overdue`
            : `${d.days_remaining}d left`}
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {new Date(d.due_date).toLocaleDateString("en-IN", {
            day: "numeric", month: "short", year: "numeric",
          })}
        </div>
      </div>
    </div>
  );
}

// ── Quick action button ────────────────────────────────────────────────────

function QuickAction({
  href,
  label,
  description,
  iconPath,
  primary,
}: {
  href: string;
  label: string;
  description: string;
  iconPath: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`card card-hover flex items-start gap-4 p-5 ${primary ? "" : ""}`}
      style={{ textDecoration: "none", display: "flex" }}
    >
      <div
        className="flex items-center justify-center rounded-lg shrink-0 mt-0.5"
        style={{
          width: 40, height: 40,
          background: primary ? "var(--primary)" : "var(--bg-2)",
          color: primary ? "#FCFAF4" : "var(--ink-2)",
        }}
      >
        <Icon path={iconPath} size={20} />
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>{label}</div>
        <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 2 }}>{description}</div>
      </div>
    </Link>
  );
}

// ── Upload record item ─────────────────────────────────────────────────────

const docTypeConfig: Record<UploadRecord["doc_type"], { label: string; iconPath: string; href: string; accent: string; accentBg: string }> = {
  gst_notice:     { label: "GST Notice",      iconPath: icons.notice,   href: "/compliance", accent: "var(--accent)",  accentBg: "#FBF1E4" },
  invoice:        { label: "Invoice",          iconPath: icons.invoice,  href: "/invoices",   accent: "var(--primary)", accentBg: "var(--primary-50)" },
  bank_statement: { label: "Bank Statement",   iconPath: "M4 6h16M4 10h16M4 14h8", href: "/finance", accent: "var(--success)", accentBg: "var(--success-50)" },
};

function UploadItem({ upload }: { upload: UploadRecord }) {
  const cfg = docTypeConfig[upload.doc_type];
  if (!cfg) return null; // unknown doc_type — skip rendering
  return (
    <Link
      href={`${cfg.href}?upload_id=${upload.id}`}
      style={{ textDecoration: "none" }}
    >
      <div
        className="flex items-center gap-3 py-3"
        style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
      >
        <div
          className="flex items-center justify-center rounded-lg shrink-0"
          style={{ width: 36, height: 36, background: cfg.accentBg, color: cfg.accent }}
        >
          <Icon path={cfg.iconPath} size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div style={{ fontWeight: 500, fontSize: 14, color: "var(--ink)" }} className="truncate">
            {upload.filename}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-2)" }}>
            {cfg.label} ·{" "}
            {new Date(upload.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </div>
        </div>
        <div style={{ color: "var(--ink-3)" }}>
          <Icon path={icons.arrow} size={14} />
        </div>
      </div>
    </Link>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2">
      <div style={{ fontSize: 28, opacity: 0.2, color: "var(--ink)" }}>₹</div>
      <p style={{ fontSize: 13, color: "var(--ink-3)", textAlign: "center" }}>{message}</p>
    </div>
  );
}

// ── Dashboard page ─────────────────────────────────────────────────────────

export default function Dashboard() {
  const [deadlines, setDeadlines] = useState<DeadlinesResponse | null>(null);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return; // AuthGuard will handle redirect

      setUserEmail(session.user?.email ?? null);

      const [dlResult, upResult] = await Promise.allSettled([
        getDeadlines(),
        listUploads(5),
      ]);

      if (dlResult.status === "fulfilled") setDeadlines(dlResult.value);
      if (upResult.status === "fulfilled") setUploads(upResult.value);

      const failures = [dlResult, upResult].filter((r) => r.status === "rejected");
      if (failures.length === 2) {
        const reason = (failures[0] as PromiseRejectedResult).reason;
        if (reason instanceof ApiError) {
          setError(`Backend error ${reason.status}: ${reason.message}`);
        } else if (reason instanceof Error) {
          setError(reason.message);
        } else {
          setError("Could not reach the backend. Make sure the server is running on port 8000.");
        }
      }
      setLoading(false);
    };
    init();
  }, []);

  // Derive stats
  const nextDeadline = deadlines?.deadlines[0];
  const urgentCount = deadlines?.deadlines.filter(
    (d) => d.urgency === "urgent" || d.urgency === "overdue"
  ).length ?? 0;

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-20 px-6 py-4 flex items-center justify-between"
        style={{
          background: "rgba(250,247,241,0.92)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em" }}>
            {userEmail ? `Welcome back, ${userEmail}` : "Raseed — Your AI Financial Copilot"}
          </h1>
          <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 1 }}>
            GST compliance, invoices, and cash flow — in one place.
          </p>
        </div>
        {urgentCount > 0 && (
          <div
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{ background: "#FBF1E4", color: "var(--accent)" }}
          >
            <Icon path={icons.notice} size={14} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              {urgentCount} urgent {urgentCount === 1 ? "deadline" : "deadlines"}
            </span>
          </div>
        )}
      </header>

      <div className="px-6 py-6 max-w-5xl mx-auto space-y-8">
        {/* ── Backend error banner ─────────────────────────────────────── */}
        {error && (
          <div
            className="rounded-xl px-4 py-3 flex items-start gap-3"
            style={{ background: "var(--danger-50)", border: "1px solid #DFA098" }}
          >
            <Icon path={icons.notice} size={18} />
            <p style={{ fontSize: 14, color: "var(--danger)" }}>{error}</p>
          </div>
        )}

        {/* ── Stat cards ────────────────────────────────────────────────── */}
        <section>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Cash Flow Health"
              value="—"
              sub="Upload a bank statement"
              iconPath={icons.health}
              accent="var(--success)"
              accentBg="var(--success-50)"
              loading={loading}
            />
            <StatCard
              label="Pending Notices"
              value={urgentCount > 0 ? urgentCount : "0"}
              sub={urgentCount > 0 ? "Needs attention" : "All clear"}
              iconPath={icons.notice}
              accent="var(--accent)"
              accentBg="#FBF1E4"
              loading={loading}
            />
            <StatCard
              label="Documents Uploaded"
              value={loading ? "—" : uploads.length}
              sub={uploads.length > 0 ? "Click to view" : "Nothing yet"}
              iconPath={icons.upload}
              accent="var(--primary)"
              accentBg="var(--primary-50)"
              loading={loading}
            />
            <StatCard
              label="Next Filing"
              value={loading ? "—" : nextDeadline ? `${nextDeadline.days_remaining}d` : "—"}
              sub={nextDeadline ? nextDeadline.form : "No deadlines due soon"}
              iconPath={icons.calendar}
              accent="var(--danger)"
              accentBg="var(--danger-50)"
              loading={loading}
            />
          </div>
        </section>

        {/* ── Quick actions ─────────────────────────────────────────────── */}
        <section>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", marginBottom: 14 }}>
            Quick actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <QuickAction
              href="/upload?type=gst_notice"
              label="Upload GST notice"
              description="Analyse any ASMT-10, DRC-01 or GSTR-3A notice."
              iconPath={icons.upload}
              primary
            />
            <QuickAction
              href="/upload?type=bank_statement"
              label="Upload bank statement"
              description="Get a cash flow health score and anomaly report."
              iconPath="M4 6h16M4 10h16M4 14h8"
            />
            <QuickAction
              href="/invoices"
              label="Generate invoice"
              description="Create a GST-compliant invoice in seconds."
              iconPath={icons.generate}
            />
          </div>
        </section>

        {/* ── Bottom two-column section ─────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent documents */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>
                Recent documents
              </h2>
              <Link
                href="/upload"
                style={{ fontSize: 13, color: "var(--primary)", fontWeight: 500, textDecoration: "none" }}
              >
                Upload new →
              </Link>
            </div>
            <div className="card p-5">
              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="rounded-lg animate-pulse" style={{ width: 36, height: 36, background: "var(--bg-3)" }} />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 rounded animate-pulse" style={{ background: "var(--bg-3)", width: "60%" }} />
                        <div className="h-2.5 rounded animate-pulse" style={{ background: "var(--bg-3)", width: "40%" }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : uploads.length > 0 ? (
                <>
                  {uploads.map((up) => (
                    <UploadItem key={up.id} upload={up} />
                  ))}
                </>
              ) : (
                <EmptyState message="No documents yet. Upload a GST notice, invoice, or bank statement." />
              )}
            </div>
          </section>

          {/* Upcoming deadlines */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>
                Upcoming deadlines
              </h2>
              <Link
                href="/compliance"
                style={{ fontSize: 13, color: "var(--primary)", fontWeight: 500, textDecoration: "none" }}
              >
                View all →
              </Link>
            </div>
            <div className="card p-5">
              {loading ? (
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="flex items-center justify-between py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                      <div className="flex items-center gap-3">
                        <div className="rounded-md animate-pulse" style={{ width: 36, height: 36, background: "var(--bg-3)" }} />
                        <div className="space-y-1.5">
                          <div className="h-3 rounded animate-pulse" style={{ background: "var(--bg-3)", width: 80 }} />
                          <div className="h-2.5 rounded animate-pulse" style={{ background: "var(--bg-3)", width: 120 }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : deadlines && deadlines.deadlines.length > 0 ? (
                <>
                  {deadlines.deadlines.map((d) => (
                    <DeadlineRow key={d.form} d={d} />
                  ))}
                  <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 12 }}>
                    As of {new Date(deadlines.as_of).toLocaleDateString("en-IN", {
                      day: "numeric", month: "long", year: "numeric",
                    })}
                  </p>
                </>
              ) : (
                <EmptyState message="No filings due in the next 30 days. You're on track." />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
