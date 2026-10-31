import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-m border-[1.2px] border-line-strong bg-surface px-3.5 py-2.5 text-[1rem] text-fg placeholder:text-fg-subtle focus:border-pax-purple focus:outline-none focus-visible:outline-2 focus-visible:outline-pax-green aria-invalid:border-error disabled:bg-gray-1";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 resize-y", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(control, "pax-select h-11 pr-10", className)} {...props} />;
}

export interface FieldProps {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, hint, error, children, className }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-paragraph-s font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-paragraph-xs text-error-dark">{error}</p>
      ) : hint ? (
        <p className="text-paragraph-xs text-fg-muted">{hint}</p>
      ) : null}
    </div>
  );
}
