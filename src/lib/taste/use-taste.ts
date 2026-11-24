"use client";

import { useSyncExternalStore } from "react";
import { STORAGE_KEY, emptyState, parseState, type TasteState } from "./store";

/**
 * One shared, localStorage-backed taste store for the whole page. Reads are
 * lazy (first subscriber), writes are best-effort: if storage is unavailable
 * (private mode, quota, disabled) the profile still works for the session.
 * Other tabs stay in sync via the `storage` event.
 */
const SERVER_STATE = emptyState();
let state: TasteState | null = null;
const listeners = new Set<() => void>();

function read(): TasteState {
  try {
    return parseState(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return emptyState();
  }
}

function current(): TasteState {
  if (state === null) state = read();
  return state;
}

function emit() {
  for (const listener of listeners) listener();
}

function onStorage(e: StorageEvent) {
  if (e.key !== STORAGE_KEY && e.key !== null) return;
  state = read();
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

/** Apply a pure update (from `store.ts`) and persist it. */
export function updateTaste(update: (s: TasteState) => TasteState) {
  state = update(current());
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable or full: keep the in-memory profile for this session.
  }
  emit();
}

/** Read the current taste profile. The server render (and first client render) sees an empty one. */
export function useTaste(): TasteState {
  return useSyncExternalStore(subscribe, current, () => SERVER_STATE);
}
