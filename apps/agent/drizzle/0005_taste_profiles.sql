CREATE TABLE "taste_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"era_from" integer NOT NULL,
	"era_to" integer NOT NULL,
	"partial" boolean DEFAULT false NOT NULL,
	"items" jsonb NOT NULL,
	"notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seeds" ADD COLUMN "year" integer;--> statement-breakpoint
ALTER TABLE "seeds" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "taste_profiles" ADD CONSTRAINT "taste_profiles_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "taste_profiles_profile_version_idx" ON "taste_profiles" USING btree ("profile_id","version");