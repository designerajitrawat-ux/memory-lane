import { z } from "zod";
import {
  ApiErrorSchema,
  DemoProfilesResponseSchema,
  EvidenceViewSchema,
  SessionItemSchema,
  SessionListResponseSchema,
  SessionResponseSchema,
  type Reaction,
  ResolveEventSchema,
  SeedResolutionSchema,
  TasteEventSchema,
  TasteProfileResponseSchema,
  TryDemoResponseSchema,
  type ConfirmRequest,
  type ResolveEvent,
  type TasteEvent,
  CreateProfileResponseSchema,
  ProfileListResponseSchema,
  ProfileResponseSchema,
  type ProfileInput,
} from "@memory-lane/shared";
import { AGENT_URL } from "./agent";
import { getOwnerToken, setOwnerToken } from "./owner-token";
import { readSse } from "./sse";

const ResolutionsResponseSchema = z.object({ resolutions: z.array(SeedResolutionSchema) });

export type ApiFailureKind =
  | "offline"
  | "unreachable"
  | "invalid"
  | "not_found"
  | "rate_limited"
  | "limit"
  | "unavailable"
  | "server";

export type ApiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      kind: ApiFailureKind;
      message: string;
      fields?: { path: string; message: string }[];
      /** The agent's error code (e.g. "nothing_confirmed"), so a page can tell 409s apart. */
      code?: string;
    };

const MESSAGES: Record<ApiFailureKind, string> = {
  offline: "You seem to be offline. Check your connection, then try again.",
  unreachable: "We couldn't reach Memory Lane just now. Please try again in a moment.",
  invalid: "Some answers need another look.",
  not_found: "We couldn't find that profile on this device.",
  rate_limited: "Memory Lane is busy just now. Please wait a minute and try again.",
  limit:
    "You have reached the limit for new profiles. Delete one you no longer need, or try again tomorrow.",
  unavailable: "This part of Memory Lane isn't available right now.",
  server: "Something went wrong on our side. Please try again.",
};

function failure<T>(kind: ApiFailureKind, extra: Partial<ApiResult<T>> = {}): ApiResult<T> {
  return { ok: false, kind, message: MESSAGES[kind], ...extra } as ApiResult<T>;
}

const kindForStatus = (status: number): ApiFailureKind =>
  status === 400
    ? "invalid"
    : status === 404
      ? "not_found"
      : status === 429
        ? "rate_limited"
        : status === 409
          ? "limit"
          : status === 503
            ? "unavailable"
            : "server";

/** A failed response as a kind, plus the agent's own error code and field messages. */
async function failureFrom<T>(res: Response): Promise<ApiResult<T>> {
  const body = ApiErrorSchema.safeParse(await res.json().catch(() => null));
  const extra: Partial<ApiResult<T>> = body.success
    ? {
        code: body.data.error,
        ...(body.data.fields ? { fields: body.data.fields } : {}),
        // A note the agent refused says why, gently (it names the kind of detail, never echoes it).
        ...(body.data.error === "invalid_note" ? { message: body.data.message } : {}),
      }
    : {};
  return failure<T>(kindForStatus(res.status), extra);
}

// The free host can take a while to wake; past this a request fails honestly with a retry (ux W17).
const TIMEOUT_MS = 25_000;

