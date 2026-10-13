import type { FastifyReply } from "fastify";

const PING_MS = 15_000; // keeps proxies (Cloudflare: 100 s idle) from cutting a slow run

/**
 * Streams Server-Sent Events over the current request (EventSource can't POST or send the bearer
 * header, so the web reads this from fetch). CORS/helmet headers set by earlier hooks are kept; only
 * fixed app text is ever written (security review S10).
 */
export function startSse(reply: FastifyReply) {
  reply.hijack();
  reply.raw.writeHead(200, {
    ...(reply.getHeaders() as Record<string, string>),
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    vary: "Origin, Authorization",
    "x-accel-buffering": "no",
  });
  let aborted = false;
  // `close` on the response (not the request): with a request body Fastify consumes the request stream
  // first, so its `close` would fire before anyone listens (security review suggestion 1).
  reply.raw.on("close", () => {
    if (!reply.raw.writableFinished) aborted = true;
  });
  const ping = setInterval(() => {
    if (!aborted) reply.raw.write(": ping\n\n");
  }, PING_MS);
  ping.unref();
  return {
    send(event: unknown) {
      if (!aborted) reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    },
    isAborted: () => aborted,
    end() {
      clearInterval(ping);
      reply.raw.end();
    },
  };
}

/** One run per key at a time (security review W1: parallel runs multiplied live Qloo calls). */
export function createRunLock() {
  const running = new Set<string>();
  return {
    tryAcquire(key: string) {
      if (running.has(key)) return false;
      running.add(key);
      return true;
    },
    release(key: string) {
      running.delete(key);
    },
  };
}
