"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import UploadCard from "@/components/UploadCard";
import {
  uploadDocument,
  uploadBankStatement,
  ApiError,
} from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────

type DocType = "gst_notice" | "invoice" | "bank_statement";

interface DocTypeConfig {
  label: string;
  hint: string;
  accept: string;
  acceptLabel: string;
  resultPath: string;
  icon: React.ReactNode;
}

// Extended upload result that includes the new inline analysis
interface UploadWithAnalysis {
  upload_id: string;
  filename: string;
  doc_type?: string;
  status?: string;
  analysis?: {
    agents_invoked: string[];
    responses: Array<{
      agent: string;
      summary: string;
      structured_data: Record<string, unknown>;
      action_items: string[];
      confidence: number;
      raw_llm_output: string;
    }>;
    integrated_insight: string | null;
  };
  todo_items?: Array<{ task: string; deadline?: string; priority?: string }>;
  // bank_statement extras
  rows_parsed?: number;
  date_range?: { start: string; end: string };
  // pdf extras
  extracted_text_preview?: string;
}

// ── Inline SVG helper ──────────────────────────────────────────────────────

function Svg({ d, size = 24 }: { d: string | string[]; size?: number }) {
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

const DOC_TYPES: Record<DocType, DocTypeConfig> = {
  gst_notice: {
    label: "GST Notice",
    hint: "ASMT-10, DRC-01, GSTR-3A — any notice from the GST department.",
    accept: ".pdf",
    acceptLabel: "PDF · max 10 MB",
    resultPath: "/compliance",
    icon: <Svg d={["M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z", "M12 9v4", "M12 17h.01"]} />,
  },
  invoice: {
    label: "Invoice",
    hint: "Upload a received or issued invoice to extract line items and GST.",
    accept: ".pdf",
    acceptLabel: "PDF · max 10 MB",
    resultPath: "/invoices",
    icon: <Svg d={["M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z", "M14 2v6h6", "M16 13H8", "M16 17H8", "M10 9H8"]} />,
  },
  bank_statement: {
    label: "Bank Statement",
    hint: "Upload a CSV export or PDF statement from your bank for a cash flow report.",
    accept: ".csv,.pdf",
    acceptLabel: "CSV or PDF",
    resultPath: "/finance",
    icon: <Svg d={["M4 6h16", "M4 10h16", "M4 14h8"]} />,
  },
};

// ── Step indicators ────────────────────────────────────────────────────────

function Step({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 700,
        background: done ? "var(--success)" : active ? "var(--primary)" : "var(--bg-3)",
        color: done || active ? "#FCFAF4" : "var(--ink-3)",
        transition: "background 200ms var(--ease)",
      }}>
        {done ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : n}
      </div>
      <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? "var(--ink)" : "var(--ink-3)" }}>
        {label}
      </span>
    </div>
  );
}

// ── Spinner ────────────────────────────────────────────────────────────────

function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      style={{ animation: "spin 0.8s linear infinite" }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <path d="M12 2a10 10 0 0110 10" />
    </svg>
  );
}

// ── Inline result summary ──────────────────────────────────────────────────

