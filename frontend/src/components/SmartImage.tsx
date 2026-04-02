"use client";

import { useMemo, useState } from "react";
import Image from "next/image";

type SmartImageProps = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  fill?: boolean;
  sizes?: string;
  width?: number;
  height?: number;
  priority?: boolean;
};

function decodeRepeated(input: string, max = 3): string {
  let value = input;
  for (let step = 0; step < max; step += 1) {
    if (!/%[0-9A-Fa-f]{2}/.test(value)) {
      break;
    }
    try {
      const decoded = decodeURIComponent(value);
      if (decoded === value) {
        break;
      }
      value = decoded;
    } catch {
      break;
    }
  }
  return value;
}

function normalizeImageUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  const maybeDecoded = /^(https?|data):/i.test(trimmed) ? trimmed : decodeRepeated(trimmed, 2);

  try {
    const parsed = new URL(maybeDecoded);
    const host = parsed.hostname.toLowerCase();
    if ((host.includes("weserv.nl") || host === "wsrv.nl") && parsed.searchParams.has("url")) {
      const nestedRaw = parsed.searchParams.get("url") ?? "";
      const nested = decodeRepeated(nestedRaw, 4);
      if (/^https?:\/\//i.test(nested)) {
        return nested;
      }
    }
    return parsed.toString();
  } catch {
    return maybeDecoded;
  }
}

function isRemote(src: string): boolean {
  return /^https?:\/\//i.test(src);
}

export function SmartImage(props: SmartImageProps) {
  const [failed, setFailed] = useState(false);

  const normalizedSrc = useMemo(() => normalizeImageUrl(props.src ?? ""), [props.src]);
  const canRender = normalizedSrc.length > 0 && !failed;

  if (!canRender) {
    return <div className={props.fallbackClassName ?? props.className} aria-hidden="true" />;
  }

  const remote = isRemote(normalizedSrc);

  return (
    <Image
      src={normalizedSrc}
      alt={props.alt}
      className={props.className}
      fill={props.fill}
      sizes={props.sizes}
      width={props.width}
      height={props.height}
      priority={props.priority}
      unoptimized={remote}
      onError={() => setFailed(true)}
    />
  );
}

