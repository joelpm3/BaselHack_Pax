import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { CustomerLabel } from "./customer-label";

/** Sections of the customer view that other screens link into. */
export type CustomerSection = "handovers" | "leads" | "conversations" | "communications";

export function customerHref(customerId: string, section?: CustomerSection): string {
  return `/firma/kunden/${customerId}${section ? `#${section}` : ""}`;
}

/** The customer's name, linking to the customer view (every list uses this). */
export function CustomerLink({
  customerId,
  firstName,
  lastName,
  city,
  section,
  className,
}: {
  customerId: string;
  firstName: string | null;
  lastName: string | null;
  city: string | null;
  section?: CustomerSection;
  className?: string;
}) {
  return (
    <Link
      href={customerHref(customerId, section)}
      className={cn("min-w-0 truncate hover:underline", className)}
    >
      <CustomerLabel
        firstName={firstName}
        lastName={lastName}
        city={city}
        className="font-medium"
      />
    </Link>
  );
}
