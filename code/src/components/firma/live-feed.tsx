"use client";

import {
  Bot,
  Handshake,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Target,
  UserRound,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { type LiveEvent, useLiveEvents } from "./live-events";

const SHOWN = new Set([
  "conversation.started",
  "conversation.message",
  "analysis.updated",
  "lead.upserted",
  "handover.created",
]);
const MAX_ITEMS = 40;

interface FeedItem extends LiveEvent {
  id: number;
}

/** Ticker of what is happening right now, newest first. Lives only in the browser tab. */
export function LiveFeed({ labels }: { labels: Record<string, string> }) {
  const t = useTranslations("firma.live.feed");
  const format = useFormatter();
  const [items, setItems] = useState<FeedItem[]>([]);
  const counter = useRef(0);

  useLiveEvents((event) => {
    if (!SHOWN.has(event.type)) return;
    counter.current += 1;
    const item = { ...event, id: counter.current };
    setItems((prev) => [item, ...prev].slice(0, MAX_ITEMS));
  });

  const describe = (e: FeedItem): { icon: ReactNode; text: ReactNode } => {
    switch (e.type) {
      case "conversation.started":
        return {
          icon: e.isSimulated ? <Bot className="size-4" /> : <Sparkles className="size-4" />,
          text: e.isSimulated ? t("startedSimulated") : t("started"),
        };
      case "conversation.message":
        return {
          icon:
            e.role === "user" ? (
              <UserRound className="size-4" />
            ) : (
              <MessageSquare className="size-4" />
            ),
          text: (
            <>
              <span className="font-medium">
                {e.role === "user" ? t("customer") : t("advisor")}:
              </span>{" "}
              <span className="text-fg-muted">{e.preview}</span>
            </>
          ),
        };
      case "analysis.updated":
        return { icon: <RefreshCw className="size-4" />, text: t("analysis") };
      case "lead.upserted":
        return { icon: <Target className="size-4" />, text: t("lead") };
      default:
        return { icon: <Handshake className="size-4" />, text: t("handover") };
    }
  };

  return (
    <section aria-label={t("title")} className="grid content-start gap-3">
      <h2 className="text-base font-bold">{t("title")}</h2>
      {items.length === 0 ? (
        <p className="rounded-xl bg-gray-1 px-4 py-6 text-fg-muted">{t("waiting")}</p>
      ) : (
        <ol
          className="grid gap-px overflow-hidden rounded-xl border border-line bg-gray-2"
          aria-live="polite"
        >
          {items.map((e) => {
            const { icon, text } = describe(e);
            const label = e.conversationId
              ? (labels[e.conversationId] ?? t("newConversation"))
              : null;
            return (
              <li key={e.id} className="grid gap-1 bg-surface px-3 py-2.5">
                <div className="flex items-center gap-2 text-xs text-fg-muted">
                  <span aria-hidden className="text-pax-purple">
                    {icon}
                  </span>
                  <time className="tabular-nums">
                    {format.dateTime(new Date(e.at), {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </time>
                  {label && e.conversationId ? (
                    <Link
                      href={`/firma/gespraeche/${e.conversationId}`}
                      className="min-w-0 truncate hover:underline"
                    >
                      {label}
                    </Link>
                  ) : null}
                </div>
                <p className="line-clamp-2">{text}</p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** Briefly tints its content when `token` changes (e.g. a conversation reached a new stage). */
export function Flash({
  token,
  children,
  className,
}: {
  token: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const previous = useRef(token);
  useEffect(() => {
    if (previous.current === token) return;
    previous.current = token;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    ref.current?.animate(
      [{ backgroundColor: "#e3f2c5" }, { backgroundColor: "rgba(227, 242, 197, 0)" }],
      {
        duration: 2400,
        easing: "ease-out",
      },
    );
  }, [token]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
