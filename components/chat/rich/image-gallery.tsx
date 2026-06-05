"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RichImage } from "@/lib/search/types";

const MAX_THUMBS = 5;

export function ImageGallery({ images }: { images: RichImage[] }) {
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<number | null>(null);

  const valid = useMemo(
    () => images.filter((image) => image.url && !failed.has(image.url)),
    [images, failed]
  );

  const markFailed = useCallback((url: string) => {
    setFailed((prev) => {
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  }, []);

  const close = useCallback(() => setActive(null), []);
  const step = useCallback(
    (dir: number) => {
      setActive((current) => {
        if (current === null) {
          return current;
        }
        return (current + dir + valid.length) % valid.length;
      });
    },
    [valid.length]
  );

  useEffect(() => {
    if (active === null) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      }
      if (e.key === "ArrowRight") {
        step(1);
      }
      if (e.key === "ArrowLeft") {
        step(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, close, step]);

  if (valid.length === 0) {
    return null;
  }

  const thumbs = valid.slice(0, MAX_THUMBS);
  const extra = valid.length - thumbs.length;
  const activeImage = active === null ? null : valid[active];

  return (
    <div className="mt-3">
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
        {thumbs.map((image, index) => {
          const isLast = index === thumbs.length - 1 && extra > 0;
          return (
            <motion.button
              animate={{ opacity: 1, scale: 1 }}
              className="group relative aspect-square overflow-hidden rounded-lg border border-border/40 bg-muted"
              initial={{ opacity: 0, scale: 0.96 }}
              key={image.url}
              onClick={() => setActive(index)}
              transition={{
                delay: 0.03 * index,
                duration: 0.25,
                ease: [0.22, 1, 0.36, 1],
              }}
              type="button"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={image.description ?? "Hasil gambar"}
                className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
                onError={() => markFailed(image.url)}
                referrerPolicy="no-referrer"
                src={image.thumbnail ?? image.url}
              />
              {isLast && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-semibold text-white">
                  +{extra + 1}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence>
        {activeImage && (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={close}
          >
            <button
              aria-label="Tutup"
              className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
              onClick={close}
              type="button"
            >
              <XIcon size={20} />
            </button>

            {valid.length > 1 && (
              <>
                <button
                  aria-label="Sebelumnya"
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    step(-1);
                  }}
                  type="button"
                >
                  <ChevronLeftIcon size={22} />
                </button>
                <button
                  aria-label="Berikutnya"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    step(1);
                  }}
                  type="button"
                >
                  <ChevronRightIcon size={22} />
                </button>
              </>
            )}

            <motion.div
              animate={{ scale: 1, opacity: 1 }}
              className="flex max-h-full max-w-3xl flex-col items-center gap-3"
              exit={{ scale: 0.95, opacity: 0 }}
              initial={{ scale: 0.95, opacity: 0 }}
              key={activeImage.url}
              onClick={(e) => e.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={activeImage.description ?? "Hasil gambar"}
                className="max-h-[80vh] w-auto rounded-xl object-contain"
                onError={() => markFailed(activeImage.url)}
                referrerPolicy="no-referrer"
                src={activeImage.url}
              />
              {(activeImage.description || activeImage.title) && (
                <p className="max-w-prose text-center text-sm text-white/80">
                  {activeImage.description ?? activeImage.title}
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
