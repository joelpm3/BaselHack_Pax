import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

const SQUARES = [0, 1, 2, 3];

/**
 * One wing of the level meter: Pax squares that light up from the talk button outwards as the
 * voice gets louder. Reads `--level` (0–1) from an ancestor, which the recorder sets per frame
 * without re-rendering React.
 */
export function LevelMeter({ side, active }: { side: "left" | "right"; active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex items-center gap-[5px]",
        side === "left" ? "flex-row-reverse justify-start" : "justify-start",
      )}
    >
      {SQUARES.map((i) => (
        <span
          key={i}
          className={cn("size-1.5 sm:size-2", active ? "bg-pax-green" : "bg-gray-3")}
          style={
            active
              ? ({ opacity: `clamp(0.2, calc(var(--level) * 4.5 - ${i}), 1)` } as CSSProperties)
              : { opacity: 0.6 }
          }
        />
      ))}
    </span>
  );
}
