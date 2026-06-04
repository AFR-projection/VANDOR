import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return {
    name: "VANDOR — Asisten Pribadi",
    short_name: "VANDOR",
    description: "Asisten AI pribadi dengan memori dan tools Jarvis-style",
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    background_color: "#0a0a0f",
    theme_color: "#0a0a0f",
    orientation: "portrait-primary",
    icons: [
      {
        src: `${base}/favicon.ico`,
        sizes: "48x48",
        type: "image/x-icon",
      },
    ],
  };
}
