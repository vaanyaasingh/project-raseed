"use client";

import Link from "next/link";

// ── Icon helper (inline SVG, 2px stroke — Lucide style, matches app icons) ──

function Icon({ path, size = 20 }: { path: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

const icons = {
  notice:   "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01",
  invoice:  "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  health:   "M22 12h-4l-3 9L9 3l-3 9H2",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z",
  users:    "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  shield:   "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  check:    "M20 6L9 17l-5-5",
  arrow:    "M5 12h14M12 5l7 7-7 7",
};

const FEATURES = [
  {
    icon: icons.notice,
    title: "Notice Explainer",
    body: "Upload any GST notice — ASMT-10, DRC-01, GSTR-3A — and get a plain-English breakdown of what it means and what to file back, in seconds.",
  },
  {
    icon: icons.invoice,
    title: "Invoice Automation",
    body: "Extract line items from client invoices automatically, or generate GST-compliant invoices for them in one click.",
  },
  {
    icon: icons.health,
    title: "Cash Flow Health",
    body: "Upload a bank statement and get an instant health score with anomalies flagged — no manual reconciliation.",
  },
  {
    icon: icons.calendar,
    title: "Deadline Tracking",
    body: "Every client's filing deadlines in one place, ranked by urgency, so nothing slips through during busy season.",
  },
];

export default function WelcomePage() {
  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      {/* ── Top nav ─────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 md:px-10 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center shrink-0"
            style={{ width: 36, height: 36, background: "var(--primary)", borderRadius: 9 }}
          >
            <span style={{ color: "#FCFAF4", fontWeight: 800, fontSize: 18, lineHeight: 1 }}>₹</span>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, color: "var(--ink)", letterSpacing: "-0.02em" }}>
              Raseed
            </div>
            <div style={{ fontSize: 10, color: "var(--ink-3)", fontWeight: 500, letterSpacing: "0.02em" }}>
              AI Compliance Copilot
            </div>
          </div>
        </div>
        <Link href="/login" className="btn-ghost" style={{ padding: "8px 16px" }}>
          Sign in
        </Link>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className="px-6 md:px-10 pt-10 md:pt-16 pb-16 md:pb-24 max-w-7xl mx-auto">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Copy */}
          <div>
            <div
              className="inline-flex items-center gap-2"
              style={{
                background: "var(--primary-50)", color: "var(--primary)",
                fontSize: 12, fontWeight: 700, letterSpacing: "0.03em",
                padding: "6px 12px", borderRadius: 999, marginBottom: 20,
              }}
            >
              <Icon path={icons.shield} size={13} />
              BUILT FOR CHARTERED ACCOUNTANTS
            </div>

            <h1
              style={{
                fontSize: "clamp(32px, 5vw, 48px)",
                fontWeight: 800,
                lineHeight: 1.08,
                letterSpacing: "-0.02em",
                color: "var(--ink)",
                marginBottom: 20,
              }}
            >
              Run your entire<br />
              GST practice from<br />
              <span style={{ color: "var(--primary)" }}>one copilot.</span>
            </h1>

            <p style={{ fontSize: 17, lineHeight: 1.6, color: "var(--ink-2)", marginBottom: 32, maxWidth: 480 }}>
              Raseed reads notices, reconciles bank statements, drafts invoices, and
              tracks every client&apos;s filing deadline — so you spend less time on
              paperwork and more time advising.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Link href="/login" className="btn-primary" style={{ padding: "12px 22px", fontSize: 15 }}>
                Start free
                <Icon path={icons.arrow} size={16} />
              </Link>
              <a href="#features" className="btn-ghost" style={{ padding: "12px 22px", fontSize: 15 }}>
                See how it works
              </a>
            </div>

            <div className="flex items-center gap-5 mt-8" style={{ color: "var(--ink-3)", fontSize: 13 }}>
              <span className="flex items-center gap-1.5">
                <Icon path={icons.check} size={14} />
                No card required
              </span>
              <span className="flex items-center gap-1.5">
                <Icon path={icons.check} size={14} />
                Human-in-the-loop by design
              </span>
            </div>
          </div>

          {/* Product preview card */}
          <div className="relative">
            <div
              className="card"
              style={{ padding: 20, borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-lg)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
                  Client: Meridian Textiles Pvt Ltd
                </div>
                <span className="badge" style={{ background: "var(--success-50)", color: "var(--success)" }}>
                  On track
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { label: "Cash Flow Health", value: "82", sub: "Healthy", accent: "var(--success)", accentBg: "var(--success-50)", icon: icons.health },
                  { label: "Pending Notices", value: "1", sub: "ASMT-10 due", accent: "var(--accent)", accentBg: "var(--accent-50)", icon: icons.notice },
                ].map((s) => (
                  <div key={s.label} style={{ background: "var(--bg-2)", borderRadius: "var(--radius-md)", padding: 14 }}>
                    <div
                      className="flex items-center justify-center mb-2"
                      style={{ width: 30, height: 30, borderRadius: 7, background: s.accentBg, color: s.accent }}
                    >
                      <Icon path={s.icon} size={15} />
                    </div>
                    <div className="num" style={{ fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-2)", marginTop: 2 }}>{s.label}</div>
                    <div style={{ fontSize: 10, color: "var(--ink-3)" }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-3)", marginBottom: 8, letterSpacing: "0.02em" }}>
                  RASEED SAYS
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
                  &ldquo;This ASMT-10 flags a mismatch of ₹42,300 between GSTR-1 and GSTR-3B for Aug 2026.
                  I&apos;ve drafted a reconciliation reply — review before sending.&rdquo;
                </div>
              </div>
            </div>

            {/* Decorative accent blob */}
            <div
              aria-hidden
              style={{
                position: "absolute", top: -24, right: -24, width: 90, height: 90,
                borderRadius: "50%", background: "var(--accent-50)", zIndex: -1,
              }}
            />
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────── */}
      <section id="features" className="px-6 md:px-10 py-16 md:py-20" style={{ background: "var(--surface)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-7xl mx-auto">
          <div className="max-w-xl mb-12">
            <h2 style={{ fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.01em", marginBottom: 12 }}>
              Everything a busy CA practice needs
            </h2>
            <p style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.6 }}>
              One workspace across every client — notices, invoices, cash flow, and deadlines, without switching tools.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="card card-hover" style={{ padding: 22 }}>
                <div
                  className="flex items-center justify-center mb-4"
                  style={{ width: 42, height: 42, borderRadius: "var(--radius-md)", background: "var(--primary-50)", color: "var(--primary)" }}
                >
                  <Icon path={f.icon} size={20} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>{f.title}</div>
                <div style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.55 }}>{f.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust strip ─────────────────────────────────────────────── */}
      <section className="px-6 md:px-10 py-16 md:py-20 max-w-7xl mx-auto">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div
              className="flex items-center justify-center mb-5"
              style={{ width: 46, height: 46, borderRadius: "var(--radius-md)", background: "var(--accent-50)", color: "var(--accent)" }}
            >
              <Icon path={icons.users} size={22} />
            </div>
            <h2 style={{ fontSize: "clamp(22px, 3vw, 28px)", fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.01em", marginBottom: 14 }}>
              Built around how CAs actually work with clients
            </h2>
            <p style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.65, marginBottom: 16 }}>
              Raseed drafts, explains, and flags — it never files or sends on its own.
              Every email, every reply to a notice, every generated invoice waits for
              your review and sign-off, because the compliance liability is yours,
              not the model&apos;s.
            </p>
            <p style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.65 }}>
              Manage GST notices, invoices, and cash flow for every SME client from
              a single dashboard — built for Indian GST and financial compliance
              specifically, not adapted from a generic template.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Human-in-the-loop", body: "Nothing sends without your approval" },
              { label: "Multi-client", body: "Every client, one dashboard" },
              { label: "India GST-first", body: "ASMT-10, DRC-01, GSTR-3A ready" },
              { label: "Always explained", body: "Plain-English, not legal jargon" },
            ].map((t) => (
              <div key={t.label} className="card" style={{ padding: 18 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>{t.label}</div>
                <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{t.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA banner ──────────────────────────────────────────────── */}
      <section className="px-6 md:px-10 pb-16 md:pb-24 max-w-7xl mx-auto">
        <div
          className="flex flex-col md:flex-row items-center justify-between gap-6"
          style={{
            background: "var(--primary)", borderRadius: "var(--radius-xl)",
            padding: "40px 36px",
          }}
        >
          <div>
            <div style={{ fontSize: "clamp(20px, 2.5vw, 26px)", fontWeight: 800, color: "#FCFAF4", letterSpacing: "-0.01em", marginBottom: 6 }}>
              Bring your first client onto Raseed today.
            </div>
            <div style={{ fontSize: 14, color: "rgba(252,250,244,0.75)" }}>
              Free to start. No card required.
            </div>
          </div>
          <Link
            href="/login"
            style={{
              background: "#FCFAF4", color: "var(--primary)",
              fontWeight: 700, fontSize: 15, padding: "13px 26px",
              borderRadius: "var(--radius-md)", textDecoration: "none",
              display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap",
            }}
          >
            Get started
            <Icon path={icons.arrow} size={16} />
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="px-6 md:px-10 py-8 max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center shrink-0"
            style={{ width: 22, height: 22, background: "var(--primary)", borderRadius: 6 }}
          >
            <span style={{ color: "#FCFAF4", fontWeight: 800, fontSize: 11, lineHeight: 1 }}>₹</span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)" }}>Raseed</span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
          AI-powered GST &amp; financial compliance copilot for Indian CA practices.
        </div>
      </footer>
    </div>
  );
}
