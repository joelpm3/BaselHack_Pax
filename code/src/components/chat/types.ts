import type { UIMessage } from "ai";
import type { AdvisorMessageMetadata } from "@/lib/advisor/types";

export type ChatMessage = UIMessage<AdvisorMessageMetadata>;
