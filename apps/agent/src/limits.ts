import { createRateLimiter } from "./qloo/budget";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ResearchLimits {
  /** Live research steps (Qloo calls) per device token in 24 h. */
  lookupsPerOwnerPerDay?: number;
  /** Live research steps per client IP (/64 for IPv6) in 24 h. */
  lookupsPerClientPerDay?: number;
  /** Daily budget units user research must leave for demo personas (gateway `reserve`). */
  budgetReserve?: number;
}

/**
 * One allowance shared by every user-triggered research route (Stage 1 lookups, Stage 2 builds), so
 * switching screens can't double anyone's share of the shared Qloo quota (security review W1). In
 * memory: the agent runs as a single instance; the daily budget in Postgres still holds on restart.
 */
export function createResearchAllowance(limits: ResearchLimits = {}) {
  const perOwner = createRateLimiter({ max: limits.lookupsPerOwnerPerDay ?? 50, windowMs: DAY_MS });
  const perClient = createRateLimiter({
    max: limits.lookupsPerClientPerDay ?? 100,
    windowMs: DAY_MS,
  });
  return {
    budgetReserve: limits.budgetReserve ?? 0,
    take: (ownerHash: string, client: string) =>
      perOwner.tryTake(ownerHash) && perClient.tryTake(client),
  };
}

export type ResearchAllowance = ReturnType<typeof createResearchAllowance>;
