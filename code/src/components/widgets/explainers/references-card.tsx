"use client";

import { BookOpen, ExternalLink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { articleLink, isPaxArticleId } from "@/lib/advisor/explainers/references";
import type { Locale } from "@/lib/domain/taxonomy";
import type { WidgetProps } from "../types";
import { WidgetCard } from "../widget-card";

/** "Mehr dazu": Pax's own pages on the concept the advisor just explained. */
export function ReferencesCard({ state, output }: WidgetProps) {
  const t = useTranslations("explainers.references");
  const locale = useLocale() as Locale;
  if (state !== "output-available") return null;
  const ids = (output as { articles?: unknown } | undefined)?.articles;
  // Only ids from the verified catalogue become links.
  const articles = Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === "string").filter(isPaxArticleId)
    : [];
  if (articles.length === 0) return null;

  return (
    <WidgetCard icon={BookOpen} title={t("title")} className="py-3.5">
      <ul className="-mt-1 flex flex-col">
        {articles.map((id) => {
          const link = articleLink(id, locale);
          return (
            <li key={id}>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-2.5 rounded-m py-1.5 text-paragraph-s font-medium text-pax-purple"
              >
                <span aria-hidden className="mt-[0.45em] size-2 shrink-0 bg-pax-green" />
                <span className="flex-1 underline-offset-2 group-hover:underline">
                  {t(`articles.${id}`)}
                  {link.lang !== locale ? (
                    <span className="font-normal text-fg-muted"> ({t("inGerman")})</span>
                  ) : null}
                </span>
                <ExternalLink aria-hidden className="mt-[0.2em] size-4 shrink-0 text-fg-muted" />
              </a>
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}
