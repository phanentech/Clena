"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert, Field, Input } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { addBranch } from "./actions";
import type { FormState } from "@/app/auth/actions";

export function BranchForm() {
  const [state, action] = useActionState<FormState, FormData>(addBranch, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.success) ref.current?.reset(); }, [state]);
  const e = state?.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} className="grid gap-4 sm:grid-cols-2" noValidate>
      {state?.error && <div className="sm:col-span-2"><Alert>{state.error}</Alert></div>}
      {state?.success && <div className="sm:col-span-2"><Alert tone="success">{state.success}</Alert></div>}
      <Field label="Branch name" htmlFor="b-name" error={e.name}><Input id="b-name" name="name" placeholder="Yaba" /></Field>
      <Field label="Phone" htmlFor="b-phone"><Input id="b-phone" name="phone" type="tel" /></Field>
      <Field label="Street address" htmlFor="b-address" error={e.address}><Input id="b-address" name="address" /></Field>
      <Field label="City" htmlFor="b-city" error={e.city}><Input id="b-city" name="city" /></Field>
      <div className="flex justify-end sm:col-span-2"><SubmitButton pendingLabel="Adding…">Add branch</SubmitButton></div>
    </form>
  );
}
