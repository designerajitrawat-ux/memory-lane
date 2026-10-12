CREATE TABLE "budget" (
	"day" date PRIMARY KEY NOT NULL,
	"qloo_calls" integer DEFAULT 0 NOT NULL,
	"llm_tokens" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qloo_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"tool" text NOT NULL,
	"args" jsonb NOT NULL,
	"envelope" jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qloo_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool" text NOT NULL,
	"args_checked" jsonb NOT NULL,
	"status" text NOT NULL,
	"summary" text,
	"result_count" integer DEFAULT 0 NOT NULL,
	"results_digest" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cached" boolean DEFAULT false NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
