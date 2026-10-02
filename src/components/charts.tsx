"use client";
/**
 * Charts. Every chart lives in a ChartCard that carries a plain-language
 * interpretation and a table view, so meaning never depends on color alone.
 */
import { useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table2, ChartLine, Lightbulb } from "lucide-react";
import { cn } from "./ui";

export interface Series {
  key: string;
  name: string;
  color: string;
  dashed?: boolean;
}

export function ChartCard({
  title, subtitle, interpretation, children, table, className, action,
}: { title: string; subtitle?: ReactNode; interpretation?: ReactNode; children: ReactNode; table?: { head: string[]; rows: (string | number)[][] }; className?: string; action?: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={cn("card flex flex-col", className)} aria-label={title}>
      <header className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-fg-3">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1 no-print">
          {action}
          {table && (
            <button onClick={() => setAsTable((v) => !v)} className="grid size-9 place-items-center rounded-full text-fg-3 hover:bg-surface-3 hover:text-fg" aria-pressed={asTable} aria-label={asTable ? "Show chart" : "Show data table"} title={asTable ? "Show chart" : "Show data table"}>
              {asTable ? <ChartLine className="size-4" /> : <Table2 className="size-4" />}
            </button>
          )}
        </div>
      </header>
      <div className="flex-1 px-3 pt-3 pb-2 sm:px-4">
        {asTable && table ? <DataTable head={table.head} rows={table.rows} /> : children}
      </div>
      {interpretation && (
        <p className="mx-5 mb-4 flex gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[13px] leading-relaxed text-fg-2">
          <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-accent-text" aria-hidden />
          <span>{interpretation}</span>
        </p>
      )}
    </section>
  );
}

