CREATE TABLE "arena_totals" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"games" bigint DEFAULT 0 NOT NULL,
	"tokens" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Seed the cumulative counter from what history we have, so the public number
-- continues from its current value instead of dropping to zero on rollout.
-- Only saved matches were ever recorded (games = COUNT(matches)); ranked token
-- spend is the SUM over ratings. Going forward, `/api/live/finish` counts every
-- finished match, saved or not.
INSERT INTO "arena_totals" ("id", "games", "tokens")
VALUES (
	'global',
	(SELECT COUNT(*) FROM "matches"),
	(SELECT COALESCE(SUM("tokens_sum"), 0) FROM "ratings")
)
ON CONFLICT ("id") DO NOTHING;
