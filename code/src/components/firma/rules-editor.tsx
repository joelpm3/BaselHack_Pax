"use client";

import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { restoreRuleSet, type SaveRulesResult, saveRuleSet } from "@/app/[locale]/firma/actions";
import { saveRuleSetWithProposal } from "@/app/[locale]/firma/learning-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
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

/** The effect of a rule is its colour: the square marker and the effect pill share it. */
const ACTION_TONE: Record<RuleAction, { square: string; pill: string }> = {
  handover: { square: "bg-pax-purple text-white", pill: "bg-light-purple text-deep-purple" },
  flag: { square: "bg-pax-green text-deep-green", pill: "bg-light-green text-deep-green" },
  block_product: { square: "bg-error-dark text-white", pill: "bg-error-light text-error-dark" },
};

/** One surface, rules separated by hairlines: the rule set reads as one document. */
export const ruleListClasses = "divide-y divide-line overflow-hidden rounded-xl border border-line";
export const ruleRowClasses = "grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-4 px-4 py-4 sm:px-5";

/** The Pax square with the rule's position; filled in its effect colour, outlined when off. */
export function RuleMarker({
  n,
  action,
  active,
}: {
  n: number;
  action: RuleAction;
  active: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 grid size-7 place-items-center rounded-sm text-paragraph-xs font-bold tabular-nums",
        active ? ACTION_TONE[action].square : "border-[1.5px] border-gray-4 text-fg-muted",
      )}
    >
      {n}
    </span>
  );
}

/** Active rules per effect, doubling as the legend for the square colours. */
export function RuleSummary({ rules }: { rules: RuleDraft[] }) {
  const t = useTranslations("firma.rules");
  const off = rules.filter((r) => !r.active).length;
  return (
    <ul
      aria-label={t("summaryLabel")}
      className="flex flex-wrap gap-x-5 gap-y-1.5 text-paragraph-s text-fg-muted"
    >
      {RULE_ACTIONS.map((action) => {
        const count = rules.filter((r) => r.active && r.action === action).length;
        if (count === 0) return null;
        return (
          <li key={action} className="flex items-center gap-2">
            <span aria-hidden className={cn("size-3 rounded-[2px]", ACTION_TONE[action].square)} />
            {t(`summary.${action}`, { count })}
          </li>
        );
      })}
      {off > 0 ? (
        <li className="flex items-center gap-2">
          <span aria-hidden className="size-3 rounded-[2px] border-[1.5px] border-gray-4" />
          {t("summary.inactive", { count: off })}
        </li>
      ) : null}
    </ul>
  );
}

const pillSelect =
  "pax-select h-8 cursor-pointer rounded-full border-0 [field-sizing:content] bg-[position:right_0.6rem_center] pr-8 pl-3 text-paragraph-xs font-medium focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pax-green";

const iconButton =
  "grid size-8 place-items-center rounded-full text-fg-subtle transition-colors hover:bg-gray-1 hover:text-fg disabled:pointer-events-none disabled:opacity-30 [&_svg]:size-4";

/**
 * Edits the active rule set. Nothing is changed in place: saving stores a new version and
 * activates it, so every past decision still points at the exact rules it used.
 */
const PROPOSAL_KEY = "proposal";

