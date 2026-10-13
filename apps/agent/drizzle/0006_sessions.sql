CREATE TABLE "session_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"domain" text NOT NULL,
	"entity_id" text NOT NULL,
	"entity_type" text,
	"name" text NOT NULL,
	"year" integer,
	"why" text NOT NULL,
	"prompts" text[] NOT NULL,
	"minutes" integer NOT NULL,
	"link" jsonb NOT NULL,
	"alt_link" jsonb,
	"evidence_ids" text[] NOT NULL,
	"reaction" text,
	"note" text,
	"reacted_at" timestamp with time zone,
	CONSTRAINT "session_items_reaction_check" CHECK ("session_items"."reaction" is null or "session_items"."reaction" in ('sang', 'engaged', 'neutral', 'distressed')),
	CONSTRAINT "session_items_evidence_check" CHECK (cardinality("session_items"."evidence_ids") > 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"taste_profile_id" uuid,
	"what_changed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_status_check" CHECK ("sessions"."status" in ('planned', 'in_progress', 'done'))
);
--> statement-breakpoint
ALTER TABLE "session_items" ADD CONSTRAINT "session_items_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_taste_profile_id_taste_profiles_id_fk" FOREIGN KEY ("taste_profile_id") REFERENCES "public"."taste_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_items_session_idx" ON "session_items" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_profile_number_idx" ON "sessions" USING btree ("profile_id","number");