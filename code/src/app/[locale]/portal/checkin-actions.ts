"use server";

import { refresh } from "next/cache";
import { getCurrentCustomer } from "@/lib/auth/customer";
import { setYearlyCheckin } from "@/lib/followups/preferences";

/** Cockpit setting: the customer switches the yearly check-in email on or off. */
export async function setMyYearlyCheckin(formData: FormData): Promise<void> {
  const customer = await getCurrentCustomer();
  if (!customer) return;
  setYearlyCheckin(customer.id, formData.get("enabled") === "true", {
    type: "customer",
    id: customer.id,
  });
  refresh();
}
