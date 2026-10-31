"use client";

import { useEffect, useRef } from "react";
import { isSpaceShortcutFree } from "./talk";

/**
 * Desktop shortcut for the talk square: Space starts and stops, Escape discards a running
 * recording. Ignored while typing or on a focused control, where those keys already act.
 */
export function useSpaceToTalk(
  enabled: boolean,
  handlers: { onToggle: () => void; onEscape: () => void },
) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "Escape") {
        latest.current.onEscape();
        return;
      }
      if (event.key !== " " || event.repeat) return;
      if (!isSpaceShortcutFree(event.target as Element | null)) return;
      event.preventDefault();
      latest.current.onToggle();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
