import type { FieldErrors, Resolver } from "react-hook-form";
import { ProfileInputSchema, type Domain, type ProfileInput } from "@memory-lane/shared";

/** What the wizard's inputs hold (text boxes give strings); `toInput` turns it into the shared shape. */
export interface ProfileFormValues {
  nickname: string;
  birthYear: string;
  languages: { value: string }[];
  lifeStages: { region: string; fromYear: string; toYear: string }[];
  favourites: { domain: Domain; text: string }[];
  avoid: { text: string; reason: string }[];
}

export const EMPTY_FORM: ProfileFormValues = {
  nickname: "",
  birthYear: "",
  languages: [{ value: "" }],
  lifeStages: [{ region: "", fromYear: "", toYear: "" }],
  favourites: [{ domain: "music", text: "" }],
  avoid: [],
};

export const STEPS = [
  { title: "About them", fields: ["nickname", "birthYear", "languages"] },
  { title: "Places", fields: ["lifeStages"] },
  { title: "Favourites", fields: ["favourites"] },
  { title: "Things to avoid", fields: ["avoid"] },
] as const;

const ARRAY_FIELDS = new Set(["languages", "lifeStages", "favourites", "avoid"]);

const num = (s: string) => (s.trim() === "" ? Number.NaN : Number(s));

export function toInput(v: ProfileFormValues): ProfileInput {
  return {
    nickname: v.nickname,
    birthYear: num(v.birthYear),
    languages: v.languages.map((l) => l.value),
    lifeStages: v.lifeStages.map((s) => ({
      region: s.region,
      fromYear: num(s.fromYear),
      toYear: num(s.toYear),
    })),
    favourites: v.favourites.map((f) => ({ domain: f.domain, text: f.text })),
    avoid: v.avoid.map((a) => ({ text: a.text, reason: a.reason.trim() || undefined })),
  };
}

/** Maps a shared-schema path ("languages.0", "favourites") to the form's field path. */
export function formPath(path: string): string {
  if (/^languages\.\d+$/.test(path)) return `${path}.value`;
  if (ARRAY_FIELDS.has(path)) return `${path}.root`;
  return path;
}

/** Which wizard step owns a field path. */
export function stepOf(path: string): number {
  const head = path.split(".")[0] ?? "";
  const i = STEPS.findIndex((s) => (s.fields as readonly string[]).includes(head));
  return i === -1 ? 0 : i;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".");
  let node: Record<string, unknown> = target;
  keys.forEach((key, i) => {
    if (i === keys.length - 1) {
      if (node[key] === undefined) node[key] = value;
      return;
    }
    const nextIsIndex = /^\d+$/.test(keys[i + 1] ?? "");
    node[key] ??= nextIsIndex ? [] : {};
    node = node[key] as Record<string, unknown>;
  });
}

/** react-hook-form resolver backed by the shared ProfileInputSchema (same rules as the agent). */
export const profileResolver: Resolver<ProfileFormValues> = async (values) => {
  const result = ProfileInputSchema.safeParse(toInput(values));
  if (result.success) return { values, errors: {} };
  const errors: Record<string, unknown> = {};
  for (const issue of result.error.issues) {
    setPath(errors, formPath(issue.path.join(".")), { type: issue.code, message: issue.message });
  }
  return { values: {}, errors: errors as FieldErrors<ProfileFormValues> };
};
