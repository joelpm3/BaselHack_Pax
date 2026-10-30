import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "inverse" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-pax-purple text-white hover:bg-deep-purple disabled:bg-gray-4",
  secondary:
    "border-[1.6px] border-ink bg-transparent text-ink hover:bg-gray-1 disabled:border-gray-4 disabled:text-gray-5",
  ghost: "bg-transparent text-ink hover:bg-gray-1 disabled:text-gray-5",
  inverse: "bg-pax-green text-ink hover:bg-contrast-green hover:text-white disabled:bg-gray-4",
  danger: "bg-error-dark text-white hover:bg-error disabled:bg-gray-4",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-paragraph-xs gap-1.5",
  md: "h-11 px-5 text-[1rem] gap-2",
  lg: "h-13 px-7 text-[1rem] gap-2.5",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 items-center justify-center rounded-full font-medium leading-none transition-colors disabled:cursor-not-allowed [&_svg]:size-[1.15em]",
    variants[variant],
    sizes[size],
    className,
  );
}

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
}
