"use client";
/**
 * Local-first persistence: IndexedDB (structured clone, no JSON cost) with a short
 * debounced writer and a localStorage fallback when IndexedDB is unavailable (e.g. some
 * private windows). Exposes save status for the UI.
 *
 * Nothing is lost when the student leaves, closes the browser or shuts the device down:
 *  - every IndexedDB write uses "strict" durability: it only counts as saved once it is on disk;
 *  - when the page is hidden, closed or frozen with a change still waiting to be written, that
 *    change is also copied synchronously to localStorage (a "rescue" copy). On the next start
 *    whichever copy is newer wins, so even a write cut off mid-way is recovered;
 *  - the app asks the browser for persistent storage, so it isn't cleared to free up space.
 *
 * Live sync: after each save, other open tabs/windows of the app are told to reload
 * the saved data (BroadcastChannel, with a localStorage "ping" as a fallback), so a
 * task ticked in one window is ticked in the other a moment later.
 */
import { del, get, promisifyRequest, set, type UseStore } from "idb-keyval";
import type { PersistStorage, StorageValue } from "zustand/middleware";
import { create } from "zustand";

export type SaveState = "idle" | "saving" | "saved" | "error";
export const useSaveStatus = create<{ state: SaveState; at?: number; error?: string }>(() => ({ state: "idle" }));

let idbOk = true;
/** `quiet` writes (re-saves caused by loading another tab's data) don't notify other tabs. */
let pending: { name: string; value: unknown; quiet: boolean; savedAt: number } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
/**
 * A change after a quiet moment is written at once (a tick, an added task); rapid changes such
 * as typing are batched, but never held back longer than MAX_WAIT_MS. Leaving the page writes
 * immediately.
 */
const SAVE_DELAY_MS = 200;
const MAX_WAIT_MS = 1000;
let lastFlushAt = 0;

/* --------------------------- durable writes --------------------------- */

// idb-keyval's default database and store, where the data has always lived.
const DB_NAME = "keyval-store";
const STORE_NAME = "keyval";
let durable: UseStore | null = null;

/** Same database as idb-keyval's default, but writes only complete once they're on disk. */
function durableStore(): UseStore {
  if (durable) return durable;
  let dbp: Promise<IDBDatabase> | undefined;
  const getDB = () => {
    if (dbp) return dbp;
    const req = indexedDB.open(DB_NAME);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    dbp = promisifyRequest(req);
    dbp.then((db) => { db.onclose = () => (dbp = undefined); }, () => {});
    return dbp;
  };
  durable = (txMode, callback) =>
    getDB().then((db) => callback(db.transaction(STORE_NAME, txMode, { durability: txMode === "readwrite" ? "strict" : "default" }).objectStore(STORE_NAME)));
  return durable;
}

/* ----------------------------- rescue copy ----------------------------- */

const rescueKey = (name: string) => `${name}:rescue`;
const rescueAtKey = (name: string) => `${name}:rescue-at`;

/** Synchronously copies a change that hasn't been written yet. Returns false if it couldn't. */
function writeRescueCopy(): boolean {
  if (!pending) return true;
  try {
    localStorage.setItem(rescueKey(pending.name), JSON.stringify(pending.value));
    localStorage.setItem(rescueAtKey(pending.name), String(pending.savedAt));
    return true;
  } catch {
    return false; // e.g. storage full; the IndexedDB write below is still attempted
  }
}

function clearRescueCopy(name: string, upTo = Infinity) {
  try {
    const at = Number(localStorage.getItem(rescueAtKey(name)) || 0);
    if (at && at <= upTo) {
      localStorage.removeItem(rescueKey(name));
      localStorage.removeItem(rescueAtKey(name));
    }
  } catch {
    /* ignore */
  }
}

/** Asks the browser not to clear this app's data to free up space. Safe to call repeatedly. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function isStoragePersistent(): Promise<boolean | null> {
  try {
    return navigator.storage?.persisted ? await navigator.storage.persisted() : null;
  } catch {
    return null;
  }
}

/* ----------------------------- live sync ----------------------------- */

const TAB_ID = Math.random().toString(36).slice(2);
const SYNC_KEY = "exam-pilot-sync";
type SyncMsg = { tab: string; at: number };
let channel: BroadcastChannel | null = null;
let applyingRemote = false;
/** Set while saving data that is already on disk (e.g. right after loading it). */
let quietWrites = false;
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

