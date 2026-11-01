import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ChatView } from "@/components/chat/chat-view";
import { DataNotice } from "@/components/chat/data-notice";
import { NewConversationButton } from "@/components/chat/new-conversation-button";
import type { ChatMessage } from "@/components/chat/types";
import { SiteHeader } from "@/components/site/site-header";
import { PaxLogo } from "@/components/ui/logo";
import { Spinner } from "@/components/ui/spinner";
import { attachHint, getOwnedConversation, loadMessages } from "@/lib/advisor/conversations";
import { buildVorsorgebild } from "@/lib/advisor/picture";
import { getCurrentCustomer } from "@/lib/auth/customer";
import type { Locale } from "@/lib/domain/taxonomy";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/chat/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "chat" });
  return { title: t("pageTitle") };
}

export default function ChatPage({ params, searchParams }: PageProps<"/[locale]/chat/[id]">) {
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <Chat params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Chat({
  params,
  searchParams,
}: Pick<PageProps<"/[locale]/chat/[id]">, "params" | "searchParams">) {
  const [{ locale, id }, { hint }] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const customer = await getCurrentCustomer();
  const conversation = customer ? getOwnedConversation(id, customer.id) : null;
  if (!customer || !conversation) notFound();
  // Opened from a cockpit hint: the greeting names it and the advisor starts there.
  if (typeof hint === "string") await attachHint(conversation, hint);

  return (
    <>
      <SiteHeader actions={<NewConversationButton locale={locale as Locale} />} />
      <main>
        <ChatView
          conversationId={conversation.id}
          initialMessages={loadMessages(conversation.id) as ChatMessage[]}
          initialPicture={buildVorsorgebild(customer.id)}
          notice={<DataNotice />}
        />
      </main>
    </>
  );
}

function ChatSkeleton() {
  return (
    <>
      <div className="h-16 border-b border-line">
        <div className="mx-auto flex h-full max-w-[1160px] items-center px-4 lg:px-8">
          <PaxLogo className="h-6 sm:h-7" />
        </div>
      </div>
      <div className="grid min-h-[60dvh] place-items-center">
        <Spinner />
      </div>
    </>
  );
}
