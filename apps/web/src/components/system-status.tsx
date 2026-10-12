"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CircleHelp, TriangleAlert, type LucideIcon } from "lucide-react";
import { HealthResponseSchema } from "@memory-lane/shared";
import { Button } from "@/components/ui/button";
import { AGENT_URL } from "@/lib/agent";
import { canRetry, describeHealth, type HealthResult, type Tone } from "@/lib/health-labels";

const TIMEOUT_MS = 25_000; // the agent may need ~10 s to start its Qloo tools after a cold start
const SLOW_MS = 6_000;

const TONE: Record<Tone, { icon: LucideIcon; className: string }> = {
  ok: { icon: Check, className: "text-evidence" },
  warn: { icon: TriangleAlert, className: "text-warning" },
  unknown: { icon: CircleHelp, className: "text-muted-foreground" },
};

async function fetchHealth(signal: AbortSignal): Promise<HealthResult> {
  try {
    // 503 still carries a full health body, so read it whatever the status code.
    const res = await fetch(`${AGENT_URL}/api/health`, { signal, cache: "no-store" });
    const parsed = HealthResponseSchema.safeParse(await res.json());
    return parsed.success ? { kind: "ok", health: parsed.data } : { kind: "invalid" };
  } catch {
    return navigator.onLine === false ? { kind: "offline" } : { kind: "unreachable" };
  }
}

export function SystemStatus() {
  const [result, setResult] = useState<HealthResult | null>(null);
  const [checking, setChecking] = useState(true);
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Keep the last result on screen while re-checking, so the button keeps focus and nothing jumps.
  const retry = useCallback(() => {
    setChecking(true);
    setSlow(false);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(TIMEOUT_MS)]);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_MS);
    fetchHealth(signal).then((r) => {
      clearTimeout(slowTimer);
      if (controller.signal.aborted) return;
      setResult(r);
      setChecking(false);
      setSlow(false);
    });
    return () => {
      clearTimeout(slowTimer);
      controller.abort();
    };
  }, [attempt]);

  useEffect(() => {
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [retry]);

  const view = result && describeHealth(result);
  const waitingCopy = slow
    ? "Still checking — the agent can take a few seconds to wake up the first time."
    : "Checking the agent, Qloo and the database…";

  return (
    <section aria-labelledby="system-status-heading" className="rounded-2xl border bg-card p-5">
      <h2 id="system-status-heading" className="text-base font-bold">
        System status
      </h2>
      <div role="status" aria-busy={checking} className="mt-3 space-y-3">
        {view ? (
          <>
            <ul role="list" className="flex flex-col gap-3">
              {view.items.map((item) => {
                const { icon: Icon, className } = TONE[item.tone];
                return (
                  <li key={item.key} className="flex items-start gap-3">
                    <Icon aria-hidden="true" className={`mt-1 size-5 shrink-0 ${className}`} />
                    <div>
                      <p className={`text-lg font-bold ${className}`}>
                        <span aria-hidden="true">{item.label}</span>
                        <span className="sr-only">{item.spoken}</span>
                      </p>
                      <p className="text-base text-muted-foreground">{item.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="text-muted-foreground">{checking ? waitingCopy : view.summary}</p>
          </>
        ) : (
          <p className="text-muted-foreground">{waitingCopy}</p>
        )}
      </div>
      {result && canRetry(result) && (
        <Button
          className="mt-4 h-12 px-5 text-base"
          disabled={checking}
          focusableWhenDisabled
          onClick={retry}
        >
          {checking ? "Checking…" : "Try again"}
        </Button>
      )}
    </section>
  );
}
