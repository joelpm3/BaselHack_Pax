"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the page every `intervalMs` while background work (reading, analysing) runs. */
export function AutoRefresh({
  active,
  intervalMs = 2500,
}: {
  active: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs, router]);
  return null;
}
