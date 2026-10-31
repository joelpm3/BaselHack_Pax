"use client";

import { Check, MapPin, NotebookPen, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { pickResidence, saveProfileFields } from "@/app/[locale]/chat/actions";
import { useChatActions } from "@/components/chat/chat-actions";
import { usePictureActions } from "@/components/chat/picture-context";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { EDITABLE_FIELDS, type FieldSpec, parseFieldValue } from "@/lib/advisor/profile-fields";
import type {
  PlaceOption,
  ProfileFieldChange,
  ResidencePlace,
  UpdateProfileOutput,
} from "@/lib/advisor/types";
import {
  formatProfileValue,
  profileFieldLabelKey,
  residenceLabel,
  visibleProfileChanges,
} from "./profile-format";
import type { WidgetProps } from "./types";
import { useChf, WidgetPending } from "./widget-card";

function useFormatValue() {
  const t = useTranslations("widgets");
  const chf = useChf();
  return (path: string, value: unknown) => formatProfileValue(path, value, t, chf);
}

/** "Ihre Situation": what the advisor just noted, correctable inline (saved as source "form"). */
export function ProfileCard({ toolCallId, state, output }: WidgetProps) {
  const t = useTranslations("widgets.profile");
  if (state !== "output-available") {
    return state === "output-error" ? null : (
      <WidgetPending icon={NotebookPen} label={t("saving")} />
    );
  }
  const data = output as UpdateProfileOutput | undefined;
  if (!data || data.status !== "ok" || !Array.isArray(data.changes)) return null;
  const changes = visibleProfileChanges(data.changes);
  const options = data.location ? [] : (data.locationOptions ?? []);
  if (changes.length === 0 && !data.location && options.length === 0) return null;
  return (
    <ProfileCardBody
      toolCallId={toolCallId}
      changes={changes}
      location={data.location}
      options={options}
    />
  );
}

function ProfileCardBody({
  toolCallId,
  changes,
  location: initialLocation,
  options,
}: {
  toolCallId: string;
  changes: ProfileFieldChange[];
  location: ResidencePlace | null;
  options: PlaceOption[];
}) {
  const t = useTranslations("widgets");
  const format = useFormatValue();
  const { conversationId, busy } = useChatActions();
  const picture = usePictureActions();
  const [values, setValues] = useState(() => new Map(changes.map((c) => [c.path, c.value])));
  const [location, setLocation] = useState(initialLocation);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const editable = changes.filter((c) => EDITABLE_FIELDS[c.path]);
  const rows = changes.filter((c) => !c.path.startsWith("residence."));
  const place = residenceLabel(changes, location);
  const picking = !location && options.length > 0;
  const noted = Boolean(place) || rows.length > 0;

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
      {noted ? (
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
      ) : null}

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
      ) : noted ? (
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
      ) : null}
      {picking ? (
        <PlacePicker
          toolCallId={toolCallId}
          options={options}
          onPicked={setLocation}
          spaced={noted}
        />
      ) : null}
    </section>
  );
}

/** "Welcher Ort?": the customer picks the town; the server stores it, no model decides. */
function PlacePicker({
  toolCallId,
  options,
  onPicked,
  spaced,
}: {
  toolCallId: string;
  options: PlaceOption[];
  onPicked: (location: ResidencePlace) => void;
  spaced: boolean;
}) {
  const t = useTranslations("locality");
  const { conversationId, sendMessage, busy } = useChatActions();
  const picture = usePictureActions();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const zips = new Set(options.map((o) => o.zip));
  const sharedZip = zips.size === 1 ? options[0].zip : null;

  function pick(option: PlaceOption) {
    startTransition(async () => {
      const result = await pickResidence({
        conversationId,
        toolCallId,
        zip: option.zip,
        town: option.town,
      }).catch(() => ({ ok: false as const }));
      if (!result.ok) {
        setFailed(true);
        return;
      }
      picture?.setPicture(result.picture);
      onPicked(result.location);
      sendMessage(t("pickedMessage", { place: residenceLabel([], result.location) }), {
        inputMode: "widget",
      });
    });
  }

  return (
    <div className={spaced ? "mt-3 border-line border-t pt-3" : undefined}>
      <p className="flex items-start gap-2 text-paragraph-xs font-bold">
        <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-pax-purple" />
        {sharedZip ? t("questionZip", { zip: sharedZip }) : t("question")}
      </p>
      <ul aria-label={t("options")} className="mt-2 flex flex-wrap gap-1.5">
        {options.map((option) => (
          <li key={`${option.zip}-${option.town}`}>
            <button
              type="button"
              onClick={() => pick(option)}
              disabled={busy || pending}
              className="rounded-full border-[1.5px] border-pax-purple bg-surface px-3.5 py-1.5 text-paragraph-xs font-medium text-pax-purple transition-colors hover:bg-light-purple disabled:border-gray-3 disabled:text-gray-5"
            >
              {sharedZip ? option.town : residenceLabel([], { zip: option.zip, city: option.town })}
            </button>
          </li>
        ))}
      </ul>
      {failed ? (
        <p role="alert" className="mt-2 text-paragraph-xs text-error-dark">
          {t("failed")}
        </p>
      ) : null}
    </div>
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
