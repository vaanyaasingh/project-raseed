"use client";

// ── Types ──────────────────────────────────────────────────────────────────

interface BarProps {
  label: string;
  value: number;
  max: number;
  color: string;
  bgColor: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatINR(n: number): string {
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)}L`;
  if (n >= 1_000)    return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

// ── Single horizontal bar ──────────────────────────────────────────────────

function HBar({ label, value, max, color, bgColor }: BarProps) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-2)" }}>{label}</span>
        <span className="num" style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
          {formatINR(value)}
        </span>
      </div>
      <div style={{ height: 12, background: bgColor, borderRadius: 999, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: color,
            borderRadius: 999,
            transition: "width 600ms cubic-bezier(0.2,0.8,0.2,1)",
          }}
        />
      </div>
    </div>
  );
}

// ── SVG bar chart — monthly trend ─────────────────────────────────────────

interface MonthBar {
  month: string;
  inflow: number;
  outflow: number;
}

function SVGBarChart({ data }: { data: MonthBar[] }) {
  if (!data.length) return null;

  const W = 560, H = 160, PAD = { top: 12, right: 8, bottom: 32, left: 48 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const maxVal = Math.max(...data.flatMap((d) => [d.inflow, d.outflow]), 1);
  const groupW = chartW / data.length;
  const barW   = Math.max(6, Math.min(20, groupW * 0.35));
  const gap    = 3;

  // Y-axis ticks (4 steps)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    val: maxVal * t,
    y:   chartH - chartH * t,
  }));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ display: "block", overflow: "visible" }}
    >
      {/* Grid lines */}
      {ticks.map((t) => (
        <g key={t.val}>
          <line
            x1={PAD.left} x2={W - PAD.right}
            y1={PAD.top + t.y} y2={PAD.top + t.y}
            stroke="var(--border)" strokeWidth="1"
          />
          <text
            x={PAD.left - 6} y={PAD.top + t.y + 4}
            textAnchor="end"
            style={{ fontSize: 10, fill: "var(--ink-3)", fontFamily: "'JetBrains Mono', monospace" }}
          >
            {formatINR(t.val)}
          </text>
        </g>
      ))}

      {/* Bars */}
      {data.map((d, i) => {
        const cx    = PAD.left + i * groupW + groupW / 2;
        const inH   = maxVal > 0 ? (d.inflow  / maxVal) * chartH : 0;
        const outH  = maxVal > 0 ? (d.outflow / maxVal) * chartH : 0;

        return (
          <g key={d.month}>
            {/* Inflow bar */}
            <rect
              x={cx - barW - gap / 2}
              y={PAD.top + chartH - inH}
              width={barW} height={Math.max(inH, 1)}
              rx={3} fill="var(--success)"
              style={{ transition: "height 600ms cubic-bezier(0.2,0.8,0.2,1)" }}
            />
            {/* Outflow bar */}
            <rect
              x={cx + gap / 2}
              y={PAD.top + chartH - outH}
              width={barW} height={Math.max(outH, 1)}
              rx={3} fill="var(--danger)"
              opacity="0.75"
              style={{ transition: "height 600ms cubic-bezier(0.2,0.8,0.2,1)" }}
            />
            {/* Month label */}
            <text
              x={cx} y={H - PAD.bottom + 16}
              textAnchor="middle"
              style={{ fontSize: 10, fill: "var(--ink-3)", fontFamily: "inherit" }}
            >
              {d.month}
            </text>
          </g>
        );
      })}

      {/* Legend */}
      <g transform={`translate(${PAD.left},${H - 4})`}>
        <rect width={10} height={10} rx={2} fill="var(--success)" y={-10} />
        <text x={14} y={0} style={{ fontSize: 10, fill: "var(--ink-2)", fontFamily: "inherit" }}>Inflow</text>
        <rect width={10} height={10} rx={2} fill="var(--danger)" opacity="0.75" x={64} y={-10} />
        <text x={78} y={0} style={{ fontSize: 10, fill: "var(--ink-2)", fontFamily: "inherit" }}>Outflow</text>
      </g>
    </svg>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

interface CashFlowChartProps {
  totalInflow:  number;
  totalOutflow: number;
  net:          number;
  /** Optional per-month breakdown [{ month, inflow, outflow }] */
  monthlyData?: MonthBar[];
}

export default function CashFlowChart({
  totalInflow,
  totalOutflow,
  net,
  monthlyData = [],
}: CashFlowChartProps) {
  const max     = Math.max(totalInflow, totalOutflow, 1);
  const netPos  = net >= 0;

  return (
    <div className="space-y-6">
      {/* Summary bars */}
      <div className="space-y-4">
        <HBar
          label="Total inflow"
          value={totalInflow}
          max={max}
          color="var(--success)"
          bgColor="var(--success-50)"
        />
        <HBar
          label="Total outflow"
          value={totalOutflow}
          max={max}
          color="var(--danger)"
          bgColor="var(--danger-50)"
        />

        {/* Net divider row */}
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px",
            background: netPos ? "var(--success-50)" : "var(--danger-50)",
            border: `1px solid ${netPos ? "#A6CBB5" : "#DFA098"}`,
            borderRadius: "var(--radius-md)",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: netPos ? "var(--success)" : "var(--danger)" }}>
            Net cash flow
          </span>
          <span
            className="num"
            style={{ fontSize: 18, fontWeight: 800, color: netPos ? "var(--success)" : "var(--danger)" }}
          >
            {netPos ? "+" : "−"}{formatINR(Math.abs(net))}
          </span>
        </div>
      </div>

      {/* Monthly SVG chart (only when data available) */}
      {monthlyData.length > 1 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
            Monthly breakdown
          </div>
          <SVGBarChart data={monthlyData} />
        </div>
      )}
    </div>
  );
}

export type { MonthBar };
