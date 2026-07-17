CREATE TABLE "turing_guesses" (
	"player_token" text NOT NULL,
	"match_id" uuid NOT NULL,
	"guess" text NOT NULL,
	"correct" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "turing_guesses_player_token_match_id_pk" PRIMARY KEY("player_token","match_id"),
	CONSTRAINT "turing_guesses_guess_chk" CHECK ("turing_guesses"."guess" IN ('p1','p2'))
);
--> statement-breakpoint
ALTER TABLE "turing_guesses" ADD CONSTRAINT "turing_guesses_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;