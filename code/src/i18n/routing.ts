import { defineRouting } from "next-intl/routing";
import { LOCALES } from "@/lib/domain/taxonomy";

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: "de",
  localePrefix: "always",
});