function ResultSummary({ result, docType }: { result: UploadWithAnalysis; docType: DocType }) {
  const analysis = result.analysis;
  const config   = DOC_TYPES[docType];

  // Pull agent-specific data
  const gstAgent     = analysis?.responses.find((r) => r.agent === "gst_tax_agent");
  const finAgent     = analysis?.responses.find((r) => r.agent === "finance_agent");
  const invoiceAgent = analysis?.responses.find((r) => r.agent === "invoice_agent");

  const finData   = (finAgent?.structured_data   ?? {}) as Record<string, unknown>;
  const invData   = (invoiceAgent?.structured_data ?? {}) as Record<string, unknown>;

  const todoCount = result.todo_items?.length ?? 0;
  const anomalyCount = ((finData.anomalies ?? []) as unknown[]).length;

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)",
      overflow: "hidden",
    }}>
      {/* Success header */}
      <div style={{
        background: "var(--success-50)", borderBottom: "1px solid #A6CBB5",
        padding: "12px 16px", display: "flex", alignItems: "center", gap: 10,
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
        <span style={{ fontWeight: 600, fontSize: 14, color: "var(--success)" }}>
          Upload and analysis complete
        </span>
      </div>

      {/* Summary content */}
      <div style={{ padding: "16px 18px" }} className="space-y-4">
        {/* File info */}
        <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
          <span style={{ fontWeight: 600, color: "var(--ink)" }}>{result.filename}</span>
          {result.rows_parsed && (
            <span style={{ marginLeft: 8 }}>
              · {result.rows_parsed} transactions · {result.date_range?.start} → {result.date_range?.end}
            </span>
          )}
        </div>

        {/* Doc-type specific summary */}
        {docType === "gst_notice" && (
          <div className="space-y-3">
            {(analysis?.integrated_insight ?? gstAgent?.summary) && (
              <p style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.6 }}>
                {analysis?.integrated_insight ?? gstAgent?.summary}
              </p>
            )}
            {todoCount > 0 && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "4px 12px", borderRadius: 999,
                background: "var(--primary-50)", color: "var(--primary)",
                fontSize: 13, fontWeight: 600,
              }}>
                {todoCount} action item{todoCount !== 1 ? "s" : ""} identified
              </div>
            )}
          </div>
        )}

        {docType === "bank_statement" && (
          <div className="space-y-3">
            {finData.health_score !== undefined && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: "50%",
                  background: (finData.health_score as number) > 7 ? "var(--success-50)" : (finData.health_score as number) >= 4 ? "#FBF1E4" : "var(--danger-50)",
                  border: `2px solid ${(finData.health_score as number) > 7 ? "var(--success)" : (finData.health_score as number) >= 4 ? "var(--accent)" : "var(--danger)"}`,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                }}>
                  <span className="num" style={{
                    fontSize: 22, fontWeight: 800, lineHeight: 1,
                    color: (finData.health_score as number) > 7 ? "var(--success)" : (finData.health_score as number) >= 4 ? "var(--accent)" : "var(--danger)",
                  }}>
                    {finData.health_score as number}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.7, color: "var(--ink-3)" }}>/10</span>
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
                    Cash flow health score
                  </div>
                  {anomalyCount > 0 && (
                    <div style={{ fontSize: 13, color: "var(--accent)", marginTop: 2 }}>
                      {anomalyCount} anomal{anomalyCount !== 1 ? "ies" : "y"} detected
                    </div>
                  )}
                </div>
              </div>
            )}
            {finAgent?.summary && (
              <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
                {finAgent.summary}
              </p>
            )}
          </div>
        )}

        {docType === "invoice" && (
          <div style={{
            background: "var(--bg-2)", borderRadius: "var(--radius-md)",
            padding: "12px 14px",
          }} className="space-y-2">
            {[
              ["Invoice number", invData.invoice_number as string],
              ["Vendor",         invData.vendor_name    as string],
              ["Grand total",    invData.grand_total !== undefined ? `₹${(invData.grand_total as number).toLocaleString("en-IN")}` : undefined],
            ].filter(([, v]) => v).map(([label, value]) => (
              <div key={label as string} style={{ display: "flex", gap: 12, fontSize: 13 }}>
                <span style={{ color: "var(--ink-3)", width: 120, flexShrink: 0 }}>{label as string}</span>
                <span style={{ color: "var(--ink)", fontWeight: 500 }}>{value as string}</span>
              </div>
            ))}
            {invoiceAgent?.summary && (
              <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                {invoiceAgent.summary}
              </p>
            )}
          </div>
        )}
      </div>

      {/* CTAs */}
      <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <Link
          href={
            docType === "invoice"
              ? `/invoices?upload_id=${result.upload_id}`
              : config.resultPath
          }
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            fontSize: 14, fontWeight: 600,
            color: "var(--primary)", textDecoration: "none",
          }}
        >
          View full analysis
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>

        {/* Ask AI quick action */}
        <button
          onClick={() => {
            const topicMap: Record<DocType, string> = {
              gst_notice: "compliance",
              invoice: "invoice",
              bank_statement: "finance",
            };
            const summaryMap: Record<DocType, string> = {
              gst_notice:
                analysis?.integrated_insight ??
                gstAgent?.summary ??
                "",
              invoice:
                invoiceAgent?.summary ??
                (invData.invoice_number ? `Invoice #${invData.invoice_number} from ${invData.vendor_name ?? "unknown"} — ₹${invData.grand_total ?? "?"}` : ""),
              bank_statement:
                finAgent?.summary ??
                (finData.health_score !== undefined ? `Cash flow health score: ${finData.health_score}/10` : ""),
            };
            const prefill = summaryMap[docType]
              ? `I just uploaded a ${config.label.toLowerCase()}. Here's what was found:\n\n"${summaryMap[docType]}"\n\nCan you help me understand this and what I should do next?`
              : `I just uploaded a ${config.label.toLowerCase()}. Can you help me understand it?`;

            window.dispatchEvent(
              new CustomEvent("raseed:chat", {
                detail: { topic: topicMap[docType], prefill },
              }),
            );
          }}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 14px",
            borderRadius: "var(--radius-md)",
            border: "1.5px solid var(--border)",
            background: "var(--bg-2)",
            color: "var(--ink-2)",
            fontSize: 13, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
            transition: "all 120ms",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.color = "var(--primary)"; e.currentTarget.style.background = "var(--bg)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--ink-2)"; e.currentTarget.style.background = "var(--bg-2)"; }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
          Ask AI about this
        </button>
      </div>
    </div>
  );
}

