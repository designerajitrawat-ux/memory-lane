import { z } from "zod";

/**
 * Qloo harness result envelope (canonical MCP, result_schema_version 1.0-preview.1). Mirrors the
 * schema reported by `qloo_capabilities`; `results` stays opaque because its shape varies by tool.
 */
export const QlooStatusSchema = z.enum([
  "ok",
  "empty",
  "needs_input",
  "partial",
  "degraded",
  "error",
]);

export const QlooErrorSchema = z.object({
  code: z.string(),
  layer: z.string(),
  retryable: z.boolean(),
  recovery: z.string(),
});

export const QlooEnvelopeSchema = z.object({
  schema_version: z.string(),
  operation: z.string(),
  status: QlooStatusSchema,
  summary: z.string().optional(),
  interpretation: z.unknown().optional(),
  results: z.unknown().optional(),
  result_count: z.number().int().nonnegative().optional(),
  warnings: z.array(z.string()).optional(),
  query_intent: z.unknown().optional(),
  error: QlooErrorSchema.optional(),
  execution: z
    .object({
      transport: z.string(),
      transport_name: z.string(),
      correlation_id: z.string(),
      duration_ms: z.number(),
    })
    .optional(),
  provenance: z.unknown().optional(),
});

/** The Qloo MCP tools Memory Lane may call (docs/05). Everything else is rejected by the gateway. */
export const QlooToolNameSchema = z.enum([
  "qloo_describe",
  "qloo_find_tags",
  "qloo_recommend",
  "qloo_rank",
  "qloo_where_popular",
  "qloo_entity_tags",
  "qloo_audience_demographics",
]);

export type QlooStatus = z.infer<typeof QlooStatusSchema>;
export type QlooError = z.infer<typeof QlooErrorSchema>;
export type QlooEnvelope = z.infer<typeof QlooEnvelopeSchema>;
export type QlooToolName = z.infer<typeof QlooToolNameSchema>;
