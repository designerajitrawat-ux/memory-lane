import { isIP } from "node:net";
import type { FastifyRequest } from "fastify";

/**
 * The client key used for rate limits. On Render the edge is Cloudflare, which always overwrites
 * `cf-connecting-ip` with the real client address and rejects requests that send it themselves
 * (verified 2026-10-12 with spoofed-header probes). Counting proxy hops instead is fragile: Render's
 * free tier adds an in-container proxy, so the chain length depends on the plan.
 * Without the header (local dev, other hosts) Fastify's `req.ip` is used.
 * IPv6 addresses are keyed by their /64, since one household or phone usually holds a whole /64.
 */
export function clientIpResolver(header: string | undefined, onHeaderMissing?: () => void) {
  const name = header?.trim().toLowerCase();
  let warned = false;
  return (req: FastifyRequest): string => {
    if (name) {
      const raw = req.headers[name];
      const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
      if (value && isIP(value)) return rateLimitKey(value);
      if (!warned) {
        warned = true;
        onHeaderMissing?.();
      }
    }
    return rateLimitKey(req.ip);
  };
}

export function rateLimitKey(ip: string): string {
  if (isIP(ip) !== 6) return ip;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped?.[1]) return mapped[1];
  const [head = "", tail] = ip.toLowerCase().split("::");
  const front = head ? head.split(":") : [];
  const back = tail ? tail.split(":") : [];
  const groups =
    tail === undefined
      ? front
      : [
          ...front,
          ...Array<string>(Math.max(0, 8 - front.length - back.length)).fill("0"),
          ...back,
        ];
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}
