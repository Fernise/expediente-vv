"use client";

import Link from "next/link";
import { useLanguage } from "@/app/components/Language";
import { usePathname, useSearchParams } from "next/navigation";
import type { ComponentProps, MouseEvent } from "react";
import { useEffect, useRef, useState } from "react";

type PendingLinkProps = ComponentProps<typeof Link>;

export function PendingLink({
  children,
  className,
  href,
  onClick,
  ...props
}: PendingLinkProps) {
  const { t } = useLanguage();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [pending, setPending] = useState(false);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    fallbackTimer.current = setTimeout(() => setPending(false), 0);
    return () => {
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    };
  }, [pathname, search]);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (props.target && props.target !== "_self") ||
      props.download !== undefined ||
      typeof href !== "string" ||
      href.startsWith("#")
    ) {
      return;
    }

    const destination = new URL(href, window.location.href);
    if (destination.origin !== window.location.origin) return;
    if (destination.href === window.location.href) return;

    setPending(true);
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    fallbackTimer.current = setTimeout(() => setPending(false), 10_000);
  }

  return (
    <Link
      {...props}
      aria-label={props["aria-label"] ? t(props["aria-label"]) : undefined}
      title={props.title ? t(props.title) : undefined}
      aria-busy={pending || undefined}
      className={`${className ?? ""} pending-link ${pending ? "is-pending" : ""}`.trim()}
      href={href}
      onClick={handleClick}
    >
      {children}
      {pending ? <span aria-hidden="true" className="pending-link-indicator" /> : null}
    </Link>
  );
}
