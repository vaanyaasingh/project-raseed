"use client";

import type { Invoice } from "@/lib/api";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatINR(n: number | undefined | null): string {
  if (n == null) return "—";
  return "₹" + n.toLocaleString("en-IN");
}

function formatDate(s: string | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ── Type badge ─────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type?: "received" | "issued" }) {
  if (!type) return <span style={{ color: "var(--ink-3)" }}>—</span>;
  const issued = type === "issued";
  return (
    <span
      style={{
        fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
        background: issued ? "var(--primary-50)" : "var(--bg-2)",
        color: issued ? "var(--primary)" : "var(--ink-2)",
        letterSpacing: "0.03em", textTransform: "capitalize",
        whiteSpace: "nowrap",
      }}
    >
      {type}
    </span>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ sentAt }: { sentAt?: string }) {
  const sent = !!sentAt;
  return (
    <span
      style={{
        fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
        background: sent ? "var(--success-50)" : "#FBF1E4",
        color: sent ? "var(--success)" : "var(--accent)",
        letterSpacing: "0.03em",
        whiteSpace: "nowrap",
      }}
    >
      {sent ? "Sent" : "Unsent"}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

interface InvoiceTableProps {
  invoices: Invoice[];
  onSend?: (invoice: Invoice) => void;
  loading?: boolean;
}

export default function InvoiceTable({ invoices, onSend, loading }: InvoiceTableProps) {
  if (loading) {
    return (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <TableHead />
          </thead>
          <tbody>
            {[1, 2, 3].map((i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                {Array(7).fill(0).map((_, j) => (
                  <td key={j} style={{ padding: "14px 12px" }}>
                    <div
                      className="animate-pulse"
                      style={{ height: 14, borderRadius: 4, background: "var(--bg-3)", width: j === 0 ? 80 : j === 6 ? 52 : 120 }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!invoices.length) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 32, color: "var(--ink-3)", marginBottom: 12, opacity: 0.3 }}>₹</div>
        <p style={{ fontSize: 14, color: "var(--ink-3)" }}>No invoices yet.</p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
        <thead>
          <TableHead />
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr
              key={inv.id}
              style={{
                borderBottom: "1px solid var(--border)",
                transition: "background 120ms",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <td style={tdStyle}>
                <span className="mono" style={{ fontSize: 13, color: "var(--ink)" }}>
                  {inv.invoice_number ?? <span style={{ color: "var(--ink-3)" }}>—</span>}
                </span>
              </td>
              <td style={tdStyle}>
                <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>
                  {inv.vendor_name ?? inv.buyer_name ?? "—"}
                </div>
                {inv.vendor_gstin && (
                  <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 1 }}>
                    {inv.vendor_gstin}
                  </div>
                )}
              </td>
              <td style={tdStyle}>
                <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
                  {formatDate(inv.invoice_date ?? inv.created_at)}
                </span>
              </td>
              <td style={{ ...tdStyle, textAlign: "right" }}>
                <span className="num" style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
                  {formatINR(inv.grand_total)}
                </span>
                {inv.total_gst != null && (
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                    GST: {formatINR(inv.total_gst)}
                  </div>
                )}
              </td>
              <td style={tdStyle}>
                <TypeBadge type={inv.invoice_type} />
              </td>
              <td style={tdStyle}>
                <StatusBadge sentAt={inv.sent_at} />
              </td>
              <td style={{ ...tdStyle, textAlign: "right" }}>
                {onSend && !inv.sent_at && (
                  <button
                    onClick={() => onSend(inv)}
                    style={{
                      fontSize: 12, fontWeight: 600, padding: "5px 12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      color: "var(--primary)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      whiteSpace: "nowrap",
                      transition: "background 120ms",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--primary-50)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface)")}
                  >
                    Send →
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Table head (extracted to avoid duplication in skeleton) ────────────────

function TableHead() {
  const cols = ["Invoice #", "Vendor / Buyer", "Date", "Amount", "Type", "Status", ""];
  return (
    <tr style={{ borderBottom: "2px solid var(--border)" }}>
      {cols.map((col, i) => (
        <th
          key={col + i}
          style={{
            padding: "10px 12px",
            textAlign: i === 3 ? "right" : "left",
            fontSize: 11,
            fontWeight: 700,
            color: "var(--ink-3)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            whiteSpace: "nowrap",
          }}
        >
          {col}
        </th>
      ))}
    </tr>
  );
}

const tdStyle: React.CSSProperties = {
  padding: "13px 12px",
  verticalAlign: "middle",
};
