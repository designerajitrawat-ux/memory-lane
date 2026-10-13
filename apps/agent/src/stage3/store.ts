import { and, asc, count, desc, eq, inArray, isNotNull, max, sql } from "drizzle-orm";
import type {
  Reaction,
  Session,
  SessionItem,
  SessionLinkSchema,
  SessionSummary,
} from "@memory-lane/shared";
import type { z } from "zod";
import { profiles, sessionItems, sessions } from "../db/schema";
import type { AppDb } from "../db/types";
import type { ComposedItem } from "./compose";

type Link = z.infer<typeof SessionLinkSchema>;

/** A reacted item from any earlier session, for Stage 4. */
export interface ReactedItem {
  sessionNumber: number;
  entityId: string;
  entityType: string | null;
  domain: string;
  name: string;
  reaction: Reaction;
}

export interface SessionStore {
  create(
    profileId: string,
    tasteProfileId: string,
    items: readonly ComposedItem[],
    whatChanged: readonly string[],
  ): Promise<Session>;
  list(profileId: string): Promise<SessionSummary[]>;
  /** The session if the owner token holds its profile; anyone else gets null (→ 404). */
  get(sessionId: string, ownerHash: string): Promise<Session | null>;
  /** Entity ids of the newest session, to rotate them out of the next one. */
  lastSessionEntities(profileId: string): Promise<Set<string>>;
  reactions(profileId: string): Promise<ReactedItem[]>;
  react(
    itemId: string,
    ownerHash: string,
    value: Reaction | null,
    note: string | null,
  ): Promise<SessionItem | null>;
  complete(sessionId: string, ownerHash: string): Promise<Session | null>;
}

