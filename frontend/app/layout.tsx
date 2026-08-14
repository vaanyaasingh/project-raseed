"use client";

import "./globals.css";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import ChatSidebar from "@/components/ChatSidebar";
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
  {
    href: "/chats",
    label: "Chats",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
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
  const [businessName, setBusinessName] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setEmail(session?.user?.email ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setEmail(s?.user?.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!email) return;
    import("@/lib/api").then(({ getProfile }) => {
      getProfile().then((p) => {
        setName(p.name ?? null);
        setBusinessName(p.business_name ?? null);
      }).catch(() => null);
    });
  }, [email]);

  const initial = ((name ?? email ?? "?")[0] ?? "?").toUpperCase();
  const displayName = name || (email ? email.split("@")[0] : "");
  const entityName = businessName || displayName || "My Business";

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  return (
    <aside
      className="hidden md:flex flex-col h-screen sticky top-0 shrink-0"
      style={{ width: 256, background: "var(--surface)", borderRight: "1px solid var(--border)" }}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 px-5" style={{ paddingTop: 22, paddingBottom: 18 }}>
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: 34, height: 34, background: "var(--primary)", borderRadius: 8 }}
        >
          <span style={{ color: "#FCFAF4", fontWeight: 800, fontSize: 17, lineHeight: 1 }}>₹</span>
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: "var(--ink)", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
            Raseed
          </div>
          <div style={{ fontSize: 10, color: "var(--ink-3)", fontWeight: 500, letterSpacing: "0.04em", lineHeight: 1.4 }}>
            रसीद · receipt
          </div>
        </div>
      </div>

      {/* Entity switcher */}
      <div style={{ padding: "0 10px 10px" }}>
        <Link
          href="/profile"
          style={{ textDecoration: "none" }}
        >
          <div
            className="flex items-center gap-2.5"
            style={{
              padding: "9px 10px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              background: "var(--bg)",
              cursor: "pointer",
              transition: "border-color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--border-strong)";
              e.currentTarget.style.background = "var(--bg-2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.background = "var(--bg)";
            }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: "var(--primary)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, fontSize: 12, fontWeight: 800, color: "#FCFAF4",
            }}>
              {initial}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: "var(--ink)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {entityName.length > 20 ? entityName.slice(0, 18) + "…" : entityName}
              </div>
              {email && (
                <div style={{
                  fontSize: 11, color: "var(--ink-3)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {email.length > 24 ? email.slice(0, 22) + "…" : email}
                </div>
              )}
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 overflow-y-auto" style={{ paddingTop: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-3)", letterSpacing: "0.08em", padding: "6px 12px 4px", textTransform: "uppercase" }}>
          Menu
        </div>
        {NAV.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={`nav-link ${isActive ? "active" : ""}`} style={{ marginBottom: 1 }}>
              {item.icon}
              <span style={{ flex: 1 }}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* AI Sync footer card */}
      <div style={{ padding: "10px 12px 6px" }}>
        <div style={{
          background: "var(--primary-50)",
          borderRadius: "var(--radius-md)",
          padding: "12px 14px",
          display: "flex", alignItems: "flex-start", gap: 10,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: "var(--primary)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FCFAF4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)", lineHeight: 1.3 }}>AI Sync active</div>
            <div style={{ fontSize: 11, color: "var(--ink-2)", marginTop: 2, lineHeight: 1.4 }}>
              Gemini 2.5 Flash · Ready
            </div>
          </div>
        </div>
      </div>

      {/* Sign out */}
      <div style={{ padding: "4px 12px 16px" }}>
        <button
          onClick={handleSignOut}
          style={{
            width: "100%", padding: "8px 10px",
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
      <body suppressHydrationWarning>
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
            <ChatSidebar />
          </>
        )}
      </body>
    </html>
  );
}
