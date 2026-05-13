"use client";

import "./globals.css";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import { supabase, signOut } from "@/lib/supabase";

// ── Nav items ──────────────────────────────────────────────────────────────

const NAV = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    href: "/upload",
    label: "Upload",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
  },
  {
    href: "/compliance",
    label: "Compliance",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 12l2 2 4-4" /><path d="M12 2a10 10 0 100 20A10 10 0 0012 2z" />
      </svg>
    ),
  },
  {
    href: "/invoices",
    label: "Invoices",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    href: "/finance",
    label: "Finance",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
      </svg>
    ),
  },
];

// ── Sidebar ────────────────────────────────────────────────────────────────

function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName]   = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setEmail(session?.user?.email ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setEmail(s?.user?.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Load name from profile (best-effort, no error shown)
  useEffect(() => {
    if (!email) return;
    import("@/lib/api").then(({ getProfile }) => {
      getProfile().then((p) => setName(p.name ?? null)).catch(() => null);
    });
  }, [email]);

  const initial = ((name ?? email ?? "?")[0] ?? "?").toUpperCase();
  const displayName = name || email || "";
  const shortDisplay = displayName.length > 22 ? displayName.slice(0, 20) + "…" : displayName;

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  return (
    <aside
      className="hidden md:flex flex-col h-screen sticky top-0 shrink-0"
      style={{ width: 240, background: "var(--surface)", borderRight: "1px solid var(--border)" }}
    >
      {/* Wordmark */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: 34, height: 34, background: "var(--primary)", borderRadius: 8 }}
        >
          <span style={{ color: "#FCFAF4", fontWeight: 800, fontSize: 17, lineHeight: 1 }}>₹</span>
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: "var(--ink)", letterSpacing: "-0.02em" }}>
            Raseed
          </div>
          <div style={{ fontSize: 10, color: "var(--ink-3)", fontWeight: 500, letterSpacing: "0.02em" }}>
            AI Compliance Copilot
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {NAV.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={`nav-link ${isActive ? "active" : ""}`}>
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "12px" }}>
        <Link
          href="/profile"
          style={{ textDecoration: "none", display: "block" }}
        >
          <div
            className="flex items-center gap-3 rounded-lg px-2 py-2"
            style={{
              cursor: "pointer",
              transition: "background 120ms",
              borderRadius: "var(--radius-md)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {/* Avatar */}
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "var(--primary)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <span style={{ color: "#FCFAF4", fontWeight: 800, fontSize: 13, lineHeight: 1 }}>
                {initial}
              </span>
            </div>
            {/* Name / email */}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: "var(--ink)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {shortDisplay || "Profile"}
              </div>
              {name && email && (
                <div style={{
                  fontSize: 11, color: "var(--ink-3)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {email.length > 22 ? email.slice(0, 20) + "…" : email}
                </div>
              )}
            </div>
            {/* Settings icon */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </div>
        </Link>
        <button
          onClick={handleSignOut}
          style={{
            marginTop: 4,
            width: "100%", padding: "7px 10px",
            background: "none", border: "none",
            borderRadius: "var(--radius-md)",
            fontSize: 13, fontWeight: 500, color: "var(--ink-3)",
            cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 8,
            transition: "background 120ms, color 120ms",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--danger-50)"; e.currentTarget.style.color = "var(--danger)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--ink-3)"; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          Sign out
        </button>
      </div>
    </aside>
  );
}

// ── Mobile top bar ─────────────────────────────────────────────────────────

function MobileHeader() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setEmail(session?.user?.email ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setEmail(s?.user?.email ?? null));
    return () => subscription.unsubscribe();
  }, []);

  const initial = (email?.[0] ?? "?").toUpperCase();

  return (
    <header
      className="md:hidden flex items-center justify-between px-4 h-14 sticky top-0 z-30"
      style={{
        background: "rgba(250,247,241,0.95)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2" style={{ textDecoration: "none" }}>
        <div style={{ width: 28, height: 28, background: "var(--primary)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#FCFAF4", fontWeight: 800, fontSize: 14, lineHeight: 1 }}>₹</span>
        </div>
        <span style={{ fontWeight: 800, fontSize: 16, color: "var(--ink)", letterSpacing: "-0.02em" }}>Raseed</span>
      </Link>

      {/* User avatar → profile */}
      <Link href="/profile" style={{ textDecoration: "none" }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: "var(--primary)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ color: "#FCFAF4", fontWeight: 800, fontSize: 13, lineHeight: 1 }}>{initial}</span>
        </div>
      </Link>
    </header>
  );
}

// ── Mobile bottom nav ──────────────────────────────────────────────────────

function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 inset-x-0 md:hidden z-30 flex"
      style={{
        background: "var(--surface)",
        borderTop: "1px solid var(--border)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {NAV.map((item) => {
        const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex-1 flex flex-col items-center gap-1 py-2.5 text-center"
            style={{
              color: isActive ? "var(--primary)" : "var(--ink-3)",
              fontSize: 10,
              fontWeight: isActive ? 600 : 400,
              textDecoration: "none",
            }}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

// ── Root layout ────────────────────────────────────────────────────────────

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname.includes("/login");

  return (
    <html lang="en">
      <body>
        {isLoginPage ? (
          <AuthGuard>{children}</AuthGuard>
        ) : (
          <>
            <MobileHeader />
            <div className="flex min-h-screen">
              <Sidebar />
              <main className="flex-1 min-w-0 pb-20 md:pb-0">
                <AuthGuard>{children}</AuthGuard>
              </main>
            </div>
            <BottomNav />
          </>
        )}
      </body>
    </html>
  );
}
