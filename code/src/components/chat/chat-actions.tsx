"use client";

import { createContext, type ReactNode, use } from "react";

/**
 * Lets generative-UI widgets talk back to the advisor without knowing about useChat.
 * CONTRACT: the chat area provides it; widgets (documents, offers, scenarios) consume it.
 */
export interface ChatActions {
  conversationId: string;
  /** Sends a user message as if typed (e.g. "Ich habe die Angaben bestätigt."). */
  sendMessage: (text: string, metadata?: Record<string, unknown>) => void;
  /** True while the advisor is responding; widgets should disable their actions. */
  busy: boolean;
}

const ChatActionsContext = createContext<ChatActions | null>(null);

export function ChatActionsProvider({ value, children }: { value: ChatActions; children: ReactNode }) {
  return <ChatActionsContext value={value}>{children}</ChatActionsContext>;
}

export function useChatActions(): ChatActions {
  const ctx = use(ChatActionsContext);
  if (!ctx) throw new Error("useChatActions must be used inside <ChatActionsProvider>");
  return ctx;
}
