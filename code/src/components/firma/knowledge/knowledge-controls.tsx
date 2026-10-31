"use client";

import { FileUp, Search, Trash, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";
import { deleteKnowledge, previewKnowledge } from "@/app/[locale]/firma/learning-actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { KNOWLEDGE_KINDS } from "@/lib/domain/learning";
import { PRODUCT_CODES, PRODUCTS } from "@/lib/domain/products";
import type { KnowledgeLookup } from "@/lib/knowledge/service";

const UPLOAD_URL = "/api/firma/knowledge";
const KNOWN_ERRORS = [
  "empty",
  "too_large",
  "not_pdf",
  "unreadable",
  "too_many_pages",
  "unknown_entry",
  "invalid_fields",
];

/** Posts the form to the upload route and returns an error key, or null on success. */
async function upload(form: FormData): Promise<string | null> {
  try {
    const response = await fetch(UPLOAD_URL, { method: "POST", body: form });
    if (response.ok) return null;
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    return body?.error && KNOWN_ERRORS.includes(body.error) ? body.error : "generic";
  } catch {
    return "generic";
  }
}

export function KnowledgeUploadForm() {
  const t = useTranslations("learning.knowledge");
  const tKind = useTranslations("learning.knowledge.kinds");
  const id = useId();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ error: string | null } | null>(null);

  return (
    <form
      ref={formRef}
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        start(async () => {
          const error = await upload(form);
          setResult({ error });
          if (!error) {
            formRef.current?.reset();
            router.refresh();
          }
        });
      }}
    >
      <Field label={t("upload.product")} htmlFor={`${id}-product`}>
        <Select id={`${id}-product`} name="productCode" required defaultValue="">
          <option value="" disabled>
            {t("upload.product")}
          </option>
          {PRODUCT_CODES.map((code) => (
            <option key={code} value={code}>
              {PRODUCTS[code].name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("upload.kind")} htmlFor={`${id}-kind`}>
        <Select id={`${id}-kind`} name="kind" defaultValue="product_sheet">
          {KNOWLEDGE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {tKind(kind)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("upload.docTitle")} htmlFor={`${id}-title`}>
        <Input
          id={`${id}-title`}
          name="title"
          required
          minLength={2}
          maxLength={120}
          placeholder={t("upload.titlePlaceholder")}
        />
      </Field>
      <Field label={t("upload.file")} htmlFor={`${id}-file`} hint={t("upload.fileHint")}>
        <input
          id={`${id}-file`}
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          required
          className="block w-full text-paragraph-s file:mr-3 file:rounded-full file:border-0 file:bg-light-purple file:px-3.5 file:py-2 file:font-medium file:text-deep-purple hover:file:bg-gray-2"
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner label={t("upload.uploading")} /> : <Upload aria-hidden />}
          {pending ? t("upload.uploading") : t("upload.submit")}
        </Button>
      </div>
      <p aria-live="polite" className={result?.error ? "text-error-dark" : "text-fg-muted"}>
        {result ? (result.error ? t(`upload.errors.${result.error}`) : t("upload.done")) : null}
      </p>
    </form>
  );
}

export function KnowledgeEntryActions({
  entryId,
  title,
  fileHref,
}: {
  entryId: string;
  title: string;
  fileHref: string | null;
}) {
  const t = useTranslations("learning.knowledge");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid justify-items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-1">
        {fileHref ? (
          <a
            href={fileHref}
            target="_blank"
            rel="noreferrer"
            className="rounded-m px-2.5 py-1.5 font-medium text-pax-purple hover:bg-gray-1"
          >
            {t("open")}
          </a>
        ) : null}
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            const form = new FormData();
            form.set("file", file);
            form.set("entryId", entryId);
            start(async () => {
              const failed = await upload(form);
              setError(failed);
              if (!failed) router.refresh();
            });
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => input.current?.click()}
        >
          {pending ? <Spinner label={t("replacing")} /> : <FileUp aria-hidden />}
          {pending ? t("replacing") : t("replace")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="px-2.5 text-error-dark"
          disabled={pending}
          aria-label={`${t("delete")}: ${title}`}
          onClick={() => {
            if (!window.confirm(t("confirmDelete", { title }))) return;
            start(() => deleteKnowledge(entryId));
          }}
        >
          <Trash aria-hidden />
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-error-dark">
          {t(`upload.errors.${error}`)}
        </p>
      ) : null}
    </div>
  );
}

export function KnowledgeTest({ productCodes }: { productCodes: string[] }) {
  const t = useTranslations("learning.knowledge.test");
  const id = useId();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<KnowledgeLookup | null>(null);

  return (
    <div className="grid gap-3">
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          start(async () => {
            setResult(
              await previewKnowledge(String(form.get("productCode")), String(form.get("question"))),
            );
          });
        }}
      >
        <Select
          name="productCode"
          aria-label={t("title")}
          defaultValue={productCodes[0] ?? PRODUCT_CODES[0]}
        >
          {PRODUCT_CODES.map((code) => (
            <option key={code} value={code}>
              {PRODUCTS[code].name}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <label htmlFor={`${id}-q`} className="sr-only">
            {t("question")}
          </label>
          <Input
            id={`${id}-q`}
            name="question"
            required
            minLength={2}
            maxLength={300}
            placeholder={t("placeholder")}
          />
          <Button type="submit" variant="secondary" disabled={pending} aria-label={t("submit")}>
            {pending ? <Spinner label={t("submit")} /> : <Search aria-hidden />}
          </Button>
        </div>
      </form>
      <div aria-live="polite" className="grid gap-2">
        {result === null ? null : result.documents.length === 0 ? (
          <p className="text-fg-muted">{t("noDocuments")}</p>
        ) : result.excerpts.length === 0 ? (
          <p className="text-fg-muted">{t("none")}</p>
        ) : (
          result.excerpts.map((excerpt) => (
            <article
              key={`${excerpt.source.documentId}-${excerpt.heading}-${excerpt.text.slice(0, 20)}`}
              className="grid gap-1 border-l-2 border-pax-purple pl-3"
            >
              <p className="font-medium">{excerpt.heading}</p>
              <p className="text-paragraph-xs text-fg-muted">
                {excerpt.source.title} v{excerpt.source.version}
                {excerpt.page ? `, ${t("page", { page: excerpt.page })}` : ""}
              </p>
              <p className="line-clamp-6 whitespace-pre-line">{excerpt.text}</p>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