export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="max-h-72 overflow-auto scroll-thin">
      <table className="w-full text-left text-[13px]">
        <thead className="sticky top-0 bg-surface">
          <tr>{head.map((h) => <th key={h} className="border-b border-border px-2 py-1.5 font-medium text-fg-3">{h}</th>)}</tr>
        </thead>
        <tbody className="tabular">
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60">
              {r.map((c, j) => <td key={j} className={cn("px-2 py-1.5", j === 0 ? "text-fg" : "text-fg-2")}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const axisProps = { stroke: "var(--chart-axis)", tick: { fill: "var(--chart-axis)", fontSize: 11 }, tickLine: false, axisLine: { stroke: "var(--border-strong)" } };

function TooltipBox({ active, payload, label, format }: { active?: boolean; payload?: { name: string; value: number; color: string; dataKey: string }[]; label?: string; format: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-semibold text-fg">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-fg-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
          <span className="flex-1">{p.name}</span>
          <span className="font-medium text-fg tabular">{format(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function LineTrend({ data, series, height = 220, yFormat = (v) => String(v), yDomain }: { data: Record<string, number | string | null>[]; series: Series[]; height?: number; yFormat?: (v: number) => string; yDomain?: [number | "auto", number | "auto"] }) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <div style={{ height }} role="img" aria-label={`Line chart of ${series.map((s) => s.name).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
          <YAxis {...axisProps} tickFormatter={yFormat} domain={yDomain ?? ["auto", "auto"]} width={44} />
          <Tooltip content={<TooltipBox format={yFormat} />} cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }} />
          {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--fg-2)" }} />}
          {series.map((s) => (
            <Line key={s.key} type="linear" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "5 4" : undefined}
              dot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)", fill: s.color }} activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--surface)" }} connectNulls isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Bars({ data, series, height = 220, yFormat = (v) => String(v), stacked, colorBy }: { data: Record<string, number | string>[]; series: Series[]; height?: number; yFormat?: (v: number) => string; stacked?: boolean; colorBy?: (row: Record<string, number | string>) => string }) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <div style={{ height }} role="img" aria-label={`Bar chart of ${series.map((s) => s.name).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }} barGap={2}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={yFormat} width={44} />
          <Tooltip content={<TooltipBox format={yFormat} />} cursor={{ fill: "var(--surface-3)", opacity: 0.6 }} />
          {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={stacked ? 0 : [4, 4, 0, 0]} stackId={stacked ? "a" : undefined} maxBarSize={40} isAnimationActive={false}>
              {colorBy && data.map((row, i) => <Cell key={i} fill={colorBy(row)} />)}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal labelled bars in plain HTML — readable, keyboard-reachable, and printable. */
export function HBarList({ rows, format = (v) => String(v), color = "var(--chart-1)", max: maxOverride }: { rows: { label: ReactNode; value: number; sub?: ReactNode; color?: string; key?: string }[]; format?: (v: number) => string; color?: string; max?: number }) {
  const max = maxOverride ?? Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <EmptyChart />;
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={r.key ?? i}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate text-fg-2">{r.label}</span>
            <span className="shrink-0 font-medium text-fg tabular">{format(r.value)}</span>
          </div>
          <div className="mt-1 h-2 w-full rounded-full bg-surface-3">
            <div className="h-2 rounded-full" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: r.color ?? color }} />
          </div>
          {r.sub && <div className="mt-0.5 text-[11.5px] text-fg-3">{r.sub}</div>}
        </li>
      ))}
    </ul>
  );
}

/** Sequential single-hue heatmap; every cell prints its counts (never colour alone). */
export function Heatmap({ rows, cols, value, cellLabel, cellText, rowLabel }: { rows: string[]; cols: string[]; value: (r: string, c: string) => number | null; cellLabel: (r: string, c: string) => string; cellText?: (r: string, c: string) => string; rowLabel?: (r: string) => ReactNode }) {
  const step = (v: number) => Math.min(5, Math.floor(v * 6));
  return (
    <div className="overflow-x-auto scroll-thin" tabIndex={0} role="region" aria-label="Accuracy heatmap">
      <table className="w-full border-separate border-spacing-[2px] text-[12px]">
        <thead>
          <tr>
            <th className="sticky left-0 bg-surface px-2 text-left font-medium text-fg-3">Chapter</th>
            {cols.map((c) => <th key={c} className="px-1 text-center font-medium whitespace-nowrap text-fg-3">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <th scope="row" className="sticky left-0 max-w-[220px] truncate bg-surface px-2 py-1 text-left font-normal text-fg-2">{rowLabel ? rowLabel(r) : r}</th>
              {cols.map((c) => {
                const v = value(r, c);
                const i = v === null ? -1 : step(v);
                return (
                  <td key={c} title={cellLabel(r, c)} className={cn("h-7 min-w-14 rounded-[4px] text-center tabular", v === null && "border border-dashed border-border text-fg-3")}
                    style={v === null ? undefined : { background: `var(--heat-${i})`, color: i >= 3 ? "var(--heat-fg-high)" : "var(--heat-fg-low)" }}>
                    {v === null ? "·" : cellText ? cellText(r, c) : `${Math.round(v * 100)}%`}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-fg-3" aria-hidden>
        <span>0%</span>
        <span className="h-2 w-40 rounded-full" style={{ background: "linear-gradient(90deg,var(--heat-0),var(--heat-2),var(--heat-4),var(--heat-5))" }} />
        <span>100% of attempted correct</span>
        <span className="ml-3">· = not in that test or none attempted</span>
      </div>
    </div>
  );
}

/** Mark-loss waterfall: maximum → losses → final score. */
export function Waterfall({ steps, format = (v) => String(v) }: { steps: { label: string; value: number; kind: "total" | "loss" | "gain" }[]; format?: (v: number) => string }) {
  const max = Math.max(1, ...steps.filter((s) => s.kind === "total").map((s) => Math.abs(s.value)));
  let running = 0;
  const bars = steps.map((s) => {
    if (s.kind === "total") {
      running = s.value;
      return { ...s, start: 0, end: s.value };
    }
    const start = running;
    running = s.kind === "loss" ? running - s.value : running + s.value;
    return { ...s, start: Math.min(start, running), end: Math.max(start, running) };
  });
  const H = 180;
  const scale = (v: number) => (Math.max(0, v) / max) * H;
  return (
    <div className="flex items-end gap-2 sm:gap-4 pt-4" role="img" aria-label={steps.map((s) => `${s.label} ${s.kind === "loss" ? "−" : ""}${format(s.value)}`).join(", ")}>
      {bars.map((b) => (
        <div key={b.label} className="flex min-w-0 flex-1 flex-col items-center">
          <div className="relative w-full" style={{ height: H }}>
            <div
              className="absolute inset-x-[15%] rounded-[4px]"
              title={`${b.label}: ${b.kind === "loss" ? "−" : ""}${format(b.value)}`}
              style={{
                bottom: scale(b.start),
                height: Math.max(2, scale(b.end) - scale(b.start)),
                background: b.kind === "total" ? "var(--chart-1)" : b.kind === "loss" ? "var(--bad)" : "var(--good)",
                opacity: b.kind === "total" ? 1 : 0.85,
              }}
            />
            <div className="absolute inset-x-0 text-center text-[11.5px] font-semibold tabular text-fg" style={{ bottom: scale(b.end) + 4 }}>
              {b.kind === "loss" ? "−" : ""}{format(b.value)}
            </div>
          </div>
          <div className="mt-2 h-8 text-center text-[11px] leading-tight text-fg-3">{b.label}</div>
        </div>
      ))}
    </div>
  );
}

export function EmptyChart({ children = "Not enough data yet." }: { children?: ReactNode }) {
  return <div className="grid h-40 place-items-center rounded-lg border border-dashed border-border text-sm text-fg-3">{children}</div>;
}

export const SUBJECT_SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];
export function subjectColorOf(subject: string, all: string[]) {
  const fixed: Record<string, number> = { Physics: 0, Chemistry: 1, Mathematics: 2, Biology: 3 };
  const i = fixed[subject] ?? Math.max(0, all.indexOf(subject));
  return SUBJECT_SERIES_COLORS[i % SUBJECT_SERIES_COLORS.length];
}
