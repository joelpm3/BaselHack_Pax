"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/** Form submit button that shows the Pax squares while its server action runs. */
export function SubmitButton({ children, ...props }: ButtonProps & { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? <Spinner /> : null}
      {children}
    </Button>
  );
}
