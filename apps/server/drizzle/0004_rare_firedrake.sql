CREATE INDEX "matches_p1" ON "matches" USING btree ("p1_id","game");--> statement-breakpoint
CREATE INDEX "matches_p2" ON "matches" USING btree ("p2_id","game");