"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert } from "./primitives";
import type { FormState } from "@/app/auth/actions";

/** A form bound to a server action that returns { error | success }; shows the result inline. */
export function ActionForm({ action, children, className, resetOnSuccess = false, compact = false }: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  compact?: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (resetOnSuccess && state?.success) ref.current?.reset(); }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className} noValidate>
      {!compact && state?.error && <div className="mb-3"><Alert>{state.error}</Alert></div>}
      {!compact && state?.success && <div className="mb-3"><Alert tone="success">{state.success}</Alert></div>}
      {children}
      {compact && (state?.error || state?.success) && (
        <p className={state?.error ? "mt-1 text-xs text-danger-600" : "mt-1 text-xs text-brand-700"}>{state?.error ?? state?.success}</p>
      )}
    </form>
  );
}
