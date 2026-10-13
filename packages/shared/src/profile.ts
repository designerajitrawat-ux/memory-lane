import { z } from "zod";
import {
  DIGIT,
  EMAIL,
  HEALTH,
  normalizeText,
  PHONE,
  POSTCODE,
  STREET,
  STREET_WORD,
  UNIT_NUMBER,
  URL_LIKE,
} from "./pii";

/**
 * Profile data from the 4-step wizard (docs/01 §5, docs/06 screen 3). Only what reminiscence needs:
 * a nickname (optional, never sent to Qloo or the AI), birth year, languages, coarse places and a few
 * public cultural favourites. No health data, no addresses, no contact details (docs/07 §1).
 */
export const DomainSchema = z.enum(["music", "film", "tv", "food", "place", "other"]);
export const SeedStatusSchema = z.enum([
  "pending",
  "needs_input",
  "confirmed",
  "rejected",
  "unresolved",
]);
/** Why a favourite wasn't matched, or couldn't be checked this time (Stage 1). Shown as fixed text. */
export const SeedNoteSchema = z.enum([
  "not_found",
  "no_clear_match",
  "personal_info",
  "invalid",
  "lookup_failed",
]);

const CURRENT_YEAR = new Date().getUTCFullYear();

const ADDRESS_MESSAGE = "Please leave out street addresses, house numbers and postcodes.";

/**
 * Free text that must not carry contact, address or health details. Uses the same patterns as the
 * Qloo PII guard (pii.ts) on normalised text. `address` adds postcode/street checks for descriptive
 * text; entity names skip them because titles like "21 Jump Street" are real.
 */
const freeText = (max: number, { address = false } = {}) =>
  z
    .string()
    .trim()
    .min(1, "Please fill this in, or remove this row.")
    .max(max, `Please keep this under ${max} characters.`)
    .refine(
      (s) => !HEALTH.test(normalizeText(s)),
      "Please leave out health or medical details. They aren't needed.",
    )
    .refine((s) => !EMAIL.test(normalizeText(s)), "Please leave out email addresses.")
    .refine((s) => !URL_LIKE.test(normalizeText(s)), "Please leave out web links.")
    .refine((s) => !PHONE.test(normalizeText(s)), "Please leave out phone numbers.")
    .refine((s) => !UNIT_NUMBER.test(normalizeText(s)), ADDRESS_MESSAGE)
    .refine(
      (s) => !address || !(POSTCODE.test(normalizeText(s)) || STREET.test(normalizeText(s))),
      ADDRESS_MESSAGE,
    );

const year = () =>
  z
    .number({ error: "Please enter a year like 1965." })
    .int("Please enter a whole year, like 1965.")
    .min(1915, "Please enter a year from 1915 on.")
    .max(CURRENT_YEAR, "Please enter a year up to this year.");

export const LifeStageSchema = z
  .object({
    region: z
      .string()
      .trim()
      .min(2, "Please name a city or region.")
      .max(80, "Please keep this under 80 characters.")
      .refine(
        (s) => !DIGIT.test(normalizeText(s)),
        "City or region only, please. No street, house number or postcode.",
      )
      .refine(
        (s) => !(EMAIL.test(normalizeText(s)) || URL_LIKE.test(normalizeText(s))),
        "City or region only, please.",
      )
      .refine((s) => !HEALTH.test(normalizeText(s)), "City or region only, please.")
      .refine(
        (s) => !STREET_WORD.test(normalizeText(s)),
        "The town or city is enough, please. No street names.",
      ),
    fromYear: year(),
    toYear: year(),
  })
  .refine((s) => s.fromYear <= s.toYear, {
    message: "'Until' should be the same year as 'From' or later.",
    path: ["toYear"],
  });

export const FavouriteInputSchema = z.object({ domain: DomainSchema, text: freeText(100) });
export const AvoidInputSchema = z.object({
  text: freeText(100, { address: true }),
  reason: freeText(200, { address: true }).optional(),
});

