"use client";

import type { ComponentType } from "react";
import type { WidgetProps } from "../types";

/** CONTRACT (owned by the pricing/sales area): tool name → widget component. */
export const salesWidgets: Record<string, ComponentType<WidgetProps>> = {};
