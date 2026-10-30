import { cn } from "@/lib/utils";

/** Three Pax squares pulsing in sequence: the brand dot as a loading indicator. */
export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <output className={cn("inline-flex items-center gap-1", className)}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-2 animate-pulse bg-pax-green"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
      <span className="sr-only">{label ?? "…"}</span>
    </output>
  );
}
