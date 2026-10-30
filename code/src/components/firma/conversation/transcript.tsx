import { FileText, Mic, Wrench } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import type { ConversationDetail } from "@/lib/firma/conversations";
import { compactJson, messageItems, type ToolSummary } from "@/lib/insights/transcript";
import { cn } from "@/lib/utils";
import { SimpleMarkdown } from "./simple-markdown";

/** `recommendProducts` → `Recommend products`. */
function humanizeToolName(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function pretty(value: unknown): string {
  if (value === null || value === undefined) return "–";
  const text = JSON.stringify(value, null, 2);
  return text.length > 4000 ? `${text.slice(0, 4000)}\n…` : text;
}

async function ToolCall({ tool }: { tool: ToolSummary }) {
  const t = await getTranslations("firma.conversation.transcript");
  const failed = tool.state === "output-error" || Boolean(tool.errorText);
  const done = tool.state === "output-available";
  return (
    <details className="group rounded-m border border-line bg-gray-1 text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <Wrench aria-hidden className="size-3.5 shrink-0 text-pax-purple" />
        <span className="font-medium">{humanizeToolName(tool.name)}</span>
        <span className="min-w-0 flex-1 truncate text-fg-muted">
          {failed ? tool.errorText : compactJson(tool.output ?? tool.input, 120)}
        </span>
        <Badge tone={failed ? "error" : done ? "success" : "neutral"}>
          {failed ? t("toolFailed") : done ? t("toolDone") : t("toolPending")}
        </Badge>
      </summary>
      <div className="grid gap-2 border-t border-line px-3 py-2">
        <div>
          <p className="mb-1 font-medium text-fg-muted">{t("input")}</p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words">
            {pretty(tool.input)}
          </pre>
        </div>
        <div>
          <p className="mb-1 font-medium text-fg-muted">{t("output")}</p>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words">
            {tool.errorText ?? pretty(tool.output)}
          </pre>
        </div>
      </div>
    </details>
  );
}

export async function Transcript({ messages }: { messages: ConversationDetail["messages"] }) {
  const [t, format] = await Promise.all([
    getTranslations("firma.conversation.transcript"),
    getFormatter(),
  ]);
  if (messages.length === 0) return <p className="text-fg-muted">{t("empty")}</p>;
  return (
    <ol className="grid gap-4">
      {messages
        .filter((m) => m.role !== "system")
        .map((m) => {
          const isCustomer = m.role === "user";
          const items = messageItems(m.parts);
          return (
            <li
              key={m.id}
              className={cn(
                "flex min-w-0 flex-col gap-1.5",
                isCustomer ? "items-end" : "items-start",
              )}
            >
              <div className="flex items-center gap-2 text-xs text-fg-muted">
                <span className="font-medium text-fg">
                  {isCustomer ? t("customer") : t("advisor")}
                </span>
                {m.inputMode === "voice" ? (
                  <Mic aria-label={t("voice")} className="size-3.5" />
                ) : null}
                <time className="tabular-nums">
                  {format.dateTime(m.createdAt, {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </time>
              </div>
              <div
                className={cn(
                  "flex w-full max-w-[42rem] min-w-0 flex-col gap-2",
                  isCustomer ? "items-end" : "items-start",
                )}
              >
                {items.map((item, i) => {
                  const key = `${m.id}-${i}`;
                  if (item.kind === "text") {
                    return (
                      <div
                        key={key}
                        className={cn(
                          "grid max-w-full gap-2 rounded-xl px-4 py-2.5 break-words",
                          isCustomer
                            ? "rounded-br-sm bg-pax-purple text-white"
                            : "rounded-bl-sm bg-gray-1",
                        )}
                      >
                        <SimpleMarkdown text={item.text} />
                      </div>
                    );
                  }
                  if (item.kind === "file") {
                    return (
                      <p key={key} className="flex items-center gap-2 text-fg-muted">
                        <FileText aria-hidden className="size-4" />
                        {item.filename ?? item.mediaType}
                      </p>
                    );
                  }
                  return (
                    <div key={key} className="w-full">
                      <ToolCall tool={item.tool} />
                    </div>
                  );
                })}
              </div>
            </li>
          );
        })}
    </ol>
  );
}
