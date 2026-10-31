"use client";

import { type DynamicToolUIPart, getToolName, type ToolUIPart } from "ai";
import type { ComponentType } from "react";
import { DocumentReviewWidget, DocumentUploadPrompt } from "./document-widgets";
import { FeedbackWidget } from "./feedback-widget";
import { HandoverWidget } from "./handover-widget";
import { PensionOverviewWidget } from "./pension-overview";
import { ProfileCard } from "./profile-card";
import { RiskAnalysisWidget } from "./risk-analysis";
import { salesWidgets } from "./sales";
import { SavingsPlanWidget } from "./savings-plan";
import { ScenarioWidget } from "./scenario-widget";
import { TaxSavingsWidget } from "./tax-savings";
import type { WidgetProps } from "./types";

/** Tool name → widget. Tools without an entry (suggestReplies) render nothing inline. */
export const widgetRegistry: Record<string, ComponentType<WidgetProps>> = {
  updateProfile: ProfileCard,
  showPensionOverview: PensionOverviewWidget,
  showRiskAnalysis: RiskAnalysisWidget,
  simulateScenario: ScenarioWidget,
  calculateTaxSavings: TaxSavingsWidget,
  suggestDocumentUpload: DocumentUploadPrompt,
  reviewDocuments: DocumentReviewWidget,
  requestHandover: HandoverWidget,
  askForFeedback: FeedbackWidget,
  calculateSavingsPlan: SavingsPlanWidget,
  ...salesWidgets,
};

/**
 * Widgets that wait for the customer (forms, uploads). They are shown after the advisor's text
 * of the same message, even when the model called the tool before writing.
 */
export const WAITING_WIDGETS = new Set([
  "suggestDocumentUpload",
  "reviewDocuments",
  "requestHandover",
  "askForFeedback",
  "startSuitabilityCheck",
  "prepareOffer",
]);

function widgetState(part: ToolUIPart | DynamicToolUIPart): WidgetProps["state"] {
  switch (part.state) {
    case "input-streaming":
      return "input-streaming";
    case "output-available":
      return "output-available";
    case "output-error":
    case "output-denied":
      return "output-error";
    default:
      return "input-available";
  }
}

/** Renders one tool part through the registry, with consistent loading/error states. */
export function ToolPartView({ part }: { part: ToolUIPart | DynamicToolUIPart }) {
  const Widget = widgetRegistry[getToolName(part)];
  // A call with invalid input is retried by the advisor; only the retry is shown.
  if (!Widget || (part.state === "output-error" && part.errorText === "invalid_tool_call"))
    return null;
  const state = widgetState(part);
  return (
    <Widget
      toolCallId={part.toolCallId}
      state={state}
      input={part.input}
      output={state === "output-available" ? part.output : undefined}
      errorText={part.state === "output-error" ? part.errorText : undefined}
    />
  );
}
