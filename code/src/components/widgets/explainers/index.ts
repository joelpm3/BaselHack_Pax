import type { ComponentType } from "react";
import type { WidgetProps } from "../types";
import { CompoundInterestWidget } from "./compound-interest-widget";
import { DrawdownWidget } from "./drawdown-widget";
import { LifePlanWidget } from "./life-plan-widget";
import { ReferencesCard } from "./references-card";

/** Explainer tools (lib/advisor/tools/explainers.ts) → widget. */
export const explainerWidgets: Record<string, ComponentType<WidgetProps>> = {
  explainCompoundInterest: CompoundInterestWidget,
  showLifePlan: LifePlanWidget,
  calculateCapitalDrawdown: DrawdownWidget,
  showReferences: ReferencesCard,
};
