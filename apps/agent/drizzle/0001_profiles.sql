CREATE TABLE "avoid_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL,
	"qloo_entity_id" text,
	"reason" text,
	"source" text DEFAULT 'caregiver' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_token_hash" text NOT NULL,
	"nickname" text,
	"birth_year" integer NOT NULL,
	"languages" text[] NOT NULL,
	"life_stages" jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"raw_text" text NOT NULL,
	"domain" text NOT NULL,
	"qloo_entity_id" text,
	"qloo_entity_type" text,
	"display_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text DEFAULT 'caregiver' NOT NULL,
	"evidence_id" uuid
);
--> statement-breakpoint
ALTER TABLE "avoid_items" ADD CONSTRAINT "avoid_items_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seeds" ADD CONSTRAINT "seeds_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "avoid_items_profile_idx" ON "avoid_items" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "profiles_owner_idx" ON "profiles" USING btree ("owner_token_hash");--> statement-breakpoint
CREATE INDEX "seeds_profile_idx" ON "seeds" USING btree ("profile_id");