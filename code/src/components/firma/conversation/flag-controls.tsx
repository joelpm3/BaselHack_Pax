"use client";

import { Check, Flag } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useRef, useTransition } from "react";
import { flagConversationAction, resolveFlagAction } from "@/app/[locale]/firma/learning-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";

export function FlagConversationForm({ conversationId }: { conversationId: string }) {
  const t = useTranslations("learning.flag");
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(flagConversationAction, {
    ok: false,
    error: false,
  });
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="grid gap-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      <label htmlFor={`${id}-note`} className="font-medium">
        {t("label")}
      </label>
      <Textarea
        id={`${id}-note`}
        name="note"
        required
        minLength={3}
        maxLength={2000}
        placeholder={t("placeholder")}
        aria-invalid={state.error || undefined}
        className="min-h-16 text-sm"
      />
      {state.error ? (
        <p role="alert" className="text-error-dark">
          {t("error")}
        </p>
      ) : null}
      <div>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          <Flag aria-hidden />
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}

export function ResolveFlagButton({ flagId }: { flagId: string }) {
  const t = useTranslations("learning.flag");
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="px-2.5"
      disabled={pending}
      onClick={() => start(() => resolveFlagAction(flagId))}
    >
      <Check aria-hidden />
      {t("resolve")}
    </Button>
  );
}
