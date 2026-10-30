"use client";

import { type CSSProperties, useEffect, useState } from "react";
import type { IncomeBreakdown } from "@/lib/advisor/types";
import { cn } from "@/lib/utils";
import { buildSquares } from "./grid";
import { SQUARE_FILL } from "./square-style";

const SIZES = {
  xs: "size-2 border",
  sm: "size-3 border-[1.5px]",
  md: "size-4 border-[1.5px] sm:size-[18px]",
  lg: "size-5 border-2 sm:size-6",
} as const;

const GAPS = { xs: "gap-0.5", sm: "gap-1", md: "gap-1", lg: "gap-1.5" } as const;

export interface SquareGridProps {
  breakdown: IncomeBreakdown;
  size?: keyof typeof SIZES;
  /** Squares per row; omit to let them wrap. */
  columns?: number;
  /** Fill the squares one after another when the grid appears. */
  animate?: boolean;
  className?: string;
}

/**
 * The Vorsorgebild unit: one square = CHF 500 of monthly income. Purely visual (aria-hidden);
 * every grid is accompanied by figures or a table for screen readers.
 */
export function SquareGrid({
  breakdown,
  size = "md",
  columns,
  animate = false,
  className,
}: SquareGridProps) {
  const squares = buildSquares(breakdown);
  const [revealed, setRevealed] = useState(!animate);

  useEffect(() => {
    if (!animate) return;
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, [animate]);

  return (
    <div
      aria-hidden
      className={cn(columns ? "grid w-max" : "flex flex-wrap", GAPS[size], className)}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, max-content)` } : undefined}
    >
      {squares.map((square, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: squares have no identity besides position
          key={i}
          style={{ "--d": `${Math.min(i * 22, 1400)}ms` } as CSSProperties}
          className={cn(
            "block shrink-0 transition-[background-color,border-color,opacity] duration-300 [transition-delay:var(--d)] motion-reduce:[transition-delay:0ms]",
            SIZES[size],
            revealed ? SQUARE_FILL[square.kind] : "border-gray-3 bg-transparent",
            revealed && square.surplus && "opacity-45",
          )}
        />
      ))}
    </div>
  );
}
