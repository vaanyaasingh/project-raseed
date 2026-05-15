"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  generateInvoice,
  sendInvoice,
  deleteUpload,
  downloadInvoicePdf,
  ApiError,
  type Invoice,
  type InvoiceResponse,
  type InvoiceGenerateRequest,
  type LineItem,
} from "@/lib/api";
import { getUploadsWithAnalyses, type DbUpload } from "@/lib/supabase";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatINR(n: number | undefined | null): string {
  if (n == null) return "—";
  return "₹" + n.toLocaleString("en-IN");
}

function formatDate(d: string | undefined | null): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return d; }
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

// ── Uploaded invoice card ──────────────────────────────────────────────────

function UploadedInvoiceCard({
  upload,
  onSend,
  onDelete,
}: {
  upload: DbUpload;
  onSend: (invoiceId: string, data: Record<string, unknown>) => void;
  onDelete: (uploadId: string) => void;
}) {
  const analysis   = upload.analyses?.[0];
  // Find the invoice_agent_extract response specifically; fall back to first response
  const response   = analysis?.result_json?.responses?.find(
    (r) => r.agent === "invoice_agent_extract" || r.agent === "invoice_agent"
  ) ?? analysis?.result_json?.responses?.[0];
  const structured = (response?.structured_data ?? {}) as Record<string, unknown>;

  // Log for debugging
  if (process.env.NODE_ENV !== "production") {
    console.log("[invoice card]", upload.filename, {
      hasAnalysis: !!analysis,
      agentName: response?.agent,
      structuredKeys: Object.keys(structured),
    });
  }

  const invoiceId   = structured.invoice_id as string | undefined;
  const invNumber   = structured.invoice_number as string | undefined;
  const vendorName  = structured.vendor_name   as string | undefined;
  const buyerName   = structured.buyer_name    as string | undefined;
  const grandTotal  = structured.grand_total   as number | undefined;
  const totalGst    = structured.total_gst     as number | undefined;
  const invType     = structured.invoice_type  as string | undefined;
  const invDate     = structured.invoice_date  as string | undefined;

  const hasInvoiceData = invNumber || vendorName || buyerName || grandTotal != null;
  const isWrongAgent   = analysis && response && response.agent !== "invoice_agent_extract";

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", overflow: "hidden",
    }}>
      {/* Header row */}
      <div style={{
        padding: "12px 16px",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
          </svg>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {upload.filename}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {invType && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "2px 8px",
              borderRadius: 999, textTransform: "uppercase", letterSpacing: "0.05em",
              background: invType === "issued" ? "var(--primary-50)" : "#F0F4FF",
              color: invType === "issued" ? "var(--primary)" : "#4460CC",
            }}>
              {invType}
            </span>
          )}
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {formatDate(upload.uploaded_at)}
          </span>
          <button
            onClick={() => onDelete(upload.id)}
            title="Delete invoice"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--ink-3)", padding: 4, display: "flex", alignItems: "center",
              borderRadius: "var(--radius-sm)", transition: "color 150ms",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--danger)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ink-3)")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Fields grid */}
      <div style={{ padding: "14px 16px" }}>
        {!analysis ? (
          <p style={{ fontSize: 13, color: "var(--ink-3)", fontStyle: "italic" }}>
            Analysis not yet available.
          </p>
        ) : isWrongAgent ? (
          /* Old upload analyzed by wrong agent — prompt re-upload */
          <div style={{
            background: "#FBF1E4", border: "1px solid #ECC68A",
            borderRadius: "var(--radius-md)", padding: "10px 14px",
            display: "flex", gap: 10, alignItems: "flex-start",
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <div>
              <p style={{ fontSize: 13, color: "#A75D1F", fontWeight: 600, marginBottom: 2 }}>
                This invoice was uploaded before a recent fix.
              </p>
              <p style={{ fontSize: 12, color: "#A75D1F", lineHeight: 1.5 }}>
                Please delete it and re-upload the PDF — extraction will work correctly now.
              </p>
            </div>
          </div>
        ) : !hasInvoiceData ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p style={{ fontSize: 13, color: "var(--ink-3)" }}>
              {response?.summary || "Could not extract fields from this PDF — try re-uploading a clearer scan."}
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px 20px" }}>
            {[
              ["Invoice #",   invNumber  ?? "—"],
              ["Date",        invDate    ? formatDate(invDate) : "—"],
              ["Vendor",      vendorName ?? "—"],
              ["Buyer",       buyerName  ?? "—"],
              ["Grand total", formatINR(grandTotal)],
              ["Total GST",   formatINR(totalGst)],
            ].map(([label, val]) => (
              <div key={label}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {label}
                </div>
                <div className="num" style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginTop: 2 }}>
                  {val}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action row */}
        {analysis && hasInvoiceData && !isWrongAgent && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            {/* Ask AI */}
            <button
              onClick={() => {
                const context = [
                  vendorName && `from ${vendorName}`,
                  buyerName && `to ${buyerName}`,
                  grandTotal != null && `totalling ₹${grandTotal.toLocaleString("en-IN")}`,
                  invNumber && `(Invoice #${invNumber})`,
                  invDate && `dated ${formatDate(invDate)}`,
                  response?.summary,
                ].filter(Boolean).join(", ");
                window.dispatchEvent(new CustomEvent("raseed:chat", {
                  detail: {
                    topic: "invoice",
                    prefill: `I have an invoice ${context}. Can you help me verify if it's GST-compliant and what I should check?`,
                  },
                }));
              }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 12px", borderRadius: "var(--radius-md)",
                background: "transparent", color: "var(--ink-3)",
                border: "1px solid var(--border)", fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit", transition: "all 120ms",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.color = "var(--primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--ink-3)"; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              Ask AI
            </button>
            <button
              onClick={() => downloadInvoicePdf(upload.id, `invoice-${invNumber ?? upload.id.slice(0,8)}.pdf`)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: "var(--radius-md)",
                background: "var(--bg-2)", color: "var(--ink-2)",
                border: "1px solid var(--border)", fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Download PDF
            </button>
            {invoiceId && (
              <button
                onClick={() => onSend(invoiceId, structured)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "7px 14px", borderRadius: "var(--radius-md)",
                  background: "var(--primary)", color: "#FCFAF4",
                  border: "none", fontSize: 13, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
                Send to client
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Generated invoice card ──────────────────────────────────────────────────

function GeneratedInvoiceCard({
  invoice,
  onSend,
}: {
  invoice: Invoice;
  onSend: (invoice: Invoice) => void;
}) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", overflow: "hidden",
    }}>
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
            {invoice.invoice_number ?? "Generated invoice"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "2px 8px",
            borderRadius: 999, textTransform: "uppercase", letterSpacing: "0.05em",
            background: "var(--success-50)", color: "var(--success)",
          }}>
            generated
          </span>
          {invoice.sent_at && (
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>Sent {formatDate(invoice.sent_at)}</span>
          )}
        </div>
      </div>
      <div style={{ padding: "14px 16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px 20px" }}>
          {[
            ["From",        invoice.vendor_name ?? "—"],
            ["To",          invoice.buyer_name  ?? "—"],
            ["Grand total", formatINR(invoice.grand_total)],
            ["Total GST",   formatINR(invoice.total_gst)],
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
              <div className="num" style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginTop: 2 }}>{val}</div>
            </div>
          ))}
        </div>
        {!invoice.sent_at && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={() => onSend(invoice)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: "var(--radius-md)",
                background: "var(--primary)", color: "#FCFAF4",
                border: "none", fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
              Send to client
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Send modal ──────────────────────────────────────────────────────────────

interface SendTarget {
  invoice_id: string;
  invoice_number?: string;
  grand_total?: number;
}

function SendModal({
  target,
  onConfirm,
  onCancel,
  sending,
  sendError,
}: {
  target: SendTarget;
  onConfirm: (email: string, message: string) => void;
  onCancel: () => void;
  sending: boolean;
  sendError: string | null;
}) {
  const [email,   setEmail]   = useState("");
  const [message, setMessage] = useState(
    `Please find the attached invoice for your reference.\n\nKindly process the payment at the earliest convenience.\n\nThank you.`
  );
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(26,29,41,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-lg)", width: "100%", maxWidth: 520, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "var(--ink)" }}>Send invoice to client</div>
            <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 2 }}>
              {target.invoice_number ? `Invoice ${target.invoice_number}` : "Invoice"}{target.grand_total != null ? ` · ${formatINR(target.grand_total)}` : ""}
            </div>
          </div>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", padding: 4 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div style={{ padding: 20 }} className="space-y-4">
          <div style={{ background: "#FBF1E4", border: "1px solid #ECC68A", borderRadius: "var(--radius-md)", padding: "10px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p style={{ fontSize: 12, color: "#A75D1F", lineHeight: 1.5 }}>Review before sending — this action cannot be undone. The AI will draft the email; you confirm it here before it is sent.</p>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>Recipient email *</label>
            <input ref={inputRef} type="email" placeholder="client@example.com" value={email} onChange={(e) => setEmail(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", fontSize: 14, color: "var(--ink)", background: "var(--bg)", fontFamily: "inherit", outline: "none" }}
              onFocus={(e) => (e.target.style.borderColor = "var(--primary)")}
              onBlur={(e)  => (e.target.style.borderColor = "var(--border)")} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>Message to client</label>
            <textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", fontSize: 13, color: "var(--ink)", background: "var(--bg)", fontFamily: "inherit", outline: "none", resize: "vertical", lineHeight: 1.6 }}
              onFocus={(e) => (e.target.style.borderColor = "var(--primary)")}
              onBlur={(e)  => (e.target.style.borderColor = "var(--border)")} />
          </div>
          {sendError && <p style={{ fontSize: 13, color: "var(--danger)", fontWeight: 500 }}>{sendError}</p>}
        </div>
        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} disabled={sending}
            style={{ padding: "9px 18px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink-2)", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
          <button onClick={() => onConfirm(email, message)} disabled={sending || !email.trim()}
            style={{ padding: "9px 20px", borderRadius: "var(--radius-md)", background: sending || !email.trim() ? "var(--primary-50)" : "var(--primary)", color: sending || !email.trim() ? "var(--primary)" : "#FCFAF4", border: "none", fontSize: 14, fontWeight: 700, cursor: sending || !email.trim() ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8 }}>
            {sending ? <><Spinner size={15} /> Sending…</> : "Confirm & send"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Generate invoice form ──────────────────────────────────────────────────

const EMPTY_ITEM: LineItem = { description: "", quantity: 1, unit_price: 0, gst_rate: 18 };

function GenerateForm({ onSuccess, onCancel }: { onSuccess: (res: InvoiceResponse) => void; onCancel: () => void }) {
  const [form, setForm]     = useState<Omit<InvoiceGenerateRequest, "line_items">>({ vendor_name: "", vendor_gstin: "", buyer_name: "", buyer_gstin: "" });
  const [items, setItems]   = useState<LineItem[]>([{ ...EMPTY_ITEM }]);
  const [submitting, setSub] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  function updateItem(i: number, key: keyof LineItem, val: string | number) {
    setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, [key]: val } : it));
  }
  function addItem()           { setItems((p) => [...p, { ...EMPTY_ITEM }]); }
  function removeItem(i: number) { setItems((p) => p.filter((_, idx) => idx !== i)); }

  const lineTotal = items.reduce((sum, it) => {
    const base = it.quantity * it.unit_price;
    return sum + base + base * (it.gst_rate / 100);
  }, 0);

  async function handleSubmit() {
    if (!form.vendor_name.trim() || !form.buyer_name.trim()) { setError("Vendor name and buyer name are required."); return; }
    if (items.some((it) => !it.description.trim())) { setError("All line items must have a description."); return; }
    setSub(true); setError(null);
    try { onSuccess(await generateInvoice({ ...form, line_items: items })); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Generation failed. Try again."); }
    finally { setSub(false); }
  }

  const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--ink)", background: "var(--bg)", fontFamily: "inherit", outline: "none" };
  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 };

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>Generate new invoice</span>
        <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <div style={{ padding: 18 }} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            ["Your name / business *", "vendor_name",  "Sharma Electricals", false],
            ["Your GSTIN",             "vendor_gstin", "27AAACP1234N1Z5",    true],
            ["Client name *",          "buyer_name",   "ABC Trading Co.",    false],
            ["Client GSTIN",           "buyer_gstin",  "29AADCS1234D1ZL",    true],
          ].map(([label, field, placeholder, mono]) => (
            <div key={field as string}>
              <label style={labelStyle}>{label as string}</label>
              <input
                style={{ ...inputStyle, ...(mono ? { fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase" } : {}) }}
                placeholder={placeholder as string}
                value={form[field as keyof typeof form] ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, [field as string]: mono ? e.target.value.toUpperCase() : e.target.value }))}
                maxLength={mono ? 15 : undefined}
              />
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Line items</div>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 72px 88px 72px 64px auto", gap: 6, alignItems: "center" }}>
                <input style={inputStyle} placeholder="Description" value={it.description} onChange={(e) => updateItem(i, "description", e.target.value)} />
                <input style={{ ...inputStyle, textAlign: "center" }} type="number" min={1} value={it.quantity} onChange={(e) => updateItem(i, "quantity", parseFloat(e.target.value) || 0)} />
                <input style={{ ...inputStyle, textAlign: "right" }} type="number" min={0} placeholder="Unit ₹" value={it.unit_price || ""} onChange={(e) => updateItem(i, "unit_price", parseFloat(e.target.value) || 0)} />
                <input style={{ ...inputStyle, textAlign: "right" }} type="number" min={0} max={100} value={it.gst_rate} onChange={(e) => updateItem(i, "gst_rate", parseFloat(e.target.value) || 0)} />
                <span className="num" style={{ fontSize: 12, color: "var(--ink-2)", textAlign: "right" }}>
                  {formatINR(it.quantity * it.unit_price * (1 + it.gst_rate / 100))}
                </span>
                {items.length > 1 && (
                  <button onClick={() => removeItem(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", padding: 4 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-3">
            <button onClick={addItem} style={{ fontSize: 13, fontWeight: 500, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              Add line item
            </button>
            <div className="num" style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>Grand total: {formatINR(lineTotal)}</div>
          </div>
        </div>
        {error && <p style={{ fontSize: 13, color: "var(--danger)", fontWeight: 500 }}>{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} style={{ padding: "9px 18px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink-2)", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={handleSubmit} disabled={submitting} style={{ padding: "9px 20px", borderRadius: "var(--radius-md)", background: submitting ? "var(--primary-50)" : "var(--primary)", color: submitting ? "var(--primary)" : "#FCFAF4", border: "none", fontSize: 14, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8 }}>
            {submitting ? <><Spinner size={15} /> Generating…</> : "Generate invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main invoices page ─────────────────────────────────────────────────────

function InvoicesPageContent() {
  const searchParams = useSearchParams();
  const newUploadId  = searchParams.get("upload_id"); // set when coming from upload page

  const [uploads,     setUploads]     = useState<DbUpload[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [justGenerated, setJustGenerated] = useState<InvoiceResponse | null>(null);

  // Send modal state
  const [sendTarget,  setSendTarget]  = useState<SendTarget | null>(null);
  const [sending,     setSending]     = useState(false);
  const [sendError,   setSendError]   = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);

  // Load all invoice uploads from Supabase
  useEffect(() => {
    getUploadsWithAnalyses("invoice", 50)
      .then(setUploads)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  // When coming from upload page with a new upload_id, scroll to top and highlight it
  useEffect(() => {
    if (newUploadId) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [newUploadId]);

  async function handleSendConfirm(email: string, message: string) {
    if (!sendTarget) return;
    setSending(true); setSendError(null);
    try {
      await sendInvoice({ invoice_id: sendTarget.invoice_id, recipient_email: email, message });
      setSendSuccess(true);
      setSendTarget(null);
      // Refresh list
      getUploadsWithAnalyses("invoice", 50).then(setUploads).catch(() => null);
    } catch (e) {
      setSendError(e instanceof ApiError ? e.message : "Send failed — check SMTP settings.");
    } finally {
      setSending(false);
    }
  }

  function handleSendFromUpload(invoiceId: string, data: Record<string, unknown>) {
    setSendTarget({
      invoice_id:     invoiceId,
      invoice_number: data.invoice_number as string | undefined,
      grand_total:    data.grand_total    as number | undefined,
    });
    setSendError(null);
  }

  async function handleDelete(uploadId: string) {
    if (!confirm("Delete this invoice? This cannot be undone.")) return;
    try {
      await deleteUpload(uploadId);
      setUploads((prev) => prev.filter((u) => u.id !== uploadId));
    } catch {
      alert("Could not delete — please try again.");
    }
  }

  function handleGenerateSuccess(res: InvoiceResponse) {
    setJustGenerated(res);
    setShowForm(false);
  }

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      {/* Header */}
      <header className="sticky top-0 z-20 px-6 py-4"
        style={{ background: "rgba(250,247,241,0.92)", backdropFilter: "blur(8px)", borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between gap-4 max-w-5xl mx-auto">
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.02em" }}>Invoices</h1>
            <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 2 }}>
              View uploaded invoices and generate GST-compliant ones.
            </p>
          </div>
          <button onClick={() => { setShowForm(true); setJustGenerated(null); }}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 16px", background: "var(--primary)", color: "#FCFAF4", borderRadius: "var(--radius-md)", fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            New invoice
          </button>
        </div>
      </header>

      <div className="px-6 py-6 max-w-5xl mx-auto space-y-6">
        {/* Send success banner */}
        {sendSuccess && (
          <div style={{ background: "var(--success-50)", border: "1px solid #A6CBB5", borderRadius: "var(--radius-lg)", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
        {showForm && <GenerateForm onSuccess={handleGenerateSuccess} onCancel={() => setShowForm(false)} />}

        {/* Just-generated preview */}
        {justGenerated && !showForm && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
            <div style={{ background: "var(--success-50)", borderBottom: "1px solid #A6CBB5", padding: "12px 18px", display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              <span style={{ fontWeight: 700, fontSize: 14, color: "var(--success)" }}>Invoice generated</span>
            </div>
            <div style={{ padding: 18 }} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Invoice #", justGenerated.invoice_number ?? "—"],
                  ["Grand total", formatINR(justGenerated.grand_total)],
                  ["From", justGenerated.vendor_name ?? "—"],
                  ["To",   justGenerated.buyer_name  ?? "—"],
                  ["GST",  formatINR(justGenerated.total_gst)],
                  ["Type", justGenerated.invoice_type ?? "issued"],
                ].map(([label, val]) => (
                  <div key={label}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
                    <div className="num" style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginTop: 2 }}>{val}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => downloadInvoicePdf(justGenerated.invoice_id, `invoice-${justGenerated.invoice_number ?? justGenerated.invoice_id.slice(0,8)}.pdf`)}
                  style={{ padding: "10px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--bg-2)", color: "var(--ink-2)", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                  Download PDF
                </button>
                <button onClick={() => setSendTarget({ invoice_id: justGenerated.invoice_id, invoice_number: justGenerated.invoice_number, grand_total: justGenerated.grand_total })}
                  style={{ flex: 1, padding: "10px", borderRadius: "var(--radius-md)", background: "var(--primary)", color: "#FCFAF4", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                  Send to client
                </button>
                <button onClick={() => setJustGenerated(null)}
                  style={{ padding: "10px 16px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink-2)", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Invoice uploads list */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>Uploaded invoices</h2>
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{uploads.length} total</span>
          </div>

          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 48, color: "var(--ink-3)" }}>
              <Spinner size={24} />
            </div>
          ) : uploads.length === 0 ? (
            <div style={{ background: "var(--surface)", border: "2px dashed var(--border)", borderRadius: "var(--radius-lg)", padding: "40px 24px", textAlign: "center" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 12px" }}>
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
              </svg>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>No invoices uploaded yet</p>
              <p style={{ fontSize: 13, color: "var(--ink-3)" }}>
                Go to{" "}
                <a href="/upload?type=invoice" style={{ color: "var(--primary)", textDecoration: "none", fontWeight: 500 }}>Upload</a>
                {" "}to add an invoice PDF.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {uploads.map((upload) => (
                <UploadedInvoiceCard
                  key={upload.id}
                  upload={upload}
                  onSend={handleSendFromUpload}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Send modal */}
      {sendTarget && (
        <SendModal
          target={sendTarget}
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
  return <Suspense><InvoicesPageContent /></Suspense>;
}
