"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname.includes("/login");

  const [isLoading, setIsLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    if (isLoginPage) {
      setIsLoading(false);
      return;
    }

    // Check existing session first
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setHasSession(true);
        setIsLoading(false);
      } else {
        // Session not yet available — wait for onAuthStateChange to confirm
        // (handles the localStorage restore race on first load)
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setHasSession(true);
        setIsLoading(false);
      } else {
        setHasSession(false);
        setIsLoading(false);
        router.push("/login");
      }
    });

    // Fallback: if neither getSession nor onAuthStateChange fired within 4s, redirect
    const fallback = setTimeout(() => {
      setIsLoading((prev) => {
        if (prev) router.push("/login");
        return false;
      });
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(fallback);
    };
  }, [router, isLoginPage]);

  // Login page — no session check needed
  if (isLoginPage) return <>{children}</>;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <svg
          width="32" height="32" viewBox="0 0 24 24" fill="none"
          stroke="#3D4FB8" strokeWidth="2.5" strokeLinecap="round"
          style={{ animation: "spin 0.8s linear infinite" }}
        >
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <path d="M12 2a10 10 0 0110 10" />
        </svg>
      </div>
    );
  }

  if (!hasSession) return null;
  return <>{children}</>;
}
