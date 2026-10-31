import "server-only";
import type { ToolSet } from "ai";
import { createAnalysisTools } from "./analysis";
import { createCapitalPayoutTools } from "./capital-payout";
import type { ToolContext } from "./context";
import { createDocumentTools } from "./documents";
import { createHandoverTools } from "./handover";
import { createProfileTools } from "./profile";
import { createSalesTools } from "./sales";
import { createScenarioTools } from "./scenario";

/** The advisor's full tool set: its own tools plus the sales tools of the pricing area. */
export function createAdvisorTools(ctx: ToolContext): ToolSet {
  return {
    ...createProfileTools(ctx),
    ...createAnalysisTools(ctx),
    ...createCapitalPayoutTools(ctx),
    ...createScenarioTools(ctx),
    ...createDocumentTools(ctx),
    ...createHandoverTools(ctx),
    ...createSalesTools(ctx),
  };
}

/**
 * Tools whose widget waits for the customer (a form, an upload, a choice). The turn ends right
 * after them so the advisor does not talk over the widget.
 */
export const WAITS_FOR_CUSTOMER = [
  "suggestDocumentUpload",
  "reviewDocuments",
  "requestHandover",
  "askForFeedback",
  "suggestReplies",
  "startSuitabilityCheck",
  "prepareOffer",
];
