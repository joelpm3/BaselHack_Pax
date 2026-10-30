"use client";

import { getToolName, isToolUIPart } from "ai";
import { Mic, Paperclip } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import { ToolPartView, WAITING_WIDGETS } from "@/components/widgets/registry";
import type { AdvisorMessageMetadata } from "@/lib/advisor/types";
import { Markdown } from "./markdown";
import type { ChatMessage } from "./types";

/** The Pax square as the advisor's mark. */
function AdvisorMark() {
  return <span aria-hidden className="mt-2 block size-2.5 shrink-0 bg-pax-purple" />;
}

function UserMessage({ message }: { message: ChatMessage }) {
  const t = useTranslations("chat.message");
  const metadata = message.metadata as AdvisorMessageMetadata | undefined;
  const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("\n");
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-[16px] rounded-br-sm bg-light-purple px-4 py-2.5 text-deep-purple">
        <p className="sr-only">{t("you")}</p>
        <p className="whitespace-pre-wrap break-words">{text}</p>
        {metadata?.inputMode === "voice" || metadata?.inputMode === "upload" ? (
          <p className="mt-1 flex items-center gap-1 text-paragraph-xs opacity-70">
            {metadata.inputMode === "voice" ? (
              <Mic aria-hidden className="size-3" />
            ) : (
              <Paperclip aria-hidden className="size-3" />
            )}
            {t(metadata.inputMode)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Keeps the transcript order but moves widgets that wait for the customer to the end. */
function orderParts(parts: ChatMessage["parts"]) {
  const indexed = parts.map((part, i) => ({ part, i }));
  const waits = ({ part }: (typeof indexed)[number]) =>
    isToolUIPart(part) && WAITING_WIDGETS.has(getToolName(part));
  return [...indexed.filter((p) => !waits(p)), ...indexed.filter(waits)];
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  const t = useTranslations("chat.message");
  return (
    <div className="flex gap-3">
      <AdvisorMark />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <p className="sr-only">{t("advisor")}</p>
        {orderParts(message.parts).map(({ part, i }) => {
          if (part.type === "text") {
            return part.text.trim() ? <Markdown key={`text-${i}`} text={part.text} /> : null;
          }
          if (isToolUIPart(part)) return <ToolPartView key={part.toolCallId} part={part} />;
          return null;
        })}
      </div>
    </div>
  );
}

export const MessageView = memo(function MessageView({ message }: { message: ChatMessage }) {
  return message.role === "user" ? (
    <UserMessage message={message} />
  ) : (
    <AssistantMessage message={message} />
  );
});
