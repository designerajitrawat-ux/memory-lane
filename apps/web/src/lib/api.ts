import { z } from "zod";
import {
  ApiErrorSchema,
  ResolveEventSchema,
  SeedResolutionSchema,
  type ConfirmRequest,
  type ResolveEvent,
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

/** One request to the agent: bearer token attached, response validated, failures turned into kinds. */
export async function request<S extends z.ZodType>(
  path: string,
  schema: S | null,
  init: RequestInit = {},
): Promise<ApiResult<z.infer<S>>> {
  const token = getOwnerToken();
  let res: Response;
  try {
    res = await fetch(`${AGENT_URL}${path}`, {
      ...init,
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

  if (!res.ok) {
    const body = ApiErrorSchema.safeParse(await res.json().catch(() => null));
    const fields = body.success ? body.data.fields : undefined;
    return failure(kindForStatus(res.status), fields ? { fields } : {});
  }
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

  /**
   * Streams the agent's Stage 1 run; each event goes to onEvent as it arrives. Aborting `signal` (the
   * page closed) ends the request, and the agent stops looking favourites up.
   */
  async resolveSeeds(
    id: string,
    onEvent: (e: ResolveEvent) => void,
    signal?: AbortSignal,
  ): Promise<ApiResult<null>> {
    const token = getOwnerToken();
    let res: Response;
    try {
      res = await fetch(`${AGENT_URL}/api/profiles/${encodeURIComponent(id)}/seeds/resolve`, {
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
    if (!res.ok || !res.body) return failure(res.ok ? "server" : kindForStatus(res.status));
    try {
      for await (const data of readSse(res.body)) {
        const parsed = ResolveEventSchema.safeParse(JSON.parse(data));
        if (parsed.success) onEvent(parsed.data);
      }
    } catch {
      return failure("unreachable");
    }
    return { ok: true, data: null };
  },
};
