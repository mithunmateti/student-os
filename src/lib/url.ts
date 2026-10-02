/**
 * Query parameters for the current page. Works for normal URLs (Next.js) and for
 * hash-routed URLs like `index.html#/analyzer/new?exam=…` (standalone build).
 */
export function getSearchParams(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  const hash = window.location.hash;
  if (hash.startsWith("#/") && hash.includes("?")) return new URLSearchParams(hash.slice(hash.indexOf("?")));
  return new URLSearchParams(window.location.search);
}

/** Removes query parameters from the address bar without navigating (works for hash URLs too). */
export function dropSearchParams(...names: string[]) {
  if (typeof window === "undefined") return;
  const { hash, pathname, search } = window.location;
  const strip = (q: string) => {
    const p = new URLSearchParams(q);
    for (const n of names) p.delete(n);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  if (hash.startsWith("#/") && hash.includes("?")) {
    const [path, q] = [hash.slice(0, hash.indexOf("?")), hash.slice(hash.indexOf("?"))];
    window.history.replaceState(window.history.state, "", `${pathname}${search}${path}${strip(q)}`);
  } else if (search) {
    window.history.replaceState(window.history.state, "", `${pathname}${strip(search)}${hash}`);
  }
}
