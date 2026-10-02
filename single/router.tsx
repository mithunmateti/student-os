/**
 * Minimal hash router used by the standalone (single index.html) build.
 * Routes live in the URL fragment — index.html#/analyzer/new?exam=… — so the
 * file works when opened straight from disk, with no server.
 */
import { createContext, useContext, useSyncExternalStore } from "react";

export interface Location {
  path: string;
  search: string;
}

function read(): Location {
  const h = window.location.hash;
  if (!h.startsWith("#/")) return { path: "/", search: "" };
  const raw = h.slice(1);
  const q = raw.indexOf("?");
  return { path: q >= 0 ? raw.slice(0, q) : raw, search: q >= 0 ? raw.slice(q) : "" };
}

let cached = read();
function subscribe(cb: () => void) {
  const f = () => {
    cached = read();
    cb();
  };
  window.addEventListener("hashchange", f);
  return () => window.removeEventListener("hashchange", f);
}

export function useLocation(): Location {
  return useSyncExternalStore(subscribe, () => cached, () => cached);
}

export function navigate(href: string, replace = false) {
  const target = "#" + (href.startsWith("/") ? href : "/" + href);
  if (window.location.hash === target) return;
  if (replace) window.location.replace(target);
  else window.location.hash = target;
  window.scrollTo(0, 0);
}

export const ParamsContext = createContext<Record<string, string>>({});
export function useRouteParams() {
  return useContext(ParamsContext);
}

export interface RouteDef {
  pattern: string;
  keys: string[];
  regex: RegExp;
}

export function compile(pattern: string): RouteDef {
  const keys: string[] = [];
  const src = pattern
    .split("/")
    .map((seg) => {
      if (seg.startsWith(":")) {
        keys.push(seg.slice(1));
        return "([^/]+)";
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return { pattern, keys, regex: new RegExp(`^${src}/?$`) };
}

export function match(def: RouteDef, path: string): Record<string, string> | null {
  const m = def.regex.exec(path);
  if (!m) return null;
  return Object.fromEntries(def.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
}
