/**
 * Extension point in the customer view for a "Wiedervorlagen / future events" panel (reminders,
 * notice dates, yearly check-ins). It renders nothing until that feature exists: replace the body
 * with the panel and keep the signature, the customer view already places it in the side column
 * between the profile and the contact log. It may be an async server component.
 */
export function CustomerFollowUpsSlot(_props: { customerId: string; locale: string }) {
  return null;
}
