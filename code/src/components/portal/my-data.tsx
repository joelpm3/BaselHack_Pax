import { Download } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonClasses } from "@/components/ui/button";
import { dataInventory } from "@/lib/privacy/service";
import { EraseData } from "./erase-data";

const ROWS = ["conversations", "messages", "documents", "profileFields", "assessments"] as const;

/** "Meine Daten": what Pax stored about the customer, the JSON export and erasure. */
export async function MyData({ customerId }: { customerId: string }) {
  const t = await getTranslations("portal.myData");
  const locale = await getLocale();
  const inventory = dataInventory(customerId);
  return (
    <div className="grid gap-4 rounded-xl border border-line p-5">
      <p className="text-paragraph-s text-fg-muted">{t("intro")}</p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-paragraph-s">
        {ROWS.map((key) => (
          <div key={key} className="contents">
            <dt>{t(`rows.${key}`)}</dt>
            <dd className="text-right font-medium tabular-nums">{inventory[key]}</dd>
          </div>
        ))}
      </dl>
      <a
        href="/api/portal/export"
        download
        className={buttonClasses("secondary", "sm", "justify-self-start")}
      >
        <Download className="size-4" aria-hidden />
        {t("download")}
      </a>
      <EraseData locale={locale} keepsContracts={inventory.contracts > 0} />
    </div>
  );
}
