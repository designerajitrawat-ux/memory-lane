import { createHash, randomBytes } from "node:crypto";
import type { FastifyRequest } from "fastify";

/**
 * Ownership without login (docs/04 §4). The agent mints a random token on the first profile; the web
 * keeps it on the caregiver's device and sends it as `Authorization: Bearer …`. A bearer header (not a
 * cookie) because the agent and the web are different sites, so an agent cookie would be third-party
 * and blocked by several browsers. Only sha256(token) is stored.
 */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url

export function mintOwnerToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOwnerToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The bearer token from the request, or null when missing or malformed. */
export function readOwnerToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  const token = match?.[1];
  return token && TOKEN_RE.test(token) ? token : null;
}
