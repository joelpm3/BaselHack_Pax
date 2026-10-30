"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { type LoginState, login } from "@/app/[locale]/firma/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import type { AdvisorOption } from "@/lib/firma/conversations";
import { cn } from "@/lib/utils";

export function LoginForm({ advisors }: { advisors: AdvisorOption[] }) {
  const t = useTranslations("firma.login");
  const [state, action, pending] = useActionState<LoginState, FormData>(login, { error: null });

  return (
    <form action={action} className="grid gap-6">
      <fieldset className="grid gap-2">
        <legend className="mb-2 font-medium">{t("advisor")}</legend>
        {advisors.map((advisor, i) => (
          <label
            key={advisor.id}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-m border-[1.2px] border-line-strong px-4 py-3",
              "has-checked:border-pax-purple has-checked:bg-light-purple has-focus-visible:outline-2 has-focus-visible:outline-pax-green",
            )}
          >
            <input
              type="radio"
              name="advisorId"
              value={advisor.id}
              defaultChecked={i === 0}
              className="size-4 accent-pax-purple"
            />
            <span className="flex-1 font-medium">{advisor.name}</span>
            <span className="text-fg-muted">{advisor.team}</span>
          </label>
        ))}
        {state.error === "advisor" ? <p className="text-error-dark">{t("chooseAdvisor")}</p> : null}
      </fieldset>

      <Field
        label={t("password")}
        htmlFor="password"
        error={state.error === "password" ? t("wrongPassword") : undefined}
        hint={t("demoNote")}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.error === "password" || undefined}
        />
      </Field>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Spinner label={t("submit")} /> : t("submit")}
      </Button>
    </form>
  );
}
