"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase, signOut } from "@/lib/supabase";
import { getProfile, updateProfile, type UserProfile } from "@/lib/api";
import AuthGuard from "@/components/AuthGuard";

// ── Label + input helpers ──────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      fontSize: 11, fontWeight: 700, color: "var(--ink-3)",
      textTransform: "uppercase", letterSpacing: "0.06em",
      display: "block", marginBottom: 6,
    }}>
      {children}
    </label>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  mono?: boolean;
  hint?: string;
}

function Field({ label, value, onChange, placeholder, readOnly, mono, hint }: FieldProps) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        readOnly={readOnly}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "9px 12px",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          fontSize: 14,
          fontFamily: mono ? "'JetBrains Mono', monospace" : "inherit",
          color: readOnly ? "var(--ink-2)" : "var(--ink)",
          background: readOnly ? "var(--bg-2)" : "var(--bg)",
          outline: "none",
          transition: "border-color 120ms",
        }}
        onFocus={(e) => { if (!readOnly) e.target.style.borderColor = "var(--primary)"; }}
        onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
      />
      {hint && (
        <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>{hint}</p>
      )}
    </div>
  );
}

// ── Avatar ─────────────────────────────────────────────────────────────────

function Avatar({ name, email, size = 64 }: { name?: string | null; email?: string | null; size?: number }) {
  const letter = (name?.[0] ?? email?.[0] ?? "?").toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: "var(--primary)",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      <span style={{
        color: "#FCFAF4",
        fontWeight: 800,
        fontSize: size * 0.4,
        lineHeight: 1,
        letterSpacing: "-0.02em",
      }}>
        {letter}
      </span>
    </div>
  );
}

// ── Section card ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      boxShadow: "var(--shadow-sm)",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "14px 20px",
        borderBottom: "1px solid var(--border)",
        fontSize: 14, fontWeight: 700, color: "var(--ink)",
      }}>
        {title}
      </div>
      <div style={{ padding: 20 }} className="space-y-5">
        {children}
      </div>
    </div>
  );
}

// ── Main profile content ───────────────────────────────────────────────────

function ProfileContent() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [name, setName]                 = useState("");
  const [phone, setPhone]               = useState("");
  const [businessName, setBusinessName] = useState("");
  const [gstin, setGstin]               = useState("");

  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    getProfile().then((p) => {
      setProfile(p);
      setName(p.name ?? "");
      setPhone(p.phone ?? "");
      setBusinessName(p.business_name ?? "");
      setGstin(p.gstin ?? "");
    }).catch(() => null);
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await updateProfile({
        name: name || null,
        phone: phone || null,
        business_name: businessName || null,
        gstin: gstin || null,
      });
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 3000);
    } catch {
      setSaveError("Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  const email = session?.user?.email ?? profile?.email ?? "";
  const memberSince = session?.user?.created_at
    ? new Date(session.user.created_at).toLocaleDateString("en-IN", {
        day: "numeric", month: "long", year: "numeric",
      })
    : null;

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
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em" }}>
          Profile
        </h1>
        <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 2 }}>
          Your account and business details
        </p>
      </header>

      <div className="px-6 py-8 max-w-lg mx-auto space-y-5">
        {/* Identity card */}
        <Section title="Account">
          <div className="flex items-center gap-4">
            <Avatar name={name} email={email} size={56} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "var(--ink)" }}>
                {name || email || "—"}
              </div>
              {name && (
                <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 2 }}>{email}</div>
              )}
              {memberSince && (
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
                  Member since {memberSince}
                </div>
              )}
            </div>
          </div>
          <Field
            label="Email address"
            value={email}
            readOnly
            hint="Email is managed by your sign-in method and cannot be changed here."
          />
        </Section>

        {/* Editable details */}
        <Section title="Personal details">
          <Field
            label="Full name"
            value={name}
            onChange={setName}
            placeholder="Priya Sharma"
          />
          <Field
            label="Phone number"
            value={phone}
            onChange={setPhone}
            placeholder="+91 98765 43210"
          />
        </Section>

        {/* Business details */}
        <Section title="Business details">
          <Field
            label="Business name"
            value={businessName}
            onChange={setBusinessName}
            placeholder="Sharma Electricals Pvt. Ltd."
          />
          <Field
            label="GSTIN"
            value={gstin}
            onChange={(v) => setGstin(v.toUpperCase())}
            placeholder="27AAACP1234N1Z5"
            mono
            hint="15-character GST Identification Number"
          />
        </Section>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary"
            style={{ opacity: saving ? 0.7 : 1 }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          {saved && (
            <span style={{ fontSize: 13, color: "var(--success)", fontWeight: 600 }}>
              ✓ Saved
            </span>
          )}
          {saveError && (
            <span style={{ fontSize: 13, color: "var(--danger)" }}>{saveError}</span>
          )}
        </div>

        {/* Danger zone */}
        <Section title="Sign out">
          <p style={{ fontSize: 13, color: "var(--ink-2)" }}>
            You will be signed out of all sessions on this device.
          </p>
          <button
            onClick={handleSignOut}
            style={{
              padding: "9px 18px",
              borderRadius: "var(--radius-md)",
              border: "1px solid #DFA098",
              background: "var(--danger-50)",
              color: "var(--danger)",
              fontSize: 14, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
              transition: "opacity 120ms",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            Sign out
          </button>
        </Section>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <AuthGuard>
      <ProfileContent />
    </AuthGuard>
  );
}