export const ProfileInputSchema = z
  .object({
    nickname: z
      .string()
      .trim()
      .max(30, "Please keep the nickname under 30 characters.")
      .regex(/^[\p{L}\p{M}' .-]*$/u, "Letters, spaces, apostrophes and hyphens only.")
      .refine(
        (s) => s.split(/\s+/).filter(Boolean).length <= 2,
        'A first name or family nickname is enough, like "Dad" or "Nani".',
      )
      .optional()
      .transform((v) => v || undefined),
    birthYear: z
      .number({ error: "Please enter a year like 1950." })
      .int("Please enter a whole year, like 1950.")
      .min(1915, "Please enter a year from 1915 on.")
      .max(2015, "Please enter a year up to 2015."),
    languages: z
      .array(freeText(30))
      .min(1, "Add at least one language.")
      .max(5, "Up to 5 languages."),
    lifeStages: z
      .array(LifeStageSchema)
      .min(1, "Add at least one place.")
      .max(5, "Up to 5 places."),
    favourites: z
      .array(FavouriteInputSchema)
      .min(1, "Add at least one favourite.")
      .max(10, "Up to 10 favourites."),
    avoid: z.array(AvoidInputSchema).max(10, "Up to 10 items."),
  })
  .superRefine((p, ctx) => {
    p.lifeStages.forEach((s, i) => {
      if (s.fromYear < p.birthYear) {
        ctx.addIssue({
          code: "custom",
          path: ["lifeStages", i, "fromYear"],
          message: "This is before they were born. Please check the year.",
        });
      }
    });
  });

export const SeedViewSchema = z.object({
  id: z.string(),
  domain: DomainSchema,
  rawText: z.string(),
  status: SeedStatusSchema,
  note: SeedNoteSchema.nullable(),
  displayName: z.string().nullable(),
});

export const AvoidViewSchema = z.object({
  id: z.string(),
  text: z.string(),
  reason: z.string().nullable(),
});

export const ProfileViewSchema = z.object({
  id: z.string(),
  nickname: z.string().nullable(),
  birthYear: z.number().int(),
  languages: z.array(z.string()),
  lifeStages: z.array(z.object({ region: z.string(), fromYear: z.number(), toYear: z.number() })),
  seeds: z.array(SeedViewSchema),
  avoid: z.array(AvoidViewSchema),
  isDemo: z.boolean(),
  createdAt: z.string(),
});

/** GET /api/demo-profiles: the public, fictional demo personas (docs/11). */
export const DemoProfileSchema = z.object({
  id: z.string(),
  nickname: z.string().nullable(),
  birthYear: z.number().int(),
  regions: z.array(z.string()),
  /** A few confirmed favourites, as hints on the demo picker. */
  favourites: z.array(z.string()),
});
export const DemoProfilesResponseSchema = z.object({ profiles: z.array(DemoProfileSchema) });

export const ProfileSummarySchema = ProfileViewSchema.pick({
  id: true,
  nickname: true,
  birthYear: true,
  isDemo: true,
  createdAt: true,
});

export const CreateProfileResponseSchema = z.object({
  profile: ProfileViewSchema,
  /** Only present when the agent minted a new owner token; the web stores it on the device. */
  ownerToken: z.string().optional(),
});

export const ProfileListResponseSchema = z.object({ profiles: z.array(ProfileSummarySchema) });

export const ProfileResponseSchema = z.object({ profile: ProfileViewSchema, isOwner: z.boolean() });

/** 4xx body: which fields failed, never the submitted values. */
export const ApiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  fields: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

export type Domain = z.infer<typeof DomainSchema>;
export type SeedNote = z.infer<typeof SeedNoteSchema>;
export type ProfileInput = z.input<typeof ProfileInputSchema>;
export type ProfileInputParsed = z.output<typeof ProfileInputSchema>;
export type ProfileView = z.infer<typeof ProfileViewSchema>;
export type ProfileSummary = z.infer<typeof ProfileSummarySchema>;
export type DemoProfile = z.infer<typeof DemoProfileSchema>;
export type CreateProfileResponse = z.infer<typeof CreateProfileResponseSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
