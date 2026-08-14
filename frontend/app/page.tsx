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
import { supabase, getUploadsWithAnalyses, type DbUpload } from "@/lib/supabase";
import type { FinanceStructuredData } from "@/lib/api";

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtINR(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

// ── SVG icon helper ────────────────────────────────────────────────────────

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const D = {
  notice:   "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z",
  upload:   "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12",
  invoice:  "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8",
  arrow:    "M5 12h14M12 5l7 7-7 7",
  bank:     "M4 6h16M4 10h16M4 14h8",
  check:    "M9 12l2 2 4-4M12 2a10 10 0 100 20A10 10 0 0012 2z",
  plus:     "M12 5v14M5 12h14",
  sparkle:  "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
};

// ── DashPill ───────────────────────────────────────────────────────────────

type PillVariant = "overdue" | "urgent" | "soon" | "upcoming" | "success" | "info";

function DashPill({ variant, label }: { variant: PillVariant; label?: string }) {
  const config: Record<PillVariant, { bg: string; fg: string; dot: string; text: string }> = {
    overdue:  { bg: "var(--danger-50)",  fg: "var(--danger)",  dot: "var(--danger)",  text: label ?? "Overdue" },
    urgent:   { bg: "var(--accent-50)",  fg: "var(--accent)",  dot: "var(--accent)",  text: label ?? "Urgent" },
    soon:     { bg: "var(--accent-50)",  fg: "var(--accent-700)", dot: "var(--accent)", text: label ?? "Soon" },
    upcoming: { bg: "var(--primary-50)", fg: "var(--primary)", dot: "var(--primary)", text: label ?? "Upcoming" },
    success:  { bg: "var(--success-50)", fg: "var(--success)", dot: "var(--success)", text: label ?? "Done" },
    info:     { bg: "var(--bg-2)",       fg: "var(--ink-2)",   dot: "var(--ink-3)",   text: label ?? "Info" },
  };
  const { bg, fg, dot, text } = config[variant];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 8px", borderRadius: "var(--radius-pill)",
      background: bg, color: fg,
      fontSize: 11, fontWeight: 600, letterSpacing: "0.02em",
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: dot, flexShrink: 0 }} />
      {text}
    </span>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────

function StatCard({
  label, value, delta, deltaGood, loading,
}: {
  label: string;
  value: string | number;
  delta?: string;
  deltaGood?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="card" style={{ padding: "20px 20px 18px" }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: "var(--ink-3)",
        letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10,
      }}>
        {label}
      </div>
      {loading ? (
        <div style={{ height: 36, borderRadius: 6, background: "var(--bg-3)", width: 80 }} className="animate-pulse" />
      ) : (
        <div className="num" style={{
          fontSize: 32, fontWeight: 700, color: "var(--ink)", lineHeight: 1,
          letterSpacing: "-0.02em",
        }}>
          {value}
        </div>
      )}
      {delta && !loading && (
        <div style={{
          fontSize: 12, marginTop: 6, fontWeight: 500,
          color: deltaGood === undefined ? "var(--ink-3)"
            : deltaGood ? "var(--success)"
            : "var(--danger)",
        }}>
          {delta}
        </div>
      )}
    </div>
  );
}

// ── Urgent item row ────────────────────────────────────────────────────────

function UrgentItem({ d }: { d: Deadline }) {
  const variant: PillVariant = d.urgency === "overdue" ? "overdue"
    : d.urgency === "urgent" ? "urgent"
    : d.urgency === "soon" ? "soon"
    : "upcoming";

  const daysLabel =
    d.days_remaining === 0 ? "Due today"
    : d.days_remaining < 0 ? `${Math.abs(d.days_remaining)}d overdue`
    : `${d.days_remaining}d left`;

  return (
    <div className="flex items-center justify-between gap-3 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center gap-3 min-w-0">
        <span style={{
          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
          background: variant === "overdue" ? "var(--danger)"
            : variant === "urgent" || variant === "soon" ? "var(--accent)"
            : "var(--primary)",
        }} />
        <div className="min-w-0">
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }} className="truncate">
            {d.form}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 1 }}>
            {daysLabel} ·{" "}
            {new Date(d.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </div>
        </div>
      </div>
      <DashPill variant={variant} />
    </div>
  );
}

