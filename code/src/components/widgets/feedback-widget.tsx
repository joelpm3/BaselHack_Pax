"use client";

import { MessageCircleHeart } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { submitFeedback } from "@/app/[locale]/chat/actions";
import { useChatActions } from "@/components/chat/chat-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import type { FeedbackOutput } from "@/lib/advisor/types";
import { cn } from "@/lib/utils";
import type { WidgetProps } from "./types";
import { WidgetCard } from "./widget-card";

const SCORES = Array.from({ length: 11 }, (_, i) => i);

/** NPS 0–10 plus an optional comment, stored in `feedback`. */
export function FeedbackWidget({ toolCallId, state, output }: WidgetProps) {
  const t = useTranslations("widgets.feedback");
  const { conversationId, busy } = useChatActions();
  const initial = (output as FeedbackOutput | undefined)?.submitted ?? null;
  const [submitted, setSubmitted] = useState(initial);
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  if (state !== "output-available") return null;

  if (submitted) {
    return (
      <WidgetCard icon={MessageCircleHeart} title={t("thanksTitle")}>
        <p className="text-paragraph-s">{t("thanks")}</p>
      </WidgetCard>
    );
  }

  function submit(form: FormData) {
    if (score === null) return;
    const comment = String(form.get("comment") ?? "").trim() || undefined;
    startTransition(async () => {
      const result = await submitFeedback({
        conversationId,
        toolCallId,
        nps: score,
        comment,
      }).catch(() => ({ ok: false }));
      if (!result.ok) {
        setError(true);
        return;
      }
      setSubmitted({ nps: score, comment: comment ?? null });
    });
  }

  return (
    <WidgetCard icon={MessageCircleHeart} title={t("title")}>
      <form action={submit} className="flex flex-col gap-4">
        <fieldset>
          <legend className="text-paragraph-s">{t("question")}</legend>
          <div className="mt-3 grid grid-cols-11 gap-1">
            {SCORES.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={score === value}
                onClick={() => setScore(value)}
                className={cn(
                  "aspect-square min-w-0 border-[1.5px] text-paragraph-xs font-medium tabular-nums transition-colors",
                  score === value
                    ? "border-pax-purple bg-pax-purple text-white"
                    : "border-line-strong hover:border-pax-purple",
                )}
              >
                {value}
              </button>
            ))}
          </div>
          <div aria-hidden className="mt-1 flex justify-between text-paragraph-xs text-fg-muted">
            <span>{t("low")}</span>
            <span>{t("high")}</span>
          </div>
        </fieldset>
        {score !== null ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`comment-${toolCallId}`} className="text-paragraph-xs font-medium">
              {t("comment")}
            </label>
            <Textarea
              id={`comment-${toolCallId}`}
              name="comment"
              maxLength={1000}
              className="min-h-20"
            />
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-paragraph-xs text-error-dark">
            {t("error")}
          </p>
        ) : null}
        <div>
          <Button type="submit" disabled={score === null || pending || busy}>
            {t("submit")}
          </Button>
        </div>
      </form>
    </WidgetCard>
  );
}
