import type { Metadata } from "next";
import { connection } from "next/server";
import { useTranslations } from "next-intl";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense, use } from "react";
import { AutoRefresh } from "@/components/firma/auto-refresh";
import {
  KnowledgeEntryActions,
  KnowledgeTest,
  KnowledgeUploadForm,
} from "@/components/firma/knowledge/knowledge-controls";
import { LoadingBlock, PageBody, PageHeader, Panel } from "@/components/firma/page-parts";
import { Badge } from "@/components/ui/badge";
import type { KnowledgeStatus } from "@/lib/domain/learning";
import { PRODUCT_CODES, PRODUCTS } from "@/lib/domain/products";
import { requireAdvisor } from "@/lib/firma/auth";
import { type KnowledgeEntry, listKnowledgeEntries } from "@/lib/knowledge/service";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/firma/wissen">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale, namespace: "firma.nav" });
  return { title: t("knowledge") };
}

export default function KnowledgePage({ params }: PageProps<"/[locale]/firma/wissen">) {
  setRequestLocale(use(params).locale);
  const t = useTranslations("learning.knowledge");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<LoadingBlock label={t("title")} />}>
        <KnowledgeContent />
      </Suspense>
    </>
  );
}

/** One square per version, oldest first: the version the advisor uses is filled. */
const SQUARE: Record<KnowledgeStatus, string> = {
  active: "bg-pax-purple",
  superseded: "border border-gray-4 bg-surface",
  processing: "bg-pax-green motion-safe:animate-pulse",
  failed: "bg-error",
  deleted: "bg-gray-2",
};

async function KnowledgeContent() {
  await requireAdvisor();
  await connection();
  const entries = listKnowledgeEntries();
  const byProduct = new Map<string, KnowledgeEntry[]>();
  for (const entry of entries)
    byProduct.set(entry.productCode, [...(byProduct.get(entry.productCode) ?? []), entry]);
  const processing = entries.some((e) => e.latest.status === "processing");
  const t = await getTranslations("learning.knowledge");

  return (
    <PageBody className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <AutoRefresh active={processing} />
      <ul className="grid content-start divide-y divide-line rounded-xl border border-line">
        {PRODUCT_CODES.map((code) => {
          const productEntries = byProduct.get(code) ?? [];
          return (
            <li key={code} className="grid gap-3 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-paragraph-m font-bold">{PRODUCTS[code].name}</h2>
                {productEntries.length > 0 ? (
                  <span className="text-fg-muted">
                    {t("documentCount", {
                      count: productEntries.filter((e) => e.active).length,
                    })}
                  </span>
                ) : null}
              </div>
              {productEntries.length === 0 ? (
                <p className="text-fg-muted">{t("productEmpty")}</p>
              ) : (
                <ul className="grid gap-3">
                  {productEntries.map((entry) => (
                    <EntryRow key={entry.entryId} entry={entry} />
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <aside className="grid content-start gap-6">
        <Panel title={t("upload.title")} description={t("upload.description")}>
          <KnowledgeUploadForm />
        </Panel>
        <Panel title={t("test.title")} description={t("test.description")}>
          <KnowledgeTest productCodes={[...byProduct.keys()]} />
        </Panel>
      </aside>
    </PageBody>
  );
}

async function EntryRow({ entry }: { entry: KnowledgeEntry }) {
  const [t, tKind, tStatus, format] = await Promise.all([
    getTranslations("learning.knowledge"),
    getTranslations("learning.knowledge.kinds"),
    getTranslations("learning.knowledge.status"),
    getFormatter(),
  ]);
  const shown = entry.active ?? entry.latest;
  const { latest } = entry;
  const oldestFirst = [...entry.versions].reverse();

  return (
    <li className="grid gap-3 rounded-m bg-gray-1 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="grid min-w-0 gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{entry.title}</p>
          <Badge tone="info">{tKind(entry.kind)}</Badge>
          {entry.active ? (
            <Badge tone="success">{t("advisorUses", { version: entry.active.version })}</Badge>
          ) : (
            <Badge>{t("noActive")}</Badge>
          )}
        </div>
        <p className="text-paragraph-xs text-fg-muted">
          {t("versionLine", {
            version: shown.version,
            filename: shown.filename,
            pages: t("pages", { count: shown.pageCount ?? 0 }),
            time: format.dateTime(shown.activatedAt ?? shown.createdAt, {
              day: "numeric",
              month: "numeric",
              year: "numeric",
            }),
          })}
          {shown.sections ? ` · ${t("sections", { count: shown.sections.length })}` : ""}
        </p>
        <ol className="flex flex-wrap items-center gap-1" aria-label={entry.title}>
          {oldestFirst.map((v) => (
            <li
              key={v.id}
              title={t("versionSquare", { version: v.version, status: tStatus(v.status) })}
            >
              <span className={cn("block size-3", SQUARE[v.status])} />
              <span className="sr-only">
                {t("versionSquare", { version: v.version, status: tStatus(v.status) })}
              </span>
            </li>
          ))}
        </ol>
        {latest.status === "processing" ? (
          <p className="text-fg-muted">{t("processingHint", { version: latest.version })}</p>
        ) : latest.status === "failed" ? (
          <p className="text-error-dark">
            {t("failedHint", { version: latest.version, error: latest.error ?? "" })}
          </p>
        ) : null}
      </div>
      <KnowledgeEntryActions
        entryId={entry.entryId}
        title={entry.title}
        fileHref={`/api/firma/knowledge/${shown.id}/file`}
      />
    </li>
  );
}
