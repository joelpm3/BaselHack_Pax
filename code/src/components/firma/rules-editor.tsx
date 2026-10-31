"use client";

import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { restoreRuleSet, type SaveRulesResult, saveRuleSet } from "@/app/[locale]/firma/actions";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { PRODUCT_CODES, PRODUCTS, type ProductCode } from "@/lib/domain/products";
import { RULE_ACTIONS, type RuleAction } from "@/lib/domain/taxonomy";
import type { RuleDraft, RuleSetDraft } from "@/lib/firma/rule-sets";
import { cn } from "@/lib/utils";

interface EditableRule extends RuleDraft {
  key: string;
}

const strip = (rules: EditableRule[]): RuleDraft[] =>
  rules.map(({ key: _key, ...rule }) => ({
    ...rule,
    text: rule.text.trim(),
    productCode: rule.action === "block_product" ? rule.productCode : null,
  }));

/**
 * Edits the active rule set. Nothing is changed in place: saving stores a new version and
 * activates it, so every past decision still points at the exact rules it used.
 */
export function RulesEditor({ initial, version }: { initial: RuleSetDraft; version: number }) {
  const t = useTranslations("firma.rules");
  const tAction = useTranslations("firma.taxonomy.ruleAction");
  const baseId = useId();
  const [leadHints, setLeadHints] = useState(initial.leadHints);
  const [rules, setRules] = useState<EditableRule[]>(() =>
    initial.rules.map((r, i) => ({ ...r, key: `r${i}` })),
  );
  const [counter, setCounter] = useState(initial.rules.length);
  const [result, setResult] = useState<SaveRulesResult | null>(null);
  const [pending, start] = useTransition();

  const draft: RuleSetDraft = { leadHints: leadHints.trim(), rules: strip(rules) };
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const invalid = draft.rules.some(
    (r) => r.text.length < 3 || (r.action === "block_product" && !r.productCode),
  );

  const update = (key: string, change: Partial<RuleDraft>) => {
    setResult(null);
    setRules((prev) => prev.map((r) => (r.key === key ? { ...r, ...change } : r)));
  };
  const moveRule = (index: number, delta: -1 | 1) => {
    setResult(null);
    setRules((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });
  };

  return (
    <div className="grid gap-6">
      <ol className="grid gap-3">
        {rules.map((rule, index) => {
          const id = `${baseId}-${rule.key}`;
          return (
            <li
              key={rule.key}
              className={cn(
                "grid gap-3 rounded-xl border border-line p-4 md:grid-cols-[2rem_minmax(0,1fr)_19rem]",
                !rule.active && "bg-gray-1",
              )}
            >
              <span className="text-lg font-bold text-fg-muted tabular-nums">{index + 1}</span>
              <div className="grid gap-1">
                <label htmlFor={`${id}-text`} className="sr-only">
                  {t("ruleText", { n: index + 1 })}
                </label>
                <Textarea
                  id={`${id}-text`}
                  value={rule.text}
                  onChange={(e) => update(rule.key, { text: e.target.value })}
                  aria-invalid={rule.text.trim().length < 3 || undefined}
                  className={cn("min-h-20 text-sm", !rule.active && "text-fg-muted")}
                  placeholder={t("placeholder")}
                />
              </div>
              <div className="grid content-start gap-2">
                <Select
                  aria-label={t("action")}
                  value={rule.action}
                  onChange={(e) => update(rule.key, { action: e.target.value as RuleAction })}
                  className="h-9 py-0 text-sm"
                >
                  {RULE_ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {tAction(a)}
                    </option>
                  ))}
                </Select>
                {rule.action === "block_product" ? (
                  <Select
                    aria-label={t("product")}
                    value={rule.productCode ?? ""}
                    onChange={(e) =>
                      update(rule.key, {
                        productCode: (e.target.value || null) as ProductCode | null,
                      })
                    }
                    aria-invalid={!rule.productCode || undefined}
                    className="h-9 py-0 text-sm"
                  >
                    <option value="">{t("chooseProduct")}</option>
                    {PRODUCT_CODES.map((code) => (
                      <option key={code} value={code}>
                        {PRODUCTS[code].name}
                      </option>
                    ))}
                  </Select>
                ) : null}
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={rule.active}
                    onChange={(e) => update(rule.key, { active: e.target.checked })}
                    className="size-4 accent-pax-purple"
                  />
                  {t("active")}
                </label>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2"
                    disabled={index === 0}
                    onClick={() => moveRule(index, -1)}
                    aria-label={t("moveUp")}
                  >
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-2"
                    disabled={index === rules.length - 1}
                    onClick={() => moveRule(index, 1)}
                    aria-label={t("moveDown")}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto px-2 text-error-dark"
                    onClick={() => {
                      setResult(null);
                      setRules((prev) => prev.filter((r) => r.key !== rule.key));
                    }}
                    aria-label={t("remove")}
                  >
                    <Trash aria-hidden />
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setResult(null);
            setRules((prev) => [
              ...prev,
              { key: `r${counter}`, text: "", action: "handover", productCode: null, active: true },
            ]);
            setCounter((c) => c + 1);
          }}
        >
          <Plus aria-hidden />
          {t("add")}
        </Button>
      </div>

      <div className="grid gap-2">
        <label htmlFor={`${baseId}-hints`} className="font-bold">
          {t("leadHints")}
        </label>
        <p className="text-fg-muted">{t("leadHintsHelp")}</p>
        <Textarea
          id={`${baseId}-hints`}
          value={leadHints}
          onChange={(e) => {
            setResult(null);
            setLeadHints(e.target.value);
          }}
          className="min-h-28 text-sm"
        />
      </div>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-surface px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <Button
          disabled={!dirty || invalid || pending}
          onClick={() =>
            start(async () => {
              setResult(await saveRuleSet(draft));
            })
          }
        >
          {t("save", { version: version + 1 })}
        </Button>
        <span aria-live="polite" className="text-fg-muted">
          {result?.status === "created"
            ? t("saved", { version: result.version })
            : result?.status === "unchanged"
              ? t("unchanged")
              : result?.status === "invalid"
                ? t("invalid")
                : invalid
                  ? t("invalid")
                  : dirty
                    ? t("unsaved")
                    : t("current", { version })}
        </span>
      </div>
    </div>
  );
}

export function RestoreVersionButton({
  ruleSetId,
  version,
}: {
  ruleSetId: string;
  version: number;
}) {
  const t = useTranslations("firma.rules");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SaveRulesResult | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setResult(await restoreRuleSet(ruleSetId));
          })
        }
      >
        <RotateCcw aria-hidden />
        {t("restore", { version })}
      </Button>
      {result?.status === "created" ? (
        <span className="text-fg-muted">{t("saved", { version: result.version })}</span>
      ) : null}
    </div>
  );
}
