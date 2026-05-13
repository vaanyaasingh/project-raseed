"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { supabase, signOut } from "@/lib/supabase";

export default function Navbar() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  const email = session?.user?.email ?? "";
  const shortEmail = email.length > 26 ? email.slice(0, 24) + "…" : email;

  return (
    <nav
      className="w-full bg-white border-b border-gray-100 px-4 sm:px-6"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="max-w-5xl mx-auto h-14 flex items-center justify-between">
        {/* Left — logo */}
        <Link
          href="/"
          className="flex items-center gap-2"
          style={{ textDecoration: "none" }}
        >
          <div
            className="flex items-center justify-center rounded-lg shrink-0"
            style={{ width: 28, height: 28, background: "var(--primary)" }}
          >
            <span style={{ color: "#FCFAF4", fontWeight: 800, fontSize: 14, lineHeight: 1 }}>₹</span>
          </div>
          <span style={{ fontWeight: 800, fontSize: 16, color: "var(--ink)", letterSpacing: "-0.02em" }}>
            Raseed
          </span>
        </Link>

        {/* Right — user info */}
        {session && (
          <div className="flex items-center gap-3">
            <span
              className="hidden sm:block truncate"
              style={{ fontSize: 13, color: "var(--ink-3)", maxWidth: 180 }}
            >
              {shortEmail}
            </span>
            <Link
              href="/profile"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--primary)",
                textDecoration: "none",
              }}
            >
              Profile
            </Link>
            <button
              onClick={handleSignOut}
              style={{
                fontSize: 13,
                fontWeight: 600,
                padding: "5px 12px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--ink-2)",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "background 120ms",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface)")}
            >
              Sign Out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
