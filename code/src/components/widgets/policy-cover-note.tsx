"use client";

import { useTranslations } from "next-intl";
import type { PolicyCover } from "@/lib/advisor/types";
import { useChf } from "./widget-card";

type CoverEvent = "disability" | "death";

/** Explains which policies a risk breakdown counts and how death capital became a monthly sum. */
export function usePolicyCoverText() {
  const t = useTranslations("widgets.policyCover");
  const chf = useChf();
  return (cover: PolicyCover | null | undefined, events: CoverEvent[]): string => {
    if (!cover) return "";
    const parts: string[] = [];
    if (events.includes("death") && cover.deathCapital > 0)
      parts.push(
        t("death", {
          capital: chf(cover.deathCapital),
          years: cover.supportYears,
          period: t(`period.${cover.supportPeriod}`),
          monthly: chf(cover.deathCapital / cover.supportYears / 12),
        }),
      );
    if (events.includes("death") && cover.deathAnnuity > 0)
      parts.push(t("deathAnnuity", { amount: chf(cover.deathAnnuity / 12) }));
    if (events.includes("disability") && cover.disabilityAnnuity > 0)
      parts.push(t("disability", { amount: chf(cover.disabilityAnnuity / 12) }));
    return parts.join(" ");
  };
}
