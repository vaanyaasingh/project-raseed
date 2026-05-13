"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import UploadCard from "@/components/UploadCard";
import {
  uploadDocument,
  uploadBankStatement,
  queryGSTNotice,
  queryFinance,
  extractInvoice,
  ApiError,
  type UploadResponse,
  type BankStatementUploadResponse,
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

// ── Inline SVG icons ───────────────────────────────────────────────────────

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
    hint: "Export a CSV from your bank and upload it for a cash flow report.",
    accept: ".csv",
    acceptLabel: "CSV file",
    resultPath: "/finance",
    icon: <Svg d={["M4 6h16", "M4 10h16", "M4 14h8"]} />,
  },
};

// ── Step indicators ────────────────────────────────────────────────────────

function Step({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div
        style={{
          width: 28, height: 28,
          borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700,
          background: done ? "var(--success)" : active ? "var(--primary)" : "var(--bg-3)",
          color: done || active ? "#FCFAF4" : "var(--ink-3)",
          transition: "background 200ms var(--ease)",
        }}
      >
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

// ── Preview panel ──────────────────────────────────────────────────────────

function TextPreview({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = text.slice(0, 300);
  const hasMore = text.length > 300;

  return (
    <div
      style={{
        background: "var(--bg-3)",
        borderRadius: "var(--radius-md)",
        padding: "12px 14px",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12,
        color: "var(--ink-2)",
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        maxHeight: expanded ? "none" : 140,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {expanded ? text : preview}
      {hasMore && !expanded && (
        <div
          style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            height: 48,
            background: "linear-gradient(transparent, var(--bg-3))",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
            paddingBottom: 8,
          }}
        >
          <button
            onClick={() => setExpanded(true)}
            style={{
              fontSize: 12, color: "var(--primary)", fontWeight: 600,
              background: "none", border: "none", cursor: "pointer",
            }}
          >
            Show more
          </button>
        </div>
      )}
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

// ── Main upload page ───────────────────────────────────────────────────────

function UploadPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialType = (searchParams.get("type") as DocType) ?? "gst_notice";
  const validTypes = Object.keys(DOC_TYPES) as DocType[];
  const [docType, setDocType] = useState<DocType>(
    validTypes.includes(initialType) ? initialType : "gst_notice"
  );

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | BankStatementUploadResponse | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  // Reset state when doc type changes
  useEffect(() => {
    setFile(null);
    setUploadResult(null);
    setError(null);
  }, [docType]);

  const config = DOC_TYPES[docType];
  const uploadId = uploadResult && "upload_id" in uploadResult ? uploadResult.upload_id : null;

  // ── Step logic ─────────────────────────────────────────────────────────

  const step = !file ? 1 : !uploadResult ? 2 : 3;

  // ── Upload handler ────────────────────────────────────────────────────

  const handleFileSelect = useCallback(
    async (selectedFile: File) => {
      setFile(selectedFile);
      setUploadResult(null);
      setError(null);
      setUploading(true);

      try {
        let result: UploadResponse | BankStatementUploadResponse;
        if (docType === "bank_statement") {
          result = await uploadBankStatement(selectedFile);
        } else {
          result = await uploadDocument(selectedFile, docType);
        }
        setUploadResult(result);
      } catch (e) {
        if (e instanceof ApiError) {
          setError({ code: e.code, message: e.message });
        } else {
          setError({ code: "UNKNOWN", message: "Something went wrong. Please try again." });
        }
        setFile(null);
      } finally {
        setUploading(false);
      }
    },
    [docType]
  );

  // ── Analyze handler ───────────────────────────────────────────────────

  async function handleAnalyze() {
    if (!uploadId) return;
    setAnalyzing(true);
    setError(null);

    try {
      if (docType === "gst_notice") {
        await queryGSTNotice(uploadId);
        router.push(`/compliance?upload_id=${uploadId}`);
      } else if (docType === "bank_statement") {
        await queryFinance(uploadId);
        router.push(`/finance?upload_id=${uploadId}`);
      } else {
        await extractInvoice(uploadId);
        router.push(`/invoices?upload_id=${uploadId}`);
      }
    } catch (e) {
      if (e instanceof ApiError) {
        setError({ code: e.code, message: e.message });
      } else {
        setError({ code: "UNKNOWN", message: "Analysis failed. Please try again." });
      }
      setAnalyzing(false);
    }
  }

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
          Upload a GST notice, invoice, or bank statement to start analysis.
        </p>
      </header>

      <div className="px-6 py-8 max-w-2xl mx-auto space-y-8">
        {/* Step indicators */}
        <div className="flex items-center gap-4">
          <Step n={1} label="Choose type" active={step === 1} done={step > 1} />
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <Step n={2} label="Upload file" active={step === 2} done={step > 2} />
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <Step n={3} label="Analyse" active={step === 3} done={false} />
        </div>

        {/* Step 1 — Document type selector */}
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
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "border-color 150ms var(--ease), background 150ms var(--ease)",
                  }}
                >
                  <div
                    style={{
                      color: active ? "var(--primary)" : "var(--ink-2)",
                      marginBottom: 8,
                      transition: "color 150ms var(--ease)",
                    }}
                  >
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

          {uploading ? (
            /* Upload in progress */
            <div
              style={{
                background: "var(--surface)",
                border: "2px dashed var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: "48px 24px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div style={{ color: "var(--primary)" }}>
                <Spinner size={32} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: "var(--ink)", textAlign: "center" }}>
                  Uploading {file?.name}…
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 4, textAlign: "center" }}>
                  Extracting text from your document
                </div>
              </div>
            </div>
          ) : (
            <UploadCard
              key={docType}
              title={`Drag & drop your ${config.label.toLowerCase()} here`}
              description="or click to browse your files"
              accept={config.accept}
              acceptLabel={config.acceptLabel}
              icon={config.icon}
              onFileSelect={handleFileSelect}
              disabled={uploading}
            />
          )}
        </section>

        {/* Error banner */}
        {error && (
          <div
            style={{
              background: "var(--danger-50)",
              border: "1px solid #DFA098",
              borderRadius: "var(--radius-lg)",
              padding: "14px 16px",
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
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

        {/* Step 3 — Success + Analyse */}
        {uploadResult && !uploading && (
          <section>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 12 }}>
              3. Review and analyse
            </h2>

            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-sm)",
                overflow: "hidden",
              }}
            >
              {/* Success header */}
              <div
                style={{
                  background: "var(--success-50)",
                  borderBottom: "1px solid #A6CBB5",
                  padding: "12px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div style={{ color: "var(--success)" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14, color: "var(--success)" }}>
                    Upload successful
                  </span>
                  {"rows_parsed" in uploadResult ? (
                    <span style={{ fontSize: 13, color: "var(--success)", marginLeft: 8 }}>
                      {uploadResult.rows_parsed} transactions parsed ·{" "}
                      {uploadResult.date_range.start} → {uploadResult.date_range.end}
                    </span>
                  ) : (
                    <span style={{ fontSize: 13, color: "var(--success)", marginLeft: 8 }}>
                      upload_id: <code style={{ fontSize: 12 }}>{uploadResult.upload_id.slice(0, 8)}…</code>
                    </span>
                  )}
                </div>
              </div>

              {/* Text preview (PDF uploads only) */}
              {"extracted_text_preview" in uploadResult && uploadResult.extracted_text_preview && (
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                    Extracted text preview
                  </div>
                  <TextPreview text={uploadResult.extracted_text_preview} />
                </div>
              )}

              {/* CTA */}
              <div style={{ padding: "14px 16px", borderTop: "1px solid var(--border)" }}>
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  style={{
                    width: "100%",
                    background: analyzing ? "var(--primary-50)" : "var(--primary)",
                    color: analyzing ? "var(--primary)" : "#FCFAF4",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    padding: "12px 20px",
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: analyzing ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    transition: "background 150ms var(--ease)",
                    fontFamily: "inherit",
                  }}
                >
                  {analyzing ? (
                    <>
                      <Spinner size={18} />
                      Analysing with AI…
                    </>
                  ) : (
                    <>
                      <Svg d="M5 12h14M12 5l7 7-7 7" size={18} />
                      Analyse now
                    </>
                  )}
                </button>
                <p style={{ fontSize: 12, color: "var(--ink-3)", textAlign: "center", marginTop: 8 }}>
                  {docType === "gst_notice" && "Runs GST Tax Agent + Compliance Agent — takes ~30 s"}
                  {docType === "bank_statement" && "Runs Finance Agent — detects cash flow trends and anomalies"}
                  {docType === "invoice" && "Runs Invoice Agent — extracts all line items and GST breakdown"}
                </p>
              </div>
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
