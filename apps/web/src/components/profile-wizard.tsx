"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, type FieldPath } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { describedBy, FieldError, Hint, selectClass } from "@/components/form-bits";
import { api } from "@/lib/api";
import { canRememberOnThisDevice } from "@/lib/owner-token";
import {
  EMPTY_FORM,
  formPath,
  profileResolver,
  stepOf,
  STEPS,
  toInput,
  type ProfileFormValues,
} from "@/lib/profile-form";

const DOMAIN_LABELS = {
  music: "Music or singer",
  film: "Film",
  tv: "TV show",
  food: "Food or dish",
  place: "Place",
  other: "Something else",
} as const;

const DRAFT_KEY = "memory-lane.profile-draft";
const SAVE_FAILED =
  "We couldn't save just now. Your answers are still here. Please try Save again in a minute.";
const addButton = "h-12 px-4 text-base";
// Names of people, songs and places: phone keyboards shouldn't "correct" them.
const nameInput = { autoCorrect: "off", spellCheck: false, autoCapitalize: "words" } as const;

function readDraft(): ProfileFormValues | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as ProfileFormValues) : null;
  } catch {
    return null;
  }
}

function writeDraft(values: ProfileFormValues | null) {
  try {
    if (values) window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(values));
    else window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Drafts are a convenience; without storage the form still works.
  }
}

