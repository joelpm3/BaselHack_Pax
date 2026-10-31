import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "muted" | "purple" | "green" | "info";

const tones: Record<Tone, string> = {
  default: "bg-surface border border-line",
  muted: "bg-surface-muted",
  purple: "bg-pax-purple text-white",
  green: "bg-light-green",
  info: "bg-light-purple",
};

export interface CardProps extends ComponentProps<"section"> {
  tone?: Tone;
}

/** Large surfaces use the Pax XL radius (20px desktop / 16px mobile). */
export function Card({ tone = "default", className, ...props }: CardProps) {
  return (
    <section
      className={cn("rounded-xl p-5 lg:rounded-xl lg:p-6", tones[tone], className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return <h3 className={cn("text-heading-s font-bold", className)} {...props} />;
}
