import { MessageSquareText } from "lucide-react";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { latestConversation } from "@/lib/advisor/conversations";
import { getCurrentCustomer } from "@/lib/auth/customer";

/** "Continue the last conversation" for a returning device (reads the customer cookie). */
export async function HomeResume() {
  await connection();
  const customer = await getCurrentCustomer();
  if (!customer || customer.isDemo) return null;
  const conversation = latestConversation(customer.id);
  if (!conversation || conversation.messageCount < 2) return null;
  const t = await getTranslations("home");
  return (
    <Link
      href={`/chat/${conversation.id}`}
      className="inline-flex items-center gap-2 text-paragraph-s font-medium text-ink underline-offset-4 hover:underline"
    >
      <MessageSquareText aria-hidden className="size-4" />
      {conversation.title ? t("resumeTitled", { title: conversation.title }) : t("resume")}
    </Link>
  );
}
