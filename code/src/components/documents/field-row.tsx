"use client";

import { Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import type { ExtractedField } from "@/lib/db/schema";
import { LOW_CONFIDENCE } from "@/lib/documents/constants";
import type { ExtractableDocumentType, FieldDef } from "@/lib/documents/fields";
import { normalizeValue } from "@/lib/documents/normalize";
import { cn } from "@/lib/utils";
import { editorValue, formatFieldValue } from "./format-field";

export type EditValue = string | number | boolean | null;

interface FieldRowProps {
  docType: ExtractableDocumentType;
  def: FieldDef;
  field: ExtractedField;
  /** undefined = untouched, null = removed by the customer. */
  edit: EditValue | undefined;
  readOnly: boolean;
  onEdit: (value: EditValue | undefined) => void;
}

function FieldEditor({
  docType,
  def,
  initial,
  onSave,
  onCancel,
}: {
  docType: ExtractableDocumentType;
  def: FieldDef;
  initial: string;
  onSave: (value: EditValue) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("documents");
  const locale = useLocale();
  const id = useId();
  const [text, setText] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const label = t(`fields.${docType}.${def.key}`);

  function save() {
    if (text.trim() === "") return onSave(null);
    const value = normalizeValue(def, def.kind === "boolean" ? text === "true" : text);
    if (value === null) setInvalid(true);
    else onSave(value);
  }

  const control =
    def.kind === "enum" || def.kind === "boolean" ? (
      <Select id={id} value={text} onChange={(e) => setText(e.target.value)}>
        {(def.kind === "boolean" ? ["true", "false"] : (def.options ?? [])).map((option) => (
          <option key={option} value={option}>
            {def.kind === "boolean"
              ? t(option === "true" ? "review.yes" : "review.no")
              : formatFieldValue(def, option, locale, t)}
          </option>
        ))}
      </Select>
    ) : (
      <Input
        id={id}
        type={def.kind === "date" ? "date" : "text"}
        inputMode={def.kind === "text" || def.kind === "date" ? undefined : "decimal"}
        value={text}
        aria-invalid={invalid || undefined}
        autoFocus
        onChange={(e) => {
          setText(e.target.value);
          setInvalid(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
          if (e.key === "Escape") onCancel();
        }}
      />
    );

  return (
    <div className="flex flex-col gap-2 py-3">
      <label htmlFor={id} className="text-paragraph-s font-medium">
        {label}
      </label>
      {control}
      {invalid ? <p className="text-paragraph-xs text-error-dark">{t("review.invalid")}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={save}>
          {t("review.save")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t("review.cancel")}
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onSave(null)}>
          {t("review.clear")}
        </Button>
      </div>
    </div>
  );
}

/** One value of the "Das habe ich gelesen" card: label, value, source quote, inline edit. */
export function FieldRow({ docType, def, field, edit, readOnly, onEdit }: FieldRowProps) {
  const t = useTranslations("documents");
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const label = t(`fields.${docType}.${def.key}`);
  const edited = edit !== undefined;
  const value = edited ? edit : field.value;
  const lowConfidence = !edited && !readOnly && field.confidence < LOW_CONFIDENCE;

  if (editing)
    return (
      <FieldEditor
        docType={docType}
        def={def}
        initial={editorValue(def, value)}
        onCancel={() => setEditing(false)}
        onSave={(next) => {
          onEdit(next);
          setEditing(false);
        }}
      />
    );

  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 py-2.5",
        lowConfidence && "-mx-2 rounded-sm bg-warning-light px-2",
      )}
    >
      <dt className="min-w-0 self-center">
        <span className="text-paragraph-s text-fg-muted">{label}</span>
        {lowConfidence ? (
          <Badge tone="warning" className="ml-2 align-middle">
            {t("review.check")}
          </Badge>
        ) : null}
        {edited ? (
          <Badge tone="info" className="ml-2 align-middle">
            {t("review.edited")}
          </Badge>
        ) : null}
      </dt>
      <dd className="flex items-center gap-1 text-right">
        <span
          className={cn(
            "text-paragraph-s font-medium tabular-nums",
            value === null && "text-fg-subtle line-through",
          )}
        >
          {value === null
            ? formatFieldValue(def, field.value, locale, t)
            : formatFieldValue(def, value, locale, t)}
        </span>
        {readOnly ? null : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={t("review.edit", { label })}
            className="-mr-1 inline-flex size-8 items-center justify-center rounded-full text-fg-muted hover:bg-gray-2 hover:text-ink"
          >
            <Pencil className="size-4" aria-hidden />
          </button>
        )}
      </dd>
      {field.quote && !edited ? (
        <dd className="col-span-2 line-clamp-1 text-paragraph-xs text-fg-subtle">
          {field.page
            ? t("review.source", { page: field.page, quote: field.quote })
            : t("review.sourceNoPage", { quote: field.quote })}
        </dd>
      ) : null}
    </div>
  );
}