// ── Main upload page ───────────────────────────────────────────────────────

function UploadPageContent() {
  const searchParams = useSearchParams();

  const initialType = (searchParams.get("type") as DocType) ?? "gst_notice";
  const validTypes  = Object.keys(DOC_TYPES) as DocType[];
  const [docType, setDocType] = useState<DocType>(
    validTypes.includes(initialType) ? initialType : "gst_notice"
  );

  const [file,         setFile]         = useState<File | null>(null);
  const [processing,   setProcessing]   = useState(false);
  const [result,       setResult]       = useState<UploadWithAnalysis | null>(null);
  const [error,        setError]        = useState<{ code: string; message: string } | null>(null);

  // Reset when doc type changes
  useEffect(() => {
    setFile(null);
    setResult(null);
    setError(null);
  }, [docType]);

  const config = DOC_TYPES[docType];

  // Step: 1 = choose type, 2 = upload, 3 = done
  const step = !file ? 1 : !result ? 2 : 3;

  // ── Upload + analyse (single shot) ────────────────────────────────────

  const handleFileSelect = useCallback(
    async (selectedFile: File) => {
      setFile(selectedFile);
      setResult(null);
      setError(null);
      setProcessing(true);

      try {
        let raw: unknown;
        if (docType === "bank_statement") {
          raw = await uploadBankStatement(selectedFile);
        } else {
          raw = await uploadDocument(selectedFile, docType);
        }
        // Cast to extended type — backend now returns analysis inline
        setResult(raw as UploadWithAnalysis);
      } catch (e) {
        if (e instanceof ApiError) {
          setError({ code: e.code, message: e.message });
        } else {
          setError({ code: "UNKNOWN", message: "Something went wrong. Please try again." });
        }
        setFile(null);
      } finally {
        setProcessing(false);
      }
    },
    [docType]
  );

  // ── Render ─────────────────────────────────────────────────────────────

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
          Upload a document
        </h1>
        <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 2 }}>
          Upload a GST notice, invoice, or bank statement — analysis runs automatically.
        </p>
      </header>

      <div className="px-6 py-8 max-w-2xl mx-auto space-y-8">
        {/* Step indicators */}
        <div className="flex items-center gap-4">
          <Step n={1} label="Choose type"    active={step === 1} done={step > 1} />
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <Step n={2} label="Upload & analyse" active={step === 2} done={step > 2} />
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <Step n={3} label="Results"          active={step === 3} done={false} />
        </div>

        {/* Step 1 — Document type */}
        <section>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 12 }}>
            1. What are you uploading?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(Object.entries(DOC_TYPES) as [DocType, DocTypeConfig][]).map(([key, cfg]) => {
              const active = docType === key;
              return (
                <button
                  key={key}
                  onClick={() => setDocType(key)}
                  style={{
                    background: active ? "var(--primary-50)" : "var(--surface)",
                    border: `2px solid ${active ? "var(--primary)" : "var(--border)"}`,
                    borderRadius: "var(--radius-lg)",
                    padding: "16px",
                    cursor: "pointer", textAlign: "left",
                    transition: "border-color 150ms var(--ease), background 150ms var(--ease)",
                    fontFamily: "inherit",
                  }}
                >
                  <div style={{
                    color: active ? "var(--primary)" : "var(--ink-2)",
                    marginBottom: 8, transition: "color 150ms var(--ease)",
                  }}>
                    {cfg.icon}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: active ? "var(--primary)" : "var(--ink)" }}>
                    {cfg.label}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 3, lineHeight: 1.4 }}>
                    {cfg.hint}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Step 2 — Upload area */}
        <section>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 12 }}>
            2. Upload your file
          </h2>

          {processing ? (
            /* Upload + analysis in progress */
            <div style={{
              background: "var(--surface)", border: "2px dashed var(--border)",
              borderRadius: "var(--radius-lg)", padding: "48px 24px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
            }}>
              <div style={{ color: "var(--primary)" }}>
                <Spinner size={36} />
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: "var(--ink)" }}>
                  Uploading and analysing with AI…
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 4 }}>
                  (~30 s) — {file?.name}
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 8 }}>
                  {docType === "gst_notice"    && "GST Tax Agent + Compliance Agent running"}
                  {docType === "bank_statement" && "Finance Agent running — extracting transactions and detecting trends"}
                  {docType === "invoice"        && "Invoice Agent running — extracting line items"}
                </div>
              </div>
            </div>
          ) : !result ? (
            <UploadCard
              key={docType}
              title={`Drag & drop your ${config.label.toLowerCase()} here`}
              description="or click to browse your files"
              accept={config.accept}
              acceptLabel={config.acceptLabel}
              icon={config.icon}
              onFileSelect={handleFileSelect}
              disabled={processing}
            />
          ) : null}
        </section>

        {/* Error banner */}
        {error && (
          <div style={{
            background: "var(--danger-50)", border: "1px solid #DFA098",
            borderRadius: "var(--radius-lg)", padding: "14px 16px",
            display: "flex", gap: 12, alignItems: "flex-start",
          }}>
            <div style={{ color: "var(--danger)", marginTop: 1 }}>
              <Svg d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" size={18} />
            </div>
            <div>
              {error.code === "LOW_QUALITY_EXTRACT" ? (
                <>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "var(--danger)" }}>
                    Could not read this PDF clearly
                  </div>
                  <div style={{ fontSize: 13, color: "var(--danger)", marginTop: 3, lineHeight: 1.5 }}>
                    The scan quality is too low for text extraction. Try a higher-resolution scan,
                    or use a digital (non-scanned) version of the document.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "var(--danger)" }}>
                    Upload failed
                  </div>
                  <div style={{ fontSize: 13, color: "var(--danger)", marginTop: 3 }}>
                    {error.message}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Step 3 — Inline result */}
        {result && !processing && (
          <section>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 12 }}>
              3. Analysis results
            </h2>
            <ResultSummary result={result} docType={docType} />

            {/* Upload another */}
            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button
                onClick={() => { setFile(null); setResult(null); setError(null); }}
                style={{
                  fontSize: 13, color: "var(--ink-2)", fontWeight: 500,
                  background: "none", border: "none", cursor: "pointer",
                  fontFamily: "inherit", textDecoration: "underline",
                }}
              >
                Upload another document
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// Wrap in Suspense because useSearchParams() requires it in Next.js App Router
export default function UploadPage() {
  return (
    <Suspense>
      <UploadPageContent />
    </Suspense>
  );
}
