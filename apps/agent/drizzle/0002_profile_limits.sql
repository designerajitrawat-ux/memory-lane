ALTER TABLE "budget" ADD COLUMN "profiles_created" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;