import { cn } from "@/lib/utils";
import type { SquareKind } from "./grid";

/** Pax chart colours per income source; the gap is an empty outlined square. */
export const SQUARE_FILL: Record<SquareKind, string> = {
  pillar1: "bg-chart-2 border-chart-2",
  pillar2: "bg-chart-1 border-chart-1",
  other: "bg-chart-3 border-chart-3",
  partner: "bg-chart-4 border-chart-4",
  gap: "bg-transparent border-gray-4",
};

export function LegendSquare({ kind, className }: { kind: SquareKind; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-3 shrink-0 border-[1.5px]", SQUARE_FILL[kind], className)}
    />
  );
}
