"use client";

import { useId, useTransition } from "react";
import { Select } from "@/components/ui/field";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { hrefWith } from "./url";

/** A select that rewrites one search param and navigates (filters stay shareable as URLs). */
export function FilterSelect({
  label,
  path,
  param,
  value,
  params,
  options,
}: {
  label: string;
  path: string;
  param: string;
  value: string;
  /** The other current search params to keep. */
  params: Record<string, string | number | null>;
  options: Array<{ value: string; label: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const id = useId();
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-paragraph-xs text-fg-muted">
        {label}
      </label>
      <Select
        id={id}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          start(() => router.push(hrefWith(path, { ...params, [param]: next || null })));
        }}
        className={cn(
          "h-9 w-auto min-w-36 py-0 pr-8 pl-3 text-paragraph-s",
          pending && "opacity-60",
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
