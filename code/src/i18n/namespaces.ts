/**
 * Message files live in `messages/<locale>/<namespace>.json`, one namespace per feature area,
 * so feature work never collides in a single giant file. Add a namespace here and create the
 * file for all four locales.
 */
export const NAMESPACES = [
  "common",
  "home",
  "chat",
  "widgets",
  "capitalPayout",
  "portal",
  "documents",
  "voice",
  "firma",
  "sales",
  "locality",
  "firmaCustomers",
  "followups",
] as const;
export type Namespace = (typeof NAMESPACES)[number];
