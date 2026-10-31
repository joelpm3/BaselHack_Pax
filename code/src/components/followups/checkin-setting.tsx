import { getTranslations } from "next-intl/server";
import { setMyYearlyCheckin } from "@/app/[locale]/portal/checkin-actions";
import { SubmitButton } from "@/components/portal/submit-button";
import { customerFollowUps } from "@/lib/followups/queries";
import { cn } from "@/lib/utils";
import { BusinessDate } from "./event-when";

/** Cockpit setting: the yearly "has anything changed?" email, on by default. */
export async function CheckinSetting({ customerId }: { customerId: string }) {
  const t = await getTranslations("followups.portal");
  const { checkin } = customerFollowUps(customerId);
  if (!checkin) return null;
  const { enabled } = checkin;
  return (
    <div className="grid gap-3 rounded-xl border border-line p-5">
      <p className="flex items-center gap-2 font-medium">
        <span
          aria-hidden
          className={cn(
            "size-2.5 shrink-0",
            enabled ? "bg-contrast-green" : "border border-gray-5",
          )}
        />
        {enabled ? t("on") : t("off")}
      </p>
      <p className="text-paragraph-s text-fg-muted">{t("body")}</p>
      {enabled && checkin.hasEmail ? (
        <p className="text-paragraph-s">
          {t("next")} <BusinessDate date={checkin.nextOn} />
        </p>
      ) : null}
      {enabled && !checkin.hasEmail ? (
        <p className="text-paragraph-s text-fg-muted">{t("noEmail")}</p>
      ) : null}
      <form action={setMyYearlyCheckin}>
        <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
        <SubmitButton size="sm" variant={enabled ? "secondary" : "primary"}>
          {enabled ? t("turnOff") : t("turnOn")}
        </SubmitButton>
      </form>
    </div>
  );
}
