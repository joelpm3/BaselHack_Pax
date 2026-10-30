"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useMemo } from "react";
import { ChatActionsProvider } from "@/components/chat/chat-actions";

/**
 * The review card talks to the advisor through ChatActions. In the cockpit there is no chat,
 * so "telling the advisor" means refreshing the cockpit to show the new contracts and hints.
 */
export function PortalChatBridge({ children }: { children: ReactNode }) {
  const router = useRouter();
  const value = useMemo(
    () => ({ conversationId: "", busy: false, sendMessage: () => router.refresh() }),
    [router],
  );
  return <ChatActionsProvider value={value}>{children}</ChatActionsProvider>;
}
