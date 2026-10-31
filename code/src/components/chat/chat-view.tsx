"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { focusReducer, initialFocus } from "@/components/vorsorgebild/focus";
import { VorsorgebildPanel } from "@/components/vorsorgebild/vorsorgebild-panel";
import { VorsorgebildStrip } from "@/components/vorsorgebild/vorsorgebild-strip";
import { answerMood, type RequestMood } from "@/lib/advisor/mood";
import { topicOfMessage } from "@/lib/advisor/picture-topic";
import { quickRepliesOf } from "@/lib/advisor/quick-replies";
import type { AdvisorMessageMetadata, PictureKind, VorsorgebildModel } from "@/lib/advisor/types";
import { type ChatActions, ChatActionsProvider } from "./chat-actions";
import { type ClaraTurn, Composer, useEffectiveInputMode } from "./composer";
import { MessageView } from "./message-view";
import { PictureProvider } from "./picture-context";
import type { ChatMessage } from "./types";
import { VoiceInvite } from "./voice-invite";

export interface ChatViewProps {
  conversationId: string;
  initialMessages: ChatMessage[];
  initialPicture: VorsorgebildModel;
}

function quickRepliesOfMessage(message: ChatMessage | undefined): string[] {
  // Filtered here too: messages stored before the server-side filter may still carry them.
  return message?.role === "assistant" ? quickRepliesOf(message.parts) : [];
}

