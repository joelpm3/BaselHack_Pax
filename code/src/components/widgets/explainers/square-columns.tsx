import { cn } from "@/lib/utils";

export interface SquareColumn<K extends string> {
  key: string | number;
  label: string;
  /** Square counts per kind, drawn bottom to top in `order`. */
  squares: Record<K, number>;
}

/**
 * A column chart built from the Pax square: every column is a stack of squares, each worth the
 * same CHF amount. Purely visual (aria-hidden); the widget gives the figures in text.
 */
export function SquareColumns<K extends string>({
  columns,
  order,
  fill,
  className,
}: {
  columns: SquareColumn<K>[];
  order: readonly K[];
  fill: Record<K, string>;
  className?: string;
}) {
  return (
    <div aria-hidden className={cn("flex items-end justify-between gap-1", className)}>
      {columns.map((column) => (
        <div key={column.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <div className="flex flex-col-reverse gap-0.5">
            {order.flatMap((kind) =>
              Array.from({ length: column.squares[kind] }, (_, i) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: squares have no identity besides position
                  key={`${kind}-${i}`}
                  className={cn(
                    "block size-2.5 border-[1.5px] transition-colors duration-200 sm:size-3",
                    fill[kind],
                  )}
                />
              )),
            )}
          </div>
          <span className="text-[0.6875rem] leading-none text-fg-muted tabular-nums">
            {column.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/** A legend square in the same style as the chart. */
export function KeySquare({ className }: { className: string }) {
  return (
    <span aria-hidden className={cn("inline-block size-3 shrink-0 border-[1.5px]", className)} />
  );
}
