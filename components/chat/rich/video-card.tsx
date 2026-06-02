"use client";

import { motion } from "framer-motion";
import { PlayIcon } from "lucide-react";
import type { VideoCard } from "@/lib/search/types";
import { SmartImage } from "./smart-image";

export function VideoCards({ videos }: { videos: VideoCard[] }) {
  if (videos.length === 0) {
    return null;
  }

  return (
    <div className="mt-3">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Video
      </p>
      <div className="flex gap-2.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {videos.map((video, index) => (
          <VideoItem index={index} key={video.url} video={video} />
        ))}
      </div>
    </div>
  );
}

function VideoItem({ video, index }: { video: VideoCard; index: number }) {
  return (
    <motion.a
      animate={{ opacity: 1, y: 0 }}
      className="group flex w-[220px] shrink-0 flex-col overflow-hidden rounded-xl border border-border/40 bg-card/40 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[var(--shadow-card)]"
      href={video.url}
      initial={{ opacity: 0, y: 10 }}
      rel="noopener noreferrer"
      target="_blank"
      transition={{ delay: 0.04 * index, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <span className="relative block">
        <SmartImage
          alt={video.title}
          className="aspect-video w-full object-cover"
          src={video.thumbnail}
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
          <span className="flex size-10 items-center justify-center rounded-full bg-white/90 text-black shadow-lg transition-transform group-hover:scale-110">
            <PlayIcon className="ml-0.5 size-4 fill-current" />
          </span>
        </span>
      </span>
      <span className="flex flex-col gap-1 p-2.5">
        <span className="line-clamp-2 text-xs font-medium leading-snug text-foreground group-hover:text-primary">
          {video.title}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {video.channel ?? video.source}
        </span>
      </span>
    </motion.a>
  );
}
