"use client";

import { motion } from "framer-motion";
import { StarIcon } from "lucide-react";
import type { ProductCard } from "@/lib/search/types";
import { SmartImage } from "./smart-image";

export function ProductCards({ products }: { products: ProductCard[] }) {
  if (products.length === 0) {
    return null;
  }

  return (
    <div className="mt-3">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Produk
      </p>
      <div className="flex gap-2.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {products.map((product, index) => (
          <ProductItem index={index} key={product.url} product={product} />
        ))}
      </div>
    </div>
  );
}

function ProductItem({
  product,
  index,
}: {
  product: ProductCard;
  index: number;
}) {
  return (
    <motion.a
      animate={{ opacity: 1, y: 0 }}
      className="group flex w-[170px] shrink-0 flex-col overflow-hidden rounded-xl border border-border/40 bg-card/40 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[var(--shadow-card)]"
      href={product.url}
      initial={{ opacity: 0, y: 10 }}
      rel="noopener noreferrer"
      target="_blank"
      transition={{ delay: 0.04 * index, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <span className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-white">
        <span className="absolute inset-0 flex items-center justify-center bg-muted text-xs text-muted-foreground">
          {product.source ?? "Produk"}
        </span>
        <SmartImage
          alt={product.title}
          className="relative size-full bg-white object-contain p-2"
          src={product.image}
        />
      </span>
      <span className="flex flex-1 flex-col gap-1 p-2.5">
        <span className="line-clamp-2 text-[12px] font-medium leading-snug text-foreground group-hover:text-primary">
          {product.title}
        </span>
        {product.price && (
          <span className="text-sm font-semibold text-foreground">
            {product.price}
          </span>
        )}
        <span className="mt-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {typeof product.rating === "number" && (
            <span className="flex items-center gap-0.5">
              <StarIcon className="size-3 fill-amber-400 text-amber-400" />
              {product.rating.toFixed(1)}
            </span>
          )}
          {product.source && <span className="truncate">{product.source}</span>}
        </span>
      </span>
    </motion.a>
  );
}
