"use client";
/**
 * Local-first persistence: IndexedDB (structured clone, no JSON cost) with a
 * debounced writer, flush-on-hide, and a localStorage fallback when IndexedDB
 * is unavailable (e.g. some private windows). Exposes save status for the UI.
 *
 * Live sync: after each save, other open tabs/windows of the app are told to reload
 * the saved data (BroadcastChannel, with a localStorage "ping" as a fallback), so a
 * task ticked in one window is ticked in the other a moment later.
 */
import { del, get, set } from "idb-keyval";
import type { PersistStorage, StorageValue } from "zustand/middleware";
import { create } from "zustand";

export type SaveState = "idle" | "saving" | "saved" | "error";
export const useSaveStatus = create<{ state: SaveState; at?: number; error?: string }>(() => ({ state: "idle" }));

let idbOk = true;
/** `quiet` writes (re-saves caused by loading another tab's data) don't notify other tabs. */
let pending: { name: string; value: unknown; quiet: boolean } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

/* ----------------------------- live sync ----------------------------- */

const TAB_ID = Math.random().toString(36).slice(2);
const SYNC_KEY = "exam-pilot-sync";
type SyncMsg = { tab: string; at: number };
let channel: BroadcastChannel | null = null;
let applyingRemote = false;
let lastSeen = 0;
let onRemote: (() => Promise<void> | void) | null = null;

function announce() {
  const msg: SyncMsg = { tab: TAB_ID, at: Date.now() };
  try {
    channel?.postMessage(msg);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(msg));
  } catch {
    /* ignore */
  }
}

async function receive(msg: SyncMsg | null) {
  if (!msg || msg.tab === TAB_ID || msg.at <= lastSeen || !onRemote) return;
  // This tab has its own unsaved change: keep it; saving it will update the other tabs.
  if (pending) return;
  lastSeen = msg.at;
  applyingRemote = true;
  try {
    await onRemote();
  } finally {
    applyingRemote = false;
  }
}

function readPing(): SyncMsg | null {
  try {
    return JSON.parse(localStorage.getItem(SYNC_KEY) ?? "null");
  } catch {
    return null;
  }
}

/** Reload the store whenever another tab saves. Call once, on the client. */
export function listenForOtherTabs(reload: () => Promise<void> | void) {
  if (typeof window === "undefined" || onRemote) return;
  onRemote = reload;
  lastSeen = readPing()?.at ?? 0;
  try {
    channel = new BroadcastChannel(SYNC_KEY);
    channel.onmessage = (e) => void receive(e.data as SyncMsg);
  } catch {
    channel = null;
  }
  window.addEventListener("storage", (e) => {
    if (e.key === SYNC_KEY && e.newValue) void receive(readPing());
  });
  // Catch up on anything missed while this tab was in the background.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void receive(readPing());
  });
}

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
  const { name, value, quiet } = pending;
  pending = null;
  clearTimeout(timer);
  try {
    await write(name, value);
    useSaveStatus.setState({ state: "saved", at: Date.now(), error: undefined });
    if (!quiet) announce();
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
      pending = { name, value, quiet: applyingRemote && !(pending && !pending.quiet) };
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
