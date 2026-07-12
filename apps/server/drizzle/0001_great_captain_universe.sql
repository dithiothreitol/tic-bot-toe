CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"nickname" text,
	"flagged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "player_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "players_token_hash" ON "players" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "players_nickname" ON "players" USING btree ("nickname");--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "matches_player_day" ON "matches" USING btree ("player_id","created_at");