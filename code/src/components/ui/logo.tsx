import Image from "next/image";
import { cn } from "@/lib/utils";

/** Positive logo on light backgrounds, negative (white dot) on Pax Purple. */
export function PaxLogo({
  variant = "positive",
  className,
}: {
  variant?: "positive" | "negative";
  className?: string;
}) {
  return (
    <Image
      src={variant === "positive" ? "/brand/pax-logo-positive.png" : "/brand/pax-logo-negative.png"}
      alt="Pax"
      width={1600}
      height={514}
      priority
      className={cn("h-7 w-auto", className)}
    />
  );
}
