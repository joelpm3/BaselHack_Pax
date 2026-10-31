import { CustomerFollowUps } from "@/components/followups/customer-follow-ups";

/**
 * The customer view's "Wiedervorlagen" panel: announced life events, follow-up emails and the
 * yearly check-in, placed in the side column between the profile and the contact log.
 */
export function CustomerFollowUpsSlot({ customerId }: { customerId: string; locale: string }) {
  return <CustomerFollowUps customerId={customerId} />;
}
