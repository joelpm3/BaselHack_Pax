"use client";

import { Check, RotateCcw, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { decideImprovement, startImprovementAnalysis } from "@/app/[locale]/firma/learning-actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "@/i18n/navigation";
import { IMPROVEMENT_WINDOWS, type ImprovementKind } from "@/lib/domain/learning";

export function RunAnalysisButtons({ running }: { running: boolean }) {
  const t = useTranslations("learning.improvements");
  const [pending, start] = useTransition();
  const busy = pending || running;
  return (
    <fieldset className="flex flex-wrap gap-2" aria-label={t("runLabel")}>
      {IMPROVEMENT_WINDOWS.map((window, i) => (
        <Button
          key={window}
          variant={i === 0 ? "primary" : "secondary"}
          size="sm"
          disabled={busy}
          onClick={() => start(() => startImprovementAnalysis(window))}
        >
          {busy && i === 0 ? <Spinner label={t(`run.${window}`)} /> : <Sparkles aria-hidden />}
          {t(`run.${window}`)}
        </Button>
      ))}
    </fieldset>
  );
}

/**
 * Accepting a rule proposal opens the rule editor with the rule as an unsaved draft; nothing is
 * active until someone saves a new rule-set version there.
 */
export function ProposalDecision({
  proposalId,
  kind,
}: {
  proposalId: string;
  kind: ImprovementKind;
}) {
  const t = useTranslations("learning.improvements");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const { ok } = await decideImprovement(proposalId, "accepted");
            if (ok && kind === "rule") router.push(`/firma/regeln?proposal=${proposalId}`);
          })
        }
      >
        <Check aria-hidden />
        {kind === "rule" ? t("acceptRule") : t("accept")}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => start(async () => void (await decideImprovement(proposalId, "dismissed")))}
      >
        <X aria-hidden />
        {t("dismiss")}
      </Button>
    </div>
  );
}

export function ReopenProposalButton({ proposalId }: { proposalId: string }) {
  const t = useTranslations("learning.improvements");
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => start(async () => void (await decideImprovement(proposalId, "open")))}
    >
      <RotateCcw aria-hidden />
      {t("reopen")}
    </Button>
  );
}
