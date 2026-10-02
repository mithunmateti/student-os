/** Drop-in replacement for the parts of next/navigation the app uses. */
import { useMemo } from "react";
import { navigate, useLocation, useRouteParams } from "./router";

export function useRouter() {
  return useMemo(
    () => ({
      push: (href: string) => navigate(href),
      replace: (href: string) => navigate(href, true),
      back: () => window.history.back(),
      forward: () => window.history.forward(),
      refresh: () => undefined,
      prefetch: () => undefined,
    }),
    [],
  );
}

export function usePathname(): string {
  return useLocation().path;
}

export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  return useRouteParams() as T;
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams(useLocation().search);
}

export function redirect(href: string): never {
  navigate(href, true);
  throw new Error("redirect");
}

export function notFound(): never {
  throw new Error("not found");
}
