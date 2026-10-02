"use client";
/**
 * Local-first persistence: IndexedDB (structured clone, no JSON cost) with a
 * debounced writer, flush-on-hide, and a localStorage fallback when IndexedDB
 * is unavailable (e.g. some private windows). Exposes save status for the UI.
 */
import { del, get, set } from "idb-keyval";
import type { PersistStorage, StorageValue } from "zustand/middleware";
import { create } from "zustand";

export type SaveState = "idle" | "saving" | "saved" | "error";
export const useSaveStatus = create<{ state: SaveState; at?: number; error?: string }>(() => ({ state: "idle" }));

let idbOk = true;
let pending: { name: string; value: unknown } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

async function write(name: string, value: unknown) {
  if (idbOk) {
    try {
      await set(name, value);
      return;
    } catch {
      idbOk = false;
    }
  }
  localStorage.setItem(name, JSON.stringify(value));
}

export async function flushNow() {
  if (!pending) return;
  const { name, value } = pending;
  pending = null;
  clearTimeout(timer);
  try {
    await write(name, value);
    useSaveStatus.setState({ state: "saved", at: Date.now(), error: undefined });
  } catch (e) {
    useSaveStatus.setState({ state: "error", error: e instanceof Error ? e.message : "Could not save" });
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => void flushNow());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushNow();
  });
  window.addEventListener("beforeunload", (e) => {
    if (pending) {
      void flushNow();
      e.preventDefault();
    }
  });
}

export function createIdbStorage<S>(): PersistStorage<S> {
  return {
    getItem: async (name) => {
      try {
        const v = await get<StorageValue<S>>(name);
        if (v) return v;
      } catch {
        idbOk = false;
      }
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(name) : null;
      return raw ? (JSON.parse(raw) as StorageValue<S>) : null;
    },
    setItem: (name, value) => {
      pending = { name, value };
      useSaveStatus.setState({ state: "saving" });
      clearTimeout(timer);
      timer = setTimeout(() => void flushNow(), 350);
    },
    removeItem: async (name) => {
      try {
        await del(name);
      } catch {
        /* ignore */
      }
      localStorage.removeItem(name);
    },
  };
}

/** Theme preference is mirrored to localStorage so the pre-paint script can read it synchronously. */
export const THEME_KEY = "exam-pilot-theme";
