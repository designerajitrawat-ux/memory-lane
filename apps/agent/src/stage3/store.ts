import { and, asc, count, desc, eq, inArray, isNotNull, lte, max, sql } from "drizzle-orm";
import type {
  Reaction,
  Session,
  SessionItem,
  SessionLinkSchema,
  SessionSummary,
} from "@memory-lane/shared";
import type { z } from "zod";
import { avoidItems, profiles, sessionItems, sessions } from "../db/schema";
import type { AppDb } from "../db/types";
import type { ComposedItem } from "./compose";

type Link = z.infer<typeof SessionLinkSchema>;

/** Sessions kept per profile; the oldest go first (security review W1: planning costs no Qloo call). */
export const MAX_SESSIONS = 50;

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
  /**
   * The newest session if it is still planned (nothing logged yet) and was made from this taste
   * profile version: planning again returns it instead of piling up unused plans.
   */
  unplayed(profileId: string, tasteProfileId: string): Promise<Session | null>;
  /**
   * The session if the owner token holds its profile, or if it belongs to a public demo persona
   * (`readOnly`); anyone else gets null (→ 404).
   */
  get(
    sessionId: string,
    ownerHash: string | null,
  ): Promise<{ session: Session; readOnly: boolean } | null>;
  /** Entity ids of the newest session, to rotate them out of the next one. */
  lastSessionEntities(profileId: string): Promise<Set<string>>;
  reactions(profileId: string): Promise<ReactedItem[]>;
  /** `seeding` lets the demo seeder (server code only) write a demo persona's sample reactions. */
  react(
    itemId: string,
    ownerHash: string,
    value: Reaction | null,
    /** undefined keeps the current note; null removes it. */
    note: string | null | undefined,
    opts?: { seeding?: boolean },
  ): Promise<SessionItem | null>;
  complete(
    sessionId: string,
    ownerHash: string,
    opts?: { seeding?: boolean },
  ): Promise<Session | null>;
  /** Stage 4: things that seemed to upset them join the avoid-list (once; the reason is owner-only). */
  addLearnedAvoid(
    profileId: string,
    items: readonly { text: string; reason: string }[],
  ): Promise<number>;
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

  /** The session row, only if its profile belongs to this owner (demo personas never change). */
  async function owned(sessionId: string, ownerHash: string, seeding = false) {
    const [row] = await db
      .select({ session: sessions })
      .from(sessions)
      .innerJoin(profiles, eq(profiles.id, sessions.profileId))
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(profiles.ownerTokenHash, ownerHash),
          eq(profiles.isDemo, seeding),
        ),
      )
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
        await tx
          .delete(sessions)
          .where(
            and(
              eq(sessions.profileId, profileId),
              lte(sessions.number, created.number - MAX_SESSIONS),
            ),
          );
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

    async unplayed(profileId, tasteProfileId) {
      const [row] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.profileId, profileId))
        .orderBy(desc(sessions.number))
        .limit(1);
      return row && row.status === "planned" && row.tasteProfileId === tasteProfileId
        ? load(row)
        : null;
    },

    async get(sessionId, ownerHash) {
      const [row] = await db
        .select({ session: sessions, owner: profiles.ownerTokenHash, isDemo: profiles.isDemo })
        .from(sessions)
        .innerJoin(profiles, eq(profiles.id, sessions.profileId))
        .where(eq(sessions.id, sessionId))
        .limit(1);
      if (!row) return null;
      const isOwner = ownerHash !== null && row.owner === ownerHash;
      if (!isOwner && !row.isDemo) return null;
      const session = await load(row.session);
      // Notes are the owner's own words: never shown to anyone else (security review S1).
      return {
        session: isOwner
          ? session
          : { ...session, items: session.items.map((i) => ({ ...i, note: null })) },
        readOnly: !isOwner,
      };
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

    async react(itemId, ownerHash, value, note, opts = {}) {
      const [hit] = await db
        .select({ sessionId: sessionItems.sessionId, status: sessions.status })
        .from(sessionItems)
        .innerJoin(sessions, eq(sessions.id, sessionItems.sessionId))
        .innerJoin(profiles, eq(profiles.id, sessions.profileId))
        .where(
          and(
            eq(sessionItems.id, itemId),
            eq(profiles.ownerTokenHash, ownerHash),
            eq(profiles.isDemo, opts.seeding ?? false),
          ),
        )
        .limit(1);
      if (!hit) return null;
      const [updated] = await db
        .update(sessionItems)
        .set({
          reaction: value,
          ...(note === undefined ? {} : { note }),
          reactedAt: value ? new Date() : null,
        })
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

    async addLearnedAvoid(profileId, items) {
      if (items.length === 0) return 0;
      const existing = await db
        .select({ text: avoidItems.text, position: avoidItems.position })
        .from(avoidItems)
        .where(eq(avoidItems.profileId, profileId));
      const known = new Set(existing.map((e) => e.text.trim().toLowerCase()));
      let position = existing.reduce((m, e) => Math.max(m, e.position), -1);
      const rows = items
        .filter((i) => !known.has(i.text.trim().toLowerCase()))
        .map((i) => ({
          profileId,
          position: ++position,
          text: i.text.slice(0, 200),
          reason: i.reason.slice(0, 200),
          source: "learned",
        }));
      if (rows.length) await db.insert(avoidItems).values(rows);
      return rows.length;
    },

    async complete(sessionId, ownerHash, opts = {}) {
      const row = await owned(sessionId, ownerHash, opts.seeding ?? false);
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
