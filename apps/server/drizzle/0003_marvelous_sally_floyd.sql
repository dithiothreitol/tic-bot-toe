CREATE TABLE "failure_gallery" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"subject_id" text NOT NULL,
	"game" text NOT NULL,
	"variant" text NOT NULL,
	"kind" text NOT NULL,
	"attempted" text,
	"reason" text,
	"excerpt" text,
	"move_index" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "failure_gallery_kind_chk" CHECK ("failure_gallery"."kind" IN ('illegal','unparseable'))
);
--> statement-breakpoint
ALTER TABLE "ratings" ADD COLUMN "rejected_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ratings" ADD COLUMN "moves_with_rejections" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ratings" ADD COLUMN "captured_moves" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "failure_gallery" ADD CONSTRAINT "failure_gallery_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "failure_gallery_game" ON "failure_gallery" USING btree ("game","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "failure_gallery_subject" ON "failure_gallery" USING btree ("subject_id","created_at" DESC NULLS LAST);