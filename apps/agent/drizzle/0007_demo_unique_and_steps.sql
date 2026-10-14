ALTER TABLE "taste_profiles" ADD COLUMN "steps" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- Two instances seeding at once could have left a demo persona twice; keep the oldest of each.
DELETE FROM "profiles" p USING "profiles" q WHERE p."is_demo" AND q."is_demo" AND p."owner_token_hash" = q."owner_token_hash" AND (p."created_at", p."id") > (q."created_at", q."id");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_demo_owner_idx" ON "profiles" USING btree ("owner_token_hash") WHERE "profiles"."is_demo";
