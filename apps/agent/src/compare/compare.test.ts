import { beforeAll, describe, expect, it } from "vitest";
import { CompareResponseSchema, SessionResponseSchema } from "@memory-lane/shared";
import describeFixture from "../../test/fixtures/synthetic/qloo_describe.json";
import findTagsFixture from "../../test/fixtures/synthetic/qloo_find_tags.json";
import recommendFixture from "../../test/fixtures/synthetic/qloo_recommend.json";
import { createTestDb } from "../../test/pglite";
import { buildApp } from "../app";
import type { AppDb } from "../db/types";
import { ensureDemoProfiles } from "../demo/seed";
import { NO_LLM, type LlmClient, type LlmRequest } from "../llm/client";
import { createProfileStore } from "../profiles/store";
import { createPgEvidenceStore } from "../qloo/evidence";
import { createQlooGateway } from "../qloo/gateway";
import type { McpToolResult, QlooMcpClient } from "../qloo/mcpClient";
import { createResolutionStore } from "../stage1/store";
import { createTasteStore } from "../stage2/store";
import { createSessionStore } from "../stage3/store";

// SYNTHETIC answers (not Qloo data, not model output).
const fakeQloo: QlooMcpClient = {
  async callTool(name: string): Promise<McpToolResult> {
    if (name === "qloo_describe") return { structuredContent: describeFixture.structuredContent };
    if (name === "qloo_find_tags") return { structuredContent: findTagsFixture.structuredContent };
    return { structuredContent: recommendFixture.structuredContent };
  },
  async close() {},
};

/** A fake LLM: the same "greatest hits" for everyone, and prompts with one memory test mixed in. */
const sent: { task: string; input: Record<string, unknown> }[] = [];
const fakeLlm: LlmClient = {
  configured: true,
  model: "test-model",
  async json<T>(req: LlmRequest<T>) {
    sent.push({ task: req.task, input: req.input });
    const data =
      req.task === "compare"
        ? {
            items: [
              { kind: "song", name: "Famous Crooner", year: 1956, why: "A classic of the era." },
              { kind: "film", name: "Blockbuster Musical", year: 1965, why: "Loved by many." },
              { kind: "food", name: "Apple Pie", year: null, why: "Comforting." },
              { kind: "place", name: "City Park", year: null, why: "A day out." },
              { kind: "film", name: "Unchained Melody", year: 1997, why: "A love story." },
              { kind: "song", name: "Famous Band", year: 1964, why: "Everyone sang along." },
            ],
          }
        : req.task === "prompts"
          ? {
              items: ((req.input.items as { n: number }[]) ?? []).map((i) => ({
                n: i.n,
                prompts: [
                  "What does this music bring to mind for you?",
                  "Do you remember who sang it first?",
                  "Who would you share an evening like this with?",
                ],
              })),
            }
          : { tvShows: [], singers: [] };
    return { kind: "ok" as const, data: req.schema.parse(data), cached: false };
  },
};

let db: AppDb;
beforeAll(async () => {
  db = await createTestDb();
}, 30_000);

function deps(llm: LlmClient) {
  const gateway = createQlooGateway({
    mcp: fakeQloo,
    evidence: createPgEvidenceStore(db),
    sleep: async () => {},
  });
  return {
    db,
    profiles: createProfileStore(db),
    resolutions: createResolutionStore(db),
    taste: createTasteStore(db),
    sessions: createSessionStore(db),
    gateway,
    llm,
    log: { info: () => {}, warn: () => {} },
  };
}

async function app(llm: LlmClient) {
  const d = deps(llm);
  return buildApp({
    gateway: { capabilities: async () => ({ ok: true, state: "ok", message: "ready" }) },
    db: null,
    profiles: d.profiles,
    sessions: { profiles: d.profiles, taste: d.taste, sessions: d.sessions, gateway: d.gateway },
    compare: { profiles: d.profiles, taste: d.taste, sessions: d.sessions, llm, db },
    version: "test",
    webOrigins: ["https://web.example"],
    logger: false,
  });
}

describe("with vs without Qloo (compare) and the LLM's prompts", () => {
  it("counts what the generic plan lacks: evidence, their years, the avoid-list, specificity", async () => {
    await ensureDemoProfiles(deps(fakeLlm));
    // The generic plans were made at seeding, from public facts only (no nickname anywhere).
    expect(sent.filter((s) => s.task === "compare")).toHaveLength(3);
    expect(JSON.stringify(sent)).not.toMatch(/Dorothy|Harjeet|Margaret/);

    const a = await app(fakeLlm);
    try {
      const demos = (await a.inject({ method: "GET", url: "/api/demo-profiles" })).json()
        .profiles as { id: string; nickname: string; latestSessionId: string }[];
      const dorothy = demos.find((d) => d.nickname === "Dorothy");
      if (!dorothy) throw new Error("no demo");
      const seeded = new Set(
        sent.filter((s) => s.task === "compare").map((s) => JSON.stringify(s.input)),
      );
      const before = sent.length;
      const res = await a.inject({ method: "GET", url: `/api/profiles/${dorothy.id}/compare` });
      expect(res.statusCode).toBe(200);
      const compare = CompareResponseSchema.parse(res.json());
      // The same facts as at seeding, so the real client answers from its cache: judges never wait.
      const asked = sent.slice(before).filter((s) => s.task === "compare");
      expect(asked.every((s) => seeded.has(JSON.stringify(s.input)))).toBe(true);
      expect(compare.state).toBe("ready");
      expect(compare.comparedWith).toEqual(["Harjeet", "Margaret"]);
      const generic = compare.generic;
      const ours = compare.memoryLane;
      if (!generic || !ours) throw new Error("missing plan");
      expect(generic.withEvidence).toBe(0);
      expect(ours.withEvidence).toBe(ours.items.length);
      expect(generic.outsideYears).toBe(1); // a 1997 film for someone born in 1946
      expect(generic.avoided).toBe(1); // "Unchained Melody" is on Dorothy's avoid-list
      expect(generic.shared).toBe(generic.items.length); // the same "greatest hits" for everyone
      expect(ours.avoided).toBe(0);

      // Session prompts came from the LLM, minus the memory test.
      const session = SessionResponseSchema.parse(
        (await a.inject({ method: "GET", url: `/api/sessions/${dorothy.latestSessionId}` })).json(),
      ).session;
      expect(session.items[0]?.prompts).toEqual([
        "What does this music bring to mind for you?",
        "Who would you share an evening like this with?",
      ]);
    } finally {
      await a.close();
    }
  }, 60_000);

  it("says honestly when the AI side is switched off", async () => {
    const a = await app(NO_LLM);
    try {
      const demos = (await a.inject({ method: "GET", url: "/api/demo-profiles" })).json()
        .profiles as { id: string }[];
      const compare = CompareResponseSchema.parse(
        (await a.inject({ method: "GET", url: `/api/profiles/${demos[0]?.id}/compare` })).json(),
      );
      expect(compare.state).toBe("off");
      expect(compare.generic).toBeNull();
      expect(compare.memoryLane?.items.length).toBeGreaterThan(0);
    } finally {
      await a.close();
    }
  });
});
