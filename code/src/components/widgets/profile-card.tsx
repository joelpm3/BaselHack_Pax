"use client";

import { Check, NotebookPen, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { saveProfileFields } from "@/app/[locale]/chat/actions";
import { useChatActions } from "@/components/chat/chat-actions";
import { usePictureActions } from "@/components/chat/picture-context";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { EDITABLE_FIELDS, type FieldSpec, parseFieldValue } from "@/lib/advisor/profile-fields";
import type { ProfileFieldChange, UpdateProfileOutput } from "@/lib/advisor/types";
import { formatProfileValue, profileFieldLabelKey, visibleProfileChanges } from "./profile-format";
import type { WidgetProps } from "./types";
import { useChf, WidgetPending } from "./widget-card";

function useFormatValue() {
  const t = useTranslations("widgets");
  const chf = useChf();
  return (path: string, value: unknown) => formatProfileValue(path, value, t, chf);
}

/** "Ihre Situation": what the advisor just noted, correctable inline (saved as source "form"). */
export function ProfileCard({ state, output }: WidgetProps) {
  const t = useTranslations("widgets.profile");
  if (state !== "output-available") {
    return state === "output-error" ? null : (
      <WidgetPending icon={NotebookPen} label={t("saving")} />
    );
  }
  const data = output as UpdateProfileOutput | undefined;
  if (!data || data.status !== "ok" || !Array.isArray(data.changes)) return null;
  const changes = visibleProfileChanges(data.changes);
  if (changes.length === 0 && !data.location) return null;
  return <ProfileCardBody changes={changes} location={data.location} />;
}

function ProfileCardBody({
  changes,
  location,
}: {
  changes: ProfileFieldChange[];
  location: UpdateProfileOutput["location"];
}) {
  const t = useTranslations("widgets");
  const format = useFormatValue();
  const { conversationId, busy } = useChatActions();
  const picture = usePictureActions();
  const [values, setValues] = useState(() => new Map(changes.map((c) => [c.path, c.value])));
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const editable = changes.filter((c) => EDITABLE_FIELDS[c.path]);
  const rows = changes.filter((c) => !c.path.startsWith("residence."));
  const place = location
    ? `${location.zip} ${location.city} (${location.canton})`
    : changes
        .filter((c) => c.path === "residence.zip" || c.path === "residence.city")
        .map((c) => String(c.value))
        .join(" ");

  function save(form: FormData) {
    const updates: Array<{ path: string; value: string | number | boolean | null }> = [];
    for (const change of editable) {
      const raw = String(form.get(change.path) ?? "");
      const value = parseFieldValue(EDITABLE_FIELDS[change.path], raw);
      if (value === undefined) {
        setError(true);
        return;
      }
      if (value !== values.get(change.path)) updates.push({ path: change.path, value });
    }
    if (updates.length === 0) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const result = await saveProfileFields({ conversationId, changes: updates });
      if (!result.ok) {
        setError(true);
        return;
      }
      setValues((prev) => {
        const next = new Map(prev);
        for (const u of updates) next.set(u.path, u.value);
        return next;
      });
      picture?.setPicture(result.picture);
      setError(false);
      setSaved(true);
      setEditing(false);
    });
  }

  return (
    <section className="rounded-[16px] border border-line bg-surface-muted px-4 py-3 lg:rounded-xl">
      <header className="flex items-center gap-2">
        <NotebookPen aria-hidden className="size-4 shrink-0 text-pax-purple" />
        <h3 className="flex-1 text-paragraph-xs font-bold">
          {saved ? t("profile.corrected") : t("profile.title")}
        </h3>
        {editable.length > 0 && !editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-paragraph-xs font-medium text-pax-purple hover:bg-light-purple disabled:text-gray-5"
          >
            <Pencil aria-hidden className="size-3.5" />
            {t("profile.edit")}
          </button>
        ) : null}
      </header>

      {editing ? (
        <form action={save} className="mt-3 flex flex-col gap-3">
          {editable.map((change) => (
            <FieldInput
              key={change.path}
              path={change.path}
              spec={EDITABLE_FIELDS[change.path]}
              value={values.get(change.path)}
            />
          ))}
          {error ? (
            <p role="alert" className="text-paragraph-xs text-error-dark">
              {t("profile.invalid")}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              <Check aria-hidden />
              {t("profile.save")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-paragraph-xs">
          {place ? (
            <>
              <dt className="text-fg-muted">{t("fields.location")}</dt>
              <dd>{place}</dd>
            </>
          ) : null}
          {rows.map((change) => (
            <div key={change.path} className="contents">
              <dt className="text-fg-muted">{t(profileFieldLabelKey(change.path))}</dt>
              <dd>{format(change.path, values.get(change.path))}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function FieldInput({ path, spec, value }: { path: string; spec: FieldSpec; value: unknown }) {
  const t = useTranslations("widgets");
  const id = `field-${path}`;
  const defaultValue = value === null || value === undefined ? "" : String(value);
  const label = (
    <label htmlFor={id} className="text-paragraph-xs font-medium">
      {t(profileFieldLabelKey(path))}
    </label>
  );
  if (spec.kind === "enum" || spec.kind === "boolean") {
    const options =
      spec.kind === "boolean"
        ? [
            ["true", t("common.yes")],
            ["false", t("common.no")],
          ]
        : (spec.options ?? []).map((o) => [o, t(`enums.${spec.enumName}.${o}`)]);
    return (
      <div className="flex flex-col gap-1">
        {label}
        <Select id={id} name={path} defaultValue={defaultValue} className="h-10">
          {options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </div>
    );
  }
  const numeric = spec.kind !== "text";
  return (
    <div className="flex flex-col gap-1">
      {label}
      <Input
        id={id}
        name={path}
        defaultValue={defaultValue}
        inputMode={numeric ? "numeric" : "text"}
        autoComplete="off"
        className="h-10"
      />
    </div>
  );
}