export function createSessionStore(db: AppDb): SessionStore {
  const toItem = (r: typeof sessionItems.$inferSelect): SessionItem => ({
    id: r.id,
    position: r.position,
    kind: r.kind as SessionItem["kind"],
    domain: r.domain as SessionItem["domain"],
    entityId: r.entityId,
    entityType: r.entityType,
    name: r.name,
    year: r.year,
    why: r.why,
    prompts: r.prompts,
    minutes: r.minutes,
    link: r.link as Link,
    altLink: (r.altLink as Link | null) ?? null,
    evidenceIds: r.evidenceIds,
    reaction: (r.reaction as Reaction | null) ?? null,
    note: r.note,
  });

  async function load(row: typeof sessions.$inferSelect): Promise<Session> {
    const items = await db
      .select()
      .from(sessionItems)
      .where(eq(sessionItems.sessionId, row.id))
      .orderBy(asc(sessionItems.position));
    return {
      id: row.id,
      profileId: row.profileId,
      number: row.number,
      status: row.status as Session["status"],
      createdAt: row.createdAt.toISOString(),
      totalMinutes: items.reduce((a, i) => a + i.minutes, 0),
      items: items.map(toItem),
      whatChanged: row.whatChanged as string[],
    };
  }

  /** The session row, only if its profile belongs to this owner. */
  async function owned(sessionId: string, ownerHash: string) {
    const [row] = await db
      .select({ session: sessions })
      .from(sessions)
      .innerJoin(profiles, eq(profiles.id, sessions.profileId))
      .where(and(eq(sessions.id, sessionId), eq(profiles.ownerTokenHash, ownerHash)))
      .limit(1);
    return row?.session ?? null;
  }

  return {
    async create(profileId, tasteProfileId, items, whatChanged) {
      const row = await db.transaction(async (tx) => {
        const [current] = await tx
          .select({ n: max(sessions.number) })
          .from(sessions)
          .where(eq(sessions.profileId, profileId));
        const [created] = await tx
          .insert(sessions)
          .values({
            profileId,
            number: (current?.n ?? 0) + 1,
            tasteProfileId,
            whatChanged: [...whatChanged],
          })
          .returning();
        if (!created) throw new Error("session insert returned no row");
        if (items.length) {
          await tx.insert(sessionItems).values(
            items.map((i) => ({
              sessionId: created.id,
              position: i.position,
              kind: i.kind,
              domain: i.domain,
              entityId: i.entityId,
              entityType: i.entityType,
              name: i.name,
              year: i.year,
              why: i.why,
              prompts: i.prompts,
              minutes: i.minutes,
              link: i.link,
              altLink: i.altLink,
              evidenceIds: i.evidenceIds,
            })),
          );
        }
        return created;
      });
      return load(row);
    },

    async list(profileId) {
      const rows = await db
        .select({
          id: sessions.id,
          number: sessions.number,
          status: sessions.status,
          createdAt: sessions.createdAt,
          itemCount: count(sessionItems.id),
          reacted: sql<number>`count(${sessionItems.reaction})::int`,
        })
        .from(sessions)
        .leftJoin(sessionItems, eq(sessionItems.sessionId, sessions.id))
        .where(eq(sessions.profileId, profileId))
        .groupBy(sessions.id)
        .orderBy(desc(sessions.number));
      return rows.map((r) => ({
        id: r.id,
        number: r.number,
        status: r.status as SessionSummary["status"],
        createdAt: r.createdAt.toISOString(),
        itemCount: Number(r.itemCount),
        reacted: Number(r.reacted),
      }));
    },

    async get(sessionId, ownerHash) {
      const row = await owned(sessionId, ownerHash);
      return row ? load(row) : null;
    },

    async lastSessionEntities(profileId) {
      const [last] = await db
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.profileId, profileId))
        .orderBy(desc(sessions.number))
        .limit(1);
      if (!last) return new Set();
      const rows = await db
        .select({ entityId: sessionItems.entityId })
        .from(sessionItems)
        .where(eq(sessionItems.sessionId, last.id));
      return new Set(rows.map((r) => r.entityId));
    },

    async reactions(profileId) {
      const ids = await db
        .select({ id: sessions.id, number: sessions.number })
        .from(sessions)
        .where(eq(sessions.profileId, profileId));
      if (ids.length === 0) return [];
      const numberOf = new Map(ids.map((s) => [s.id, s.number]));
      const rows = await db
        .select()
        .from(sessionItems)
        .where(
          and(
            inArray(
              sessionItems.sessionId,
              ids.map((s) => s.id),
            ),
            isNotNull(sessionItems.reaction),
          ),
        );
      return rows.map((r) => ({
        sessionNumber: numberOf.get(r.sessionId) ?? 0,
        entityId: r.entityId,
        entityType: r.entityType,
        domain: r.domain,
        name: r.name,
        reaction: r.reaction as Reaction,
      }));
    },

    async react(itemId, ownerHash, value, note) {
      const [hit] = await db
        .select({ sessionId: sessionItems.sessionId, status: sessions.status })
        .from(sessionItems)
        .innerJoin(sessions, eq(sessions.id, sessionItems.sessionId))
        .innerJoin(profiles, eq(profiles.id, sessions.profileId))
        .where(and(eq(sessionItems.id, itemId), eq(profiles.ownerTokenHash, ownerHash)))
        .limit(1);
      if (!hit) return null;
      const [updated] = await db
        .update(sessionItems)
        .set({ reaction: value, note, reactedAt: value ? new Date() : null })
        .where(eq(sessionItems.id, itemId))
        .returning();
      if (hit.status === "planned") {
        await db
          .update(sessions)
          .set({ status: "in_progress" })
          .where(eq(sessions.id, hit.sessionId));
      }
      return updated ? toItem(updated) : null;
    },

    async complete(sessionId, ownerHash) {
      const row = await owned(sessionId, ownerHash);
      if (!row) return null;
      const [done] = await db
        .update(sessions)
        .set({ status: "done" })
        .where(eq(sessions.id, sessionId))
        .returning();
      return done ? load(done) : null;
    },
  };
}