export function ProfileWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [remembers, setRemembers] = useState(true);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  const saved = useRef(false);

  const form = useForm<ProfileFormValues>({
    resolver: profileResolver,
    defaultValues: EMPTY_FORM,
    mode: "onTouched",
  });
  const {
    register,
    control,
    trigger,
    handleSubmit,
    setError,
    reset,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = form;
  const languages = useFieldArray({ control, name: "languages" });
  const lifeStages = useFieldArray({ control, name: "lifeStages" });
  const favourites = useFieldArray({ control, name: "favourites" });
  const avoid = useFieldArray({ control, name: "avoid" });

  // Restore a draft from this tab (e.g. after a reload), check storage, and start step history.
  useEffect(() => {
    const draft = readDraft();
    if (draft) reset(draft, { keepDefaultValues: true });
    setRemembers(canRememberOnThisDevice());
    window.history.replaceState({ ...window.history.state, wizardStep: 0 }, "");
    const onPop = (e: PopStateEvent) => {
      const s = (e.state as { wizardStep?: unknown } | null)?.wizardStep;
      if (typeof s === "number") setStep(s);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [reset]);

  // Keep the draft in this tab only (sessionStorage), so a reload or Back doesn't lose answers.
  useEffect(() => {
    const sub = watch((values) => {
      if (!saved.current) writeDraft(values as ProfileFormValues);
    });
    return () => sub.unsubscribe();
  }, [watch]);

  // Ask before leaving with unsaved answers.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && !saved.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  // Move focus to the new step's heading so keyboard and screen-reader users know where they are.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (submitError) bannerRef.current?.focus();
  }, [submitError]);

  const current = STEPS[step] ?? STEPS[0];
  const isLast = step === STEPS.length - 1;

  function goTo(next: number) {
    setSubmitError(null);
    setStep(next);
    window.history.pushState({ ...window.history.state, wizardStep: next }, "");
  }

  async function next() {
    const ok = await trigger([...current.fields] as FieldPath<ProfileFormValues>[], {
      shouldFocus: true,
    });
    if (ok) goTo(Math.min(step + 1, STEPS.length - 1));
  }

  // After removing a row, keep focus near where it was instead of dropping it to the page.
  function focusAfterRemove(rowFirstInputId: (i: number) => string, i: number, addId: string) {
    requestAnimationFrame(() => {
      const target =
        document.getElementById(rowFirstInputId(i)) ??
        document.getElementById(rowFirstInputId(i - 1)) ??
        document.getElementById(addId);
      target?.focus();
    });
  }

  const save = handleSubmit(async (values) => {
    setSubmitError(null);
    const result = await api.createProfile(toInput(values));
    if (result.ok) {
      saved.current = true;
      writeDraft(null);
      router.push(`/profiles/${result.data.profile.id}?saved=1`);
      return;
    }
    if (result.fields?.length) {
      for (const f of result.fields) {
        setError(formPath(f.path) as FieldPath<ProfileFormValues>, { message: f.message });
      }
      goTo(stepOf(result.fields[0]?.path ?? ""));
      setSubmitError(result.message);
      return;
    }
    setSubmitError(
      result.kind === "limit" || result.kind === "offline" ? result.message : SAVE_FAILED,
    );
  });

  // Enter/Go on earlier steps moves on instead of saving (and skipping the avoid-list).
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    if (isLast) return void save(e);
    e.preventDefault();
    void next();
  }

  const err = (path: string) => {
    let node: unknown = errors;
    for (const p of path.split(".")) node = (node as Record<string, unknown> | undefined)?.[p];
    return (node as { message?: string } | undefined)?.message;
  };
  const enterKeyHint = isLast ? "done" : "next";

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      <div className="space-y-3">
        <p aria-hidden="true" className="text-base font-bold text-muted-foreground">
          Step {step + 1} of {STEPS.length}
        </p>
        <div
          role="progressbar"
          aria-label="Profile steps"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={step + 1}
          aria-valuetext={`Step ${step + 1} of ${STEPS.length}: ${current.title}`}
          className="h-2 w-full rounded-full bg-muted"
        >
          <div
            className="h-2 rounded-full bg-primary transition-[width]"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <h2 ref={headingRef} tabIndex={-1} className="font-heading text-3xl outline-none">
          <span className="sr-only">
            Step {step + 1} of {STEPS.length}:{" "}
          </span>
          {current.title}
        </h2>
      </div>

      {submitError && (
        <div
          ref={bannerRef}
          tabIndex={-1}
          role="alert"
          className="rounded-xl border border-destructive p-4 text-base outline-none"
        >
          {submitError}
        </div>
      )}

      {step === 0 && (
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="nickname">What do you call them? (optional)</Label>
            <Input
              id="nickname"
              autoComplete="off"
              enterKeyHint={enterKeyHint}
              {...nameInput}
              aria-invalid={!!err("nickname")}
              aria-describedby={describedBy("nickname-hint", "nickname-error", !!err("nickname"))}
              {...register("nickname")}
            />
            <Hint id="nickname-hint">
              A first name or family nickname is enough, like &ldquo;Dad&rdquo; or
              &ldquo;Nani&rdquo;. It stays in Memory Lane and is never sent to Qloo or the AI.
            </Hint>
            <FieldError id="nickname-error" message={err("nickname")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="birthYear">Year they were born</Label>
            <Input
              id="birthYear"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              enterKeyHint={enterKeyHint}
              className="max-w-40"
              aria-required="true"
              aria-invalid={!!err("birthYear")}
              aria-describedby={describedBy(
                "birthYear-hint",
                "birthYear-error",
                !!err("birthYear"),
              )}
              {...register("birthYear")}
            />
            <Hint id="birthYear-hint">
              For example, 1950. Used to find music and films from their younger years.
            </Hint>
            <FieldError id="birthYear-error" message={err("birthYear")} />
          </div>

          <fieldset className="space-y-3">
            <legend className="text-base font-bold">Languages they enjoy</legend>
            {languages.fields.map((field, i) => (
              <div key={field.id} className="space-y-1">
                <div className="flex gap-2">
                  <Label htmlFor={`languages.${i}.value`} className="sr-only">
                    Language {i + 1}
                  </Label>
                  <Input
                    id={`languages.${i}.value`}
                    enterKeyHint={enterKeyHint}
                    {...nameInput}
                    aria-required="true"
                    aria-invalid={!!err(`languages.${i}.value`)}
                    aria-describedby={describedBy(
                      i === 0 ? "languages-hint" : null,
                      `languages.${i}-error`,
                      !!err(`languages.${i}.value`),
                    )}
                    {...register(`languages.${i}.value`)}
                  />
                  {languages.fields.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 w-12 shrink-0"
                      aria-label={`Remove language ${i + 1}`}
                      onClick={() => {
                        languages.remove(i);
                        focusAfterRemove((n) => `languages.${n}.value`, i, "add-language");
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  )}
                </div>
                <FieldError id={`languages.${i}-error`} message={err(`languages.${i}.value`)} />
              </div>
            ))}
            <Hint id="languages-hint">For example, Punjabi or English.</Hint>
            <FieldError id="languages-error" message={err("languages.root")} />
            {languages.fields.length < 5 && (
              <Button
                id="add-language"
                type="button"
                variant="outline"
                className={addButton}
                onClick={() => languages.append({ value: "" })}
              >
                <Plus aria-hidden="true" /> Add a language
              </Button>
            )}
          </fieldset>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-6">
          <Hint id="places-hint">
            Where did they live, and when? A city or region and country is enough, like
            &ldquo;Amritsar, Punjab, India&rdquo;. Please leave out street names and house numbers.
          </Hint>
          {lifeStages.fields.map((field, i) => (
            <fieldset key={field.id} className="space-y-3 rounded-2xl border bg-card p-4">
              <legend className="px-1 text-base font-bold">Place {i + 1}</legend>
              <div className="space-y-2">
                <Label htmlFor={`lifeStages.${i}.region`}>City or region, and country</Label>
                <Input
                  id={`lifeStages.${i}.region`}
                  autoComplete="off"
                  enterKeyHint={enterKeyHint}
                  {...nameInput}
                  aria-required="true"
                  aria-invalid={!!err(`lifeStages.${i}.region`)}
                  aria-describedby={describedBy(
                    "places-hint",
                    `lifeStages.${i}.region-error`,
                    !!err(`lifeStages.${i}.region`),
                  )}
                  {...register(`lifeStages.${i}.region`)}
                />
                <FieldError
                  id={`lifeStages.${i}.region-error`}
                  message={err(`lifeStages.${i}.region`)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(["fromYear", "toYear"] as const).map((key) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={`lifeStages.${i}.${key}`}>
                      {key === "fromYear" ? "From (year)" : "Until (year)"}
                    </Label>
                    <Input
                      id={`lifeStages.${i}.${key}`}
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={4}
                      enterKeyHint={enterKeyHint}
                      aria-required="true"
                      aria-invalid={!!err(`lifeStages.${i}.${key}`)}
                      aria-describedby={describedBy(
                        "years-hint",
                        `lifeStages.${i}.${key}-error`,
                        !!err(`lifeStages.${i}.${key}`),
                      )}
                      {...register(`lifeStages.${i}.${key}`)}
                    />
                    <FieldError
                      id={`lifeStages.${i}.${key}-error`}
                      message={err(`lifeStages.${i}.${key}`)}
                    />
                  </div>
                ))}
              </div>
              {lifeStages.fields.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  className={addButton}
                  onClick={() => {
                    lifeStages.remove(i);
                    focusAfterRemove((n) => `lifeStages.${n}.region`, i, "add-place");
                  }}
                >
                  <Trash2 aria-hidden="true" /> Remove place {i + 1}
                </Button>
              )}
            </fieldset>
          ))}
          <Hint id="years-hint">
            Rough years are fine. If they still live there, use this year.
          </Hint>
          <FieldError id="lifeStages-error" message={err("lifeStages.root")} />
          {lifeStages.fields.length < 5 && (
            <Button
              id="add-place"
              type="button"
              variant="outline"
              className={addButton}
              onClick={() => lifeStages.append({ region: "", fromYear: "", toYear: "" })}
            >
              <Plus aria-hidden="true" /> Add another place
            </Button>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <Hint id="favourites-hint">
            A few things they loved: singers, songs, films, TV shows, dishes or places. Memory Lane
            will look each one up with Qloo (a service that knows which music, films and food go
            together) and ask you to confirm what it found.
          </Hint>
          {favourites.fields.map((field, i) => (
            <fieldset key={field.id} className="space-y-3 rounded-2xl border bg-card p-4">
              <legend className="px-1 text-base font-bold">Favourite {i + 1}</legend>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_1fr]">
                <div className="space-y-2">
                  <Label htmlFor={`favourites.${i}.domain`}>Type</Label>
                  <select
                    id={`favourites.${i}.domain`}
                    className={selectClass}
                    {...register(`favourites.${i}.domain`)}
                  >
                    {Object.entries(DOMAIN_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`favourites.${i}.text`}>Name</Label>
                  <Input
                    id={`favourites.${i}.text`}
                    enterKeyHint={enterKeyHint}
                    {...nameInput}
                    aria-required="true"
                    aria-invalid={!!err(`favourites.${i}.text`)}
                    aria-describedby={describedBy(
                      "favourites-hint",
                      `favourites.${i}.text-error`,
                      !!err(`favourites.${i}.text`),
                    )}
                    {...register(`favourites.${i}.text`)}
                  />
                  <FieldError
                    id={`favourites.${i}.text-error`}
                    message={err(`favourites.${i}.text`)}
                  />
                </div>
              </div>
              {favourites.fields.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  className={addButton}
                  onClick={() => {
                    favourites.remove(i);
                    focusAfterRemove((n) => `favourites.${n}.text`, i, "add-favourite");
                  }}
                >
                  <Trash2 aria-hidden="true" /> Remove favourite {i + 1}
                </Button>
              )}
            </fieldset>
          ))}
          <FieldError id="favourites-error" message={err("favourites.root")} />
          {favourites.fields.length < 10 && (
            <Button
              id="add-favourite"
              type="button"
              variant="outline"
              className={addButton}
              onClick={() => favourites.append({ domain: "music", text: "" })}
            >
              <Plus aria-hidden="true" /> Add another favourite
            </Button>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          <Hint id="avoid-hint">
            Is there anything to steer clear of? Some memories can be painful, such as a war,
            Partition or migration, or a song tied to a loss. Memory Lane checks every suggestion
            against this list and leaves out anything that matches. You can skip this step.
          </Hint>
          {avoid.fields.map((field, i) => (
            <fieldset key={field.id} className="space-y-3 rounded-2xl border bg-card p-4">
              <legend className="px-1 text-base font-bold">Thing to avoid {i + 1}</legend>
              <div className="space-y-2">
                <Label htmlFor={`avoid.${i}.text`}>Topic, song, film or era</Label>
                <Input
                  id={`avoid.${i}.text`}
                  enterKeyHint={enterKeyHint}
                  {...nameInput}
                  aria-required="true"
                  aria-invalid={!!err(`avoid.${i}.text`)}
                  aria-describedby={describedBy(
                    "avoid-hint",
                    `avoid.${i}.text-error`,
                    !!err(`avoid.${i}.text`),
                  )}
                  {...register(`avoid.${i}.text`)}
                />
                <FieldError id={`avoid.${i}.text-error`} message={err(`avoid.${i}.text`)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`avoid.${i}.reason`}>Why (optional, only for you)</Label>
                <Input
                  id={`avoid.${i}.reason`}
                  enterKeyHint={enterKeyHint}
                  aria-invalid={!!err(`avoid.${i}.reason`)}
                  aria-describedby={describedBy(
                    `avoid.${i}.reason-hint`,
                    `avoid.${i}.reason-error`,
                    !!err(`avoid.${i}.reason`),
                  )}
                  {...register(`avoid.${i}.reason`)}
                />
                <Hint id={`avoid.${i}.reason-hint`}>Please don&apos;t include health details.</Hint>
                <FieldError id={`avoid.${i}.reason-error`} message={err(`avoid.${i}.reason`)} />
              </div>
              <Button
                type="button"
                variant="outline"
                className={addButton}
                onClick={() => {
                  avoid.remove(i);
                  focusAfterRemove((n) => `avoid.${n}.text`, i, "add-avoid");
                }}
              >
                <Trash2 aria-hidden="true" /> Remove thing to avoid {i + 1}
              </Button>
            </fieldset>
          ))}
          {avoid.fields.length < 10 && (
            <Button
              id="add-avoid"
              type="button"
              variant="outline"
              className={addButton}
              onClick={() => avoid.append({ text: "", reason: "" })}
            >
              <Plus aria-hidden="true" /> Add something to avoid
            </Button>
          )}
          {!remembers && (
            <p className="rounded-xl border p-4 text-base">
              This browser can&apos;t remember your profile after you close it (for example in
              private browsing). You can still save it and look at it now.
            </p>
          )}
        </div>
      )}

      {/* Primary action first in the DOM (focus order), shown on the right on wider screens. */}
      <div className="flex flex-col gap-3 border-t pt-6 sm:flex-row-reverse sm:justify-between">
        {isLast ? (
          <Button
            key="submit"
            type="submit"
            className="h-12 px-6 text-base"
            disabled={isSubmitting}
            focusableWhenDisabled
          >
            {isSubmitting ? "Saving…" : "Save profile"}
          </Button>
        ) : (
          <Button key="next" type="submit" className="h-12 px-6 text-base">
            Next
          </Button>
        )}
        {step > 0 && (
          <Button
            type="button"
            variant="outline"
            className="h-12 px-6 text-base"
            onClick={() => window.history.back()}
          >
            Back
          </Button>
        )}
      </div>
    </form>
  );
}
