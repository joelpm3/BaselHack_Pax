import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "purple" | "green" | "success" | "warning" | "error" | "info" | "accent";

const tones: Record<Tone, string> = {
  neutral: "bg-gray-2 text-gray-7",
  purple: "bg-pax-purple text-white",
  green: "bg-pax-green text-ink",
  success: "bg-success-light text-success-dark",
  warning: "bg-warning-light text-warning-dark",
  error: "bg-error-light text-error-dark",
  info: "bg-light-purple text-deep-purple",
  /** Accent colours are reserved for "Störer" callouts only. */
  accent: "bg-accent-yellow text-ink",
};

export interface BadgeProps extends ComponentProps<"span"> {
  tone?: Tone;
}

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-paragraph-xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
