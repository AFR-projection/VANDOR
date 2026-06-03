"use client";

import { useEffect, useState } from "react";

/**
 * Bottom inset when the mobile virtual keyboard is open (visualViewport API).
 */
export function useVisualViewportInset() {
  const [bottom, setBottom] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const keyboard = Math.max(
        0,
        window.innerHeight - vv.height - vv.offsetTop
      );
      setBottom(Math.round(keyboard));
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);

    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return bottom;
}
