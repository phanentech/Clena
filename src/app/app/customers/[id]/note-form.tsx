"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { addCustomerNote } from "../actions";
import type { FormState } from "@/app/auth/actions";

export function NoteForm({ customerId }: { customerId: string }) {
  const [state, action] = useActionState<FormState, FormData>(addCustomerNote.bind(null, customerId), undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.success) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="grid gap-2">
      {state?.error && <Alert>{state.error}</Alert>}
      <label htmlFor="body" className="sr-only">Add a note</label>
      <Textarea id="body" name="body" placeholder="Add a note about this customer…" className="min-h-20" />
      {state?.fieldErrors?.body && <p className="text-xs text-danger-600">{state.fieldErrors.body}</p>}
      <div className="flex justify-end"><SubmitButton size="sm" variant="navy" pendingLabel="Adding…">Add note</SubmitButton></div>
    </form>
  );
}
