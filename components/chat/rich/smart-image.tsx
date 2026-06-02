"use client";

import { useState } from "react";

/**
 * External images (Tavily, news thumbnails, product shots) frequently fail to
 * load due to hotlink protection or dead URLs. This component renders nothing
 * when the image errors, and sends no referrer to maximise load success.
 */
export function SmartImage({
  src,
  alt,
  className,
  onError,
}: {
  src?: string;
  alt: string;
  className?: string;
  onError?: () => void;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return null;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => {
        setFailed(true);
        onError?.();
      }}
      referrerPolicy="no-referrer"
      src={src}
    />
  );
}
