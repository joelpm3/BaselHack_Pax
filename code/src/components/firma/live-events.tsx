"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

/** The JSON shape of a bus event as it arrives over SSE (see `@/lib/events/bus`). */
export interface LiveEvent {
  type: string;
  at: number;
  conversationId?: string;
  customerId?: string;
  role?: "user" | "assistant";
  preview?: string;
  leadId?: string;
  handoverId?: string;
  runId?: string;
  isSimulated?: boolean;
}

type Listener = (event: LiveEvent) => void;
type Status = "connecting" | "open" | "offline";

const LiveContext = createContext<{
  subscribe: (listener: Listener) => () => void;
  status: Status;
} | null>(null);

/** One EventSource per dashboard tab, shared by every live component on the page. */
export function LiveEventsProvider({ children }: { children: ReactNode }) {
  const listeners = useRef(new Set<Listener>());
  const [status, setStatus] = useState<Status>("connecting");

  useEffect(() => {
    const source = new EventSource("/api/events");
    source.onopen = () => setStatus("open");
    source.onerror = () =>
      setStatus(source.readyState === EventSource.CLOSED ? "offline" : "connecting");
    source.onmessage = (message) => {
      let event: LiveEvent;
      try {
        event = JSON.parse(message.data) as LiveEvent;
      } catch {
        return;
      }
      for (const listener of listeners.current) listener(event);
    };
    return () => source.close();
  }, []);

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const value = useMemo(() => ({ subscribe, status }), [subscribe, status]);
  return <LiveContext value={value}>{children}</LiveContext>;
}

function useLive() {
  const ctx = use(LiveContext);
  if (!ctx) throw new Error("LiveEventsProvider missing");
  return ctx;
}

/** Calls `handler` for every live event; the latest handler is always used. */
export function useLiveEvents(handler: Listener): void {
  const { subscribe } = useLive();
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => subscribe((event) => latest.current(event)), [subscribe]);
}

function matches(event: LiveEvent, types: readonly string[], conversationId?: string): boolean {
  if (!types.some((t) => event.type === t || event.type.startsWith(`${t}.`))) return false;
  return !conversationId || !event.conversationId || event.conversationId === conversationId;
}

/**
 * Re-renders the server components of the current page when a matching event arrives,
 * at most once per `intervalMs` (leading and trailing), so a burst of simulated turns
 * does not hammer the server.
 */
export function LiveRefresh({
  types,
  conversationId,
  intervalMs = 1500,
}: {
  types: readonly string[];
  conversationId?: string;
  intervalMs?: number;
}) {
  const router = useRouter();
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  useLiveEvents((event) => {
    if (!matches(event, types, conversationId)) return;
    const wait = last.current + intervalMs - Date.now();
    if (wait <= 0) {
      last.current = Date.now();
      router.refresh();
    } else if (!timer.current) {
      timer.current = setTimeout(() => {
        timer.current = null;
        last.current = Date.now();
        router.refresh();
      }, wait);
    }
  });
  return null;
}

/** Connection state of the live stream: a pulsing green square while connected. */
export function LiveStatus({ className }: { className?: string }) {
  const { status } = useLive();
  const t = useTranslations("firma.live.status");
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-full border border-line px-3 text-paragraph-xs font-medium text-fg",
        className,
      )}
      aria-live="polite"
    >
      <span
        aria-hidden
        className={cn(
          "size-2",
          status === "open" ? "bg-pax-green" : status === "connecting" ? "bg-warning" : "bg-gray-4",
        )}
      />
      {t(status)}
    </span>
  );
}