/** One request to the agent: bearer token attached, response validated, failures turned into kinds. */
export async function request<S extends z.ZodType>(
  path: string,
  schema: S | null,
  init: RequestInit = {},
): Promise<ApiResult<z.infer<S>>> {
  const token = getOwnerToken();
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${AGENT_URL}${path}`, {
      ...init,
      signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
      cache: "no-store",
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    return failure(
      typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "unreachable",
    );
  }

  if (!res.ok) return failureFrom<z.infer<S>>(res);
  if (!schema) return { ok: true, data: undefined as z.infer<S> };
  const parsed = schema.safeParse(await res.json().catch(() => null));
  return parsed.success ? { ok: true, data: parsed.data } : failure("server");
}

export const api = {
  async createProfile(input: ProfileInput) {
    const result = await request("/api/profiles", CreateProfileResponseSchema, {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (result.ok && result.data.ownerToken) setOwnerToken(result.data.ownerToken);
    return result;
  },
  listProfiles: () => request("/api/profiles", ProfileListResponseSchema),
  listDemoProfiles: () => request("/api/demo-profiles", DemoProfilesResponseSchema),
  getProfile: (id: string) =>
    request(`/api/profiles/${encodeURIComponent(id)}`, ProfileResponseSchema),
  deleteProfile: (id: string) =>
    request(`/api/profiles/${encodeURIComponent(id)}`, null, { method: "DELETE" }),
  listResolutions: (id: string) =>
    request(`/api/profiles/${encodeURIComponent(id)}/seeds`, ResolutionsResponseSchema),
  confirmSeeds: (id: string, decisions: ConfirmRequest["decisions"]) =>
    request(`/api/profiles/${encodeURIComponent(id)}/seeds/confirm`, ResolutionsResponseSchema, {
      method: "POST",
      body: JSON.stringify({ decisions }),
    }),

  /** Streams the agent's Stage 1 run (aborting `signal` stops the agent's lookups too). */
  resolveSeeds: (id: string, onEvent: (e: ResolveEvent) => void, signal?: AbortSignal) =>
    stream(
      `/api/profiles/${encodeURIComponent(id)}/seeds/resolve`,
      ResolveEventSchema,
      onEvent,
      signal,
    ),

  getTasteProfile: (id: string) =>
    request(`/api/profiles/${encodeURIComponent(id)}/taste-profile`, TasteProfileResponseSchema),
  /** Streams the agent's Stage 2 run, which builds a new version of the Life Taste Profile. */
  buildTasteProfile: (id: string, onEvent: (e: TasteEvent) => void, signal?: AbortSignal) =>
    stream(
      `/api/profiles/${encodeURIComponent(id)}/taste-profile`,
      TasteEventSchema,
      onEvent,
      signal,
    ),
  getEvidence: (id: string) =>
    request(`/api/evidence/${encodeURIComponent(id)}`, EvidenceViewSchema),

  planSession: (profileId: string) =>
    request(`/api/profiles/${encodeURIComponent(profileId)}/sessions`, SessionResponseSchema, {
      method: "POST",
    }),
  listSessions: (profileId: string) =>
    request(`/api/profiles/${encodeURIComponent(profileId)}/sessions`, SessionListResponseSchema),
  getSession: (id: string) =>
    request(`/api/sessions/${encodeURIComponent(id)}`, SessionResponseSchema),
  react: (itemId: string, value: Reaction | null, note?: string) =>
    request(
      `/api/session-items/${encodeURIComponent(itemId)}/reaction`,
      z.object({ item: SessionItemSchema }),
      { method: "POST", body: JSON.stringify(note === undefined ? { value } : { value, note }) },
    ),
  /** A private copy of a demo persona on this device, with session 1 ready to play. */
  async tryDemo(profileId: string) {
    const result = await request(
      `/api/demo-profiles/${encodeURIComponent(profileId)}/try`,
      TryDemoResponseSchema,
      { method: "POST" },
    );
    if (result.ok && result.data.ownerToken) setOwnerToken(result.data.ownerToken);
    return result;
  },
  completeSession: (id: string) =>
    request(`/api/sessions/${encodeURIComponent(id)}/complete`, SessionResponseSchema, {
      method: "POST",
    }),
};

/**
 * POSTs to a streaming agent route and hands each parsed event to onEvent as it arrives. Events that
 * don't match the schema are skipped; a cut connection is a failure the page can show honestly.
 */
async function stream<S extends z.ZodType>(
  path: string,
  schema: S,
  onEvent: (e: z.infer<S>) => void,
  signal?: AbortSignal,
): Promise<ApiResult<null>> {
  const token = getOwnerToken();
  let res: Response;
  try {
    res = await fetch(`${AGENT_URL}${path}`, {
      method: "POST",
      cache: "no-store",
      headers: token ? { authorization: `Bearer ${token}` } : {},
      signal,
    });
  } catch {
    return failure(
      typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "unreachable",
    );
  }
  if (!res.ok) return failureFrom<null>(res);
  if (!res.body) return failure("server");
  try {
    for await (const data of readSse(res.body)) {
      const parsed = schema.safeParse(JSON.parse(data));
      if (parsed.success) onEvent(parsed.data);
    }
  } catch {
    return failure("unreachable");
  }
  return { ok: true, data: null };
}
