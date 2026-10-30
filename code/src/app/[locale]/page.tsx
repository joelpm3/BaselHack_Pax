import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";

export default function HomePage({ params }: PageProps<"/[locale]">) {
  setRequestLocale(use(params).locale);
  const t = useTranslations("common");
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-heading-xl">{t("appName")}</h1>
      <p className="mt-4 text-paragraph-l text-fg-muted">{t("claim")}</p>
    </main>
  );
}