/** The advisor chat with the live Vorsorgebild (side panel on desktop, strip + sheet on mobile). */
export function ChatView({ conversationId, initialMessages, initialPicture }: ChatViewProps) {
  const t = useTranslations("chat");
  const [picture, setPicture] = useState(initialPicture);
  // The situation the Vorsorgebild shows follows Clara's latest message (see picture-topic).
  const [focus, dispatchFocus] = useReducer(focusReducer, initialMessages, (messages) =>
    initialFocus(topicOfMessage(messages.findLast((m) => m.role === "assistant")?.parts ?? [])),
  );
  const selectSituation = useCallback(
    (kind: PictureKind) => dispatchFocus({ type: "pick", kind }),
    [],
  );
  const stickToBottom = useRef(true);
  const logRef = useRef<HTMLOListElement>(null);
  // How the customer's latest message reads (sent by the server once classified).
  const [requestMood, setRequestMood] = useState<RequestMood>("neutral");

  const refreshPicture = useCallback(() => {
    fetch(`/api/chat/${conversationId}/vorsorgebild`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<VorsorgebildModel>) : null))
      .then((model) => model && setPicture(model))
      .catch(() => {});
  }, [conversationId]);

  const [transport] = useState(
    () =>
      new DefaultChatTransport<ChatMessage>({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ id, messages, trigger }) => ({
          body: { id, message: messages.at(-1), trigger },
        }),
      }),
  );

  const { messages, sendMessage, status, error, regenerate, stop } = useChat<ChatMessage>({
    id: conversationId,
    messages: initialMessages,
    transport,
    throttle: 50,
    onData: (part) => {
      if (part.type === "data-mood") setRequestMood(part.data);
    },
    onFinish: ({ message, isError, isAbort }) => {
      refreshPicture();
      // Once per finished answer, never on a re-render; a stopped answer is not finished.
      if (!isError && !isAbort)
        dispatchFocus({ type: "advisor", kind: topicOfMessage(message.parts) });
    },
  });

  const busy = status === "submitted" || status === "streaming";

  const send = useCallback(
    (text: string, metadata: AdvisorMessageMetadata) => {
      stickToBottom.current = true;
      dispatchFocus({ type: "send" });
      setRequestMood("neutral");
      void sendMessage({ text, metadata });
    },
    [sendMessage],
  );

  const chatActions = useMemo<ChatActions>(
    () => ({
      conversationId,
      busy,
      sendMessage: (text, metadata) =>
        send(text, { inputMode: "widget", ...(metadata as AdvisorMessageMetadata | undefined) }),
    }),
    [conversationId, busy, send],
  );
  const pictureActions = useMemo(() => ({ setPicture, refreshPicture }), [refreshPicture]);

  // Every input is known but nothing is calculated yet (e.g. an existing customer opening a new
  // conversation, or a corrected value): the route runs the checks, no turn needed.
  useEffect(() => {
    if (picture.pending) refreshPicture();
  }, [picture.pending, refreshPicture]);

  // Follow the transcript while it grows (streaming, widgets loading) unless the person scrolled
  // up, but never past the start of Clara's latest reply: a long answer stays readable from its
  // first line instead of scrolling it away. On open, ignore scroll events until they interact:
  // the router's scroll reset and widgets settling would otherwise leave a reopened conversation
  // at the greeting.
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    let settling = true;
    const intents = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    const settle = () => {
      settling = false;
      for (const type of intents) window.removeEventListener(type, settle);
    };
    for (const type of intents) window.addEventListener(type, settle, { passive: true });
    const timer = window.setTimeout(settle, 2000);

    const toBottom = () => {
      const bottom = document.documentElement.scrollHeight;
      const items = log.querySelectorAll<HTMLElement>(":scope > li[data-role]");
      const start = items[items.length - 1];
      if (start?.dataset.role !== "assistant") return window.scrollTo({ top: bottom });
      const replyTop =
        start.getBoundingClientRect().top +
        window.scrollY -
        Number.parseFloat(getComputedStyle(start).scrollMarginTop);
      window.scrollTo({ top: Math.min(bottom, replyTop) });
    };
    const onScroll = () => {
      if (settling) return;
      const distance = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      stickToBottom.current = distance < 160;
    };
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) toBottom();
    });
    observer.observe(log);
    // The composer grows too when quick replies appear under the last message.
    if (log.nextElementSibling) observer.observe(log.nextElementSibling);
    window.addEventListener("scroll", onScroll, { passive: true });
    const frame = requestAnimationFrame(toBottom);
    return () => {
      settle();
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const last = messages.at(-1);
  const inputMode = useEffectiveInputMode();
  const answered = messages.some((m) => m.role === "user");

  const quickReplies = status === "ready" ? quickRepliesOfMessage(last) : [];
  const waiting = status === "submitted" || (status === "streaming" && last?.role !== "assistant");
  const answering = status === "streaming" && last?.role === "assistant";
  const clara: ClaraTurn = {
    activity: waiting ? "thinking" : answering ? "answering" : null,
    mood: answering ? answerMood(requestMood, last.parts) : requestMood,
  };

  return (
    <ChatActionsProvider value={chatActions}>
      <PictureProvider value={pictureActions}>
        <div className="sticky top-16 z-20 lg:hidden">
          <VorsorgebildStrip model={picture} focus={focus} onSelect={selectSituation} />
        </div>
        <div className="mx-auto w-full max-w-[1160px] lg:grid lg:grid-cols-[minmax(0,680px)_minmax(320px,380px)] lg:justify-between lg:gap-12 lg:px-8">
          <div className="flex min-h-[calc(100dvh-4rem)] min-w-0 flex-col">
            <ol
              ref={logRef}
              role="log"
              aria-label={t("transcript")}
              className="flex flex-1 flex-col gap-6 px-4 pt-6 pb-8 lg:px-0 lg:pt-10"
            >
              {messages.map((message) => (
                // The scroll margin keeps a reply's first line below the header (and the
                // Vorsorgebild strip on mobile) when the view stops at its start.
                <li
                  key={message.id}
                  data-role={message.role}
                  className="scroll-mt-32 lg:scroll-mt-24"
                >
                  <MessageView message={message} />
                </li>
              ))}
              {!answered && inputMode === "voice" ? (
                <li>
                  <VoiceInvite />
                </li>
              ) : null}
              {waiting ? (
                <li className="flex gap-3">
                  <span aria-hidden className="mt-2 block size-2.5 shrink-0 bg-pax-purple" />
                  <Spinner label={t("thinking")} className="mt-1.5" />
                </li>
              ) : null}
              {error ? (
                <li
                  role="alert"
                  className="rounded-[16px] border border-warning bg-warning-light px-4 py-3 text-paragraph-s text-warning-dark"
                >
                  <p>{t("error.unavailable")}</p>
                  <button
                    type="button"
                    onClick={() => {
                      dispatchFocus({ type: "send" });
                      void regenerate();
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 font-medium underline underline-offset-2"
                  >
                    <RotateCcw aria-hidden className="size-4" />
                    {t("error.retry")}
                  </button>
                </li>
              ) : null}
            </ol>
            <div className="sticky bottom-0 z-10 bg-surface/95 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm lg:px-0 lg:pb-6">
              <Composer
                conversationId={conversationId}
                busy={busy}
                clara={clara}
                quickReplies={quickReplies}
                onSend={send}
                onStop={() => void stop()}
              />
              <p className="mt-2 text-center text-paragraph-xs text-fg-subtle">{t("disclaimer")}</p>
            </div>
          </div>
          <aside aria-label={t("picture.title")} className="hidden lg:block">
            <div className="sticky top-24 mt-10 max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-xl bg-surface-muted p-6">
              <VorsorgebildPanel model={picture} focus={focus} onSelect={selectSituation} />
            </div>
          </aside>
        </div>
      </PictureProvider>
    </ChatActionsProvider>
  );
}
