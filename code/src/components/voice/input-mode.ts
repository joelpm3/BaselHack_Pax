"use client";

import { useSyncExternalStore } from "react";

/** How the customer answers in the chat: talking is the default, writing the alternative. */
export type InputMode = "voice" | "text";

const KEY = "pax.chat.inputMode";
const listeners = new Set<() => void>();

function read(): InputMode {
  try {
    return window.localStorage.getItem(KEY) === "text" ? "text" : "voice";
  } catch {
    return "voice";
  }
}

let current: InputMode | null = null;

function snapshot(): InputMode {
  current ??= read();
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    current = read();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Remembers the choice on this device; private windows without storage just do not remember. */
export function setInputMode(mode: InputMode) {
  current = mode;
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    // Storage blocked: the choice still holds for this page.
  }
  for (const listener of listeners) listener();
}

/** The device's preferred input mode ("voice" on the server and on a first visit). */
export function useInputMode(): InputMode {
  return useSyncExternalStore(subscribe, snapshot, () => "voice");
}
