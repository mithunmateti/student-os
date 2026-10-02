/** Drop-in replacement for next/link in the standalone build. */
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { navigate } from "./router";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string | { pathname?: string };
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean | null;
  children?: ReactNode;
};

export default function Link({ href, replace, scroll: _scroll, prefetch: _prefetch, onClick, children, ...rest }: Props) {
  const url = typeof href === "string" ? href : href.pathname ?? "/";
  const internal = url.startsWith("/");
  return (
    <a
      href={internal ? `#${url}` : url}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (!internal || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === "_blank") return;
        e.preventDefault();
        navigate(url, replace);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
