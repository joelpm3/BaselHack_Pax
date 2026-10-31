"use client";

import { CircleAlert, CircleCheck, FileText, PenLine } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { type FormEvent, useId, useState, useTransition } from "react";
import { useChatActions } from "@/components/chat/chat-actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Link } from "@/i18n/navigation";
import { saveContactAction, signApplicationAction } from "@/lib/sales/actions";
import type { ContactPrefill, OfferOutput, OfferView, SignedInfo } from "@/lib/sales/types";
import type { WidgetProps } from "../types";
import { WidgetCard, WidgetFailed, WidgetPending } from "../widget-card";
import { CoverFacts, FactGrid, IssueList, PriceTag, RiderList, ScenarioList } from "./shared";

const UNIT_LINKED = new Set(["lifestar", "fondsstar", "auszahlungsplan"]);

/** Offer summary → contact details → consents → typed-name demo signature → policy. */
export function OfferWidget({ toolCallId, state, output }: WidgetProps) {
  const t = useTranslations("sales.offer");
  if (state === "output-error") return <WidgetFailed icon={FileText} title={t("titleShort")} />;
  if (state !== "output-available") return <WidgetPending icon={FileText} label={t("pending")} />;
  const data = output as OfferOutput | undefined;
  if (!data) return null;
  if (data.status !== "ok" || !data.offer || !data.applicationId) {
    const key = data.status === "ok" ? "not_found" : data.status;
    return (
      <WidgetCard icon={FileText} title={t("titleShort")}>
        <p className="text-paragraph-s">{t(`status.${key}`)}</p>
      </WidgetCard>
    );
  }
  return (
    <OfferBody
      toolCallId={toolCallId}
      data={data}
      initialOffer={data.offer}
      applicationId={data.applicationId}
    />
  );
}

