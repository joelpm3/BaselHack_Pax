"use client";

import { Play, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useTransition } from "react";
import { cancelSimulation, startSimulation } from "@/app/[locale]/firma/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function SimulationForm({
  limits,
}: {
  limits: {
    size: { min: number; max: number; default: number };
    concurrency: { min: number; max: number; default: number };
  };
}) {
  const t = useTranslations("firma.simulation.form");
  const [state, action, pending] = useActionState(startSimulation, { error: false });
  return (
    <form
      action={action}
      className="grid gap-4 sm:grid-cols-[repeat(2,minmax(0,12rem))_auto] sm:items-end"
    >
      <Field label={t("size")} htmlFor="sim-size" hint={t("sizeHint", limits.size)}>
        <Input
          id="sim-size"
          name="size"
          type="number"
          inputMode="numeric"
          min={limits.size.min}
          max={limits.size.max}
          defaultValue={limits.size.default}
          required
        />
      </Field>
      <Field
        label={t("concurrency")}
        htmlFor="sim-concurrency"
        hint={t("concurrencyHint", limits.concurrency)}
      >
        <Input
          id="sim-concurrency"
          name="concurrency"
          type="number"
          inputMode="numeric"
          min={limits.concurrency.min}
          max={limits.concurrency.max}
          defaultValue={limits.concurrency.default}
          required
        />
      </Field>
      <div className="grid justify-items-start gap-1.5 sm:pb-6">
        <Button type="submit" disabled={pending}>
          <Play aria-hidden />
          {t("start")}
        </Button>
      </div>
      {state.error ? <p className="text-error-dark sm:col-span-3">{t("invalid")}</p> : null}
    </form>
  );
}

export function CancelSimulationButton({ runId }: { runId: string }) {
  const t = useTranslations("firma.simulation");
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() => start(() => cancelSimulation(runId))}
    >
      <Square aria-hidden />
      {t("cancel")}
    </Button>
  );
}
