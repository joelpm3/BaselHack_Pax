"use client";

import type { ComponentType } from "react";
import type { WidgetProps } from "../types";
import { OfferWidget } from "./offer-widget";
import { RecommendationWidget } from "./recommendation-widget";
import { SuitabilityWidget } from "./suitability-widget";

/** CONTRACT (owned by the pricing/sales area): tool name → widget component. */
export const salesWidgets: Record<string, ComponentType<WidgetProps>> = {
  recommendProducts: RecommendationWidget,
  startSuitabilityCheck: SuitabilityWidget,
  prepareOffer: OfferWidget,
};