function OfferBody({
  toolCallId,
  data,
  initialOffer,
  applicationId,
}: {
  toolCallId: string;
  data: OfferOutput;
  initialOffer: OfferView;
  applicationId: string;
}) {
  const t = useTranslations("sales.offer");
  const tPrice = useTranslations("sales.price");
  const format = useFormatter();
  const [contact, setContact] = useState<ContactPrefill>(data.contact);
  const [contactSaved, setContactSaved] = useState(
    Boolean(data.contactSaved) || !data.needsContact,
  );
  const [signed, setSigned] = useState<SignedInfo | undefined>(data.signed);
  // The form re-prices the offer when the birth date or smoker status change.
  const [offer, setOffer] = useState(initialOffer);
  const [repriced, setRepriced] = useState(false);
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "long" });
  const unitLinked = UNIT_LINKED.has(offer.productCode);
  // The policyholder's name can change in the contact step; a partner keeps the offer's name.
  const insuredName =
    offer.insured.who === "self" && contact.firstName
      ? `${contact.firstName} ${contact.lastName}`.trim()
      : (offer.insured.name ?? t("you"));

  const conditions = [
    "withdrawal",
    ...(unitLinked ? ["investmentRisk"] : ["premiumGuaranteed"]),
    ...(offer.productCode === "erwerbsunfaehigkeit" ? ["maximumBenefit", "crisisCoach"] : []),
    ...(offer.pillar === "3a" ? ["pillar3a"] : []),
    "health",
    "cooperative",
  ];

  return (
    <WidgetCard
      icon={FileText}
      title={t("title", { product: offer.productName })}
      aside={<Badge tone="accent">{t("demoBadge")}</Badge>}
    >
      <div className="flex flex-col gap-5">
        <FactGrid
          items={[
            {
              label: t("insured"),
              value: (
                <>
                  {insuredName}
                  <span className="block text-paragraph-xs font-normal text-fg-muted">
                    {t("insuredDetails", {
                      birthDate: date(offer.insured.birthDate),
                      smoker: offer.insured.smoker ? "yes" : "no",
                    })}
                  </span>
                  {offer.insured.birthDateAssumed || offer.insured.smokerAssumed ? (
                    <span className="mt-1 block text-paragraph-xs font-normal text-deep-purple">
                      {[
                        offer.insured.birthDateAssumed ? t("birthDateAssumed") : null,
                        offer.insured.smokerAssumed ? t("smokerAssumed") : null,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </span>
                  ) : null}
                </>
              ),
            },
            {
              label: t("period"),
              value: t("periodValue", { start: date(offer.startDate), end: date(offer.endDate) }),
            },
          ]}
        />
        <CoverFacts
          productCode={offer.productCode}
          pillar={offer.pillar}
          cover={offer.cover}
          price={offer.price}
          extra={
            offer.fund
              ? [
                  { label: t("fund"), value: offer.fund },
                  ...(offer.guaranteedSharePercent
                    ? [{ label: t("guaranteedShare"), value: `${offer.guaranteedSharePercent} %` }]
                    : []),
                ]
              : []
          }
        />

        <div className="flex flex-col gap-3 rounded-m bg-surface-muted p-4">
          <PriceTag price={offer.price} />
          {repriced ? (
            <output className="block text-paragraph-xs text-deep-purple">{t("repriced")}</output>
          ) : null}
          {offer.price.maturity ? (
            <ScenarioList
              title={tPrice("maturityTitle")}
              values={offer.price.maturity}
              note={tPrice("scenarioNote")}
            />
          ) : null}
          {offer.price.payoutAnnual ? (
            <ScenarioList
              title={tPrice("payoutTitle")}
              values={offer.price.payoutAnnual}
              note={tPrice("scenarioNote")}
            />
          ) : null}
          <RiderList riders={offer.price.riders} />
          <IssueList issues={offer.price.issues} />
        </div>

        <section>
          <h4 className="text-paragraph-s font-bold">{t("conditionsTitle")}</h4>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-paragraph-xs">
            {conditions.map((key) => (
              <li key={key}>{t(`conditions.${key}`)}</li>
            ))}
          </ul>
        </section>

        {signed ? (
          <Signed signed={signed} date={date} />
        ) : (
          <>
            <section>
              <h4 className="text-paragraph-s font-bold">{t("nextTitle")}</h4>
              <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-paragraph-xs">
                <li>{t("next.contact")}</li>
                <li>{t("next.sign")}</li>
                <li>{t("next.policy", { date: date(offer.startDate) })}</li>
              </ol>
            </section>
            <p className="rounded-m bg-light-purple p-3 text-paragraph-xs text-deep-purple">
              {t("demoNotice")}
            </p>
            {contactSaved ? (
              <SignForm
                toolCallId={toolCallId}
                applicationId={applicationId}
                productName={offer.productName}
                expectedName={`${contact.firstName} ${contact.lastName}`.trim()}
                onSigned={setSigned}
                onEditContact={() => setContactSaved(false)}
              />
            ) : (
              <ContactForm
                toolCallId={toolCallId}
                applicationId={applicationId}
                initial={contact}
                insured={offer.insured}
                onSaved={(saved, result) => {
                  setContact(saved);
                  if (result.offer) setOffer(result.offer);
                  setRepriced(result.repriced);
                  setContactSaved(true);
                }}
              />
            )}
          </>
        )}
      </div>
    </WidgetCard>
  );
}

function ContactForm({
  toolCallId,
  applicationId,
  initial,
  insured,
  onSaved,
}: {
  toolCallId: string;
  applicationId: string;
  initial: ContactPrefill;
  insured: OfferView["insured"];
  onSaved: (
    contact: ContactPrefill,
    result: { offer: OfferView | null; repriced: boolean },
  ) => void;
}) {
  const t = useTranslations("sales.offer.contact");
  const { conversationId, busy } = useChatActions();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const id = useId();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const contact: ContactPrefill = {
      firstName: String(form.get("firstName") ?? "").trim(),
      lastName: String(form.get("lastName") ?? "").trim(),
      birthDate: String(form.get("birthDate") ?? ""),
      email: String(form.get("email") ?? "").trim(),
      phone: String(form.get("phone") ?? "").trim(),
    };
    const smoker = form.get("smoker") === "yes";
    setFailed(false);
    startTransition(async () => {
      const result = await saveContactAction({
        conversationId,
        toolCallId,
        applicationId,
        contact,
        smoker,
      }).catch(() => ({ ok: false as const }));
      if (!result.ok) {
        setFailed(true);
        return;
      }
      onSaved(contact, result);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <h4 className="text-paragraph-s font-bold">{t("title")}</h4>
        <p className="mt-0.5 text-paragraph-xs text-fg-muted">{t("hint")}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("firstName")} htmlFor={`${id}-first`}>
          <Input
            id={`${id}-first`}
            name="firstName"
            autoComplete="given-name"
            required
            maxLength={80}
            defaultValue={initial.firstName}
          />
        </Field>
        <Field label={t("lastName")} htmlFor={`${id}-last`}>
          <Input
            id={`${id}-last`}
            name="lastName"
            autoComplete="family-name"
            required
            maxLength={80}
            defaultValue={initial.lastName}
          />
        </Field>
        <Field label={t("birthDate")} htmlFor={`${id}-birth`}>
          <Input
            id={`${id}-birth`}
            name="birthDate"
            type="date"
            autoComplete="bday"
            required
            defaultValue={initial.birthDate}
          />
        </Field>
        <Field label={t("email")} htmlFor={`${id}-email`}>
          <Input
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={200}
            defaultValue={initial.email}
          />
        </Field>
        <Field label={t("phone")} htmlFor={`${id}-phone`} className="sm:col-span-2">
          <Input
            id={`${id}-phone`}
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            pattern="^\+?[0-9 \(\)\-]{6,20}$"
            placeholder="+41 79 123 45 67"
            defaultValue={initial.phone}
          />
        </Field>
        <Field
          label={
            insured.who === "self"
              ? t("smoker")
              : insured.name
                ? t("smokerPartner", { name: insured.name })
                : t("smokerInsured")
          }
          htmlFor={`${id}-smoker`}
          hint={t("smokerHint")}
          className="sm:col-span-2"
        >
          <Select
            id={`${id}-smoker`}
            name="smoker"
            required
            defaultValue={insured.smokerAssumed ? "" : insured.smoker ? "yes" : "no"}
          >
            <option value="" disabled>
              {t("smokerChoose")}
            </option>
            <option value="no">{t("smokerNo")}</option>
            <option value="yes">{t("smokerYes")}</option>
          </Select>
        </Field>
      </div>
      <p className="text-paragraph-xs text-fg-muted">{t("privacy")}</p>
      {failed ? (
        <p role="alert" className="flex items-center gap-1.5 text-paragraph-xs text-error-dark">
          <CircleAlert aria-hidden className="size-4" />
          {t("error")}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={busy || pending}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}

const CONSENTS = ["offerRead", "dataCorrect", "demoUnderstood"] as const;
type Consent = (typeof CONSENTS)[number];

function SignForm({
  toolCallId,
  applicationId,
  productName,
  expectedName,
  onSigned,
  onEditContact,
}: {
  toolCallId: string;
  applicationId: string;
  productName: string;
  expectedName: string;
  onSigned: (signed: SignedInfo) => void;
  onEditContact: () => void;
}) {
  const t = useTranslations("sales.offer.sign");
  const { conversationId, busy, sendMessage } = useChatActions();
  const [consents, setConsents] = useState<Record<Consent, boolean>>({
    offerRead: false,
    dataCorrect: false,
    demoUnderstood: false,
  });
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();
  const ready = CONSENTS.every((c) => consents[c]) && name.trim().length >= 3;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) return;
    setError(null);
    startTransition(async () => {
      const result = await signApplicationAction({
        conversationId,
        toolCallId,
        applicationId,
        signatureName: name.trim(),
        consents,
      }).catch(() => ({ ok: false as const, error: "invalid" as const }));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSigned(result.signed);
      sendMessage(
        t("signedMessage", { product: productName, number: result.signed.policyNumber }),
        {
          inputMode: "widget",
        },
      );
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <h4 className="text-paragraph-s font-bold">{t("title")}</h4>
      <fieldset className="flex flex-col gap-2.5">
        <legend className="sr-only">{t("consentsLegend")}</legend>
        {CONSENTS.map((key) => (
          <label key={key} className="flex cursor-pointer items-start gap-2.5 text-paragraph-xs">
            <input
              type="checkbox"
              checked={consents[key]}
              onChange={(e) => setConsents((c) => ({ ...c, [key]: e.target.checked }))}
              className="mt-0.5 size-4 shrink-0 accent-pax-purple"
            />
            <span>{t(`consents.${key}`)}</span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-signature`} className="text-paragraph-xs font-medium">
          {t("signatureLabel")}
        </label>
        <div className="flex items-end gap-2 border-b-[1.6px] border-ink pb-1">
          <PenLine aria-hidden className="mb-2 size-5 shrink-0 text-pax-purple" />
          <input
            id={`${id}-signature`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            aria-describedby={`${id}-signature-hint`}
            placeholder={expectedName || t("signaturePlaceholder")}
            className="h-11 w-full min-w-0 bg-transparent text-heading-s italic placeholder:text-gray-4 focus:outline-none"
          />
        </div>
        <p id={`${id}-signature-hint`} className="text-paragraph-xs text-fg-muted">
          {t("signatureHint", { name: expectedName })}{" "}
          <button
            type="button"
            onClick={onEditContact}
            className="font-medium text-contrast-green hover:underline"
          >
            {t("editContact")}
          </button>
        </p>
      </div>
      {error ? (
        <p role="alert" className="flex items-start gap-1.5 text-paragraph-xs text-error-dark">
          <CircleAlert aria-hidden className="mt-px size-4 shrink-0" />
          {t.has(`errors.${error}`)
            ? t(`errors.${error}`, { name: expectedName })
            : t("errors.invalid")}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={!ready || busy || pending}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}

function Signed({ signed, date }: { signed: SignedInfo; date: (iso: string) => string }) {
  const t = useTranslations("sales.offer.signed");
  return (
    <div className="flex flex-col gap-3 rounded-m bg-light-green p-4">
      <p className="flex items-start gap-2 text-paragraph-s font-medium">
        <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-contrast-green" />
        {t("title", {
          number: signed.policyNumber,
          date: signed.startDate ? date(signed.startDate) : "",
        })}
      </p>
      <p className="text-paragraph-xs">{t("body")}</p>
      <div>
        <Link href="/portal" className={buttonClasses("primary", "sm")}>
          {t("portal")}
        </Link>
      </div>
    </div>
  );
}