export function RulesEditor({
  initial,
  version,
  proposal,
}: {
  initial: RuleSetDraft;
  version: number;
  /** An accepted improvement proposal, added as an unsaved rule until the version is saved. */
  proposal?: { id: string; rule: RuleDraft };
}) {
  const t = useTranslations("firma.rules");
  const tDraft = useTranslations("learning.ruleDraft");
  const tAction = useTranslations("firma.taxonomy.ruleAction");
  const baseId = useId();
  const [leadHints, setLeadHints] = useState(initial.leadHints);
  const [rules, setRules] = useState<EditableRule[]>(() => [
    ...initial.rules.map((r, i) => ({ ...r, key: `r${i}` })),
    ...(proposal ? [{ ...proposal.rule, key: PROPOSAL_KEY }] : []),
  ]);
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
    <div className="grid gap-8">
      <div className="grid gap-4">
        <RuleSummary rules={draft.rules} />
        <ol className={ruleListClasses}>
          {rules.map((rule, index) => {
            const id = `${baseId}-${rule.key}`;
            const isProposal = rule.key === PROPOSAL_KEY;
            return (
              <li key={rule.key} className={cn(ruleRowClasses, isProposal && "bg-info-light")}>
                <RuleMarker n={index + 1} action={rule.action} active={rule.active} />
                <div className="grid min-w-0 gap-2.5">
                  {isProposal ? (
                    <Badge tone="info" className="justify-self-start">
                      {tDraft("proposed")}
                    </Badge>
                  ) : null}
                  <label htmlFor={`${id}-text`} className="sr-only">
                    {t("ruleText", { n: index + 1 })}
                  </label>
                  <textarea
                    id={`${id}-text`}
                    rows={2}
                    value={rule.text}
                    onChange={(e) => update(rule.key, { text: e.target.value })}
                    aria-invalid={rule.text.trim().length < 3 || undefined}
                    placeholder={t("placeholder")}
                    className={cn(
                      "-mx-2 -my-1 max-w-[68ch] resize-none rounded-m bg-transparent px-2 py-1 text-paragraph-m text-fg [field-sizing:content] placeholder:text-fg-subtle hover:bg-gray-1 focus:bg-surface focus:outline-[1.5px] focus:outline-pax-purple focus:outline-solid aria-invalid:outline-[1.5px] aria-invalid:outline-error aria-invalid:outline-solid",
                      !rule.active && "text-fg-muted",
                    )}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={t("action")}
                      value={rule.action}
                      onChange={(e) => update(rule.key, { action: e.target.value as RuleAction })}
                      className={cn(
                        pillSelect,
                        rule.active ? ACTION_TONE[rule.action].pill : "bg-gray-2 text-gray-7",
                      )}
                    >
                      {RULE_ACTIONS.map((a) => (
                        <option key={a} value={a}>
                          {tAction(a)}
                        </option>
                      ))}
                    </select>
                    {rule.action === "block_product" ? (
                      <select
                        aria-label={t("product")}
                        value={rule.productCode ?? ""}
                        onChange={(e) =>
                          update(rule.key, {
                            productCode: (e.target.value || null) as ProductCode | null,
                          })
                        }
                        aria-invalid={!rule.productCode || undefined}
                        className={cn(
                          pillSelect,
                          "bg-gray-2 text-gray-7 aria-invalid:outline-[1.5px] aria-invalid:outline-error aria-invalid:outline-solid",
                        )}
                      >
                        <option value="">{t("chooseProduct")}</option>
                        {PRODUCT_CODES.map((code) => (
                          <option key={code} value={code}>
                            {PRODUCTS[code].name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <div className="ml-auto flex items-center gap-0.5">
                      <ActiveSwitch
                        checked={rule.active}
                        onChange={(active) => update(rule.key, { active })}
                        label={t("active")}
                      />
                      <button
                        type="button"
                        className={iconButton}
                        disabled={index === 0}
                        onClick={() => moveRule(index, -1)}
                        aria-label={t("moveUp")}
                      >
                        <ArrowUp aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={iconButton}
                        disabled={index === rules.length - 1}
                        onClick={() => moveRule(index, 1)}
                        aria-label={t("moveDown")}
                      >
                        <ArrowDown aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={cn(iconButton, "hover:bg-error-light hover:text-error-dark")}
                        onClick={() => {
                          setResult(null);
                          setRules((prev) => prev.filter((r) => r.key !== rule.key));
                        }}
                        aria-label={t("remove")}
                      >
                        <Trash aria-hidden />
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              className={cn(
                ruleRowClasses,
                "w-full items-center text-left font-medium text-fg-muted transition-colors hover:bg-gray-1 hover:text-fg",
              )}
              onClick={() => {
                setResult(null);
                setRules((prev) => [
                  ...prev,
                  {
                    key: `r${counter}`,
                    text: "",
                    action: "handover",
                    productCode: null,
                    active: true,
                  },
                ]);
                setCounter((c) => c + 1);
              }}
            >
              <span
                aria-hidden
                className="grid size-7 place-items-center rounded-sm border-[1.5px] border-dashed border-gray-4"
              >
                <Plus className="size-4" />
              </span>
              {t("add")}
            </button>
          </li>
        </ol>
      </div>

      <section className="grid max-w-[68ch] gap-2">
        <label htmlFor={`${baseId}-hints`} className="text-paragraph-m font-bold">
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
          className="min-h-28 text-paragraph-s [field-sizing:content]"
        />
      </section>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <span
          aria-live="polite"
          className={cn(
            "flex items-center gap-2",
            invalid || result?.status === "invalid"
              ? "text-error-dark"
              : dirty && !result
                ? "font-medium text-deep-purple"
                : "text-fg-muted",
          )}
        >
          {dirty && !result ? (
            <span aria-hidden className="size-2 rounded-[2px] bg-pax-purple" />
          ) : null}
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
        <Button
          disabled={!dirty || invalid || pending}
          onClick={() =>
            start(async () => {
              const withProposal = proposal && rules.some((r) => r.key === PROPOSAL_KEY);
              setResult(
                withProposal
                  ? await saveRuleSetWithProposal(draft, proposal.id)
                  : await saveRuleSet(draft),
              );
            })
          }
        >
          {t("save", { version: version + 1 })}
        </Button>
      </div>
    </div>
  );
}

function ActiveSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="mr-1 inline-flex h-8 cursor-pointer items-center gap-2 rounded-full px-2 text-paragraph-xs text-fg-muted hover:bg-gray-1">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        aria-checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative h-5 w-9 rounded-full bg-gray-4 transition-colors peer-checked:bg-pax-purple peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-pax-green after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4"
      />
      {label}
    </label>
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
