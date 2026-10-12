CREATE TABLE "seed_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seed_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"entity_id" text NOT NULL,
	"name" text NOT NULL,
	"entity_type" text,
	"year" integer,
	"evidence_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "qloo_calls" ADD COLUMN "profile_id" uuid;--> statement-breakpoint
ALTER TABLE "seeds" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "seed_candidates" ADD CONSTRAINT "seed_candidates_seed_id_seeds_id_fk" FOREIGN KEY ("seed_id") REFERENCES "public"."seeds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seed_candidates" ADD CONSTRAINT "seed_candidates_evidence_id_qloo_calls_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."qloo_calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seed_candidates_seed_idx" ON "seed_candidates" USING btree ("seed_id");--> statement-breakpoint
ALTER TABLE "qloo_calls" ADD CONSTRAINT "qloo_calls_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seeds" ADD CONSTRAINT "seeds_evidence_id_qloo_calls_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."qloo_calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qloo_calls_profile_idx" ON "qloo_calls" USING btree ("profile_id");--> statement-breakpoint
ALTER TABLE "seeds" ADD CONSTRAINT "seeds_status_check" CHECK ("seeds"."status" in ('pending', 'needs_input', 'confirmed', 'rejected', 'unresolved'));--> statement-breakpoint
ALTER TABLE "seeds" ADD CONSTRAINT "seeds_note_check" CHECK ("seeds"."note" is null or "seeds"."note" in ('not_found', 'no_clear_match', 'personal_info', 'invalid', 'lookup_failed'));--> statement-breakpoint
ALTER TABLE "seeds" ADD CONSTRAINT "seeds_confirmed_evidence_check" CHECK ("seeds"."status" <> 'confirmed' or ("seeds"."evidence_id" is not null and "seeds"."qloo_entity_id" is not null));