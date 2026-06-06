const YOUTUBE_ID_RE =
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{11})/i;

export function extractYoutubeVideoId(url: string): string | null {
  const match = YOUTUBE_ID_RE.exec(url);
  return match?.[1] ?? null;
}
