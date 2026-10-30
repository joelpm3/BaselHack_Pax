"use client";

import { useEffect } from "react";

/** Registers /sw.js in production builds (dev reloads would fight with a cached shell). */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installability is progressive enhancement; the app works without it.
    });
  }, []);
  return null;
}
