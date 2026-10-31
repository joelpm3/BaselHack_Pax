import { CustomerFollowUps } from "@/components/followups/customer-follow-ups";

/**
 * The customer view's "Wiedervorlagen und Post" panel: announced life events, follow-up emails
 * and the yearly check-in. This is their only home; the Wiedervorlagen page lists events only.
 */
export function CustomerFollowUpsSlot({ customerId }: { customerId: string; locale: string }) {
  return <CustomerFollowUps customerId={customerId} />;
}
