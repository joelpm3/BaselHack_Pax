import "server-only";
import type { ToolSet } from "ai";
import type { ToolContext } from "./context";

/**
 * CONTRACT (owned by the pricing/sales area): recommendation → suitability → offer → signature
 * tools. Expected tool names: `recommendProducts`, `startSuitabilityCheck`, `prepareOffer`.
 * The advisor area merges these into its tool set and renders them via `salesWidgets`.
 */
export function createSalesTools(_context: ToolContext): ToolSet {
  return {};
}
