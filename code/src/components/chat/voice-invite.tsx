import { Mic } from "lucide-react";
import { useTranslations } from "next-intl";

const EXAMPLES = ["family", "work", "retirement"] as const;

/** Before the first answer: invites the customer to just talk, with things people often say. */
export function VoiceInvite() {
  const t = useTranslations("voice.invite");
  return (
    <section
      aria-labelledby="voice-invite-title"
      className="ml-[1.375rem] rounded-xl bg-surface-muted p-4 sm:p-5"
    >
      <h2
        id="voice-invite-title"
        className="flex items-center gap-2 text-heading-s font-bold text-contrast-green"
      >
        <span aria-hidden className="grid size-7 place-items-center rounded-sm bg-pax-purple">
          <Mic className="size-4 text-white" />
        </span>
        {t("title")}
      </h2>
      <p className="mt-2 text-paragraph-s text-fg">{t("body")}</p>
      <p className="mt-3 text-paragraph-xs text-fg-muted">{t("examplesLabel")}</p>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {EXAMPLES.map((key) => (
          <li key={key} className="flex gap-2.5 text-paragraph-s text-deep-purple">
            <span aria-hidden className="mt-[0.55em] block size-1.5 shrink-0 bg-pax-green" />
            <span>{t(`examples.${key}`)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
