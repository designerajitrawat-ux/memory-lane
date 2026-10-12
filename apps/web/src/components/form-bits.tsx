import type { ReactNode } from "react";

/** Inline error under a field; screen readers reach it through aria-describedby. */
export function FieldError({ id, message }: { id: string; message?: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="text-base font-bold text-destructive">
      {message}
    </p>
  );
}

export function Hint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="text-base text-muted-foreground">
      {children}
    </p>
  );
}

/** ids for aria-describedby: always the hint, the error only when there is one. */
export const describedBy = (hintId: string | null, errorId: string, hasError: boolean) =>
  [hintId, hasError ? errorId : null].filter(Boolean).join(" ") || undefined;

export const selectClass =
  "h-12 w-full rounded-lg border border-field-border bg-background px-3 text-base outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive";
