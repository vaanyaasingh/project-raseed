"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import InvoiceTable from "@/components/InvoiceTable";
import {
  listInvoices,
  generateInvoice,
  sendInvoice,
  extractInvoice,
  ApiError,
  type Invoice,
  type InvoiceResponse,
  type InvoiceGenerateRequest,
  type LineItem,
} from "@/lib/api";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatINR(n: number | undefined | null): string {
  if (n == null) return "—";
  return "₹" + n.toLocaleString("en-IN");
}

// ── Spinner ────────────────────────────────────────────────────────────────

function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round"
      style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }}
    >
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <path d="M12 2a10 10 0 0110 10" />
    </svg>
  );
}

// ── Send confirmation modal ────────────────────────────────────────────────

interface SendModalProps {
  invoice: Invoice | InvoiceResponse;
  onConfirm: (email: string, message: string) => void;
  onCancel: () => void;
  sending: boolean;
  sendError: string | null;
}

function SendModal({ invoice, onConfirm, onCancel, sending, sendError }: SendModalProps) {
  const [email,   setEmail]   = useState("");
  const [message, setMessage] = useState(
    `Please find the attached invoice for your reference.\n\nKindly process the payment at the earliest convenience.\n\nThank you.`
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const invNum = (invoice as Invoice).invoice_number ?? (invoice as InvoiceResponse).invoice_number ?? "—";

  return (
    /* Backdrop */
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(26,29,41,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      {/* Modal card */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-lg)",
          width: "100%", maxWidth: 520,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "var(--ink)" }}>
              Send invoice to client
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 2 }}>
              Invoice {invNum} · {formatINR((invoice as Invoice).grand_total ?? (invoice as InvoiceResponse).grand_total)}
            </div>
          </div>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", padding: 4 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px" }} className="space-y-4">
          {/* Human-in-the-loop notice */}
          <div
            style={{
              background: "#FBF1E4", border: "1px solid #ECC68A",
              borderRadius: "var(--radius-md)", padding: "10px 14px",
              display: "flex", gap: 10, alignItems: "flex-start",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p style={{ fontSize: 12, color: "#A75D1F", lineHeight: 1.5 }}>
              Review before sending — this action cannot be undone. The AI will draft
              the email; you confirm it here before it is sent.
            </p>
          </div>

          {/* Recipient */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
              Recipient email *
            </label>
            <input
              ref={inputRef}
              type="email"
              placeholder="client@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%", padding: "9px 12px",
                border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
                fontSize: 14, color: "var(--ink)", background: "var(--bg)",
                fontFamily: "inherit", outline: "none",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--primary)")}
              onBlur={(e)  => (e.target.style.borderColor = "var(--border)")}
            />
          </div>

          {/* Message */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
              Message to client
            </label>
            <textarea
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              style={{
                width: "100%", padding: "9px 12px",
                border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
                fontSize: 13, color: "var(--ink)", background: "var(--bg)",
                fontFamily: "inherit", outline: "none", resize: "vertical", lineHeight: 1.6,
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--primary)")}
              onBlur={(e)  => (e.target.style.borderColor = "var(--border)")}
            />
          </div>

          {/* Error */}
          {sendError && (
            <p style={{ fontSize: 13, color: "var(--danger)", fontWeight: 500 }}>{sendError}</p>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--border)",
            display: "flex", gap: 10, justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onCancel}
            disabled={sending}
            style={{
              padding: "9px 18px", borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)", background: "var(--surface)",
              color: "var(--ink-2)", fontSize: 14, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(email, message)}
            disabled={sending || !email.trim()}
            style={{
              padding: "9px 20px", borderRadius: "var(--radius-md)",
              background: sending || !email.trim() ? "var(--primary-50)" : "var(--primary)",
              color: sending || !email.trim() ? "var(--primary)" : "#FCFAF4",
              border: "none", fontSize: 14, fontWeight: 700,
              cursor: sending || !email.trim() ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            {sending ? <><Spinner size={15} /> Sending…</> : "Confirm & send"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Generate invoice form ──────────────────────────────────────────────────

const EMPTY_ITEM: LineItem = { description: "", quantity: 1, unit_price: 0, gst_rate: 18 };

function GenerateForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: (res: InvoiceResponse) => void;
  onCancel: () => void;
}) {
  const [form, setForm]       = useState<Omit<InvoiceGenerateRequest, "line_items">>({
    vendor_name: "", vendor_gstin: "", buyer_name: "", buyer_gstin: "",
  });
  const [items, setItems]     = useState<LineItem[]>([{ ...EMPTY_ITEM }]);
  const [submitting, setSub]  = useState(false);
  const [error, setError]     = useState<string | null>(null);

  function updateItem(i: number, key: keyof LineItem, val: string | number) {
    setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, [key]: val } : it));
  }

  function addItem()    { setItems((p) => [...p, { ...EMPTY_ITEM }]); }
  function removeItem(i: number) { setItems((p) => p.filter((_, idx) => idx !== i)); }

  const lineTotal = items.reduce((sum, it) => {
    const base = it.quantity * it.unit_price;
    return sum + base + base * (it.gst_rate / 100);
  }, 0);

  async function handleSubmit() {
    if (!form.vendor_name.trim() || !form.buyer_name.trim()) {
      setError("Vendor name and buyer name are required."); return;
    }
    if (items.some((it) => !it.description.trim())) {
      setError("All line items must have a description."); return;
    }
    setSub(true); setError(null);
    try {
      const res = await generateInvoice({ ...form, line_items: items });
      onSuccess(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Generation failed. Try again.");
    } finally {
      setSub(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px",
    border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
    fontSize: 13, color: "var(--ink)", background: "var(--bg)",
    fontFamily: "inherit", outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: "var(--ink-3)",
    textTransform: "uppercase", letterSpacing: "0.05em",
    display: "block", marginBottom: 4,
  };

  return (
    <div
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>Generate new invoice</span>
        <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div style={{ padding: 18 }} className="space-y-5">
        {/* Parties */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label style={labelStyle}>Your name / business *</label>
            <input style={inputStyle} placeholder="Sharma Electricals" value={form.vendor_name} onChange={(e) => setForm((p) => ({ ...p, vendor_name: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>Your GSTIN</label>
            <input style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase" }} placeholder="27AAACP1234N1Z5" value={form.vendor_gstin} onChange={(e) => setForm((p) => ({ ...p, vendor_gstin: e.target.value.toUpperCase() }))} maxLength={15} />
          </div>
          <div>
            <label style={labelStyle}>Client name *</label>
            <input style={inputStyle} placeholder="ABC Trading Co." value={form.buyer_name} onChange={(e) => setForm((p) => ({ ...p, buyer_name: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>Client GSTIN</label>
            <input style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase" }} placeholder="29AADCS1234D1ZL" value={form.buyer_gstin} onChange={(e) => setForm((p) => ({ ...p, buyer_gstin: e.target.value.toUpperCase() }))} maxLength={15} />
          </div>
        </div>

        {/* Line items */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
            Line items
          </div>
          <div className="space-y-2">
            {items.map((it, i) => {
              const itemTotal = it.quantity * it.unit_price * (1 + it.gst_rate / 100);
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 72px 88px 72px 64px auto", gap: 6, alignItems: "center" }}>
                  <input style={inputStyle} placeholder="Description" value={it.description} onChange={(e) => updateItem(i, "description", e.target.value)} />
                  <input style={{ ...inputStyle, textAlign: "center" }} type="number" min={1} placeholder="Qty" value={it.quantity} onChange={(e) => updateItem(i, "quantity", parseFloat(e.target.value) || 0)} />
                  <input style={{ ...inputStyle, textAlign: "right" }} type="number" min={0} placeholder="Unit ₹" value={it.unit_price || ""} onChange={(e) => updateItem(i, "unit_price", parseFloat(e.target.value) || 0)} />
                  <input style={{ ...inputStyle, textAlign: "right" }} type="number" min={0} max={100} placeholder="GST%" value={it.gst_rate} onChange={(e) => updateItem(i, "gst_rate", parseFloat(e.target.value) || 0)} />
                  <span className="num" style={{ fontSize: 12, color: "var(--ink-2)", textAlign: "right" }}>
                    {formatINR(itemTotal)}
                  </span>
                  {items.length > 1 && (
                    <button onClick={() => removeItem(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", padding: 4 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-3">
            <button
              onClick={addItem}
              style={{
                fontSize: 13, fontWeight: 500, color: "var(--primary)",
                background: "none", border: "none", cursor: "pointer", padding: 0,
                display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              Add line item
            </button>
            <div className="num" style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>
              Grand total: {formatINR(lineTotal)}
            </div>
          </div>
        </div>

        {error && <p style={{ fontSize: 13, color: "var(--danger)", fontWeight: 500 }}>{error}</p>}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            style={{ padding: "9px 18px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink-2)", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              padding: "9px 20px", borderRadius: "var(--radius-md)",
              background: submitting ? "var(--primary-50)" : "var(--primary)",
              color: submitting ? "var(--primary)" : "#FCFAF4",
              border: "none", fontSize: 14, fontWeight: 700,
              cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            {submitting ? <><Spinner size={15} /> Generating…</> : "Generate invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Generated invoice preview ──────────────────────────────────────────────

function GeneratedPreview({
  result,
  onSend,
  onDone,
}: {
  result: InvoiceResponse;
  onSend: () => void;
  onDone: () => void;
}) {
  return (
    <div
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
      }}
    >
      {/* Success header */}
      <div style={{ background: "var(--success-50)", borderBottom: "1px solid #A6CBB5", padding: "12px 18px", display: "flex", alignItems: "center", gap: 10 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--success)" }}>Invoice generated</span>
      </div>

      <div style={{ padding: 18 }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {[
            ["Invoice #",    result.invoice_number ?? "—"],
            ["Grand total",  formatINR(result.grand_total)],
            ["From",         result.vendor_name   ?? "—"],
            ["To",           result.buyer_name    ?? "—"],
            ["GST",          formatINR(result.total_gst)],
            ["Type",         result.invoice_type  ?? "issued"],
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
              <div className="num" style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginTop: 2 }}>{val}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onSend}
            style={{
              flex: 1, padding: "10px", borderRadius: "var(--radius-md)",
              background: "var(--primary)", color: "#FCFAF4",
              border: "none", fontSize: 14, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
            Send to client
          </button>
          <button
            onClick={onDone}
            style={{
              padding: "10px 16px", borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)", background: "var(--surface)",
              color: "var(--ink-2)", fontSize: 14, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main invoices page ─────────────────────────────────────────────────────

function InvoicesPageContent() {
  const searchParams = useSearchParams();
  const extractId    = searchParams.get("upload_id");

  const [invoices,  setInvoices]  = useState<Invoice[]>([]);
  const [listLoad,  setListLoad]  = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [generated, setGenerated] = useState<InvoiceResponse | null>(null);

  // Send modal state
  const [sendTarget,  setSendTarget]  = useState<Invoice | InvoiceResponse | null>(null);
  const [sending,     setSending]     = useState(false);
  const [sendError,   setSendError]   = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);

  // Load invoice list on mount
  useEffect(() => {
    listInvoices()
      .then(setInvoices)
      .catch(() => null)
      .finally(() => setListLoad(false));
  }, []);

  // Auto-extract if upload_id provided, then refresh the list
  useEffect(() => {
    if (!extractId) return;
    extractInvoice(extractId).then((res) => {
      setGenerated(res);
      listInvoices().then(setInvoices).catch(() => null);
    }).catch(() => null);
  }, [extractId]);

  async function handleSendConfirm(email: string, message: string) {
    if (!sendTarget) return;
    const invoiceId = (sendTarget as Invoice).id ?? (sendTarget as InvoiceResponse).invoice_id;
    setSending(true); setSendError(null);
    try {
      await sendInvoice({ invoice_id: invoiceId, recipient_email: email, message });
      setSendSuccess(true);
      setSendTarget(null);
      // Refresh invoice list
      listInvoices().then(setInvoices).catch(() => null);
    } catch (e) {
      setSendError(e instanceof ApiError ? e.message : "Send failed — check SMTP settings.");
    } finally {
      setSending(false);
    }
  }

  function handleGenerateSuccess(res: InvoiceResponse) {
    setGenerated(res);
    setShowForm(false);
    // Refresh invoice list
    listInvoices().then(setInvoices).catch(() => null);
  }

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
        <div className="flex items-center justify-between gap-4 max-w-5xl mx-auto">
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em" }}>
              Invoices
            </h1>
            <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 2 }}>
              Generate GST-compliant invoices and send them to clients.
            </p>
          </div>
          <button
            onClick={() => { setShowForm(true); setGenerated(null); }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "9px 16px",
              background: "var(--primary)", color: "#FCFAF4",
              borderRadius: "var(--radius-md)",
              fontSize: 14, fontWeight: 600, border: "none",
              cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            New invoice
          </button>
        </div>
      </header>

      <div className="px-6 py-6 max-w-5xl mx-auto space-y-6">
        {/* Send success banner */}
        {sendSuccess && (
          <div
            style={{
              background: "var(--success-50)", border: "1px solid #A6CBB5",
              borderRadius: "var(--radius-lg)", padding: "12px 16px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--success)" }}>Invoice sent successfully.</span>
            </div>
            <button onClick={() => setSendSuccess(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--success)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {/* Generate form */}
        {showForm && (
          <GenerateForm
            onSuccess={handleGenerateSuccess}
            onCancel={() => setShowForm(false)}
          />
        )}

        {/* Generated invoice preview */}
        {generated && !showForm && (
          <GeneratedPreview
            result={generated}
            onSend={() => setSendTarget(generated)}
            onDone={() => setGenerated(null)}
          />
        )}

        {/* Invoice table */}
        <div
          style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>All invoices</span>
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{invoices.length} total</span>
          </div>
          <InvoiceTable
            invoices={invoices}
            onSend={(inv) => { setSendTarget(inv); setSendError(null); }}
            loading={listLoad}
          />
        </div>
      </div>

      {/* Send modal (human-in-the-loop) */}
      {sendTarget && (
        <SendModal
          invoice={sendTarget}
          onConfirm={handleSendConfirm}
          onCancel={() => { setSendTarget(null); setSendError(null); }}
          sending={sending}
          sendError={sendError}
        />
      )}
    </div>
  );
}

export default function InvoicesPage() {
  return (
    <Suspense><InvoicesPageContent /></Suspense>
  );
}
