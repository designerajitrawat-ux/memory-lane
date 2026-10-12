import { z } from "zod";

/**
 * Readiness of each part of the system, as reported by the agent's GET /api/health.
 * Messages are written for people and must never contain raw errors, env values or secrets.
 */
export const AgentStateSchema = z.enum(["ok"]);
export const QlooStateSchema = z.enum(["ok", "no_credential", "unavailable", "quota_exhausted"]);
export const DbStateSchema = z.enum(["ok", "not_configured", "error"]);

const check = <S extends z.ZodEnum>(state: S) =>
  z.object({
    ok: z.boolean(),
    state,
    message: z.string().max(200),
  });

export const HealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  time: z.iso.datetime(),
  checks: z.object({
    agent: check(AgentStateSchema),
    qloo: check(QlooStateSchema),
    db: check(DbStateSchema),
  }),
});

export type QlooState = z.infer<typeof QlooStateSchema>;
export type DbState = z.infer<typeof DbStateSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type QlooCheck = HealthResponse["checks"]["qloo"];
export type DbCheck = HealthResponse["checks"]["db"];
