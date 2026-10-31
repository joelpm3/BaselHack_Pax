"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { eraseMyDataAction } from "@/app/[locale]/portal/actions";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "./submit-button";

/** Two-step erasure: the request button, then what goes and what stays before confirming. */
export function EraseData({ locale, keepsContracts }: { locale: string; keepsContracts: boolean }) {
  const t = useTranslations("portal.myData.erase");
  const [asking, setAsking] = useState(false);

  if (!asking)
    return (
      <Button
        size="sm"
        variant="ghost"
        className="justify-self-start text-error-dark hover:bg-error-light"
        onClick={() => setAsking(true)}
      >
        <Trash2 className="size-4" aria-hidden />
        {t("request")}
      </Button>
    );

  return (
    <form action={eraseMyDataAction} className="grid gap-3 rounded-m bg-error-light p-4">
      <input type="hidden" name="locale" value={locale} />
      <p className="font-medium text-error-dark">{t("question")}</p>
      <p className="text-paragraph-s text-error-dark">{t("deletes")}</p>
      <p className="text-paragraph-s text-error-dark">
        {keepsContracts ? t("keepsContracts") : t("keepsNothing")}
      </p>
      <div className="flex flex-wrap gap-2">
        <SubmitButton size="sm" variant="danger">
          {t("confirm")}
        </SubmitButton>
        <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