/** Runs `fn` with any resulting save marked quiet: no "unsaved changes" warning, no ping to other tabs. */
export function quietly(fn: () => void) {
  quietWrites = true;
  try {
    fn();
  } finally {
    quietWrites = false;
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
      await set(name, value, durableStore());
      return;
    } catch {
      idbOk = false;
    }
  }
  localStorage.setItem(name, JSON.stringify(value));
}

export async function flushNow() {
  if (!pending) return;
  const { name, value, quiet, savedAt } = pending;
  pending = null;
  clearTimeout(timer);
  lastFlushAt = Date.now();
  try {
    await write(name, value);
    clearRescueCopy(name, savedAt);
    useSaveStatus.setState({ state: "saved", at: Date.now(), error: undefined });
    if (!quiet) announce();
  } catch (e) {
    useSaveStatus.setState({ state: "error", error: e instanceof Error ? e.message : "Could not save" });
  }
}

if (typeof window !== "undefined") {
  // The page is going away (tab closed, app switched, browser quitting, device shutting down,
  // page frozen to save battery): make a synchronous rescue copy, then write to disk.
  const leaving = () => {
    if (!pending) return;
    writeRescueCopy();
    void flushNow();
  };
  window.addEventListener("pagehide", leaving);
  document.addEventListener("freeze", leaving);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") leaving();
  });
  window.addEventListener("beforeunload", (e) => {
    if (!pending) return;
    const unsaved = !pending.quiet;
    const rescued = writeRescueCopy();
    void flushNow();
    // Only ask "Leave site?" if a real change couldn't even be copied (e.g. storage is full).
    if (unsaved && !rescued) e.preventDefault();
  });
}

export function createIdbStorage<S>(): PersistStorage<S> {
  return {
    getItem: async (name) => {
      type Saved = StorageValue<S> & { savedAt?: number };
      const parse = (raw: string | null): Saved | null => {
        try {
          return raw ? (JSON.parse(raw) as Saved) : null;
        } catch {
          return null; // a damaged copy is skipped; the others are used
        }
      };
      let fromDb: Saved | null = null;
      try {
        fromDb = (await get<Saved>(name, durableStore())) ?? null;
      } catch {
        idbOk = false;
      }
      const ls = typeof localStorage !== "undefined" ? localStorage : null;
      // The fallback copy (used if IndexedDB failed during a session) and the rescue copy
      // (made when the page closed with a write still pending).
      const fallback = parse(ls?.getItem(name) ?? null);
      const rescue = parse(ls?.getItem(rescueKey(name)) ?? null);
      if (rescue) rescue.savedAt = Number(ls?.getItem(rescueAtKey(name)) || rescue.savedAt || 0);
      // Use whichever copy is newest; on a tie, the IndexedDB copy.
      const newest = [fromDb, fallback, rescue].reduce<Saved | null>((best, c) => (c && (!best || (c.savedAt ?? 0) > (best.savedAt ?? 0)) ? c : best), null);
      if (newest && newest !== fromDb) {
        let stored = false;
        if (idbOk) {
          try {
            await set(name, newest, durableStore());
            ls?.removeItem(name);
            stored = true;
          } catch {
            idbOk = false;
          }
        }
        if (!stored) {
          try {
            ls?.setItem(name, JSON.stringify(newest));
          } catch {
            return newest; // keep the rescue copy until a save succeeds
          }
        }
      }
      clearRescueCopy(name);
      return newest;
    },
    setItem: (name, value) => {
      const savedAt = Date.now();
      pending = { name, value: { ...value, savedAt }, savedAt, quiet: (applyingRemote || quietWrites) && !(pending && !pending.quiet) };
      useSaveStatus.setState({ state: "saving" });
      clearTimeout(timer);
      const sinceLast = savedAt - lastFlushAt;
      const oneOff = sinceLast > SAVE_DELAY_MS || sinceLast > MAX_WAIT_MS;
      // A one-off change (a tick, a new task) also gets an instant copy, in case the browser
      // quits before the disk write finishes. Bursts like typing skip it to stay smooth.
      if (oneOff && !pending.quiet) writeRescueCopy();
      timer = setTimeout(() => void flushNow(), oneOff ? 0 : SAVE_DELAY_MS);
    },
    removeItem: async (name) => {
      try {
        await del(name, durableStore());
      } catch {
        /* ignore */
      }
      localStorage.removeItem(name);
      clearRescueCopy(name);
    },
  };
}

/** Theme preference is mirrored to localStorage so the pre-paint script can read it synchronously. */
export const THEME_KEY = "exam-pilot-theme";
