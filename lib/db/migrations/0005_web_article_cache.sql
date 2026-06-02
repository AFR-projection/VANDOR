CREATE TABLE IF NOT EXISTS "WebArticleCache" (
  "url" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "fetchedAt" timestamp NOT NULL DEFAULT now()
);
