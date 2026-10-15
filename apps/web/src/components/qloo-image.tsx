"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import { qlooImageOrNull } from "@memory-lane/shared";
import { cn } from "@/lib/utils";

/**
 * Qloo's own picture of an item (an artist's photo, a film poster, a place), shown through Next's image
 * optimizer: the browser loads it from this site, never from Qloo, and it is never stored by us. The
 * item's name is always next to it, so the picture is decorative for screen readers (alt=""). Without a
 * picture (dishes), or if it fails to load, `fallback` is shown instead.
 */
export function QlooImage({
  src,
  sizes,
  fit = "cover",
  className,
  fallback = null,
  eager = false,
}: {
  src: string | null | undefined;
  /** The rendered width, for the optimizer ("64px", "(min-width: 640px) 320px, 90vw"). */
  sizes: string;
  /** "cover" fills a thumbnail; "contain" shows a whole poster or photo in a frame. */
  fit?: "cover" | "contain";
  /** Size and shape of the frame (it must have a size: the image fills it). */
  className: string;
  fallback?: ReactNode;
  /** Load now rather than when scrolled near (a printed plan needs its pictures). */
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const url = qlooImageOrNull(src);
  if (!url || failed) return fallback;
  return (
    <span
      aria-hidden="true"
      className={cn("relative block shrink-0 overflow-hidden bg-secondary", className)}
    >
      <Image
        src={url}
        alt=""
        fill
        sizes={sizes}
        className={fit === "cover" ? "object-cover" : "object-contain"}
        loading={eager ? "eager" : "lazy"}
        onError={() => setFailed(true)}
      />
    </span>
  );
}

/** A square thumbnail for an item, or its kind icon on a warm tile when Qloo has no picture. */
export function ItemThumb({
  image,
  icon: Icon,
  className = "size-16 rounded-xl",
  iconClassName = "size-7",
  eager = false,
}: {
  image: string | null | undefined;
  icon: LucideIcon;
  /** Size and shape, shared by the picture and the icon tile. */
  className?: string;
  iconClassName?: string;
  eager?: boolean;
}) {
  const tile = (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center bg-secondary text-primary",
        className,
      )}
    >
      <Icon className={iconClassName} />
    </span>
  );
  // Thumbnails are at most 96 CSS px: the optimizer sends a small file, not Qloo's 420px original.
  return <QlooImage src={image} sizes="96px" className={className} fallback={tile} eager={eager} />;
}
