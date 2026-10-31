import type { CapitalPayoutTaxOutput } from "@/lib/advisor/capital-payout";
import type {
  FeedbackOutput,
  HandoverOutput,
  IncomeBreakdown,
  PensionOverviewOutput,
  ProfileFieldChange,
  QuickRepliesOutput,
  RiskAnalysisOutput,
  ScenarioOutput,
  TaxSavingsOutput,
  UpdateProfileOutput,
} from "@/lib/advisor/types";
import type { OfferOutput, RecommendOutput, SuitabilityOutput } from "@/lib/sales/types";

/**
 * One readable line per advisor tool call for the company transcript. `key` selects the
 * message `firma.conversation.transcript.tools.<key>`; `amounts` are CHF values the caller
 * formats; `changes` carries profile updates for the shared profile formatter.
 */
export interface ToolLine {
  key: string;
  values: Record<string, string | number>;
  amounts: Record<string, number>;
  changes?: ProfileFieldChange[];
}

function line(
  key: string,
  values: ToolLine["values"] = {},
  amounts: ToolLine["amounts"] = {},
): ToolLine {
  return { key, values, amounts };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function missingLine(output: { missing?: unknown }): ToolLine {
  const missing = Array.isArray(output.missing) ? output.missing.map(String) : [];
  return line("missing", { fields: missing.join(", ") });
}

const monthly = (b: IncomeBreakdown) => Math.round(b.gap / 12);

/** Summarises a finished tool call; `null` when the tool or its output shape is unknown. */
export function summarizeTool(name: string, output: unknown): ToolLine | null {
  if (!isObject(output)) {
    if (name === "suggestDocumentUpload") return line("documentUpload");
    return null;
  }
  switch (name) {
    case "updateProfile": {
      const o = output as unknown as UpdateProfileOutput;
      if (o.status !== "ok") return line("profileInvalid");
      const changes = Array.isArray(o.changes) ? o.changes : [];
      // A town the customer picked in the card afterwards (8165 → Schleinikon) is only in `location`.
      const picked =
        o.location && !changes.some((c) => c.path === "residence.city")
          ? [
              { path: "residence.zip", value: o.location.zip },
              { path: "residence.city", value: o.location.city },
            ]
          : [];
      return { ...line("profile"), changes: [...changes, ...picked] };
    }
    case "showRiskAnalysis": {
      const o = output as unknown as RiskAnalysisOutput;
      if (o.status !== "ok") return missingLine(o);
      const gaps = o.persons.flatMap((p) => p.scenarios.map((s) => monthly(s.breakdown)));
      const largest = Math.max(0, ...gaps);
      return largest > 0 ? line("risk", {}, { gap: largest }) : line("riskCovered");
    }
    case "showPensionOverview": {
      const o = output as unknown as PensionOverviewOutput;
      if (o.status !== "ok") return missingLine(o);
      const gap = monthly(o.breakdown);
      return gap > 0
        ? line("pension", { age: o.retirementAge }, { gap })
        : line("pensionCovered", { age: o.retirementAge });
    }
    case "calculateTaxSavings": {
      const o = output as unknown as TaxSavingsOutput;
      if (o.status !== "ok") return missingLine(o);
      return line(
        "tax",
        {},
        { amount: o.saving3a.yearlyAmount, saving: o.saving3a.yearlyTaxSavings },
      );
    }
    case "calculateCapitalPayoutTax": {
      const o = output as unknown as CapitalPayoutTaxOutput;
      if (o.status !== "ok") return missingLine(o);
      return line("capitalTax", {}, { amount: o.totalAmount, tax: o.totalTax });
    }
    case "simulateScenario": {
      const o = output as unknown as ScenarioOutput;
      if (o.status !== "ok") return { ...missingLine(o), key: "scenarioMissing" };
      return line("scenario", { scenario: o.scenario });
    }
    case "calculateSavingsPlan": {
      const params = isObject(output.params) ? output.params : {};
      return line(
        "savingsPlan",
        { years: Number(params.years) },
        { goal: Number(params.goal), monthly: Number(output.monthly) },
      );
    }
    case "recommendProducts": {
      const o = output as unknown as RecommendOutput;
      if (o.status === "needs_analysis") return line("recommendHeldBack");
      if (o.status !== "ok") return missingLine(o);
      return line("recommend", {
        count: o.recommendations.length,
        products: o.recommendations.map((r) => r.productName).join(", "),
      });
    }
    case "startSuitabilityCheck": {
      const o = output as unknown as SuitabilityOutput;
      if (o.record) {
        return line("suitabilityDone", { product: o.productName, points: o.record.result.total });
      }
      return line("suitability", { product: o.productName });
    }
    case "prepareOffer": {
      const o = output as unknown as OfferOutput;
      if (!o.offer) return line("offerUnavailable", { status: o.status });
      const product = o.offer.productName;
      if (o.signed) return line("offerSigned", { product, policy: o.signed.policyNumber });
      return line("offer", { product }, { premium: o.offer.price.annualGross });
    }
    case "reviewDocuments": {
      const extractions = Array.isArray(output.extractions) ? output.extractions : [];
      const names = extractions
        .filter(isObject)
        .map((e) => String(e.filename ?? ""))
        .filter(Boolean);
      return line("documents", { count: names.length, files: names.join(", ") });
    }
    case "requestHandover": {
      const o = output as unknown as HandoverOutput;
      return line(o.booked ? "handoverBooked" : "handover", { reason: o.reason });
    }
    case "askForFeedback": {
      const o = output as unknown as FeedbackOutput;
      return o.submitted ? line("feedbackGiven", { nps: o.submitted.nps }) : line("feedback");
    }
    case "suggestReplies": {
      const o = output as unknown as QuickRepliesOutput;
      const options = Array.isArray(o.options) ? o.options : [];
      return line("replies", { options: options.map((x) => `«${x}»`).join(", ") });
    }
    case "suggestDocumentUpload":
      return line("documentUpload");
    default:
      return null;
  }
}
