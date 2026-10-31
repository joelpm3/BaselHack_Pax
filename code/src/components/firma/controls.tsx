"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  addLeadNote,
  assignHandover,
  assignLead,
  rerunAnalysis,
  setHandoverStatus,
  setLeadStatus,
} from "@/app/[locale]/firma/actions";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { HANDOVER_STATUSES, LEAD_STATUSES } from "@/lib/domain/taxonomy";
import type { AdvisorOption } from "@/lib/firma/conversations";
import { cn } from "@/lib/utils";

const compact = "h-8 w-auto py-0 pr-7 pl-2.5 text-paragraph-s";

export function LeadStatusSelect({
  leadId,
  status,
  className,
}: {
  leadId: string;
  status: string;
  className?: string;
}) {
  const t = useTranslations("common.taxonomy.leadStatus");
  const tf = useTranslations("firma.leads");
  const [pending, start] = useTransition();
  return (
    <Select
      aria-label={tf("changeStatus")}
      value={status}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        start(() => setLeadStatus(leadId, next));
      }}
      className={cn(compact, className)}
    >
      {LEAD_STATUSES.map((s) => (
        <option key={s} value={s}>
          {t(s)}
        </option>
      ))}
    </Select>
  );
}

export function HandoverStatusSelect({
  handoverId,
  status,
}: {
  handoverId: string;
  status: string;
}) {
  const t = useTranslations("firma.taxonomy.handoverStatus");
  const tf = useTranslations("firma.handovers");
  const [pending, start] = useTransition();
  return (
    <Select
      aria-label={tf("changeStatus")}
      value={status}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        start(() => setHandoverStatus(handoverId, next));
      }}
      className={compact}
    >
      {HANDOVER_STATUSES.map((s) => (
        <option key={s} value={s}>
          {t(s)}
        </option>
      ))}
    </Select>
  );
}

export function AssignSelect({
  kind,
  id,
  value,
  advisors,
  className,
}: {
  kind: "lead" | "handover";
  id: string;
  value: string | null;
  advisors: AdvisorOption[];
  className?: string;
}) {
  const t = useTranslations("firma.common");
  const [pending, start] = useTransition();
  return (
    <Select
      aria-label={t("assign")}
      value={value ?? ""}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value || null;
        start(() => (kind === "lead" ? assignLead(id, next) : assignHandover(id, next)));
      }}
      className={cn(compact, className)}
    >
      <option value="">{t("unassigned")}</option>
      {advisors.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </Select>
  );
}

export function LeadNoteForm({ leadId }: { leadId: string }) {
  const t = useTranslations("firma.conversation.leadNote");
  const [state, action, pending] = useActionState(addLeadNote, { ok: false });
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="grid gap-2">
      <input type="hidden" name="leadId" value={leadId} />
      <label htmlFor={`note-${leadId}`} className="sr-only">
        {t("label")}
      </label>
      <Textarea
        id={`note-${leadId}`}
        name="body"
        required
        maxLength={4000}
        placeholder={t("placeholder")}
        className="min-h-16 text-paragraph-s"
      />
      <div className="flex items-center gap-2">
        <Select name="type" aria-label={t("type")} defaultValue="note" className={compact}>
          <option value="note">{t("note")}</option>
          <option value="call">{t("call")}</option>
          <option value="email">{t("email")}</option>
        </Select>
        <Button type="submit" size="sm" disabled={pending}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}

export function RerunAnalysisButton({ conversationId }: { conversationId: string }) {
  const t = useTranslations("firma.conversation");
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex items-center gap-2">
      {failed ? <span className="text-error-dark">{t("rerunFailed")}</span> : null}
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await rerunAnalysis(conversationId);
            setFailed(!result.ok);
          })
        }
      >
        {pending ? <Spinner label={t("rerun")} /> : <RefreshCw aria-hidden />}
        {t("rerun")}
      </Button>
    </div>
  );
}
