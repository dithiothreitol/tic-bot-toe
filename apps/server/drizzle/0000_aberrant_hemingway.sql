CREATE TABLE "daily_results" (
	"player_token" text NOT NULL,
	"day" date NOT NULL,
	"completed" boolean NOT NULL,
	"match_id" uuid,
	CONSTRAINT "daily_results_player_token_day_pk" PRIMARY KEY("player_token","day")
);
--> statement-breakpoint
CREATE TABLE "elo_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"subject_id" text NOT NULL,
	"mode" text NOT NULL,
	"game" text NOT NULL,
	"variant" text NOT NULL,
	"match_id" uuid NOT NULL,
	"elo_after" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" text NOT NULL,
	"game" text NOT NULL,
	"variant" text NOT NULL,
	"p1_id" text NOT NULL,
	"p2_id" text NOT NULL,
	"winner" text,
	"moves" jsonb NOT NULL,
	"setup" jsonb,
	"commentary" jsonb,
	"price_snapshot" jsonb,
	"moves_hash" text NOT NULL,
	"lab" boolean DEFAULT false NOT NULL,
	"server_verified" boolean DEFAULT false NOT NULL,
	"forfeit_moves_p1" integer DEFAULT 0 NOT NULL,
	"forfeit_moves_p2" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"client_ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_mode_chk" CHECK ("matches"."mode" IN ('model_vs_model','human_vs_model')),
	CONSTRAINT "matches_winner_chk" CHECK ("matches"."winner" IN ('p1','p2','draw'))
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"player_token" text NOT NULL,
	"nickname" text,
	"match_id" uuid,
	"predicted" text NOT NULL,
	"correct" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "predictions_pred_chk" CHECK ("predictions"."predicted" IN ('p1','p2','draw'))
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"subject_id" text NOT NULL,
	"mode" text NOT NULL,
	"game" text NOT NULL,
	"variant" text NOT NULL,
	"elo" real DEFAULT 1000 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"games" integer DEFAULT 0 NOT NULL,
	"forfeit_moves" integer DEFAULT 0 NOT NULL,
	"total_moves" integer DEFAULT 0 NOT NULL,
	"latency_ms_sum" bigint DEFAULT 0 NOT NULL,
	"tokens_sum" bigint DEFAULT 0 NOT NULL,
	"cost_usd_sum" numeric(12, 6) DEFAULT '0' NOT NULL,
	"optimal_moves" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ratings_subject_id_mode_game_variant_pk" PRIMARY KEY("subject_id","mode","game","variant")
);
--> statement-breakpoint
CREATE TABLE "used_jti" (
	"jti" uuid PRIMARY KEY NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_results" ADD CONSTRAINT "daily_results_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_history" ADD CONSTRAINT "elo_history_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "elo_hist_idx" ON "elo_history" USING btree ("subject_id","mode","game","variant","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_dedup" ON "matches" USING btree ("moves_hash");--> statement-breakpoint
CREATE INDEX "matches_lb" ON "matches" USING btree ("mode","game","variant","created_at" DESC NULLS LAST);