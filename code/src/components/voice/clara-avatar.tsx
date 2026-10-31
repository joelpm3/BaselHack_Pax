"use client";

import { useEffect, useState } from "react";
import type { ClaraMood } from "@/lib/advisor/mood";
import { cn } from "@/lib/utils";
import "./clara-avatar.css";

export type ClaraActivity = "listening" | "thinking" | "answering";

/** How long Clara stays after her answer, so its mood is seen before she leaves. */
const LINGER_MS = 1500;

/**
 * Clara above the talk square while something happens: listening, thinking, answering. Her face
 * shows the mood of the request and then of her answer; between turns she steps away.
 */
export function ClaraAvatar({
  activity,
  mood,
}: {
  activity: ClaraActivity | null;
  mood: ClaraMood;
}) {
  const active = activity !== null;
  const [lingering, setLingering] = useState(false);

  useEffect(() => {
    if (active) {
      setLingering(true);
      return;
    }
    const timer = window.setTimeout(() => setLingering(false), LINGER_MS);
    return () => window.clearTimeout(timer);
  }, [active]);

  const visible = active || lingering;

  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-500 ease-out",
        visible ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      {/* Sized so the face is as wide as the talk square below it. */}
      <div className="flex min-h-0 justify-center overflow-hidden">
        <svg
          aria-hidden="true"
          viewBox="0 0 120 120"
          className="clara-avatar mb-2 size-[5.5rem] shrink-0"
          data-mood={mood}
          data-state={activity ?? undefined}
        >
          <g className="clara-face">
            <circle cx="60" cy="60" r="42" className="fill-pax-purple" />
            <g className="clara-eyes">
              <g className="clara-drift">
                <g className="clara-blink">
                  <rect x="42" y="50" width="10" height="14" rx="5" className="fill-white" />
                  <rect x="68" y="50" width="10" height="14" rx="5" className="fill-white" />
                </g>
              </g>
            </g>
            <path
              d="M-1 0Q0 1 1 0"
              className="clara-mouth stroke-white"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <g className="clara-baseline-mood">
              <rect
                x="18"
                y="98"
                width="84"
                height="4"
                rx="2"
                className="clara-baseline fill-pax-green"
              />
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}