// ── Filing Calendar ────────────────────────────────────────────────────────

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function urgencyColor(u: string) {
  if (u === "overdue")               return "var(--danger)";
  if (u === "urgent" || u === "soon") return "var(--accent)";
  return "var(--primary)";
}
function urgencyBg(u: string) {
  if (u === "overdue")               return "var(--danger-50)";
  if (u === "urgent" || u === "soon") return "var(--accent-50)";
  return "var(--primary-50)";
}
function urgencyLabel(d: Deadline) {
  if (d.days_remaining < 0)  return `${Math.abs(d.days_remaining)}d overdue`;
  if (d.days_remaining === 0) return "Due today";
  return `${d.days_remaining}d left`;
}

function FilingCalendar({ deadlines, loading }: { deadlines: Deadline[]; loading: boolean }) {
  const today = new Date();
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedKey, setSelectedKey] = useState<string | null>(null); // "YYYY-MM-DD"

  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  const todayD = today.getDate();

  const firstDow    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  // Map "YYYY-MM-DD" → deadlines
  const byDate = new Map<string, Deadline[]>();
  for (const d of deadlines) {
    const key = d.due_date.slice(0, 10);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(d);
  }

  function dayKey(day: number) {
    return `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
    setSelectedKey(null);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
    setSelectedKey(null);
  }

  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedDeadlines = selectedKey ? (byDate.get(selectedKey) ?? []) : [];
  const isCurrentMonth = viewYear === todayY && viewMonth === todayM;

  if (loading) {
    return (
      <div className="card" style={{ padding: 20 }}>
        <div className="animate-pulse" style={{ height: 240, borderRadius: 8, background: "var(--bg-3)" }} />
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 18px 12px",
        borderBottom: "1px solid var(--border)",
      }}>
        <div>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em" }}>
            {MONTHS[viewMonth]}
          </span>
          <span style={{ fontSize: 13, color: "var(--ink-3)", marginLeft: 6 }}>
            {viewYear}
          </span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {!isCurrentMonth && (
            <button
              onClick={() => { setViewYear(todayY); setViewMonth(todayM); setSelectedKey(null); }}
              style={{
                fontSize: 11, fontWeight: 600, color: "var(--primary)",
                background: "var(--primary-50)", border: "none",
                borderRadius: "var(--radius-sm)", padding: "4px 10px",
                cursor: "pointer", fontFamily: "inherit", marginRight: 4,
              }}
            >
              Today
            </button>
          )}
          {(["←", "→"] as const).map((arrow, idx) => (
            <button
              key={arrow}
              onClick={idx === 0 ? prevMonth : nextMonth}
              style={{
                width: 28, height: 28, borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                background: "var(--bg-2)", color: "var(--ink-2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", fontSize: 14, fontFamily: "inherit",
                transition: "background 120ms",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-3)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--bg-2)"; }}
            >
              {arrow}
            </button>
          ))}
        </div>
      </div>

      {/* ── Day-of-week row ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
        padding: "8px 12px 4px",
        borderBottom: "1px solid var(--border)",
      }}>
        {DOW.map((d) => (
          <div key={d} style={{
            textAlign: "center",
            fontSize: 10, fontWeight: 700, color: "var(--ink-3)",
            letterSpacing: "0.06em", textTransform: "uppercase",
            paddingBottom: 4,
          }}>
            {d.slice(0, 2)}
          </div>
        ))}
      </div>

      {/* ── Day grid ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
        gap: 1, padding: "6px 12px 10px",
      }}>
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} style={{ aspectRatio: "1" }} />;

          const key          = dayKey(day);
          const isToday      = isCurrentMonth && day === todayD;
          const dayDeadlines = byDate.get(key) ?? [];
          const hasItems     = dayDeadlines.length > 0;
          const topUrgency   = dayDeadlines[0]?.urgency ?? "upcoming";
          const isSelected   = key === selectedKey;
          const isPast       = !isToday && (
            viewYear < todayY ||
            (viewYear === todayY && viewMonth < todayM) ||
            (isCurrentMonth && day < todayD)
          );

          return (
            <button
              key={key}
              onClick={() => hasItems ? setSelectedKey(isSelected ? null : key) : undefined}
              style={{
                aspectRatio: "1",
                borderRadius: "var(--radius-sm)",
                border: isSelected
                  ? `2px solid ${urgencyColor(topUrgency)}`
                  : isToday
                  ? "2px solid var(--primary)"
                  : "2px solid transparent",
                background: isSelected
                  ? urgencyBg(topUrgency)
                  : isToday
                  ? "var(--primary)"
                  : "transparent",
                cursor: hasItems ? "pointer" : "default",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 3, padding: "2px",
                transition: "background 120ms, border-color 120ms",
              }}
              onMouseEnter={e => { if (hasItems && !isSelected) e.currentTarget.style.background = "var(--bg-2)"; }}
              onMouseLeave={e => { if (hasItems && !isSelected) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{
                fontSize: 12,
                fontWeight: isToday ? 800 : hasItems ? 700 : 400,
                color: isToday
                  ? "#FCFAF4"
                  : isSelected
                  ? urgencyColor(topUrgency)
                  : hasItems
                  ? urgencyColor(topUrgency)
                  : isPast
                  ? "var(--ink-3)"
                  : "var(--ink-2)",
                lineHeight: 1,
              }}>
                {day}
              </span>
              {hasItems && (
                <div style={{ display: "flex", gap: 2, justifyContent: "center" }}>
                  {dayDeadlines.slice(0, 3).map((dl, di) => (
                    <span key={di} style={{
                      width: 4, height: 4, borderRadius: "50%",
                      background: isToday ? "rgba(255,255,255,0.7)" : urgencyColor(dl.urgency),
                    }} />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Selected day panel ── */}
      {selectedKey && selectedDeadlines.length > 0 && (
        <div style={{
          borderTop: "1px solid var(--border)",
          padding: "12px 18px 14px",
          background: "var(--bg)",
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: "var(--ink-3)",
            letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10,
          }}>
            {new Date(selectedKey + "T00:00:00").toLocaleDateString("en-IN", {
              weekday: "long", day: "numeric", month: "long",
            })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {selectedDeadlines.map((d) => (
              <div key={d.form} style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "10px 12px",
                background: "var(--surface)",
                border: `1px solid ${urgencyBg(d.urgency)}`,
                borderLeft: `3px solid ${urgencyColor(d.urgency)}`,
                borderRadius: "var(--radius-md)",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{d.form}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-2)", marginTop: 2, lineHeight: 1.4 }}>
                    {d.description}
                  </div>
                </div>
                <span style={{
                  flexShrink: 0,
                  fontSize: 11, fontWeight: 700,
                  padding: "3px 8px", borderRadius: 999,
                  background: urgencyBg(d.urgency),
                  color: urgencyColor(d.urgency),
                  whiteSpace: "nowrap",
                }}>
                  {urgencyLabel(d)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── No filings this month ── */}
      {deadlines.filter(d => {
        const due = new Date(d.due_date);
        return due.getFullYear() === viewYear && due.getMonth() === viewMonth;
      }).length === 0 && (
        <div style={{ padding: "10px 18px 14px", borderTop: "1px solid var(--border)" }}>
          <p style={{ fontSize: 12, color: "var(--ink-3)", textAlign: "center" }}>
            No filings due in {MONTHS[viewMonth]}.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Activity row ───────────────────────────────────────────────────────────

const docConfig: Record<UploadRecord["doc_type"], { label: string; d: string; accent: string; bg: string; href: string }> = {
  gst_notice:     { label: "GST Notice",    d: D.notice,  accent: "var(--accent)",  bg: "var(--accent-50)",  href: "/compliance" },
  invoice:        { label: "Invoice",        d: D.invoice, accent: "var(--primary)", bg: "var(--primary-50)", href: "/invoices" },
  bank_statement: { label: "Bank Statement", d: D.bank,    accent: "var(--success)", bg: "var(--success-50)", href: "/finance" },
};

function ActivityRow({ upload }: { upload: UploadRecord }) {
  const cfg = docConfig[upload.doc_type];
  if (!cfg) return null;
  return (
    <Link href={`${cfg.href}?upload_id=${upload.id}`} style={{ textDecoration: "none" }}>
      <div className="flex items-center gap-3" style={{
        padding: "11px 0",
        borderBottom: "1px solid var(--border)",
        cursor: "pointer",
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: "var(--radius-md)",
          background: cfg.bg, color: cfg.accent,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <Icon d={cfg.d} size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="truncate" style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
            {upload.filename}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
            {cfg.label}
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap", flexShrink: 0 }}>
          {new Date(upload.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
        </div>
        <div style={{ color: "var(--ink-3)", flexShrink: 0 }}>
          <Icon d={D.arrow} size={13} />
        </div>
      </div>
    </Link>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────

function Empty({ text }: { text: string }) {
  return (
    <div style={{ padding: "28px 0", textAlign: "center" }}>
      <p style={{ fontSize: 13, color: "var(--ink-3)" }}>{text}</p>
    </div>
  );
}

// ── Skeleton rows ──────────────────────────────────────────────────────────

function SkeletonRows({ n = 3 }: { n?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="animate-pulse rounded-md" style={{ width: 32, height: 32, background: "var(--bg-3)" }} />
          <div className="flex-1 space-y-1.5">
            <div className="animate-pulse rounded" style={{ height: 12, background: "var(--bg-3)", width: "55%" }} />
            <div className="animate-pulse rounded" style={{ height: 10, background: "var(--bg-3)", width: "35%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [deadlines, setDeadlines] = useState<DeadlinesResponse | null>(null);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [healthScore, setHealthScore] = useState<number | null>(null);
  const [healthReason, setHealthReason] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const email = session.user?.email ?? null;
      if (email) setUserName(email.split("@")[0]);

      // Try to load profile name
      import("@/lib/api").then(({ getProfile }) => {
        getProfile().then((p) => { if (p.name) setUserName(p.name); }).catch(() => null);
      });

      // Load finance health score from Supabase (non-blocking, best-effort)
      getUploadsWithAnalyses("bank_statement", 1).then((stmts: DbUpload[]) => {
        const latest = stmts[0];
        if (!latest || latest.analysis_status !== "complete") return;
        const analysis = latest.analyses?.[0];
        if (!analysis) return;
        const finAgent = analysis.result_json.responses.find((r) => r.agent === "finance_agent");
        const finData = (finAgent?.structured_data ?? {}) as FinanceStructuredData & { health_reason?: string };
        if (finData.health_score) {
          setHealthScore(finData.health_score);
          setHealthReason(finData.health_reason ?? null);
        }
      }).catch(() => null);

      const [dlResult, upResult] = await Promise.allSettled([
        getDeadlines(),
        listUploads(8),
      ]);

      if (dlResult.status === "fulfilled") setDeadlines(dlResult.value);
      if (upResult.status === "fulfilled") setUploads(upResult.value);

      const failures = [dlResult, upResult].filter((r) => r.status === "rejected");
      if (failures.length === 2) {
        const reason = (failures[0] as PromiseRejectedResult).reason;
        setError(
          reason instanceof ApiError
            ? `Backend error ${reason.status}: ${reason.message}`
            : reason instanceof Error
            ? reason.message
            : "Could not reach the backend. Is the server running on port 8000?"
        );
      }
      setLoading(false);
    };
    init();
  }, []);

  const allDeadlines = deadlines?.deadlines ?? [];
  const urgentItems = allDeadlines.filter((d) => d.urgency === "overdue" || d.urgency === "urgent");
  const calendarItems = allDeadlines.slice(0, 5);
  const urgentCount = urgentItems.length;
  const nextDeadline = allDeadlines[0];

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>

      {/* ── Topbar ──────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-20 px-6 flex items-center gap-3"
        style={{
          height: 60,
          background: "rgba(250,247,241,0.95)",
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {/* Greeting */}
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.01em" }}>
            {getGreeting()}{userName ? `, ${userName}` : ""} 👋
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {formatDate()}
            {urgentCount > 0 && (
              <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                {" "}· {urgentCount} {urgentCount === 1 ? "item needs" : "items need"} your attention
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/upload?type=gst_notice"
            className="btn-ghost"
            style={{ fontSize: 13, padding: "7px 14px" }}
          >
            <Icon d={D.upload} size={14} />
            Upload
          </Link>
          <Link
            href="/invoices"
            className="btn-primary"
            style={{ fontSize: 13, padding: "7px 14px" }}
          >
            <Icon d={D.plus} size={14} />
            New invoice
          </Link>
        </div>
      </header>

      <div style={{ padding: "24px 24px", maxWidth: 1100, margin: "0 auto" }}>

        {/* ── Error banner ─────────────────────────────────────────────── */}
        {error && (
          <div
            className="rounded-xl px-4 py-3 flex items-start gap-3 mb-6"
            style={{ background: "var(--danger-50)", border: "1px solid var(--danger-200)" }}
          >
            <span style={{ color: "var(--danger)", marginTop: 1 }}><Icon d={D.notice} size={16} /></span>
            <p style={{ fontSize: 13, color: "var(--danger)" }}>{error}</p>
          </div>
        )}

        {/* ── Stat cards ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Cash flow health — live from Supabase finance analysis */}
          <Link href="/finance" style={{ textDecoration: "none" }}>
            <div className="card h-full" style={{ padding: "20px 20px 18px", cursor: "pointer" }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-md)"; e.currentTarget.style.borderColor = "var(--border-strong)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-sm)"; e.currentTarget.style.borderColor = "var(--border)"; }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
                Cash flow health
              </div>
              {loading && !healthScore ? (
                <div style={{ height: 36, borderRadius: 6, background: "var(--bg-3)", width: 80 }} className="animate-pulse" />
              ) : healthScore ? (
                <div className="num" style={{
                  fontSize: 32, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em",
                  color: healthScore > 7 ? "var(--success)" : healthScore >= 4 ? "var(--accent)" : "var(--danger)",
                }}>
                  {healthScore}<span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-3)" }}>/10</span>
                </div>
              ) : (
                <div className="num" style={{ fontSize: 32, fontWeight: 700, color: "var(--ink-3)", lineHeight: 1 }}>—</div>
              )}
              <div style={{ fontSize: 12, marginTop: 6, fontWeight: 500, color: "var(--ink-3)" }}>
                {healthScore
                  ? (healthReason ? healthReason.slice(0, 42) + (healthReason.length > 42 ? "…" : "") : healthScore > 7 ? "Healthy" : healthScore >= 4 ? "Moderate" : "Needs attention")
                  : "Upload a bank statement"}
              </div>
            </div>
          </Link>
          <StatCard
            label="Urgent notices"
            value={loading ? "—" : urgentCount}
            delta={urgentCount > 0 ? "Needs attention" : "Nothing critical"}
            deltaGood={urgentCount === 0}
            loading={loading}
          />
          <StatCard
            label="Documents"
            value={loading ? "—" : uploads.length}
            delta={uploads.length > 0 ? "uploaded" : "None yet"}
            deltaGood={uploads.length > 0}
            loading={loading}
          />
          <StatCard
            label="Next deadline"
            value={loading ? "—" : nextDeadline ? `${Math.max(0, nextDeadline.days_remaining)}d` : "—"}
            delta={nextDeadline ? nextDeadline.form : "No upcoming filings"}
            deltaGood={!nextDeadline || nextDeadline.days_remaining > 7}
            loading={loading}
          />
        </div>

        {/* ── Needs attention + Filing calendar ────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">

          {/* Needs your attention */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.01em" }}>
                Needs your attention
              </h2>
              <Link href="/compliance" style={{ fontSize: 12, color: "var(--primary)", fontWeight: 500, textDecoration: "none" }}>
                View all →
              </Link>
            </div>
            <div className="card" style={{ padding: "4px 20px" }}>
              {loading ? (
                <div style={{ padding: "16px 0" }}><SkeletonRows n={3} /></div>
              ) : urgentItems.length > 0 ? (
                urgentItems.map((d) => <UrgentItem key={d.form} d={d} />)
              ) : allDeadlines.length > 0 ? (
                <div style={{ padding: "20px 0" }}>
                  <div className="flex items-center gap-2" style={{ color: "var(--success)" }}>
                    <Icon d={D.check} size={16} />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>All filings are on track.</span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>
                    No overdue or urgent items right now.
                  </p>
                </div>
              ) : (
                <Empty text="Upload a GST notice or bank statement to see alerts here." />
              )}
            </div>
          </section>

          {/* Filing calendar */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.01em" }}>
                Filing calendar
              </h2>
              <Link href="/compliance" style={{ fontSize: 12, color: "var(--primary)", fontWeight: 500, textDecoration: "none" }}>
                Full calendar →
              </Link>
            </div>
            <FilingCalendar deadlines={allDeadlines} loading={loading} />
          </section>
        </div>

        {/* ── Recent activity ───────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.01em" }}>
              Recent activity
            </h2>
            <Link href="/upload" style={{ fontSize: 12, color: "var(--primary)", fontWeight: 500, textDecoration: "none" }}>
              Upload new →
            </Link>
          </div>
          <div className="card" style={{ padding: "0 20px" }}>
            {/* Table header */}
            <div className="flex items-center gap-3" style={{
              padding: "11px 0 8px",
              borderBottom: "1px solid var(--border)",
            }}>
              <div style={{ width: 32, flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 10, fontWeight: 700, color: "var(--ink-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Document
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-3)", letterSpacing: "0.06em", textTransform: "uppercase", width: 60, textAlign: "right", flexShrink: 0 }}>
                Date
              </div>
              <div style={{ width: 16, flexShrink: 0 }} />
            </div>

            {loading ? (
              <div style={{ padding: "16px 0" }}><SkeletonRows n={4} /></div>
            ) : uploads.length > 0 ? (
              uploads.map((up) => <ActivityRow key={up.id} upload={up} />)
            ) : (
              <Empty text="No documents uploaded yet. Start by uploading a GST notice, invoice, or bank statement." />
            )}
          </div>
        </section>

        {/* ── Quick actions ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          {[
            { href: "/upload?type=gst_notice", label: "Upload GST notice", sub: "Analyse ASMT-10, DRC-01 or GSTR-3A", d: D.notice, primary: true },
            { href: "/upload?type=bank_statement", label: "Upload bank statement", sub: "Cash flow health & anomaly detection", d: D.bank, primary: false },
            { href: "/invoices", label: "Generate invoice", sub: "Create a GST-compliant invoice", d: D.invoice, primary: false },
          ].map((qa) => (
            <Link
              key={qa.href}
              href={qa.href}
              style={{ textDecoration: "none" }}
            >
              <div
                className="card card-hover flex items-start gap-3"
                style={{ padding: "16px 18px" }}
              >
                <div style={{
                  width: 36, height: 36,
                  background: qa.primary ? "var(--primary)" : "var(--bg-2)",
                  color: qa.primary ? "#FCFAF4" : "var(--ink-2)",
                  borderRadius: "var(--radius-md)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <Icon d={qa.d} size={16} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{qa.label}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 2 }}>{qa.sub}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>

      </div>
    </div>
  );
}
