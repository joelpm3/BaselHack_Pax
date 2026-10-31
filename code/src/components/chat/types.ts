import type { UIMessage } from "ai";
import type { AdvisorDataParts, AdvisorMessageMetadata } from "@/lib/advisor/types";

export type ChatMessage = UIMessage<AdvisorMessageMetadata, AdvisorDataParts>;
