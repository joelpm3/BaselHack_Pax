import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Small server-rendered charts in the Pax chart palette. Every value is also printed as text
 * (bar tips, legends), so nothing depends on colour or hover alone.
 */

export const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
  "var(--color-chart-7)",
  "var(--color-chart-8)",
] as const;

export interface BarItem {
  key: string;
  label: ReactNode;
  value: number;
  /** Text after the value, e.g. a share. */
  suffix?: string;
  title?: string;
}

/** Ranked horizontal bars, value at the tip. One series, one colour. */
export function BarList({
  items,
  max,
  emptyLabel,
  color = CHART_COLORS[0],
}: {
  items: BarItem[];
  max?: number;
  emptyLabel: string;
  color?: string;
}) {
  if (items.length === 0) return <p className="py-4 text-fg-muted">{emptyLabel}</p>;
  const top = max ?? Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li key={item.key} title={item.title} className="grid gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">{item.label}</span>
            <span className="shrink-0 tabular-nums text-fg-muted">
              <span className="font-medium text-fg">{item.value}</span>
              {item.suffix ? ` ${item.suffix}` : null}
            </span>
          </div>
          <div className="h-2 w-full bg-gray-1">
            <div
              className="h-full rounded-r-[4px]"
              style={{ width: `${(item.value / top) * 100}%`, background: color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Part-to-whole as one 100% bar with 2px gaps, plus a legend with counts and shares. */
export function SegmentBar({ segments, emptyLabel }: { segments: Segment[]; emptyLabel: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <p className="py-4 text-fg-muted">{emptyLabel}</p>;
  const visible = segments.filter((s) => s.value > 0);
  return (
    <div className="grid gap-3">
      <div
        className="flex h-3 w-full gap-[2px]"
        role="img"
        aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(", ")}
      >
        {visible.map((s, i) => (
          <div
            key={s.key}
            title={`${s.label}: ${s.value} (${Math.round((s.value / total) * 100)}%)`}
            className={cn(
              i === 0 && "rounded-l-[4px]",
              i === visible.length - 1 && "rounded-r-[4px]",
            )}
            style={{ flexGrow: s.value, flexBasis: 0, background: s.color }}
          />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 shrink-0" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            <span className="tabular-nums text-fg-muted">
              <span className="font-medium text-fg">{s.value}</span> ·{" "}
              {Math.round((s.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Daily columns; labels the latest day and the peak, the rest is in the hover title. */
export function ColumnChart({
  columns,
  ariaLabel,
}: {
  columns: Array<{ key: string; label: string; shortLabel: string; value: number }>;
  ariaLabel: string;
}) {
  const max = Math.max(...columns.map((c) => c.value), 1);
  const peak = columns.reduce((best, c, i) => (c.value > columns[best].value ? i : best), 0);
  return (
    <figure aria-label={ariaLabel} className="grid gap-1.5">
      <div className="flex h-28 items-end gap-1 border-b border-line">
        {columns.map((c, i) => {
          const labelled = (i === columns.length - 1 || i === peak) && c.value > 0;
          return (
            <div
              key={c.key}
              title={`${c.label}: ${c.value}`}
              className="flex h-full flex-1 flex-col justify-end"
            >
              {labelled ? (
                <span className="mb-0.5 text-center text-[11px] tabular-nums text-fg-muted">
                  {c.value}
                </span>
              ) : null}
              <div
                className="mx-auto w-full max-w-6 rounded-t-[4px]"
                style={{
                  height: `${(c.value / max) * (labelled ? 80 : 100)}%`,
                  minHeight: c.value > 0 ? 2 : 0,
                  background: CHART_COLORS[0],
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 text-[11px] text-fg-subtle">
        {columns.map((c, i) => (
          <span key={c.key} className="flex-1 text-center tabular-nums">
            {i % 2 === (columns.length - 1) % 2 ? c.shortLabel : ""}
          </span>
        ))}
      </div>
    </figure>
  );
}
