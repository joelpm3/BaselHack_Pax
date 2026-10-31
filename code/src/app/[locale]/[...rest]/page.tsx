import { notFound } from "next/navigation";

/** Unmatched paths under a locale get the localized not-found page instead of Next's default. */
export default function CatchAll() {
  notFound();
}
