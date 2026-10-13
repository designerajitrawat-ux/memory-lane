import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ApiError, ProfileView } from "@memory-lane/shared";
import { hashOwnerToken, readOwnerToken } from "../auth/ownerToken";
import type { ProfileStore } from "./store";

const IdParams = z.object({ id: z.uuid() });

/** The profile in `:id` if the caller's owner token holds it; anyone else gets null (→ 404). */
export async function ownedProfile(
  req: FastifyRequest,
  profiles: ProfileStore,
): Promise<{ profile: ProfileView; ownerHash: string } | null> {
  const params = IdParams.safeParse(req.params);
  const token = readOwnerToken(req);
  if (!params.success || !token) return null;
  const ownerHash = hashOwnerToken(token);
  const stored = await profiles.get(params.data.id, ownerHash);
  return stored?.isOwner ? { profile: stored.view, ownerHash } : null;
}

export const notFound = (reply: FastifyReply) =>
  reply
    .code(404)
    .send({ error: "not_found", message: "We couldn't find that profile." } satisfies ApiError);

/** Data routes answer 503 when the agent has no (migrated) database. */
export const needsDatabase = async (_req: unknown, reply: FastifyReply) =>
  reply.code(503).send({
    error: "unavailable",
    message: "This needs the database, which isn't set up yet.",
  } satisfies ApiError);

/** Responses carry per-owner data: never cached, and keyed by the Authorization header. */
export async function privateResponse(_req: unknown, reply: FastifyReply, payload: unknown) {
  reply.header("Cache-Control", "no-store");
  const vary = reply.getHeader("Vary");
  reply.header("Vary", vary ? `${String(vary)}, Authorization` : "Authorization");
  return payload;
}
